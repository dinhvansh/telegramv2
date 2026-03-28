import { Injectable } from '@nestjs/common';
import { CampaignStatus, EventTone } from '@prisma/client';
import { fallbackSnapshot } from './fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';

const toneMap: Record<EventTone, 'primary' | 'success' | 'warning' | 'danger'> =
  {
    PRIMARY: 'primary',
    SUCCESS: 'success',
    WARNING: 'warning',
    DANGER: 'danger',
  };

const campaignStatusMap: Record<
  CampaignStatus,
  'Active' | 'Paused' | 'Review'
> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  REVIEW: 'Review',
};

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    if (!process.env.DATABASE_URL) {
      return {
        status: 'ok',
        service: 'telegram-operations-api',
        mode: 'fallback',
        timestamp: new Date().toISOString(),
      };
    }

    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      service: 'telegram-operations-api',
      mode: 'database',
      timestamp: new Date().toISOString(),
    };
  }

  async getSnapshot() {
    if (!process.env.DATABASE_URL) {
      return fallbackSnapshot;
    }

    try {
      const [
        metrics,
        campaigns,
        eventFeed,
        moderationRules,
        roadmap,
        autopostCapabilities,
        roles,
        settings,
      ] = await Promise.all([
        this.prisma.metricCard.findMany({ orderBy: { label: 'asc' } }),
        this.prisma.campaign.findMany({ orderBy: { createdAt: 'asc' } }),
        this.prisma.eventFeedItem.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.moderationRule.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.prisma.roadmapPhase.findMany({
          orderBy: { sortOrder: 'asc' },
          include: { tasks: { orderBy: { sortOrder: 'asc' } } },
        }),
        this.prisma.autopostCapability.findMany({ orderBy: { title: 'asc' } }),
        this.prisma.role.findMany({ orderBy: { createdAt: 'asc' } }),
        this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
      ]);

      return {
        navItems: fallbackSnapshot.navItems,
        metrics: metrics.map((metric) => ({
          label: metric.label,
          value: metric.value,
          trend: metric.trend,
          tone: toneMap[metric.tone],
        })),
        campaigns: campaigns.map((campaign) => ({
          name: campaign.name,
          channel: campaign.channel,
          inviteCode: campaign.inviteCode,
          joinRate: campaign.joinRate,
          status: campaignStatusMap[campaign.status],
        })),
        eventFeed: eventFeed.map((event) => ({
          time: event.timeLabel,
          title: event.title,
          detail: event.detail,
          tone: toneMap[event.tone],
        })),
        moderationRules: moderationRules.map((rule) => rule.content),
        roadmap: roadmap.map((phase) => ({
          phase: phase.name,
          outcome: phase.outcome,
          tasks: phase.tasks.map((task) => task.content),
        })),
        autopostCapabilities: autopostCapabilities.map((capability) => ({
          title: capability.title,
          detail: capability.detail,
        })),
        roles: roles.map((role) => ({
          title: role.name,
          detail: role.description,
        })),
        settings: settings.reduce<Record<string, string>>((acc, item) => {
          acc[item.key] = item.value;
          return acc;
        }, {}),
      };
    } catch {
      return fallbackSnapshot;
    }
  }
}
