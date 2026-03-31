import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

type CreateCampaignInput = {
  name: string;
  telegramGroupId: string;
  joinRate?: string;
  status?: 'Active' | 'Paused' | 'Review';
  inviteMemberLimit?: number | null;
  inviteRequiresApproval?: boolean;
};

type UpdateCampaignInput = {
  name?: string;
  joinRate?: string;
  status?: 'Active' | 'Paused' | 'Review';
};

const statusToDb: Record<
  NonNullable<CreateCampaignInput['status']>,
  CampaignStatus
> = {
  Active: CampaignStatus.ACTIVE,
  Paused: CampaignStatus.PAUSED,
  Review: CampaignStatus.REVIEW,
};

const statusFromDb: Record<CampaignStatus, 'Active' | 'Paused' | 'Review'> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  REVIEW: 'Review',
};

function formatMemberSummary(members: Array<{ leftAt: Date | null }>) {
  const joinedCount = members.length;
  const leftCount = members.filter((member) => member.leftAt).length;
  const activeCount = joinedCount - leftCount;

  return {
    joinedCount,
    leftCount,
    activeCount,
  };
}

function mapMember(member: {
  id: string;
  displayName: string;
  avatarInitials: string;
  externalId: string;
  username: string | null;
  groupTitle: string;
  campaignLabel: string;
  ownerName: string | null;
  note: string | null;
  joinedAt: Date;
  leftAt: Date | null;
}) {
  return {
    id: member.id,
    displayName: member.displayName,
    avatarInitials: member.avatarInitials,
    externalId: member.externalId,
    username: member.username,
    groupTitle: member.groupTitle,
    campaignLabel: member.campaignLabel,
    ownerName: member.ownerName,
    note: member.note,
    joinedAt: member.joinedAt.toISOString(),
    leftAt: member.leftAt ? member.leftAt.toISOString() : null,
    membershipStatus: member.leftAt ? 'left' : 'active',
  };
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  async findAll() {
    if (!process.env.DATABASE_URL) {
      return fallbackSnapshot.campaigns.map((campaign, index) => ({
        id: `fallback-${index + 1}`,
        name: campaign.name,
        channel: campaign.channel,
        inviteCode: campaign.inviteCode,
        joinRate: String(campaign.targetCount),
        status: campaign.status,
        conversionRate: 0,
        joinedCount: campaign.joinedCount,
        leftCount: campaign.leftCount,
        activeCount: campaign.activeCount,
      }));
    }

    const campaigns = await this.prisma.campaign.findMany({
      include: {
        telegramGroup: true,
        communityMembers: {
          orderBy: { joinedAt: 'desc' },
        },
        inviteLinks: {
          include: {
            events: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return campaigns.map((campaign) => {
      const summary = formatMemberSummary(campaign.communityMembers);
      const primaryInviteLink = campaign.inviteLinks[0];
      const joinedViaInvite = primaryInviteLink
        ? primaryInviteLink.events.filter(
            (event) => event.eventType === 'USER_JOINED',
          ).length
        : 0;

      return {
        id: campaign.id,
        telegramGroupId: campaign.telegramGroupId,
        name: campaign.name,
        channel: campaign.channel,
        inviteCode: primaryInviteLink?.inviteUrl || campaign.inviteCode,
        joinRate: primaryInviteLink?.memberLimit
          ? `${joinedViaInvite} / ${primaryInviteLink.memberLimit}`
          : campaign.joinRate,
        status: statusFromDb[campaign.status],
        conversionRate: campaign.conversionRate,
        joinedCount: summary.joinedCount,
        leftCount: summary.leftCount,
        activeCount: summary.activeCount,
        inviteLinks: campaign.inviteLinks.map((inviteLink) => ({
          id: inviteLink.id,
          label: inviteLink.label,
          inviteUrl: inviteLink.inviteUrl,
          memberLimit: inviteLink.memberLimit,
          createsJoinRequest: inviteLink.createsJoinRequest,
          joins: inviteLink.events.filter(
            (event) => event.eventType === 'USER_JOINED',
          ).length,
        })),
      };
    });
  }

  async findOne(campaignId: string) {
    if (!process.env.DATABASE_URL) {
      const campaign = fallbackSnapshot.campaigns.find(
        (_, index) => `fallback-${index + 1}` === campaignId,
      );

      if (!campaign) {
        throw new NotFoundException('Không tìm thấy campaign.');
      }

      return {
        id: campaignId,
        name: campaign.name,
        channel: campaign.channel,
        inviteCode: campaign.inviteCode,
        status: campaign.status,
        joinRate: String(campaign.targetCount),
        conversionRate: 0,
        summary: {
          joinedCount: campaign.joinedCount,
          activeCount: campaign.activeCount,
          leftCount: campaign.leftCount,
        },
        inviteLinks: [],
        members: [],
      };
    }

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        telegramGroup: true,
        communityMembers: {
          orderBy: [{ leftAt: 'asc' }, { joinedAt: 'desc' }],
        },
        inviteLinks: {
          include: {
            events: {
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Không tìm thấy campaign.');
    }

    const summary = formatMemberSummary(campaign.communityMembers);

    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      inviteCode: campaign.inviteCode,
      status: statusFromDb[campaign.status],
      joinRate: campaign.joinRate,
      conversionRate: campaign.conversionRate,
      telegramGroupId: campaign.telegramGroupId,
      telegramGroupTitle: campaign.telegramGroup?.title || campaign.channel,
      summary,
      inviteLinks: campaign.inviteLinks.map((inviteLink) => ({
        id: inviteLink.id,
        label: inviteLink.label,
        inviteUrl: inviteLink.inviteUrl,
        memberLimit: inviteLink.memberLimit,
        createsJoinRequest: inviteLink.createsJoinRequest,
        status: inviteLink.status,
        expireAt: inviteLink.expireAt?.toISOString() || null,
        joinedCount: inviteLink.events.filter(
          (event) => event.eventType === 'USER_JOINED',
        ).length,
        leftCount: inviteLink.events.filter(
          (event) => event.eventType === 'USER_LEFT',
        ).length,
        pendingCount: inviteLink.events.filter(
          (event) => event.eventType === 'JOIN_REQUEST',
        ).length,
      })),
      members: campaign.communityMembers.slice(0, 8).map(mapMember),
    };
  }

  async findMembers(campaignId: string) {
    if (!process.env.DATABASE_URL) {
      return {
        items: [],
        summary: {
          joinedCount: 0,
          activeCount: 0,
          leftCount: 0,
        },
      };
    }

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        communityMembers: {
          orderBy: [{ leftAt: 'asc' }, { joinedAt: 'desc' }],
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Không tìm thấy campaign.');
    }

    const summary = formatMemberSummary(campaign.communityMembers);

    return {
      items: campaign.communityMembers.map(mapMember),
      summary,
    };
  }

  async create(input: CreateCampaignInput) {
    if (!process.env.DATABASE_URL) {
      return {
        id: 'fallback-created',
        name: input.name,
        telegramGroupId: input.telegramGroupId,
        channel: 'Telegram Group',
        inviteCode: `t.me/+${Math.random().toString(36).slice(2, 10)}`,
        joinRate: input.joinRate ?? '0% conversion',
        status: input.status ?? 'Active',
        conversionRate: 0,
        joinedCount: 0,
        leftCount: 0,
        activeCount: 0,
      };
    }

    if (input.inviteRequiresApproval && input.inviteMemberLimit) {
      throw new BadRequestException(
        'Link yêu cầu admin duyệt không thể đặt giới hạn số người cùng lúc.',
      );
    }

    const inviteCode = `t.me/+${Math.random().toString(36).slice(2, 10)}`;
    const status = input.status
      ? statusToDb[input.status]
      : CampaignStatus.ACTIVE;
    const telegramGroup = await this.prisma.telegramGroup.findUnique({
      where: { id: input.telegramGroupId },
    });
    if (!telegramGroup) {
      throw new BadRequestException(
        'Campaign phải gắn với một group Telegram đã được đồng bộ trong CRM.',
      );
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        name: input.name,
        channel: telegramGroup.title,
        joinRate: input.joinRate ?? '0% conversion',
        inviteCode,
        status,
        conversionRate: 0,
        telegramGroupId: telegramGroup.id,
      },
    });

    const inviteLinkResult = await this.telegramService.createInviteLink({
      campaignId: campaign.id,
      groupExternalId: telegramGroup.externalId,
      groupTitle: telegramGroup.title,
      name: input.name,
      memberLimit:
        input.inviteRequiresApproval || !input.inviteMemberLimit
          ? undefined
          : Math.max(1, Math.min(99999, Math.round(input.inviteMemberLimit))),
      createsJoinRequest: Boolean(input.inviteRequiresApproval),
      expireHours: 24 * 30,
    });

    if (!inviteLinkResult.ok || !inviteLinkResult.inviteLink?.url) {
      await this.prisma.campaign.delete({
        where: { id: campaign.id },
      });

      throw new BadRequestException(
        inviteLinkResult.description ||
          inviteLinkResult.reason ||
          'Không thể tạo link mời Telegram cho campaign.',
      );
    }

    const updatedCampaign = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        inviteCode: inviteLinkResult.inviteLink.url,
      },
    });

    await this.prisma.campaignInviteLink.upsert({
      where: {
        inviteUrl: inviteLinkResult.inviteLink.url,
      },
      update: {
        campaignId: campaign.id,
        telegramGroupId: telegramGroup.id,
        externalInviteId: input.name.trim() || null,
        label: input.name.trim() || `Invite ${telegramGroup.title}`,
        memberLimit: inviteLinkResult.inviteLink.memberLimit || null,
        createsJoinRequest: Boolean(
          inviteLinkResult.inviteLink.createsJoinRequest,
        ),
        expireAt: inviteLinkResult.inviteLink.expireDate
          ? new Date(inviteLinkResult.inviteLink.expireDate)
          : null,
        status: 'ACTIVE',
      },
      create: {
        campaignId: campaign.id,
        telegramGroupId: telegramGroup.id,
        externalInviteId: input.name.trim() || null,
        inviteUrl: inviteLinkResult.inviteLink.url,
        label: input.name.trim() || `Invite ${telegramGroup.title}`,
        memberLimit: inviteLinkResult.inviteLink.memberLimit || null,
        createsJoinRequest: Boolean(
          inviteLinkResult.inviteLink.createsJoinRequest,
        ),
        expireAt: inviteLinkResult.inviteLink.expireDate
          ? new Date(inviteLinkResult.inviteLink.expireDate)
          : null,
        status: 'ACTIVE',
      },
    });

    return {
      id: updatedCampaign.id,
      telegramGroupId: updatedCampaign.telegramGroupId,
      name: updatedCampaign.name,
      channel: updatedCampaign.channel,
      inviteCode: updatedCampaign.inviteCode,
      joinRate: updatedCampaign.joinRate,
      status: statusFromDb[updatedCampaign.status],
      conversionRate: updatedCampaign.conversionRate,
      joinedCount: 0,
      leftCount: 0,
      activeCount: 0,
    };
  }

  async update(campaignId: string, input: UpdateCampaignInput) {
    if (!process.env.DATABASE_URL) {
      return {
        updated: true,
        id: campaignId,
        name: input.name ?? 'Fallback campaign',
        joinRate: input.joinRate ?? '0% conversion',
        status: input.status ?? 'Active',
      };
    }

    const existingCampaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!existingCampaign) {
      throw new NotFoundException('Không tìm thấy campaign.');
    }

    const updatedCampaign = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.joinRate !== undefined ? { joinRate: input.joinRate } : {}),
        ...(input.status !== undefined
          ? { status: statusToDb[input.status] }
          : {}),
      },
    });

    return {
      updated: true,
      id: updatedCampaign.id,
      name: updatedCampaign.name,
      joinRate: updatedCampaign.joinRate,
      status: statusFromDb[updatedCampaign.status],
    };
  }

  async delete(campaignId: string) {
    if (!process.env.DATABASE_URL) {
      return {
        deleted: true,
        id: campaignId,
      };
    }

    const existingCampaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!existingCampaign) {
      throw new NotFoundException('Không tìm thấy campaign.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.communityMember.updateMany({
        where: { campaignId },
        data: {
          campaignId: null,
          campaignLabel: 'Không gắn campaign',
        },
      });

      await tx.campaign.delete({
        where: { id: campaignId },
      });
    });

    return {
      deleted: true,
      id: campaignId,
    };
  }

  async findInviteLinks(campaignId: string) {
    if (!process.env.DATABASE_URL) {
      return [];
    }

    const inviteLinks = await this.prisma.campaignInviteLink.findMany({
      where: { campaignId },
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return inviteLinks.map((inviteLink) => ({
      id: inviteLink.id,
      label: inviteLink.label,
      inviteUrl: inviteLink.inviteUrl,
      memberLimit: inviteLink.memberLimit,
      createsJoinRequest: inviteLink.createsJoinRequest,
      status: inviteLink.status,
      expireAt: inviteLink.expireAt?.toISOString() || null,
      events: inviteLink.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        actorUsername: event.actorUsername,
        createdAt: event.createdAt.toISOString(),
        detail: event.detail,
      })),
    }));
  }
}
