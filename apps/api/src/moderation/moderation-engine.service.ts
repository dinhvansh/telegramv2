/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Injectable } from '@nestjs/common';
import { SpamDecision } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
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
};

type AiModerationResult = {
  provider: 'remote' | 'mock' | 'disabled';
  label: string;
  riskScore: number;
  reason: string;
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
  ) {}

  async evaluate(input: ModerateInput) {
    const text = normalizeText(input.messageText);
    const detectionText = normalizeDetectionText(input.messageText);
    const username = normalizeText(input.actorUsername).replace(/^@/, '');
    const detectionUsername = normalizeDetectionText(username);
    const matchedRules: string[] = [];
    let ruleScore = 0;

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
      ruleScore >= 85 || (!text && input.eventType === 'user_joined')
        ? ({
            provider: 'disabled',
            label: 'skip',
            riskScore: 0,
            reason: 'Rule score already decisive or no analyzable text.',
          } satisfies AiModerationResult)
        : await this.evaluateWithAi({
            eventType: input.eventType,
            text,
            username,
            groupTitle: input.groupTitle,
            matchedRules,
            ruleScore,
          });

    const blendedScore = clampScore(
      aiResult.provider === 'disabled'
        ? ruleScore
        : ruleScore * 0.65 + aiResult.riskScore * 0.35,
    );
    const decision = this.applyPolicyDecision(
      this.decide(blendedScore, matchedRules),
      blendedScore,
      input.eventType,
      effectivePolicy,
    );

    const payload = {
      source: input.source,
      eventType: input.eventType,
      actorUsername: username || null,
      actorExternalId: normalizeText(input.actorExternalId) || null,
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

  private async evaluateWithAi(input: {
    eventType: string;
    text: string;
    username: string;
    groupTitle: string;
    matchedRules: string[];
    ruleScore: number;
  }): Promise<AiModerationResult> {
    const aiConfig = await this.settingsService.getResolvedAiConfig();

    if (
      !aiConfig.baseUrl ||
      !aiConfig.apiToken ||
      /^mock:\/\//i.test(aiConfig.baseUrl)
    ) {
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
            content: `${aiConfig.prompt}\nTra ve duy nhat mot object JSON hop le voi cac truong: label, risk_score, reason. Khong boc trong markdown, khong giai thich them.`,
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
      return this.getMockAiResult(input);
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
      return this.getMockAiResult(input);
    }

    try {
      const parsed = JSON.parse(this.extractJsonObject(content)) as {
        label?: string;
        risk_score?: number;
        reason?: string;
      };

      return {
        provider: 'remote',
        label: String(parsed.label || 'review'),
        riskScore: clampScore(Number(parsed.risk_score || 0)),
        reason: String(parsed.reason || 'AI moderation completed.'),
      };
    } catch {
      return this.getMockAiResult(input);
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
      reason:
        input.matchedRules.length > 0
          ? `Mock AI nâng cảnh báo vì trúng ${input.matchedRules.length} rule.`
          : 'Mock AI không thấy thêm dấu hiệu ngoài rule cứng.',
    };
  }
}
