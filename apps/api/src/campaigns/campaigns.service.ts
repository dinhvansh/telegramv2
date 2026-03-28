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

    const campaigns = await this.prisma.campaign.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      inviteCode: campaign.inviteCode,
      joinRate: campaign.joinRate,
      status: statusFromDb[campaign.status],
      conversionRate: campaign.conversionRate,
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

    const campaign = await this.prisma.campaign.create({
      data: {
        name: input.name,
        channel: input.channel,
        joinRate: input.joinRate ?? '0% conversion',
        inviteCode,
        status,
        conversionRate: 0,
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
}
