/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Injectable } from '@nestjs/common';
import { SpamDecision } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { ModerationService } from './moderation.service';
import {
  builtInBlacklistKeywords,
  builtInRiskyDomains,
  moderationDecisionThresholds,
  socialEngineeringPattern,
  suspiciousUsernamePattern,
  uniqueNormalizedValues,
} from './moderation-rules';

type ModerateInput = {
  source: 'telegram.webhook' | 'telegram.mock' | 'manual';
  eventType: 'message_received' | 'join_request' | 'user_joined';
  actorUsername?: string | null;
  actorExternalId?: string | null;
  groupTitle: string;
  groupExternalId?: string | null;
  campaignLabel?: string | null;
  messageText?: string | null;
  messageExternalId?: string | null;
  aiModerationEnabled?: boolean;
  aiMode?: 'off' | 'fallback_only' | 'suspicious_only';
  aiConfidenceThreshold?: number;
  aiOverrideAction?: boolean;
};

type AiModerationResult = {
  provider: 'remote' | 'mock' | 'disabled';
  label: string;
  riskScore: number;
  reason: string;
  confidence: number;
  suggestedDecision: SpamDecision | null;
};

type EffectiveAiSettings = {
  enabled: boolean;
  mode: 'off' | 'fallback_only' | 'suspicious_only';
  confidenceThreshold: number;
  overrideAction: boolean;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function normalizeDetectionText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.:/@_+\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomainMatches(
  sourceText: string,
  candidateDomains: string[],
  allowedDomains: string[],
) {
  return candidateDomains.filter((domain) => {
    const normalizedDomain = normalizeDetectionText(domain);
    if (!normalizedDomain) {
      return false;
    }

    const domainPattern = new RegExp(
      `(^|[^a-z0-9])${normalizedDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`,
      'i',
    );

    if (!domainPattern.test(sourceText)) {
      return false;
    }

    return !allowedDomains.some(
      (allowDomain) => normalizeDetectionText(allowDomain) === normalizedDomain,
    );
  });
}

@Injectable()
export class ModerationEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly moderationService: ModerationService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async evaluate(input: ModerateInput) {
    const text = normalizeText(input.messageText);
    const detectionText = normalizeDetectionText(input.messageText);
    const username = normalizeText(input.actorUsername).replace(/^@/, '');
    const detectionUsername = normalizeDetectionText(username);
    const actorExternalId = normalizeText(input.actorExternalId) || null;
    const matchedRules: string[] = [];
    let ruleScore = 0;
    const effectiveAiSettings = await this.resolveEffectiveAiSettings(input);

    const effectivePolicy =
      await this.moderationService.getResolvedPolicyForGroup(input.groupTitle);
    const activeKeywords = uniqueNormalizedValues([
      ...builtInBlacklistKeywords,
      ...effectivePolicy.customKeywords,
    ]);
    const blockedDomains = uniqueNormalizedValues([
      ...builtInRiskyDomains,
      ...effectivePolicy.blockDomains,
    ]);
    const allowedDomains = uniqueNormalizedValues([
      ...effectivePolicy.allowDomains,
    ]);

    const linkCount =
      detectionText.match(
        /\b(?:https?:\/\/|www\.|t\.me\/|\w+\.(?:com|net|org|io|ly|me|app))\S*/g,
      )?.length || 0;

    if (input.eventType === 'join_request') {
      ruleScore += 15;
      matchedRules.push('join_request_requires_review');
    }

    if (linkCount >= 2) {
      ruleScore += 30;
      matchedRules.push('multiple_links');
    } else if (linkCount === 1) {
      ruleScore += 12;
      matchedRules.push('contains_link');
    }

    const matchedKeyword = activeKeywords.filter((keyword) => {
      const normalizedKeyword = normalizeDetectionText(keyword);
      if (!normalizedKeyword) {
        return false;
      }

      const phrasePattern = new RegExp(
        `(^|\\s)${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`,
        'i',
      );

      return (
        phrasePattern.test(detectionText) ||
        detectionText.includes(normalizedKeyword)
      );
    });
    if (matchedKeyword.length) {
      ruleScore += 45;
      matchedRules.push(
        ...matchedKeyword.map((keyword) => `keyword:${keyword}`),
      );
    }

    const matchedAllowDomain = allowedDomains.filter((domain) =>
      detectionText.includes(normalizeDetectionText(domain)),
    );
    if (matchedAllowDomain.length) {
      matchedRules.push(
        ...matchedAllowDomain.map((domain) => `allow_domain:${domain}`),
      );
      ruleScore = Math.max(0, ruleScore - 20);
    }

    const matchedDomain = extractDomainMatches(
      detectionText,
      blockedDomains,
      matchedAllowDomain,
    );
    if (matchedDomain.length) {
      ruleScore += 35;
      matchedRules.push(...matchedDomain.map((domain) => `domain:${domain}`));
    }

    if (suspiciousUsernamePattern.test(detectionUsername)) {
      ruleScore += 15;
      matchedRules.push('suspicious_username');
    }

    if (socialEngineeringPattern.test(detectionText)) {
      ruleScore += 20;
      matchedRules.push('social_engineering_phrase');
    }

    const aiResult =
      !this.shouldRunAi({
        text,
        eventType: input.eventType,
        matchedRules,
        ruleScore,
        settings: effectiveAiSettings,
      }) ||
      ruleScore >= 85 ||
      (!text && input.eventType === 'user_joined')
        ? ({
            provider: 'disabled',
            label: 'skip',
            riskScore: 0,
            reason: 'Rule score already decisive or no analyzable text.',
            confidence: 0,
            suggestedDecision: null,
          } satisfies AiModerationResult)
        : await this.evaluateWithAi({
            eventType: input.eventType,
            text,
            username,
            groupTitle: input.groupTitle,
            matchedRules,
            ruleScore,
          });

    const shouldTrustAi =
      aiResult.provider !== 'disabled' &&
      aiResult.confidence >= effectiveAiSettings.confidenceThreshold;
    const blendedScore = clampScore(
      aiResult.provider === 'disabled' || !shouldTrustAi
        ? ruleScore
        : ruleScore * 0.65 + aiResult.riskScore * 0.35,
    );
    let baseDecision = this.applyPolicyDecision(
      this.decide(blendedScore, matchedRules),
      blendedScore,
      input.eventType,
      effectivePolicy,
    );
    if (
      effectiveAiSettings.overrideAction &&
      shouldTrustAi &&
      aiResult.suggestedDecision
    ) {
      baseDecision = this.escalateDecision(
        baseDecision,
        aiResult.suggestedDecision,
      );
      matchedRules.push(
        `ai_override:${aiResult.suggestedDecision.toLowerCase()}`,
      );
    }
    const warningContext =
      await this.moderationService.getWarningEscalationPreview({
        actorExternalId,
        groupTitle: input.groupTitle,
        decision: baseDecision,
      });
    matchedRules.push(...warningContext.matchedRules);
    const decision = warningContext.effectiveDecision;

    const payload = {
      source: input.source,
      eventType: input.eventType,
      actorUsername: username || null,
      actorExternalId,
      groupTitle: input.groupTitle,
      groupExternalId: normalizeText(input.groupExternalId) || null,
      campaignLabel: normalizeText(input.campaignLabel) || null,
      messageText: text || null,
      messageExternalId: normalizeText(input.messageExternalId) || null,
      matchedRules,
      ruleScore: clampScore(ruleScore),
      aiScore:
        aiResult.provider === 'disabled'
          ? null
          : clampScore(aiResult.riskScore),
      finalScore: blendedScore,
      aiLabel: aiResult.provider === 'disabled' ? null : aiResult.label,
      aiReason: aiResult.provider === 'disabled' ? null : aiResult.reason,
      decision,
    };

    if (aiResult.provider !== 'disabled') {
      await this.systemLogsService.log({
        level: 'INFO',
        scope: 'moderation.ai',
        action: 'evaluate',
        message: `AI moderation evaluated ${input.eventType} in ${input.groupTitle}`,
        payload: {
          groupTitle: input.groupTitle,
          eventType: input.eventType,
          actorUsername: username || null,
          actorExternalId,
          label: aiResult.label,
          riskScore: aiResult.riskScore,
          confidence: aiResult.confidence,
          suggestedDecision: aiResult.suggestedDecision,
          matchedRules,
          ruleScore,
          finalScore: blendedScore,
          trusted: shouldTrustAi,
        },
      });
    }

    let createdEventId: string | null = null;
    if (process.env.DATABASE_URL) {
      const created = await this.prisma.spamEvent.create({
        data: {
          ...payload,
          matchedRules,
        },
      });
      createdEventId = created.id;
    }

    return {
      ...payload,
      eventId: createdEventId,
      decisionLabel: this.getDecisionLabel(decision),
      reviewRequired:
        decision === SpamDecision.REVIEW || decision === SpamDecision.WARN,
      aiProvider: aiResult.provider,
      policyScope: effectivePolicy.scopeKey,
      policyLabel: effectivePolicy.scopeLabel,
      policySnapshot: {
        autoBanSpam: effectivePolicy.autoBanSpam,
        muteNewMembers: effectivePolicy.muteNewMembers,
        muteDurationHours: effectivePolicy.muteDurationHours,
        blockDomains: effectivePolicy.blockDomains,
        allowDomains: effectivePolicy.allowDomains,
      },
      warningContext,
      aiSummary:
        aiResult.provider === 'disabled'
          ? null
          : {
              provider: aiResult.provider,
              label: aiResult.label,
              score: clampScore(aiResult.riskScore),
              confidence: aiResult.confidence,
              reason: aiResult.reason,
              trusted: shouldTrustAi,
              suggestedDecision: aiResult.suggestedDecision,
            },
    };
  }

  async getEvents() {
    if (!process.env.DATABASE_URL) {
      return [];
    }

    const events = await this.prisma.spamEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return events.map((rawEvent) => {
      const event = rawEvent as any;
      return {
        id: event.id,
        source: event.source,
        eventType: event.eventType,
        actorUsername: event.actorUsername,
        actorExternalId: event.actorExternalId,
        groupTitle: event.groupTitle,
        groupExternalId: event.groupExternalId,
        campaignLabel: event.campaignLabel,
        messageText: event.messageText,
        messageExternalId: event.messageExternalId,
        matchedRules: Array.isArray(event.matchedRules)
          ? event.matchedRules
          : [],
        ruleScore: event.ruleScore,
        aiScore: event.aiScore,
        finalScore: event.finalScore,
        aiLabel: event.aiLabel,
        aiReason: event.aiReason,
        decision: event.decision,
        decisionLabel: this.getDecisionLabel(event.decision),
        manualDecision: event.manualDecision,
        manualDecisionLabel: event.manualDecision
          ? this.getDecisionLabel(event.manualDecision)
          : null,
        manualNote: event.manualNote,
        reviewedAt: event.reviewedAt?.toISOString() || null,
        actionLogs: Array.isArray(event.actionLogs) ? event.actionLogs : [],
        actionTimeline: this.buildActionTimeline(event),
        lastActionAt: event.lastActionAt?.toISOString() || null,
        createdAt: event.createdAt.toISOString(),
      };
    });
  }

  private decide(finalScore: number, matchedRules: string[]) {
    if (
      finalScore >= moderationDecisionThresholds.ban ||
      matchedRules.some((rule) => rule.startsWith('keyword:seed phrase'))
    ) {
      return SpamDecision.BAN;
    }

    if (finalScore >= moderationDecisionThresholds.restrict) {
      return SpamDecision.RESTRICT;
    }

    if (finalScore >= moderationDecisionThresholds.warn) {
      return SpamDecision.WARN;
    }

    if (finalScore >= moderationDecisionThresholds.review) {
      return SpamDecision.REVIEW;
    }

    return SpamDecision.ALLOW;
  }

  private applyPolicyDecision(
    baseDecision: SpamDecision,
    finalScore: number,
    eventType: ModerateInput['eventType'],
    policy: {
      autoBanSpam: boolean;
      muteNewMembers: boolean;
    },
  ) {
    if (!policy.autoBanSpam && baseDecision === SpamDecision.BAN) {
      return finalScore >= 95 ? SpamDecision.RESTRICT : SpamDecision.REVIEW;
    }

    if (
      policy.muteNewMembers &&
      eventType === 'join_request' &&
      baseDecision === SpamDecision.ALLOW
    ) {
      return SpamDecision.REVIEW;
    }

    return baseDecision;
  }

  private getDecisionLabel(decision: SpamDecision) {
    switch (decision) {
      case SpamDecision.BAN:
        return 'Ban ngay';
      case SpamDecision.RESTRICT:
        return 'Restrict / mute';
      case SpamDecision.WARN:
        return 'Cảnh báo';
      case SpamDecision.REVIEW:
        return 'Chờ review';
      default:
        return 'Cho phép';
    }
  }

  private async resolveEffectiveAiSettings(
    input: Pick<
      ModerateInput,
      | 'groupTitle'
      | 'groupExternalId'
      | 'aiModerationEnabled'
      | 'aiMode'
      | 'aiConfidenceThreshold'
      | 'aiOverrideAction'
    >,
  ): Promise<EffectiveAiSettings> {
    const defaults: EffectiveAiSettings = {
      enabled: false,
      mode: 'off',
      confidenceThreshold: 0.85,
      overrideAction: false,
    };

    if (!process.env.DATABASE_URL) {
      return {
        enabled: input.aiModerationEnabled ?? defaults.enabled,
        mode: input.aiMode ?? defaults.mode,
        confidenceThreshold: Math.max(
          0,
          Math.min(
            1,
            Number(input.aiConfidenceThreshold ?? defaults.confidenceThreshold),
          ),
        ),
        overrideAction: input.aiOverrideAction ?? defaults.overrideAction,
      };
    }

    const group = await this.prisma.telegramGroup.findFirst({
      where: {
        OR: [
          input.groupExternalId
            ? { externalId: input.groupExternalId }
            : undefined,
          { title: input.groupTitle },
        ].filter(Boolean) as never,
      },
      include: {
        moderationSettings: true,
      },
    });

    const settings = group?.moderationSettings;

    return {
      enabled:
        input.aiModerationEnabled ??
        (settings?.moderationEnabled && settings.aiModerationEnabled) ??
        false,
      mode: (input.aiMode ??
        settings?.aiMode ??
        'off') as EffectiveAiSettings['mode'],
      confidenceThreshold: Math.max(
        0,
        Math.min(
          1,
          Number(
            input.aiConfidenceThreshold ??
              settings?.aiConfidenceThreshold ??
              defaults.confidenceThreshold,
          ),
        ),
      ),
      overrideAction:
        input.aiOverrideAction ??
        settings?.aiOverrideAction ??
        defaults.overrideAction,
    };
  }

  private shouldRunAi(input: {
    text: string;
    eventType: ModerateInput['eventType'];
    matchedRules: string[];
    ruleScore: number;
    settings: EffectiveAiSettings;
  }) {
    if (!input.settings.enabled || input.settings.mode === 'off') {
      return false;
    }

    if (!input.text.trim() && input.eventType !== 'join_request') {
      return false;
    }

    if (input.settings.mode === 'fallback_only') {
      return input.ruleScore < moderationDecisionThresholds.restrict;
    }

    if (input.settings.mode === 'suspicious_only') {
      return (
        input.ruleScore >= moderationDecisionThresholds.review ||
        input.matchedRules.length > 0
      );
    }

    return true;
  }

  private mapSuggestedDecision(value?: string | null) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();
    switch (normalized) {
      case 'ALLOW':
        return SpamDecision.ALLOW;
      case 'REVIEW':
        return SpamDecision.REVIEW;
      case 'WARN':
        return SpamDecision.WARN;
      case 'RESTRICT':
      case 'MUTE':
      case 'TMUTE':
        return SpamDecision.RESTRICT;
      case 'BAN':
      case 'TBAN':
      case 'KICK':
        return SpamDecision.BAN;
      default:
        return null;
    }
  }

  private escalateDecision(left: SpamDecision, right: SpamDecision) {
    const rank: Record<SpamDecision, number> = {
      ALLOW: 0,
      REVIEW: 1,
      WARN: 2,
      RESTRICT: 3,
      BAN: 4,
    };

    return rank[right] > rank[left] ? right : left;
  }

  private async evaluateWithAi(input: {
    eventType: string;
    text: string;
    username: string;
    groupTitle: string;
    matchedRules: string[];
    ruleScore: number;
  }): Promise<AiModerationResult> {
    const aiConfig = await this.settingsService.getResolvedAiConfig();

    if (!aiConfig.baseUrl || !aiConfig.apiToken) {
      return {
        provider: 'disabled',
        label: 'disabled',
        riskScore: 0,
        reason: 'AI provider is not configured.',
        confidence: 0,
        suggestedDecision: null,
      };
    }

    if (/^mock:\/\//i.test(aiConfig.baseUrl)) {
      return this.getMockAiResult(input);
    }

    const normalizedBaseUrl = aiConfig.baseUrl.replace(/\/$/, '');
    const endpoint = /\/v1$/i.test(normalizedBaseUrl)
      ? `${normalizedBaseUrl}/chat/completions`
      : `${normalizedBaseUrl}/v1/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiToken}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `${aiConfig.prompt}\nTra ve duy nhat mot object JSON hop le voi cac truong: label, risk_score, confidence, reason, suggested_decision. suggested_decision chi duoc la ALLOW, REVIEW, WARN, RESTRICT hoac BAN. Khong boc trong markdown, khong giai thich them.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              eventType: input.eventType,
              groupTitle: input.groupTitle,
              username: input.username,
              text: input.text,
              matchedRules: input.matchedRules,
              ruleScore: input.ruleScore,
            }),
          },
        ],
        response_format: {
          type: 'json_object',
        },
      }),
    });

    if (!response.ok) {
      return {
        provider: 'disabled',
        label: 'error',
        riskScore: 0,
        reason: `AI endpoint returned HTTP ${response.status}.`,
        confidence: 0,
        suggestedDecision: null,
      };
    }

    const body = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = String(body.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      return {
        provider: 'disabled',
        label: 'empty',
        riskScore: 0,
        reason: 'AI endpoint returned empty content.',
        confidence: 0,
        suggestedDecision: null,
      };
    }

    try {
      const parsed = JSON.parse(this.extractJsonObject(content)) as {
        label?: string;
        risk_score?: number;
        confidence?: number;
        reason?: string;
        suggested_decision?: string;
      };

      return {
        provider: 'remote',
        label: String(parsed.label || 'review'),
        riskScore: clampScore(Number(parsed.risk_score || 0)),
        reason: String(parsed.reason || 'AI moderation completed.'),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
        suggestedDecision: this.mapSuggestedDecision(parsed.suggested_decision),
      };
    } catch {
      return {
        provider: 'disabled',
        label: 'invalid_json',
        riskScore: 0,
        reason: 'AI endpoint did not return valid JSON.',
        confidence: 0,
        suggestedDecision: null,
      };
    }
  }

  private extractJsonObject(content: string) {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      const candidate = fencedMatch[1].trim();
      if (candidate.startsWith('{') && candidate.endsWith('}')) {
        return candidate;
      }
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
  }

  private buildActionTimeline(event: any) {
    const steps: Array<{
      at: string | null;
      tone: 'info' | 'warn' | 'danger' | 'success';
      title: string;
      detail: string;
    }> = [
      {
        at: event.createdAt?.toISOString?.() ?? null,
        tone: 'info',
        title: 'Ghi nhận sự kiện',
        detail: `${event.eventType} · ${event.groupTitle}`,
      },
    ];

    const matchedRules = Array.isArray(event.matchedRules)
      ? event.matchedRules
      : [];
    if (matchedRules.length) {
      steps.push({
        at: event.createdAt?.toISOString?.() ?? null,
        tone:
          event.decision === 'BAN' || event.decision === 'RESTRICT'
            ? 'warn'
            : 'info',
        title: 'Rule trúng',
        detail: matchedRules.slice(0, 5).join(', '),
      });
    }

    if (event.aiScore || event.aiLabel || event.aiReason) {
      steps.push({
        at: event.createdAt?.toISOString?.() ?? null,
        tone: 'info',
        title: 'AI moderation',
        detail: [
          event.aiLabel,
          event.aiScore ? `score ${event.aiScore}` : null,
          event.aiReason,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }

    if (event.manualDecision && event.reviewedAt) {
      steps.push({
        at: event.reviewedAt.toISOString(),
        tone: 'success',
        title: 'Review thủ công',
        detail: `${event.manualDecision}${event.manualNote ? ` · ${event.manualNote}` : ''}`,
      });
    }

    const actionLogs = Array.isArray(event.actionLogs) ? event.actionLogs : [];
    for (const item of actionLogs) {
      const entry = item as {
        executedAt?: string;
        actionVariant?: string;
        decision?: string;
        result?: {
          enforced?: boolean;
          skipped?: boolean;
          reason?: string;
        };
      };

      const statusLabel = entry.result?.enforced
        ? 'Đã thực thi'
        : entry.result?.skipped
          ? 'Bỏ qua'
          : 'Đã thử';

      steps.push({
        at: entry.executedAt ?? null,
        tone: entry.result?.enforced
          ? 'danger'
          : entry.result?.skipped
            ? 'info'
            : 'warn',
        title: 'Action Telegram',
        detail: [
          entry.actionVariant ?? entry.decision,
          statusLabel,
          entry.result?.reason,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }

    return steps;
  }

  private getMockAiResult(input: {
    text: string;
    matchedRules: string[];
    ruleScore: number;
  }): AiModerationResult {
    const extraRisk =
      input.text.length > 120 ? 10 : input.matchedRules.length >= 3 ? 20 : 5;
    const riskScore = clampScore(input.ruleScore + extraRisk);

    return {
      provider: 'mock',
      label: riskScore >= 70 ? 'spam' : riskScore >= 45 ? 'suspicious' : 'safe',
      riskScore,
      confidence: riskScore >= 70 ? 0.92 : riskScore >= 45 ? 0.74 : 0.61,
      suggestedDecision:
        riskScore >= 85
          ? SpamDecision.BAN
          : riskScore >= 60
            ? SpamDecision.RESTRICT
            : riskScore >= 40
              ? SpamDecision.WARN
              : SpamDecision.ALLOW,
      reason:
        input.matchedRules.length > 0
          ? `Mock AI nâng cảnh báo vì trúng ${input.matchedRules.length} rule.`
          : 'Mock AI không thấy thêm dấu hiệu ngoài rule cứng.',
    };
  }
}
