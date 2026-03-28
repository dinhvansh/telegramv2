/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
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
  campaignLabel: string;
  groupTitle: string;
  joinedAt: string;
  joinedRelative: string;
  membershipStatus: 'active' | 'left';
  statusLabel: string;
  statusDetail: string;
  leftAt: string | null;
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
    campaignLabel: 'Winter_24',
    groupTitle: 'Dev_Ops_Global',
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
    campaignLabel: 'Trực tiếp',
    groupTitle: 'Support_QA',
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
    campaignLabel: 'Winter_24',
    groupTitle: 'Dev_Ops_Global',
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

  async getMembers() {
    if (!process.env.DATABASE_URL) {
      return this.composePayload(fallbackMembers);
    }

    const members = await this.prisma.communityMember.findMany({
      orderBy: { joinedAt: 'desc' },
    });

    return this.composePayload(
      members.map((member) => {
        const hasLeft = Boolean(member.leftAt);
        return {
          id: member.id,
          displayName: member.displayName,
          avatarInitials: member.avatarInitials,
          externalId: member.externalId,
          username: member.username,
          campaignLabel: member.campaignLabel,
          groupTitle: member.groupTitle,
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

  async getConfig() {
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
    const groupPolicies = new Map(
      policies
        .filter(
          (policy) => policy.scopeType === 'GROUP' && policy.telegramGroupId,
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

    const updated = (await this.prisma.spamEvent.update({
      where: {
        id: input.eventId,
      },
      data: {
        manualDecision: input.decision,
        manualNote: String(input.note || '').trim() || null,
        reviewedAt: new Date(),
      },
    })) as any;

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

    return {
      updated: true,
      id: updated.id,
      manualDecision: updated.manualDecision,
      manualNote: updated.manualNote,
      reviewedAt: updated.reviewedAt?.toISOString() || null,
      action,
    };
  }

  async getResolvedPolicyForGroup(groupTitle: string) {
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
        title: groupTitle,
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
