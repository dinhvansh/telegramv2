/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Injectable } from '@nestjs/common';
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

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    if (!process.env.DATABASE_URL) {
      return fallbackSnapshot.campaigns.map((campaign, index) => ({
        id: `fallback-${index + 1}`,
        ...campaign,
        conversionRate: 0,
      }));
    }

    const campaigns = (await this.prisma.campaign.findMany({
      include: {
        inviteLinks: {
          include: {
            events: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })) as any[];

    return campaigns.map((campaign: any) => ({
      id: campaign.id,
      telegramGroupId: campaign.telegramGroupId,
      name: campaign.name,
      channel: campaign.channel,
      inviteCode: campaign.inviteLinks[0]?.inviteUrl || campaign.inviteCode,
      joinRate: campaign.inviteLinks[0]?.memberLimit
        ? `${campaign.inviteLinks[0].events.filter((event: any) => event.eventType === 'USER_JOINED').length} / ${campaign.inviteLinks[0].memberLimit}`
        : campaign.joinRate,
      status: statusFromDb[campaign.status as CampaignStatus],
      conversionRate: campaign.inviteLinks[0]?.memberLimit
        ? Math.round(
            (campaign.inviteLinks[0].events.filter(
              (event: any) => event.eventType === 'USER_JOINED',
            ).length /
              campaign.inviteLinks[0].memberLimit) *
              100,
          )
        : campaign.conversionRate,
      inviteLinks: campaign.inviteLinks.map((inviteLink: any) => ({
        id: inviteLink.id,
        label: inviteLink.label,
        inviteUrl: inviteLink.inviteUrl,
        memberLimit: inviteLink.memberLimit,
        createsJoinRequest: inviteLink.createsJoinRequest,
        joins: inviteLink.events.filter(
          (event: any) => event.eventType === 'USER_JOINED',
        ).length,
      })),
    }));
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
    };
  }

  async findInviteLinks(campaignId: string) {
    if (!process.env.DATABASE_URL) {
      return [];
    }

    const inviteLinks = (await this.prisma.campaignInviteLink.findMany({
      where: { campaignId },
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as any[];

    return inviteLinks.map((inviteLink: any) => ({
      id: inviteLink.id,
      label: inviteLink.label,
      inviteUrl: inviteLink.inviteUrl,
      memberLimit: inviteLink.memberLimit,
      createsJoinRequest: inviteLink.createsJoinRequest,
      status: inviteLink.status,
      expireAt: inviteLink.expireAt?.toISOString() || null,
      events: inviteLink.events.map((event: any) => ({
        id: event.id,
        eventType: event.eventType,
        actorUsername: event.actorUsername,
        createdAt: event.createdAt.toISOString(),
        detail: event.detail,
      })),
    }));
  }
}
