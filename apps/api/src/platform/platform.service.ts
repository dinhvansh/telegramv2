import { ForbiddenException, Injectable } from '@nestjs/common';
import { CampaignStatus, EventTone } from '@prisma/client';
import { fallbackSnapshot } from './fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';

type SnapshotViewer = {
  userId: string;
  permissions: string[];
  workspaceIds?: string[];
  workspaceId?: string;
};

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

function parseTargetCount(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const matched = value.match(/(\d+)/);
  return matched ? Number(matched[1]) : 0;
}

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  private canViewAllCampaigns(viewer?: SnapshotViewer) {
    if (!viewer) {
      return true;
    }

    return viewer.permissions.some(
      (permission) =>
        permission === 'settings.manage' || permission === 'moderation.review',
    );
  }

  private resolveWorkspaceScope(viewer?: SnapshotViewer) {
    if (!viewer) {
      return undefined;
    }

    if (viewer.workspaceId) {
      if (
        viewer.permissions.includes('organization.manage') ||
        viewer.workspaceIds?.includes(viewer.workspaceId)
      ) {
        return viewer.workspaceId;
      }

      throw new ForbiddenException('Workspace is outside your scope');
    }

    if (viewer.permissions.includes('organization.manage')) {
      return undefined;
    }

    const defaultWorkspaceId = viewer.workspaceIds?.[0];
    if (!defaultWorkspaceId) {
      throw new ForbiddenException('Workspace access is required');
    }

    return defaultWorkspaceId;
  }

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

  async getSnapshot(viewer?: SnapshotViewer) {
    if (!process.env.DATABASE_URL) {
      return fallbackSnapshot;
    }

    try {
      const workspaceId = this.resolveWorkspaceScope(viewer);
      const campaignWhere = this.canViewAllCampaigns(viewer)
        ? workspaceId
          ? { workspaceId }
          : undefined
        : {
            assigneeUserId: viewer?.userId,
            ...(workspaceId ? { workspaceId } : {}),
          };

      const campaigns = await this.prisma.campaign.findMany({
        where: campaignWhere,
        orderBy: { createdAt: 'asc' },
        include: {
          communityMembers: true,
          telegramGroup: true,
        },
      });

      const [
        eventFeed,
        moderationRules,
        roadmap,
        autopostCapabilities,
        roles,
        settings,
        workspaceBot,
        telegramGroups,
        communityMembers,
        activityEvents,
      ] = await Promise.all([
        this.prisma.eventFeedItem.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.moderationRule.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.prisma.roadmapPhase.findMany({
          orderBy: { sortOrder: 'asc' },
          include: { tasks: { orderBy: { sortOrder: 'asc' } } },
        }),
        this.prisma.autopostCapability.findMany({ orderBy: { title: 'asc' } }),
        this.prisma.role.findMany({ orderBy: { createdAt: 'asc' } }),
        this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
        this.prisma.telegramBot.findFirst({
          where: workspaceId
            ? {
                workspaceId,
                isActive: true,
              }
            : {
                isActive: true,
              },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        }),
        this.prisma.telegramGroup.findMany({
          where: workspaceId ? { workspaceId } : undefined,
          orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
        }),
        this.prisma.communityMember.findMany({
          where: this.canViewAllCampaigns(viewer)
            ? workspaceId
              ? {
                  campaign: {
                    workspaceId,
                  },
                }
              : undefined
            : {
                campaignId: {
                  in: campaigns.map((campaign) => campaign.id),
                },
              },
          select: {
            externalId: true,
            groupTitle: true,
            joinedAt: true,
            leftAt: true,
          },
        }),
        this.prisma.spamEvent.findMany({
          where: {
            eventType: 'message_received',
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
            ...(workspaceId
              ? {
                  groupTitle: {
                    in: campaigns
                      .map(
                        (campaign) =>
                          campaign.telegramGroup?.title ?? campaign.channel,
                      )
                      .filter(Boolean),
                  },
                }
              : {}),
          },
          select: {
            actorExternalId: true,
            groupTitle: true,
          },
        }),
      ]);

      const scopedCampaigns = campaigns.map((campaign) => {
        const joinedCount = campaign.communityMembers.length;
        const leftCount = campaign.communityMembers.filter(
          (member) => member.leftAt,
        ).length;
        const activeCount = joinedCount - leftCount;
        const targetCount = parseTargetCount(campaign.joinRate);

        return {
          name: campaign.name,
          channel: campaign.channel,
          inviteCode: campaign.inviteCode,
          targetCount,
          joinedCount,
          activeCount,
          leftCount,
          status: campaignStatusMap[campaign.status],
        };
      });

      const joinedTotal = scopedCampaigns.reduce(
        (total, campaign) => total + campaign.joinedCount,
        0,
      );
      const activeTotal = scopedCampaigns.reduce(
        (total, campaign) => total + campaign.activeCount,
        0,
      );
      const leftTotal = scopedCampaigns.reduce(
        (total, campaign) => total + campaign.leftCount,
        0,
      );
      const targetTotal = scopedCampaigns.reduce(
        (total, campaign) => total + campaign.targetCount,
        0,
      );
      const progressValue =
        targetTotal > 0
          ? `${Math.round((joinedTotal / targetTotal) * 100)}%`
          : '0%';

      const scopedMetrics = [
        {
          label: this.canViewAllCampaigns(viewer)
            ? 'Campaign trong WP'
            : 'Campaign được giao',
          value: String(scopedCampaigns.length),
          trend: workspaceId ? 'Theo workspace' : 'Tất cả workspace được phép',
          tone: 'primary' as const,
        },
        {
          label: 'Khách đã tham gia',
          value: String(joinedTotal),
          trend: progressValue,
          tone: 'success' as const,
        },
        {
          label: 'Khách đang ở lại',
          value: String(activeTotal),
          trend: `${leftTotal} đã rời`,
          tone: 'warning' as const,
        },
        {
          label: 'Hoạt động 30 ngày',
          value: String(activityEvents.length),
          trend: 'Message events',
          tone: 'danger' as const,
        },
      ];

      const allowedGroupTitles =
        this.canViewAllCampaigns(viewer) || campaigns.length === 0
          ? new Set(telegramGroups.map((group) => group.title))
          : new Set(
              campaigns
                .map(
                  (campaign) =>
                    campaign.telegramGroup?.title ?? campaign.channel,
                )
                .filter(Boolean),
            );

      const startCurrentMonth = new Date();
      startCurrentMonth.setDate(1);
      startCurrentMonth.setHours(0, 0, 0, 0);

      const startPreviousMonth = new Date(startCurrentMonth);
      startPreviousMonth.setMonth(startPreviousMonth.getMonth() - 1);

      const activeMemberCounts = new Map<string, number>();
      const currentMonthJoins = new Map<string, number>();
      const previousMonthJoins = new Map<string, number>();

      for (const member of communityMembers) {
        if (!allowedGroupTitles.has(member.groupTitle)) {
          continue;
        }

        if (!member.leftAt) {
          activeMemberCounts.set(
            member.groupTitle,
            (activeMemberCounts.get(member.groupTitle) ?? 0) + 1,
          );
        }

        if (member.joinedAt >= startCurrentMonth) {
          currentMonthJoins.set(
            member.groupTitle,
            (currentMonthJoins.get(member.groupTitle) ?? 0) + 1,
          );
        } else if (
          member.joinedAt >= startPreviousMonth &&
          member.joinedAt < startCurrentMonth
        ) {
          previousMonthJoins.set(
            member.groupTitle,
            (previousMonthJoins.get(member.groupTitle) ?? 0) + 1,
          );
        }
      }

      const activeUsersByGroup = new Map<string, Set<string>>();

      for (const event of activityEvents) {
        if (!event.groupTitle || !event.actorExternalId) {
          continue;
        }
        if (!allowedGroupTitles.has(event.groupTitle)) {
          continue;
        }

        const bucket =
          activeUsersByGroup.get(event.groupTitle) ?? new Set<string>();
        bucket.add(event.actorExternalId);
        activeUsersByGroup.set(event.groupTitle, bucket);
      }

      const groupsForDashboard = telegramGroups.filter((group) =>
        allowedGroupTitles.has(group.title),
      );

      const groupInsights = groupsForDashboard
        .map((group) => {
          const memberCount = activeMemberCounts.get(group.title) ?? 0;
          const monthlyJoins = currentMonthJoins.get(group.title) ?? 0;
          const previousMonthlyJoins = previousMonthJoins.get(group.title) ?? 0;
          const activeUsers = activeUsersByGroup.get(group.title)?.size ?? 0;
          const growthRate =
            previousMonthlyJoins > 0
              ? ((monthlyJoins - previousMonthlyJoins) / previousMonthlyJoins) *
                100
              : monthlyJoins > 0
                ? 100
                : 0;
          const activityRate =
            memberCount > 0 ? (activeUsers / memberCount) * 100 : 0;

          return {
            title: group.title,
            memberCount,
            monthlyJoins,
            previousMonthlyJoins,
            growthRate: Number(growthRate.toFixed(1)),
            activeUsers,
            activityRate: Number(activityRate.toFixed(1)),
          };
        })
        .sort((a, b) => b.memberCount - a.memberCount);

      const botName =
        workspaceBot?.displayName || workspaceBot?.username || 'Chưa xác định';
      const botExternalId = workspaceBot?.externalId || null;
      const webhookRegistered = workspaceBot?.webhookRegistered ?? false;

      const botSummary = {
        botName,
        botExternalId,
        activeGroupCount: groupsForDashboard.filter((group) => group.isActive)
          .length,
        totalGroupCount: groupsForDashboard.length,
        webhookRegistered,
      };

      return {
        navItems: fallbackSnapshot.navItems,
        metrics: scopedMetrics,
        campaigns: scopedCampaigns,
        eventFeed: eventFeed.map((event) => ({
          time: event.timeLabel,
          title: event.title,
          detail: event.detail,
          tone: toneMap[event.tone],
        })),
        botSummary,
        groupInsights,
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
