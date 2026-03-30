import { Injectable, NotFoundException } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';

type CreateCampaignInput = {
  name: string;
  channel: string;
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
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    if (!process.env.DATABASE_URL) {
      return fallbackSnapshot.campaigns.map((campaign, index) => ({
        id: `fallback-${index + 1}`,
        ...campaign,
        conversionRate: 0,
        joinedCount: 0,
        leftCount: 0,
        activeCount: 0,
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
        joinRate: campaign.joinRate,
        conversionRate: 0,
        summary: {
          joinedCount: 0,
          activeCount: 0,
          leftCount: 0,
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
        channel: input.channel,
        inviteCode: `t.me/+${Math.random().toString(36).slice(2, 10)}`,
        joinRate: input.joinRate ?? '0% conversion',
        status: input.status ?? 'Active',
        conversionRate: 0,
        joinedCount: 0,
        leftCount: 0,
        activeCount: 0,
      };
    }

    const inviteCode = `t.me/+${Math.random().toString(36).slice(2, 10)}`;
    const status = input.status
      ? statusToDb[input.status]
      : CampaignStatus.ACTIVE;
    const telegramGroup = await this.prisma.telegramGroup.findFirst({
      where: { title: input.channel },
    });

    const campaign = await this.prisma.campaign.create({
      data: {
        name: input.name,
        channel: input.channel,
        joinRate: input.joinRate ?? '0% conversion',
        inviteCode,
        status,
        conversionRate: 0,
        telegramGroupId: telegramGroup?.id || null,
      },
    });

    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      inviteCode: campaign.inviteCode,
      joinRate: campaign.joinRate,
      status: statusFromDb[campaign.status],
      conversionRate: campaign.conversionRate,
      joinedCount: 0,
      leftCount: 0,
      activeCount: 0,
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
