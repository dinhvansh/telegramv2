import { Injectable } from '@nestjs/common';
import {
  ModerationListMode,
  ModerationScopeType,
  Prisma,
  SpamDecision,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { TelegramActionsService } from '../telegram-actions/telegram-actions.service';
import {
  builtInBlacklistKeywords,
  builtInRiskyDomains,
  moderationDecisionThresholds,
  normalizeRuleValue,
  socialEngineeringPattern,
  suspiciousUsernamePattern,
  uniqueNormalizedValues,
} from './moderation-rules';

type ModerationMember = {
  id: string;
  displayName: string;
  avatarInitials: string;
  externalId: string;
  username: string | null;
  phoneNumber: string | null;
  customerSource: string | null;
  campaignLabel: string;
  campaignId: string | null;
  groupTitle: string;
  ownerName: string | null;
  note: string | null;
  warningCount: number;
  lastWarnedAt: string | null;
  joinedAt: string;
  joinedRelative: string;
  membershipStatus: 'active' | 'left';
  statusLabel: string;
  statusDetail: string;
  leftAt: string | null;
};

type Member360SummaryItem = {
  externalId: string;
  displayName: string;
  avatarInitials: string;
  username: string | null;
  phoneNumber: string | null;
  customerSource: string | null;
  ownerName: string | null;
  note: string | null;
  groupsActiveCount: number;
  groupsTotalCount: number;
  joinCount: number;
  leftCount: number;
  warningTotal: number;
  lastActivityAt: string | null;
  currentGroups: Array<{
    groupTitle: string;
    campaignLabel: string;
    joinedAt: string;
    warningCount: number;
  }>;
};

type Member360TimelineEvent = {
  id: string;
  type: 'join' | 'left' | 'warn';
  timestamp: string;
  detail: string;
  groupTitle: string;
  campaignLabel: string | null;
};

type Member360ProfileResponse = {
  found: boolean;
  profile: null | {
    externalId: string;
    displayName: string;
    avatarInitials: string;
    username: string | null;
    phoneNumber: string | null;
    customerSource: string | null;
    ownerName: string | null;
    note: string | null;
    groupsActiveCount: number;
    groupsTotalCount: number;
    joinCount: number;
    leftCount: number;
    warningTotal: number;
    lastActivityAt: string | null;
    currentGroups: ModerationMember[];
    memberships: ModerationMember[];
    timeline: Member360TimelineEvent[];
    moderationTimeline: Member360TimelineEvent[];
    inviteTimeline: Member360TimelineEvent[];
  };
};

type Member360ImportRow = {
  externalId: string;
  phoneNumber: string | null;
  customerSource: string | null;
};

type ResolvedContactEntry = {
  externalId: string;
  displayName: string;
  avatarInitials: string;
  username: string | null;
  phoneNumber: string | null;
  customerSource: string | null;
  ownerName: string | null;
  note: string | null;
  lastActivityAt: string | null;
};

type Member360Meta = {
  ownerName: string | null;
  note: string | null;
  phoneNumber: string | null;
  customerSource: string | null;
};

type ModerationViewer = {
  userId: string;
  permissions: string[];
  workspaceIds?: string[];
  workspaceId?: string;
};

type WorkspaceGroupScope = {
  ids: string[];
  titles: string[];
  externalIds: string[];
};

type WarningEscalationPreview = {
  memberId: string | null;
  currentWarningCount: number;
  nextWarningCount: number;
  warnLimit: number;
  warnAction: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  actionVariant: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  incrementWarning: boolean;
  triggered: boolean;
  effectiveDecision: SpamDecision;
  muteDurationHours: number | null;
  durationSeconds: number | null;
  matchedRules: string[];
};

type PolicyRecord = Prisma.ModerationPolicyGetPayload<{
  include: {
    keywords: true;
    domains: true;
    telegramGroup: true;
  };
}>;

const fallbackMembers: ModerationMember[] = [
  {
    id: 'member-jd',
    displayName: 'Julianne Doe',
    avatarInitials: 'JD',
    externalId: '5029112',
    username: 'juli_dev',
    phoneNumber: '0905123456',
    customerSource: 'CRM seed',
    campaignLabel: 'Winter_24',
    campaignId: null,
    groupTitle: 'Dev_Ops_Global',
    ownerName: 'Trust Moderator',
    note: 'Ưu tiên theo dõi sau khi vào nhóm.',
    warningCount: 1,
    lastWarnedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    joinedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    joinedRelative: '2 phút trước',
    membershipStatus: 'active',
    statusLabel: 'Đang ở trong nhóm',
    statusDetail: 'Chưa ghi nhận sự kiện rời nhóm.',
    leftAt: null,
  },
  {
    id: 'member-mk',
    displayName: 'Mark Kovalski',
    avatarInitials: 'MK',
    externalId: '1129384',
    username: 'marko_k',
    phoneNumber: null,
    customerSource: 'Import thử nghiệm',
    campaignLabel: 'Trực tiếp',
    campaignId: null,
    groupTitle: 'Support_QA',
    ownerName: null,
    note: null,
    warningCount: 0,
    lastWarnedAt: null,
    joinedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    joinedRelative: '14 phút trước',
    membershipStatus: 'active',
    statusLabel: 'Đang ở trong nhóm',
    statusDetail: 'Chưa ghi nhận sự kiện rời nhóm.',
    leftAt: null,
  },
  {
    id: 'member-sl',
    displayName: 'Sasha Lee',
    avatarInitials: 'SL',
    externalId: '9928374',
    username: 'slee_crypto',
    phoneNumber: '0988112233',
    customerSource: 'Invite link Winter_24',
    campaignLabel: 'Winter_24',
    campaignId: null,
    groupTitle: 'Dev_Ops_Global',
    ownerName: 'Campaign Operator',
    note: 'Đã rời nhóm sau đợt thử nghiệm.',
    warningCount: 2,
    lastWarnedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    joinedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    joinedRelative: '1 giờ trước',
    membershipStatus: 'left',
    statusLabel: 'Đã rời nhóm',
    statusDetail: 'Rời nhóm 25 phút trước.',
    leftAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  },
];

function formatRelativeTime(date: Date) {
  const diffInMinutes = Math.max(
    1,
    Math.round((Date.now() - date.getTime()) / 60000),
  );

  if (diffInMinutes < 60) {
    return `${diffInMinutes} phút trước`;
  }

  const diffInHours = Math.round(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} giờ trước`;
  }

  const diffInDays = Math.round(diffInHours / 24);
  return `${diffInDays} ngày trước`;
}

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramActionsService: TelegramActionsService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private canViewAllMembers(viewer?: ModerationViewer) {
    if (!viewer) {
      return true;
    }

    return viewer.permissions.some(
      (permission) =>
        permission === 'moderation.review' || permission === 'settings.manage',
    );
  }

  private resolveWorkspaceScope(viewer?: ModerationViewer) {
    if (!viewer?.workspaceId) {
      return undefined;
    }

    if (
      viewer.permissions.includes('settings.manage') ||
      viewer.permissions.includes('organization.manage')
    ) {
      return viewer.workspaceId;
    }

    return viewer.workspaceIds?.includes(viewer.workspaceId)
      ? viewer.workspaceId
      : undefined;
  }

  private async getWorkspaceGroupScope(
    workspaceId?: string,
  ): Promise<WorkspaceGroupScope | null> {
    if (!process.env.DATABASE_URL || !workspaceId) {
      return null;
    }

    const groups = await this.prisma.telegramGroup.findMany({
      where: { workspaceId },
      select: { id: true, title: true, externalId: true },
    });

    return {
      ids: groups.map((group) => group.id),
      titles: groups.map((group) => group.title),
      externalIds: groups
        .map((group) => group.externalId)
        .filter((value): value is string => Boolean(value)),
    };
  }

  private buildMemberAccessWhere(
    viewer?: ModerationViewer,
  ): Prisma.CommunityMemberWhereInput | undefined {
    if (!viewer || this.canViewAllMembers(viewer)) {
      return undefined;
    }

    return {
      campaign: {
        assigneeUserId: viewer.userId,
      },
    };
  }

  private buildAvatarInitials(displayName: string) {
    const tokens = displayName
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    if (!tokens.length) {
      return 'TG';
    }

    return tokens
      .slice(0, 2)
      .map((token) => token.charAt(0).toUpperCase())
      .join('');
  }

  private extractMember360Meta(
    rawPayload: Prisma.JsonValue | null,
  ): Member360Meta {
    if (
      !rawPayload ||
      typeof rawPayload !== 'object' ||
      Array.isArray(rawPayload) ||
      !('__member360Meta' in rawPayload)
    ) {
      return {
        ownerName: null,
        note: null,
        phoneNumber: null,
        customerSource: null,
      };
    }

    const candidate = rawPayload.__member360Meta;
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return {
        ownerName: null,
        note: null,
        phoneNumber: null,
        customerSource: null,
      };
    }

    return {
      ownerName:
        typeof candidate.ownerName === 'string' ? candidate.ownerName : null,
      note: typeof candidate.note === 'string' ? candidate.note : null,
      phoneNumber:
        typeof candidate.phoneNumber === 'string'
          ? candidate.phoneNumber
          : null,
      customerSource:
        typeof candidate.customerSource === 'string'
          ? candidate.customerSource
          : null,
    };
  }

  private buildResolvedContactBatchWhere(viewer?: ModerationViewer) {
    const workspaceId = this.resolveWorkspaceScope(viewer);
    if (workspaceId) {
      return { workspaceId };
    }

    if (!viewer) {
      return undefined;
    }

    if (
      viewer.permissions.includes('settings.manage') ||
      viewer.permissions.includes('organization.manage')
    ) {
      return undefined;
    }

    if (viewer.workspaceIds?.length) {
      return {
        workspaceId: {
          in: viewer.workspaceIds,
        },
      };
    }

    return {
      workspaceId: '__no_workspace_access__',
    };
  }

  private async getResolvedContactEntries(
    viewer?: ModerationViewer,
    externalId?: string,
  ): Promise<ResolvedContactEntry[]> {
    if (!process.env.DATABASE_URL) {
      return [];
    }

    const items = await this.prisma.contactImportItem.findMany({
      where: {
        telegramExternalId: externalId ? externalId : { not: null },
        status: {
          in: ['RESOLVED', 'SKIPPED'],
        },
        batch: this.buildResolvedContactBatchWhere(viewer),
      },
      select: {
        telegramExternalId: true,
        telegramUsername: true,
        displayName: true,
        phoneNumber: true,
        processedAt: true,
        createdAt: true,
        rawPayload: true,
      },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const latestByExternalId = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      if (!item.telegramExternalId) {
        continue;
      }
      if (!latestByExternalId.has(item.telegramExternalId)) {
        latestByExternalId.set(item.telegramExternalId, item);
      }
    }

    const externalIds = Array.from(latestByExternalId.keys());
    if (!externalIds.length) {
      return [];
    }

    const telegramUsers = await this.prisma.telegramUser.findMany({
      where: { externalId: { in: externalIds } },
      select: {
        externalId: true,
        username: true,
        displayName: true,
        phoneNumber: true,
        customerSource: true,
      },
    });
    const telegramUserByExternalId = new Map(
      telegramUsers.map((user) => [user.externalId, user]),
    );

    return externalIds.map((resolvedExternalId) => {
      const item = latestByExternalId.get(resolvedExternalId)!;
      const meta = this.extractMember360Meta(item.rawPayload);
      const telegramUser = telegramUserByExternalId.get(resolvedExternalId);
      const displayName =
        telegramUser?.displayName ||
        item.displayName ||
        item.phoneNumber ||
        `Telegram ${resolvedExternalId}`;

      return {
        externalId: resolvedExternalId,
        displayName,
        avatarInitials: this.buildAvatarInitials(displayName),
        username: telegramUser?.username || item.telegramUsername || null,
        phoneNumber: meta.phoneNumber || item.phoneNumber || null,
        customerSource: meta.customerSource || 'Contacts import',
        ownerName: meta.ownerName,
        note: meta.note,
        lastActivityAt:
          (item.processedAt || item.createdAt)?.toISOString?.() ?? null,
      };
    });
  }

  async getMembers(campaignId?: string, viewer?: ModerationViewer) {
    if (!process.env.DATABASE_URL) {
      return this.composePayload(fallbackMembers);
    }

    const workspaceId = this.resolveWorkspaceScope(viewer);
    const workspaceGroupScope = await this.getWorkspaceGroupScope(workspaceId);
    const workspaceWhere = workspaceId
      ? {
          OR: [
            {
              campaign: {
                workspaceId,
              },
            },
            ...(workspaceGroupScope?.titles.length
              ? [
                  {
                    groupTitle: {
                      in: workspaceGroupScope.titles,
                    },
                  },
                ]
              : []),
          ],
        }
      : undefined;
    const members = await this.prisma.communityMember.findMany({
      include: {
        campaign: true,
        telegramUser: true,
      },
      where: {
        ...(campaignId ? { campaignId } : {}),
        ...(this.buildMemberAccessWhere(viewer) || {}),
        ...(workspaceWhere || {}),
      },
      orderBy: { joinedAt: 'desc' },
    });

    return this.composePayload(
      members.map((member) => {
        const hasLeft = Boolean(member.leftAt);
        const scopedPhoneNumber = workspaceId
          ? null
          : (member.telegramUser?.phoneNumber ?? null);
        const scopedCustomerSource = workspaceId
          ? null
          : (member.telegramUser?.customerSource ?? null);
        return {
          id: member.id,
          displayName: member.displayName,
          avatarInitials: member.avatarInitials,
          externalId: member.externalId,
          username: member.username,
          phoneNumber: scopedPhoneNumber,
          customerSource: scopedCustomerSource,
          campaignLabel: member.campaign?.name || member.campaignLabel,
          campaignId: member.campaignId,
          groupTitle: member.groupTitle,
          ownerName: member.ownerName,
          note: member.note,
          warningCount: member.warningCount,
          lastWarnedAt: member.lastWarnedAt
            ? member.lastWarnedAt.toISOString()
            : null,
          joinedAt: member.joinedAt.toISOString(),
          joinedRelative: formatRelativeTime(member.joinedAt),
          membershipStatus: hasLeft ? 'left' : 'active',
          statusLabel: hasLeft ? 'Đã rời nhóm' : 'Đang ở trong nhóm',
          statusDetail:
            hasLeft && member.leftAt
              ? `Rời nhóm ${formatRelativeTime(member.leftAt)}.`
              : 'Chưa ghi nhận sự kiện rời nhóm.',
          leftAt: member.leftAt ? member.leftAt.toISOString() : null,
        } satisfies ModerationMember;
      }),
    );
  }

  async getMember360Summary(viewer?: ModerationViewer) {
    const payload = await this.getMembers(undefined, viewer);
    const grouped = new Map<string, Member360SummaryItem>();

    for (const member of payload.members) {
      const existing = grouped.get(member.externalId);
      if (existing) {
        existing.groupsTotalCount += 1;
        existing.joinCount += 1;
        existing.leftCount += member.leftAt ? 1 : 0;
        existing.warningTotal += member.warningCount;
        existing.phoneNumber = existing.phoneNumber || member.phoneNumber;
        existing.customerSource =
          existing.customerSource || member.customerSource;
        existing.lastActivityAt =
          !existing.lastActivityAt ||
          new Date(member.joinedAt).getTime() >
            new Date(existing.lastActivityAt).getTime()
            ? member.joinedAt
            : existing.lastActivityAt;

        if (member.membershipStatus === 'active') {
          existing.groupsActiveCount += 1;
          existing.currentGroups.push({
            groupTitle: member.groupTitle,
            campaignLabel: member.campaignLabel,
            joinedAt: member.joinedAt,
            warningCount: member.warningCount,
          });
        }
        continue;
      }

      grouped.set(member.externalId, {
        externalId: member.externalId,
        displayName: member.displayName,
        avatarInitials: member.avatarInitials,
        username: member.username,
        phoneNumber: member.phoneNumber,
        customerSource: member.customerSource,
        ownerName: member.ownerName,
        note: member.note,
        groupsActiveCount: member.membershipStatus === 'active' ? 1 : 0,
        groupsTotalCount: 1,
        joinCount: 1,
        leftCount: member.leftAt ? 1 : 0,
        warningTotal: member.warningCount,
        lastActivityAt: member.joinedAt,
        currentGroups:
          member.membershipStatus === 'active'
            ? [
                {
                  groupTitle: member.groupTitle,
                  campaignLabel: member.campaignLabel,
                  joinedAt: member.joinedAt,
                  warningCount: member.warningCount,
                },
              ]
            : [],
      });
    }

    const resolvedContacts = await this.getResolvedContactEntries(viewer);
    for (const contact of resolvedContacts) {
      const existing = grouped.get(contact.externalId);
      if (existing) {
        existing.phoneNumber = existing.phoneNumber || contact.phoneNumber;
        existing.customerSource =
          existing.customerSource || contact.customerSource;
        existing.ownerName = existing.ownerName || contact.ownerName;
        existing.note = existing.note || contact.note;
        existing.username = existing.username || contact.username;
        existing.lastActivityAt =
          !existing.lastActivityAt ||
          (contact.lastActivityAt &&
            new Date(contact.lastActivityAt).getTime() >
              new Date(existing.lastActivityAt).getTime())
            ? contact.lastActivityAt
            : existing.lastActivityAt;
        continue;
      }

      grouped.set(contact.externalId, {
        externalId: contact.externalId,
        displayName: contact.displayName,
        avatarInitials: contact.avatarInitials,
        username: contact.username,
        phoneNumber: contact.phoneNumber,
        customerSource: contact.customerSource,
        ownerName: contact.ownerName,
        note: contact.note,
        groupsActiveCount: 0,
        groupsTotalCount: 0,
        joinCount: 0,
        leftCount: 0,
        warningTotal: 0,
        lastActivityAt: contact.lastActivityAt,
        currentGroups: [],
      });
    }

    return {
      items: Array.from(grouped.values()).sort((left, right) => {
        const leftTime = left.lastActivityAt
          ? new Date(left.lastActivityAt).getTime()
          : 0;
        const rightTime = right.lastActivityAt
          ? new Date(right.lastActivityAt).getTime()
          : 0;
        return rightTime - leftTime;
      }),
    };
  }

  async getMember360Profile(
    externalId: string,
    viewer?: ModerationViewer,
  ): Promise<Member360ProfileResponse> {
    const payload = await this.getMembers(undefined, viewer);
    const memberships = payload.members.filter(
      (member) => member.externalId === externalId,
    );
    const resolvedContact = (
      await this.getResolvedContactEntries(viewer, externalId)
    )[0];

    if (!memberships.length && !resolvedContact) {
      return {
        found: false,
        profile: null,
      };
    }

    if (!memberships.length && resolvedContact) {
      return {
        found: true,
        profile: {
          externalId: resolvedContact.externalId,
          displayName: resolvedContact.displayName,
          avatarInitials: resolvedContact.avatarInitials,
          username: resolvedContact.username,
          phoneNumber: resolvedContact.phoneNumber,
          customerSource: resolvedContact.customerSource,
          ownerName: resolvedContact.ownerName,
          note: resolvedContact.note,
          groupsActiveCount: 0,
          groupsTotalCount: 0,
          joinCount: 0,
          leftCount: 0,
          warningTotal: 0,
          lastActivityAt: resolvedContact.lastActivityAt,
          currentGroups: [],
          memberships: [],
          timeline: [],
          moderationTimeline: [],
          inviteTimeline: [],
        },
      };
    }

    const currentGroups = memberships.filter(
      (member) => member.membershipStatus === 'active',
    );

    const timeline: Member360TimelineEvent[] = memberships
      .flatMap((member) => [
        {
          id: `${member.id}-join`,
          type: 'join' as const,
          timestamp: member.joinedAt,
          detail: `Vào ${member.groupTitle}${member.campaignLabel ? ` qua ${member.campaignLabel}` : ''}`,
          groupTitle: member.groupTitle,
          campaignLabel: member.campaignLabel || null,
        },
        ...(member.leftAt
          ? [
              {
                id: `${member.id}-left`,
                type: 'left' as const,
                timestamp: member.leftAt,
                detail: `Rời ${member.groupTitle}`,
                groupTitle: member.groupTitle,
                campaignLabel: member.campaignLabel || null,
              },
            ]
          : []),
        ...(member.warningCount > 0 && member.lastWarnedAt
          ? [
              {
                id: `${member.id}-warn`,
                type: 'warn' as const,
                timestamp: member.lastWarnedAt,
                detail: `${member.warningCount} cảnh báo tại ${member.groupTitle}`,
                groupTitle: member.groupTitle,
                campaignLabel: member.campaignLabel || null,
              },
            ]
          : []),
      ])
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      );

    const first = memberships[0];

    let moderationTimeline: Member360TimelineEvent[] = [];
    let inviteTimeline: Member360TimelineEvent[] = [];
    let phoneNumber = first.phoneNumber;
    let customerSource = first.customerSource;
    let ownerName = first.ownerName;
    let note = first.note;

    if (process.env.DATABASE_URL) {
      const [spamEvents, inviteEvents, telegramUser] = await Promise.all([
        this.prisma.spamEvent.findMany({
          where: {
            actorExternalId: externalId,
            groupTitle: {
              in: memberships.map((member) => member.groupTitle),
            },
            OR: [
              { decision: { not: SpamDecision.ALLOW } },
              { manualDecision: { not: null } },
              { lastActionAt: { not: null } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.inviteLinkEvent.findMany({
          where: {
            actorExternalId: externalId,
            groupTitle: {
              in: memberships.map((member) => member.groupTitle),
            },
          },
          include: {
            inviteLink: {
              include: {
                campaign: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.telegramUser.findUnique({
          where: { externalId },
          include: {
            membershipSessions: {
              orderBy: { joinedAt: 'desc' },
            },
          },
        }),
      ]);

      moderationTimeline = spamEvents.map((event) => {
        const matchedRules = Array.isArray(event.matchedRules)
          ? event.matchedRules.join(', ')
          : '';
        const actionLogs = Array.isArray(event.actionLogs)
          ? event.actionLogs
          : [];
        const actionVariant =
          actionLogs.length && typeof actionLogs[0] === 'object'
            ? String(
                (actionLogs[0] as { actionVariant?: string }).actionVariant ||
                  '',
              )
            : '';

        return {
          id: `spam-${event.id}`,
          type: 'warn',
          timestamp:
            event.lastActionAt?.toISOString() ||
            event.reviewedAt?.toISOString() ||
            event.createdAt.toISOString(),
          detail: actionVariant
            ? `Moderation ${event.decision}: ${actionVariant}${matchedRules ? ` · ${matchedRules}` : ''}`
            : `Moderation ${event.decision}${matchedRules ? ` · ${matchedRules}` : ''}`,
          groupTitle: event.groupTitle,
          campaignLabel: event.campaignLabel || null,
        };
      });

      inviteTimeline = inviteEvents.map((event) => ({
        id: `invite-${event.id}`,
        type:
          event.eventType === 'USER_LEFT'
            ? 'left'
            : event.eventType === 'JOIN_REQUEST'
              ? 'warn'
              : 'join',
        timestamp: event.createdAt.toISOString(),
        detail:
          event.detail ||
          (event.eventType === 'JOIN_REQUEST'
            ? 'Tạo yêu cầu tham gia'
            : event.eventType === 'USER_JOINED'
              ? 'Vào nhóm qua link mời'
              : 'Rời nhóm'),
        groupTitle: event.groupTitle,
        campaignLabel: event.inviteLink?.campaign?.name || null,
      }));

      if (telegramUser) {
        phoneNumber = telegramUser.phoneNumber || phoneNumber;
        customerSource = telegramUser.customerSource || customerSource;
      }

      if (telegramUser?.membershipSessions.length) {
        customerSource =
          telegramUser.membershipSessions.find((session) => session.joinSource)
            ?.joinSource || customerSource;

        const sessionTimeline = telegramUser.membershipSessions.flatMap(
          (session) => [
            {
              id: `session-${session.id}-join`,
              type: 'join' as const,
              timestamp: session.joinedAt.toISOString(),
              detail: `Session #${session.sessionNo} vào ${session.groupTitle}${session.campaignLabel ? ` qua ${session.campaignLabel}` : ''}`,
              groupTitle: session.groupTitle,
              campaignLabel: session.campaignLabel || null,
            },
            ...(session.leftAt
              ? [
                  {
                    id: `session-${session.id}-left`,
                    type: 'left' as const,
                    timestamp: session.leftAt.toISOString(),
                    detail: `Session #${session.sessionNo} rời ${session.groupTitle}${session.leaveReason ? ` · ${session.leaveReason}` : ''}`,
                    groupTitle: session.groupTitle,
                    campaignLabel: session.campaignLabel || null,
                  },
                ]
              : []),
          ],
        );

        timeline.splice(
          0,
          timeline.length,
          ...[...timeline, ...sessionTimeline].sort(
            (left, right) =>
              new Date(right.timestamp).getTime() -
              new Date(left.timestamp).getTime(),
          ),
        );
      }
    }

    if (resolvedContact) {
      phoneNumber = phoneNumber || resolvedContact.phoneNumber;
      customerSource = customerSource || resolvedContact.customerSource;
      ownerName = ownerName || resolvedContact.ownerName;
      note = note || resolvedContact.note;
    }

    return {
      found: true,
      profile: {
        externalId,
        displayName: first.displayName,
        avatarInitials: first.avatarInitials,
        username: first.username,
        phoneNumber,
        customerSource,
        ownerName,
        note,
        groupsActiveCount: currentGroups.length,
        groupsTotalCount: memberships.length,
        joinCount: memberships.length,
        leftCount: memberships.filter((member) => member.leftAt).length,
        warningTotal: memberships.reduce(
          (total, member) => total + member.warningCount,
          0,
        ),
        lastActivityAt:
          memberships
            .map((member) => member.joinedAt)
            .sort()
            .at(-1) || null,
        currentGroups,
        memberships,
        timeline,
        moderationTimeline,
        inviteTimeline,
      },
    };
  }

  async getMemberDetail(memberId: string, viewer?: ModerationViewer) {
    if (!process.env.DATABASE_URL) {
      const fallbackMember = fallbackMembers.find(
        (member) => member.id === memberId,
      );
      return {
        found: Boolean(fallbackMember),
        member: fallbackMember || null,
      };
    }

    const member = await this.prisma.communityMember.findFirst({
      where: {
        id: memberId,
        ...(this.buildMemberAccessWhere(viewer) || {}),
      },
      include: {
        campaign: true,
        telegramUser: true,
      },
    });

    return {
      found: Boolean(member),
      member: member
        ? {
            id: member.id,
            displayName: member.displayName,
            avatarInitials: member.avatarInitials,
            externalId: member.externalId,
            username: member.username,
            phoneNumber: member.telegramUser?.phoneNumber || null,
            customerSource: member.telegramUser?.customerSource || null,
            campaignLabel: member.campaign?.name || member.campaignLabel,
            campaignId: member.campaignId,
            groupTitle: member.groupTitle,
            ownerName: member.ownerName,
            note: member.note,
            warningCount: member.warningCount,
            lastWarnedAt: member.lastWarnedAt
              ? member.lastWarnedAt.toISOString()
              : null,
            joinedAt: member.joinedAt.toISOString(),
            joinedRelative: formatRelativeTime(member.joinedAt),
            membershipStatus: member.leftAt ? 'left' : 'active',
            statusLabel: member.leftAt ? 'Đã rời nhóm' : 'Đang ở trong nhóm',
            statusDetail: member.leftAt
              ? `Rời nhóm ${formatRelativeTime(member.leftAt)}.`
              : 'Chưa ghi nhận sự kiện rời nhóm.',
            leftAt: member.leftAt ? member.leftAt.toISOString() : null,
          }
        : null,
    };
  }

  async updateMember(
    memberId: string,
    input: {
      ownerName?: string | null;
      note?: string | null;
      phoneNumber?: string | null;
      customerSource?: string | null;
      viewer?: ModerationViewer;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      const fallbackMember = fallbackMembers.find(
        (member) => member.id === memberId,
      );
      if (!fallbackMember) {
        return { found: false, member: null };
      }

      fallbackMember.ownerName = input.ownerName?.trim() || null;
      fallbackMember.note = input.note?.trim() || null;
      fallbackMember.phoneNumber = input.phoneNumber?.trim() || null;
      fallbackMember.customerSource = input.customerSource?.trim() || null;

      return {
        found: true,
        member: fallbackMember,
      };
    }

    const existingMember = await this.prisma.communityMember.findFirst({
      where: {
        id: memberId,
        ...(this.buildMemberAccessWhere(input.viewer) || {}),
      },
      select: {
        id: true,
        telegramUserId: true,
      },
    });

    if (!existingMember) {
      return { found: false, member: null };
    }

    const member = await this.prisma.communityMember.update({
      where: { id: existingMember.id },
      data: {
        ownerName: input.ownerName?.trim() || null,
        note: input.note?.trim() || null,
      },
      include: {
        telegramUser: true,
      },
    });

    if (existingMember.telegramUserId) {
      await this.prisma.telegramUser.update({
        where: { id: existingMember.telegramUserId },
        data: {
          phoneNumber: input.phoneNumber?.trim() || null,
          customerSource: input.customerSource?.trim() || null,
        },
      });
    }

    return this.getMemberDetail(member.id, input.viewer);
  }

  async updateMember360Profile(
    externalId: string,
    input: {
      ownerName?: string | null;
      note?: string | null;
      phoneNumber?: string | null;
      customerSource?: string | null;
      viewer?: ModerationViewer;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      return this.getMember360Profile(externalId, input.viewer);
    }

    const latestResolvedItem = await this.prisma.contactImportItem.findFirst({
      where: {
        telegramExternalId: externalId,
        status: {
          in: ['RESOLVED', 'SKIPPED'],
        },
        batch: this.buildResolvedContactBatchWhere(input.viewer),
      },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        rawPayload: true,
      },
    });

    if (!latestResolvedItem) {
      return { found: false, profile: null };
    }

    const currentRawPayload =
      latestResolvedItem.rawPayload &&
      typeof latestResolvedItem.rawPayload === 'object' &&
      !Array.isArray(latestResolvedItem.rawPayload)
        ? { ...latestResolvedItem.rawPayload }
        : latestResolvedItem.rawPayload !== undefined
          ? {
              source:
                (latestResolvedItem.rawPayload as Prisma.InputJsonValue | null) ??
                null,
            }
          : {};

    const existingMeta = this.extractMember360Meta(
      latestResolvedItem.rawPayload,
    );

    await this.prisma.contactImportItem.update({
      where: { id: latestResolvedItem.id },
      data: {
        rawPayload: {
          ...currentRawPayload,
          __member360Meta: {
            ...existingMeta,
            ownerName: input.ownerName?.trim() || null,
            note: input.note?.trim() || null,
            phoneNumber: input.phoneNumber?.trim() || null,
            customerSource: input.customerSource?.trim() || null,
          },
        },
      },
    });

    return this.getMember360Profile(externalId, input.viewer);
  }

  async resetMemberWarning(memberId: string, viewer?: ModerationViewer) {
    if (!process.env.DATABASE_URL) {
      const fallbackMember = fallbackMembers.find(
        (member) => member.id === memberId,
      );
      if (!fallbackMember) {
        return { found: false, member: null };
      }

      fallbackMember.warningCount = 0;
      fallbackMember.lastWarnedAt = null;
      return {
        found: true,
        member: fallbackMember,
      };
    }

    const member = await this.prisma.communityMember.findFirst({
      where: {
        id: memberId,
        ...(this.buildMemberAccessWhere(viewer) || {}),
      },
    });

    if (!member) {
      return { found: false, member: null };
    }

    await this.prisma.communityMember.update({
      where: { id: member.id },
      data: {
        warningCount: 0,
        lastWarnedAt: null,
      },
    });

    return this.getMemberDetail(member.id, viewer);
  }

  async importMember360Customers(rows: Record<string, unknown>[]) {
    const normalizedRows = rows
      .map((row) => this.normalizeMember360ImportRow(row))
      .filter((row): row is Member360ImportRow => Boolean(row?.externalId));

    if (!process.env.DATABASE_URL) {
      return {
        imported: 0,
        skipped: normalizedRows.length,
        total: normalizedRows.length,
        message:
          'Import Excel chỉ hoạt động khi backend đang kết nối PostgreSQL.',
      };
    }

    let imported = 0;

    for (const row of normalizedRows) {
      const linkedMembers = await this.prisma.communityMember.findMany({
        where: { externalId: row.externalId },
        orderBy: { joinedAt: 'desc' },
      });

      if (!linkedMembers.length) {
        continue;
      }

      let telegramUser = await this.prisma.telegramUser.findUnique({
        where: { externalId: row.externalId },
      });

      if (!telegramUser) {
        const seed = linkedMembers[0];
        telegramUser = await this.prisma.telegramUser.create({
          data: {
            externalId: row.externalId,
            username: seed.username,
            displayName: seed.displayName,
            avatarInitials: seed.avatarInitials,
            phoneNumber: row.phoneNumber,
            customerSource: row.customerSource,
          },
        });

        await this.prisma.communityMember.updateMany({
          where: {
            externalId: row.externalId,
            OR: [{ telegramUserId: null }, { telegramUserId: telegramUser.id }],
          },
          data: { telegramUserId: telegramUser.id },
        });
      } else {
        await this.prisma.telegramUser.update({
          where: { id: telegramUser.id },
          data: {
            phoneNumber: row.phoneNumber || null,
            customerSource: row.customerSource || null,
          },
        });

        await this.prisma.communityMember.updateMany({
          where: {
            externalId: row.externalId,
            telegramUserId: null,
          },
          data: { telegramUserId: telegramUser.id },
        });
      }

      imported += 1;
    }

    return {
      imported,
      skipped: rows.length - imported,
      total: rows.length,
      message: `Đã cập nhật ${imported} khách hàng theo ID số.`,
    };
  }

  async getConfig(workspaceId?: string) {
    const fallbackConfig = {
      builtInRules: this.getBuiltInRules(),
      scopes: [
        {
          scopeKey: 'global',
          scopeType: 'GLOBAL',
          scopeLabel: 'Mặc định toàn hệ thống',
          telegramGroupId: null,
          inheritsFromGlobal: false,
          autoBanSpam: true,
          muteNewMembers: true,
          muteDurationHours: 24,
          keywords: [
            { id: 'fallback-crypto-bot', value: 'crypto_bot' },
            { id: 'fallback-airdrop', value: 'airdrop' },
          ],
          domains: [
            { id: 'fallback-bitly', value: 'bit.ly', mode: 'BLOCK' },
            { id: 'fallback-nexus', value: 'app.nexus.local', mode: 'ALLOW' },
          ],
        },
      ],
    };

    if (!process.env.DATABASE_URL) {
      return fallbackConfig;
    }

    await this.ensureGlobalPolicy();

    const [groups, policies] = await Promise.all([
      this.prisma.telegramGroup.findMany({
        where: workspaceId ? { workspaceId } : undefined,
        orderBy: { title: 'asc' },
      }),
      this.prisma.moderationPolicy.findMany({
        include: {
          keywords: {
            orderBy: { value: 'asc' },
          },
          domains: {
            orderBy: [{ mode: 'asc' }, { value: 'asc' }],
          },
          telegramGroup: true,
        },
        orderBy: [{ scopeType: 'asc' }, { scopeLabel: 'asc' }],
      }),
    ]);

    const globalPolicy =
      policies.find((policy) => policy.scopeKey === 'global') || null;
    const allowedGroupIds = new Set(groups.map((group) => group.id));
    const groupPolicies = new Map(
      policies
        .filter(
          (policy) =>
            policy.scopeType === 'GROUP' &&
            policy.telegramGroupId &&
            allowedGroupIds.has(policy.telegramGroupId),
        )
        .map((policy) => [policy.telegramGroupId as string, policy]),
    );

    const scopes = [
      this.mapScopeRecord(globalPolicy, false, 'Mặc định toàn hệ thống'),
      ...groups.map((group) => {
        const policy = groupPolicies.get(group.id) || null;
        return this.mapScopeRecord(
          policy,
          !policy,
          group.title,
          group.id,
          globalPolicy,
        );
      }),
    ].filter(Boolean);

    return {
      builtInRules: this.getBuiltInRules(),
      scopes,
    };
  }

  async upsertScopePolicy(input: {
    scopeKey: string;
    autoBanSpam: boolean;
    muteNewMembers: boolean;
    muteDurationHours: number;
  }) {
    if (!process.env.DATABASE_URL) {
      return this.getConfig();
    }

    const scope = await this.ensureScopePolicy(input.scopeKey);

    await this.prisma.moderationPolicy.update({
      where: { id: scope.id },
      data: {
        autoBanSpam: Boolean(input.autoBanSpam),
        muteNewMembers: Boolean(input.muteNewMembers),
        muteDurationHours: Math.max(
          1,
          Math.min(168, Math.round(Number(input.muteDurationHours || 24))),
        ),
      },
    });

    return this.getConfig();
  }

  async addKeyword(input: { scopeKey: string; value: string }) {
    if (!process.env.DATABASE_URL) {
      return this.getConfig();
    }

    const normalizedValue = normalizeRuleValue(input.value);
    if (!normalizedValue) {
      return this.getConfig();
    }

    const scope = await this.ensureScopePolicy(input.scopeKey);

    await this.prisma.moderationKeyword.upsert({
      where: {
        moderationPolicyId_normalizedValue: {
          moderationPolicyId: scope.id,
          normalizedValue,
        },
      },
      update: {
        value: input.value.trim(),
      },
      create: {
        moderationPolicyId: scope.id,
        value: input.value.trim(),
        normalizedValue,
      },
    });

    return this.getConfig();
  }

  async removeKeyword(keywordId: string) {
    if (process.env.DATABASE_URL) {
      await this.prisma.moderationKeyword.delete({
        where: { id: keywordId },
      });
    }

    return this.getConfig();
  }

  async addDomain(input: {
    scopeKey: string;
    value: string;
    mode: 'BLOCK' | 'ALLOW';
  }) {
    if (!process.env.DATABASE_URL) {
      return this.getConfig();
    }

    const normalizedValue = normalizeRuleValue(input.value);
    if (!normalizedValue) {
      return this.getConfig();
    }

    const scope = await this.ensureScopePolicy(input.scopeKey);

    await this.prisma.moderationDomain.upsert({
      where: {
        moderationPolicyId_normalizedValue_mode: {
          moderationPolicyId: scope.id,
          normalizedValue,
          mode:
            input.mode === 'ALLOW'
              ? ModerationListMode.ALLOW
              : ModerationListMode.BLOCK,
        },
      },
      update: {
        value: input.value.trim(),
      },
      create: {
        moderationPolicyId: scope.id,
        value: input.value.trim(),
        normalizedValue,
        mode:
          input.mode === 'ALLOW'
            ? ModerationListMode.ALLOW
            : ModerationListMode.BLOCK,
      },
    });

    return this.getConfig();
  }

  async removeDomain(domainId: string) {
    if (process.env.DATABASE_URL) {
      await this.prisma.moderationDomain.delete({
        where: { id: domainId },
      });
    }

    return this.getConfig();
  }

  async applyManualAction(input: {
    eventId: string;
    decision: SpamDecision;
    note?: string;
  }) {
    if (!process.env.DATABASE_URL) {
      return {
        updated: false,
        fallback: true,
      };
    }

    const updated = await this.prisma.spamEvent.update({
      where: {
        id: input.eventId,
      },
      data: {
        manualDecision: input.decision,
        manualNote: String(input.note || '').trim() || null,
        reviewedAt: new Date(),
      },
    });

    const action =
      input.decision === SpamDecision.REVIEW ||
      input.decision === SpamDecision.WARN
        ? {
            enforced: false,
            skipped: true,
            reason:
              'Review/Warn chi cap nhat workflow, khong goi Telegram API.',
            decision: input.decision,
            operations: [],
          }
        : await this.telegramActionsService.executeModerationDecision({
            source: 'manual',
            spamEventId: updated.id,
            eventType: updated.eventType,
            decision: input.decision,
            chatId: updated.groupExternalId,
            userId: updated.actorExternalId,
            messageId: updated.messageExternalId,
            note: input.note || '',
            groupTitle: updated.groupTitle,
            actorExternalId: updated.actorExternalId,
            actorUsername: updated.actorUsername,
            reasonSummary: this.buildAnnouncementReasonSummary(
              Array.isArray(updated.matchedRules)
                ? updated.matchedRules
                    .map((rule) =>
                      typeof rule === 'string' ? rule.trim() : '',
                    )
                    .filter(Boolean)
                : [],
              input.note || '',
            ),
            operatorName: 'CRM Admin',
            silentActions: await this.resolveSilentActionsForGroup({
              groupExternalId: updated.groupExternalId,
              groupTitle: updated.groupTitle,
            }),
          });

    await this.systemLogsService.log({
      level: action.enforced ? 'INFO' : 'WARN',
      scope: 'moderation.manual',
      action: 'apply_manual_action',
      message: `Manual moderation action ${input.decision} on spam event ${updated.id}`,
      detail: 'reason' in action ? action.reason || null : null,
      payload: {
        eventId: updated.id,
        inputDecision: input.decision,
        action,
      },
    });

    const memberImpact = await this.applyMemberModerationEffect(updated, input);

    return {
      updated: true,
      id: updated.id,
      manualDecision: updated.manualDecision,
      manualNote: updated.manualNote,
      reviewedAt: updated.reviewedAt?.toISOString() || null,
      action,
      memberImpact,
    };
  }

  async getDebugOverview(workspaceId?: string) {
    const workspaceScope = await this.getWorkspaceGroupScope(workspaceId);
    const jobs = (await this.telegramActionsService.listActionJobs(
      30,
      workspaceId,
    )) as Array<{
      id: string;
      source: string;
      status: string;
      eventType: string;
      actionVariant: string;
      chatId: string;
      userId: string;
      groupTitle: string | null;
      note: string | null;
      commandText: string | null;
      expireAt: string | null;
      completedAt: string | null;
      lastError: string | null;
    }>;
    const logs = (await this.systemLogsService.findRecent({
      limit: 40,
    })) as Array<{
      id: string;
      level: 'INFO' | 'WARN' | 'ERROR';
      scope: string;
      action: string;
      message: string;
      detail: string | null;
      payload?: unknown;
      createdAt: string;
    }>;

    const filteredLogs = workspaceScope
      ? logs.filter((log) => {
          const payload = log.payload as
            | { groupTitle?: string; groupExternalId?: string; chatId?: string }
            | undefined;

          return Boolean(
            (payload?.groupTitle &&
              workspaceScope.titles.includes(payload.groupTitle)) ||
            (payload?.groupExternalId &&
              workspaceScope.externalIds.includes(payload.groupExternalId)) ||
            (payload?.chatId &&
              workspaceScope.externalIds.includes(String(payload.chatId))),
          );
        })
      : logs;

    return {
      jobs,
      logs: filteredLogs,
    };
  }

  async processDueActionJobs(workspaceId?: string) {
    return this.telegramActionsService.processDueActionJobs(30, workspaceId);
  }

  async getWarningEscalationPreview(input: {
    actorExternalId?: string | null;
    groupTitle: string;
    decision: SpamDecision;
    workspaceId?: string;
  }): Promise<WarningEscalationPreview> {
    const warnSettings = await this.resolveWarnSettingsForGroup({
      groupTitle: input.groupTitle,
      workspaceId: input.workspaceId,
    });
    const defaultPreview = {
      memberId: null,
      currentWarningCount: 0,
      nextWarningCount: 0,
      warnLimit: warnSettings.warnLimit,
      warnAction: warnSettings.warnAction,
      actionVariant: warnSettings.warnAction,
      incrementWarning: false,
      triggered: false,
      effectiveDecision: input.decision,
      muteDurationHours: warnSettings.warnActionDurationHours,
      durationSeconds: warnSettings.warnActionDurationSeconds,
      matchedRules: [] as string[],
    } satisfies WarningEscalationPreview;

    if (input.decision !== SpamDecision.WARN) {
      return defaultPreview;
    }

    const actorExternalId = String(input.actorExternalId || '').trim();
    const member = process.env.DATABASE_URL
      ? await this.findCommunityMemberForEvent(
          actorExternalId,
          input.groupTitle,
          input.workspaceId,
        )
      : fallbackMembers.find(
          (candidate) =>
            candidate.externalId === actorExternalId &&
            candidate.groupTitle === input.groupTitle,
        ) || null;

    const currentWarningCount = this.getEffectiveWarningCount(
      member?.warningCount || 0,
      member?.lastWarnedAt || null,
      warnSettings.warningExpirySeconds,
    );
    const nextWarningCount = currentWarningCount + 1;
    const triggered =
      warnSettings.lockWarns && nextWarningCount >= warnSettings.warnLimit;

    return {
      memberId: member?.id || null,
      currentWarningCount,
      nextWarningCount,
      warnLimit: warnSettings.warnLimit,
      warnAction: warnSettings.warnAction,
      actionVariant: warnSettings.warnAction,
      incrementWarning: true,
      triggered,
      effectiveDecision: triggered
        ? this.mapWarnActionToDecision(warnSettings.warnAction)
        : SpamDecision.WARN,
      muteDurationHours: warnSettings.warnActionDurationHours,
      durationSeconds: warnSettings.warnActionDurationSeconds,
      matchedRules: triggered
        ? [
            `warning_ladder:${nextWarningCount}/${warnSettings.warnLimit}`,
            `warning_action:${warnSettings.warnAction}`,
          ]
        : [`warning_count:${nextWarningCount}/${warnSettings.warnLimit}`],
    };
  }

  async applyAutomatedDecisionEffect(input: {
    actorExternalId?: string | null;
    groupTitle: string;
    incrementWarning: boolean;
    workspaceId?: string;
  }) {
    const actorExternalId = String(input.actorExternalId || '').trim() || null;

    if (!actorExternalId) {
      return {
        memberId: null,
        warningCount: null,
        warningApplied: false,
      };
    }

    if (!process.env.DATABASE_URL) {
      const fallbackMember = fallbackMembers.find(
        (member) =>
          member.externalId === actorExternalId &&
          member.groupTitle === input.groupTitle,
      );

      if (!fallbackMember) {
        return {
          memberId: null,
          warningCount: null,
          warningApplied: false,
        };
      }

      if (input.incrementWarning) {
        fallbackMember.warningCount += 1;
        fallbackMember.lastWarnedAt = new Date().toISOString();
      }

      return {
        memberId: fallbackMember.id,
        warningCount: fallbackMember.warningCount,
        warningApplied: input.incrementWarning,
      };
    }

    const member = await this.findCommunityMemberForEvent(
      actorExternalId,
      input.groupTitle,
      input.workspaceId,
    );

    if (!member) {
      return {
        memberId: null,
        warningCount: null,
        warningApplied: false,
      };
    }

    const warnSettings = await this.resolveWarnSettingsForGroup({
      groupTitle: input.groupTitle,
      workspaceId: input.workspaceId,
    });
    const currentWarningCount = this.getEffectiveWarningCount(
      member.warningCount,
      member.lastWarnedAt,
      warnSettings.warningExpirySeconds,
    );

    if (!input.incrementWarning) {
      return {
        memberId: member.id,
        warningCount: currentWarningCount,
        warningApplied: false,
      };
    }

    const updatedMember = await this.prisma.communityMember.update({
      where: { id: member.id },
      data: {
        warningCount: currentWarningCount + 1,
        lastWarnedAt: new Date(),
      },
    });

    return {
      memberId: updatedMember.id,
      warningCount: updatedMember.warningCount,
      warningApplied: true,
    };
  }

  private async applyMemberModerationEffect(
    spamEvent: {
      actorExternalId?: string | null;
      groupTitle: string;
    },
    input: { decision: SpamDecision },
  ) {
    return this.applyAutomatedDecisionEffect({
      actorExternalId: spamEvent.actorExternalId || null,
      groupTitle: spamEvent.groupTitle,
      incrementWarning: input.decision === SpamDecision.WARN,
    });
  }

  private async resolveSilentActionsForGroup(input: {
    groupExternalId?: string | null;
    groupTitle?: string | null;
  }) {
    if (!process.env.DATABASE_URL) {
      return false;
    }

    const group = await this.prisma.telegramGroup.findFirst({
      where: {
        OR: [
          input.groupExternalId
            ? { externalId: input.groupExternalId }
            : undefined,
          input.groupTitle ? { title: input.groupTitle } : undefined,
        ].filter(Boolean) as never,
      },
      include: {
        moderationSettings: true,
      },
    });

    return group?.moderationSettings?.silentActions ?? false;
  }

  private buildAnnouncementReasonSummary(
    matchedRules?: string[] | null,
    fallbackNote?: string | null,
  ) {
    const normalizedRules = Array.from(
      new Set(
        (matchedRules || [])
          .map((rule) => this.formatAnnouncementRule(rule))
          .filter(Boolean),
      ),
    ).slice(0, 4);

    if (normalizedRules.length > 0) {
      return normalizedRules.join(', ');
    }

    const note = String(fallbackNote || '').trim();
    return note || null;
  }

  private formatAnnouncementRule(rule: string) {
    const normalizedRule = String(rule || '').trim();
    if (!normalizedRule) {
      return null;
    }

    if (normalizedRule.startsWith('lock:')) {
      const lockKey = normalizedRule.slice(5);
      const lockLabels: Record<string, string> = {
        url: 'chứa liên kết',
        invitelink: 'chứa link mời Telegram',
        forward: 'tin nhắn chuyển tiếp',
        email: 'chứa email',
        phone: 'chứa số điện thoại',
        bot: 'gửi qua bot',
        photo: 'gửi ảnh',
        video: 'gửi video',
        document: 'gửi tài liệu',
        sticker: 'gửi sticker',
      };
      return lockLabels[lockKey] || `vi phạm ${lockKey}`;
    }

    if (normalizedRule.startsWith('antiflood:')) {
      return `gửi tin quá nhanh (${normalizedRule.slice('antiflood:'.length)})`;
    }

    if (normalizedRule.startsWith('warning_ladder:')) {
      return `vượt ngưỡng cảnh báo (${normalizedRule.slice('warning_ladder:'.length)})`;
    }

    if (normalizedRule.startsWith('warning_action:')) {
      const action = normalizedRule.slice('warning_action:'.length);
      const labels: Record<string, string> = {
        mute: 'nâng lên khóa chat',
        tmute: 'nâng lên khóa chat tạm thời',
        kick: 'nâng lên kick',
        ban: 'nâng lên cấm khỏi nhóm',
        tban: 'nâng lên cấm tạm thời',
      };
      return labels[action] || `nâng mức ${action}`;
    }

    return normalizedRule.replace(/_/g, ' ');
  }

  async getResolvedPolicyForGroup(input: {
    groupTitle: string;
    groupExternalId?: string | null;
    workspaceId?: string;
  }) {
    if (!process.env.DATABASE_URL) {
      return {
        scopeKey: 'global',
        scopeLabel: 'Mặc định toàn hệ thống',
        autoBanSpam: true,
        muteNewMembers: true,
        muteDurationHours: 24,
        customKeywords: ['crypto_bot', 'airdrop'],
        blockDomains: ['bit.ly', 'tinyurl.com'],
        allowDomains: ['app.nexus.local'],
      };
    }

    const globalPolicy = await this.ensureGlobalPolicy();
    const group = await this.prisma.telegramGroup.findFirst({
      where: {
        OR: [
          input.groupExternalId
            ? { externalId: input.groupExternalId }
            : undefined,
          { title: input.groupTitle },
        ].filter(Boolean) as Prisma.TelegramGroupWhereInput[],
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
    });

    const groupPolicy = group
      ? await this.prisma.moderationPolicy.findFirst({
          where: {
            telegramGroupId: group.id,
          },
          include: {
            keywords: true,
            domains: true,
          },
        })
      : null;

    const [globalKeywords, globalDomains] = await Promise.all([
      this.prisma.moderationKeyword.findMany({
        where: {
          moderationPolicyId: globalPolicy.id,
        },
        orderBy: { value: 'asc' },
      }),
      this.prisma.moderationDomain.findMany({
        where: {
          moderationPolicyId: globalPolicy.id,
        },
        orderBy: [{ mode: 'asc' }, { value: 'asc' }],
      }),
    ]);

    const mergedDomains = [...globalDomains, ...(groupPolicy?.domains || [])];

    return {
      scopeKey: groupPolicy?.scopeKey || globalPolicy.scopeKey,
      scopeLabel: groupPolicy?.scopeLabel || globalPolicy.scopeLabel,
      autoBanSpam: groupPolicy?.autoBanSpam ?? globalPolicy.autoBanSpam,
      muteNewMembers:
        groupPolicy?.muteNewMembers ?? globalPolicy.muteNewMembers,
      muteDurationHours:
        groupPolicy?.muteDurationHours ?? globalPolicy.muteDurationHours,
      customKeywords: uniqueNormalizedValues([
        ...globalKeywords.map((keyword) => keyword.value),
        ...(groupPolicy?.keywords || []).map((keyword) => keyword.value),
      ]),
      blockDomains: uniqueNormalizedValues(
        mergedDomains
          .filter((domain) => domain.mode === ModerationListMode.BLOCK)
          .map((domain) => domain.value),
      ),
      allowDomains: uniqueNormalizedValues(
        mergedDomains
          .filter((domain) => domain.mode === ModerationListMode.ALLOW)
          .map((domain) => domain.value),
      ),
    };
  }

  getBuiltInRules() {
    return {
      keywords: [...builtInBlacklistKeywords],
      riskyDomains: [...builtInRiskyDomains],
      usernameRule: suspiciousUsernamePattern.source,
      socialEngineeringRule: socialEngineeringPattern.source,
      linkRules: {
        singleLinkScore: 12,
        multipleLinksScore: 30,
      },
      decisionThresholds: moderationDecisionThresholds,
    };
  }

  private async findCommunityMemberForEvent(
    actorExternalId: string | null,
    groupTitle: string,
    workspaceId?: string,
  ) {
    if (!actorExternalId) {
      return null;
    }

    return this.prisma.communityMember.findFirst({
      where: {
        externalId: actorExternalId,
        groupTitle,
        ...(workspaceId
          ? {
              campaign: {
                workspaceId,
              },
            }
          : {}),
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });
  }

  private async resolveWarnSettingsForGroup(input: {
    groupTitle: string;
    workspaceId?: string;
  }) {
    if (!process.env.DATABASE_URL) {
      return {
        lockWarns: true,
        warnLimit: 2,
        warnAction: 'tmute' as const,
        warnActionDurationHours: 1,
        warnActionDurationSeconds: 600,
        warningExpirySeconds: 86400,
      };
    }

    const group = await this.prisma.telegramGroup.findFirst({
      where: {
        title: input.groupTitle,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      include: {
        moderationSettings: true,
      },
    });

    const warnAction = group?.moderationSettings?.warnAction || 'tmute';
    const warnActionDurationHours =
      warnAction === 'tmute' || warnAction === 'tban'
        ? Math.max(
            1,
            Math.ceil(
              Number(
                group?.moderationSettings?.warnActionDurationSeconds || 3600,
              ) / 3600,
            ),
          )
        : 24;
    const warnActionDurationSeconds =
      warnAction === 'tmute' || warnAction === 'tban'
        ? Math.max(
            60,
            Number(
              group?.moderationSettings?.warnActionDurationSeconds || 3600,
            ),
          )
        : null;

    return {
      lockWarns: group?.moderationSettings?.lockWarns ?? true,
      warnLimit: Math.max(1, group?.moderationSettings?.warnLimit ?? 2),
      warnAction: warnAction as 'mute' | 'tmute' | 'kick' | 'ban' | 'tban',
      warnActionDurationHours,
      warnActionDurationSeconds,
      warningExpirySeconds: Math.max(
        0,
        group?.moderationSettings?.warningExpirySeconds ?? 86400,
      ),
    };
  }

  private getEffectiveWarningCount(
    warningCount: number,
    lastWarnedAt: Date | string | null,
    warningExpirySeconds: number,
  ) {
    if (!warningCount || warningExpirySeconds <= 0 || !lastWarnedAt) {
      return warningCount;
    }

    const lastWarnedAtDate =
      lastWarnedAt instanceof Date ? lastWarnedAt : new Date(lastWarnedAt);
    if (Number.isNaN(lastWarnedAtDate.getTime())) {
      return warningCount;
    }

    const expiresAt = lastWarnedAtDate.getTime() + warningExpirySeconds * 1000;
    return expiresAt <= Date.now() ? 0 : warningCount;
  }

  private mapWarnActionToDecision(action: string) {
    switch (action) {
      case 'mute':
      case 'tmute':
        return SpamDecision.RESTRICT;
      case 'kick':
      case 'ban':
      case 'tban':
      default:
        return SpamDecision.BAN;
    }
  }

  private composePayload(members: ModerationMember[]) {
    const activeMembers = members.filter(
      (member) => member.membershipStatus === 'active',
    ).length;
    const leftMembers = members.length - activeMembers;

    return {
      members,
      summary: {
        total: members.length,
        active: activeMembers,
        left: leftMembers,
      },
    };
  }

  private normalizeMember360ImportRow(
    row: Record<string, unknown>,
  ): Member360ImportRow | null {
    const externalId = this.readImportCell(row, [
      'ID số',
      'ID',
      'id',
      'externalId',
      'External ID',
    ]);
    const phoneNumber = this.readImportCell(row, [
      'SĐT',
      'SDT',
      'Sdt',
      'phone',
      'phoneNumber',
      'Phone Number',
    ]);
    const customerSource = this.readImportCell(row, [
      'Nguồn khách',
      'Nguon khach',
      'source',
      'customerSource',
      'Customer Source',
    ]);

    if (!externalId) {
      return null;
    }

    return {
      externalId,
      phoneNumber: phoneNumber || null,
      customerSource: customerSource || null,
    };
  }

  private readImportCell(
    row: Record<string, unknown>,
    aliases: string[],
  ): string {
    for (const alias of aliases) {
      const value = row[alias];
      if (value === undefined || value === null) {
        continue;
      }

      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        typeof value !== 'bigint'
      ) {
        continue;
      }

      const normalized = String(value).trim();
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  private async ensureGlobalPolicy() {
    return this.prisma.moderationPolicy.upsert({
      where: {
        scopeKey: 'global',
      },
      update: {},
      create: {
        scopeKey: 'global',
        scopeType: ModerationScopeType.GLOBAL,
        scopeLabel: 'Mặc định toàn hệ thống',
        autoBanSpam: true,
        muteNewMembers: true,
        muteDurationHours: 24,
      },
      include: {
        keywords: {
          orderBy: { value: 'asc' },
        },
        domains: {
          orderBy: [{ mode: 'asc' }, { value: 'asc' }],
        },
      },
    });
  }

  private async ensureScopePolicy(scopeKey: string) {
    if (scopeKey === 'global') {
      return this.ensureGlobalPolicy();
    }

    const groupId = scopeKey.replace(/^group:/, '').trim();
    const group = await this.prisma.telegramGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return this.ensureGlobalPolicy();
    }

    return this.prisma.moderationPolicy.upsert({
      where: {
        scopeKey: `group:${group.id}`,
      },
      update: {},
      create: {
        scopeKey: `group:${group.id}`,
        scopeType: ModerationScopeType.GROUP,
        scopeLabel: group.title,
        telegramGroupId: group.id,
      },
      include: {
        keywords: {
          orderBy: { value: 'asc' },
        },
        domains: {
          orderBy: [{ mode: 'asc' }, { value: 'asc' }],
        },
      },
    });
  }

  private mapScopeRecord(
    policy: PolicyRecord | null,
    inheritsFromGlobal: boolean,
    fallbackLabel: string,
    telegramGroupId?: string,
    globalPolicy?: PolicyRecord | null,
  ) {
    if (!policy && !globalPolicy && !telegramGroupId) {
      return null;
    }

    return {
      scopeKey:
        policy?.scopeKey ||
        (telegramGroupId ? `group:${telegramGroupId}` : 'global'),
      scopeType: policy?.scopeType || (telegramGroupId ? 'GROUP' : 'GLOBAL'),
      scopeLabel: policy?.scopeLabel || fallbackLabel,
      telegramGroupId: policy?.telegramGroupId || telegramGroupId || null,
      inheritsFromGlobal,
      autoBanSpam: policy?.autoBanSpam ?? globalPolicy?.autoBanSpam ?? true,
      muteNewMembers:
        policy?.muteNewMembers ?? globalPolicy?.muteNewMembers ?? true,
      muteDurationHours:
        policy?.muteDurationHours ?? globalPolicy?.muteDurationHours ?? 24,
      keywords: (policy?.keywords || []).map((keyword) => ({
        id: keyword.id,
        value: keyword.value,
      })),
      domains: (policy?.domains || []).map((domain) => ({
        id: domain.id,
        value: domain.value,
        mode: domain.mode,
      })),
    };
  }
}
