/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { SpamDecision } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecretValue } from '../settings/settings-security';
import { SystemLogsService } from '../system-logs/system-logs.service';

type TelegramApiResponse<T> = {
  ok?: boolean;
  description?: string;
  result?: T;
};

type ExecuteDecisionInput = {
  source: 'webhook' | 'manual';
  spamEventId?: string | null;
  eventType: string;
  decision: SpamDecision;
  chatId?: string | null;
  userId?: string | null;
  messageId?: string | null;
  muteDurationHours?: number;
  note?: string | null;
};

@Injectable()
export class TelegramActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async executeModerationDecision(input: ExecuteDecisionInput) {
    const config = await this.getResolvedConfig();
    if (!config.botToken) {
      const result = {
        enforced: false,
        skipped: true,
        reason: 'Missing Telegram bot token',
        decision: input.decision,
        operations: [],
      };
      await this.persistActionLog(input.spamEventId, result, input);
      return result;
    }

    const chatId = input.chatId;
    const userId = input.userId;
    const messageId = input.messageId;

    if (!chatId) {
      const result = {
        enforced: false,
        skipped: true,
        reason: 'Missing Telegram chat id',
        decision: input.decision,
        operations: [],
      };
      await this.persistActionLog(input.spamEventId, result, input);
      return result;
    }

    const operations: Array<{
      method: string;
      ok: boolean;
      description: string | null;
    }> = [];

    const execute = async (
      method: string,
      body: Record<string, unknown>,
      required = true,
    ) => {
      if (!required) {
        return;
      }

      const response = await this.callTelegram(
        botTokenOrThrow(config.botToken),
        method,
        body,
      );
      operations.push({
        method,
        ok: Boolean(response.ok),
        description: response.description ?? null,
      });
    };

    if (input.source === 'manual' && input.decision === SpamDecision.ALLOW) {
      if (input.eventType === 'join_request') {
        await execute(
          'approveChatJoinRequest',
          {
            chat_id: chatId,
            user_id: Number(userId),
          },
          Boolean(userId),
        );
      }
    }

    if (input.eventType === 'message_received') {
      if (
        input.decision === SpamDecision.BAN ||
        input.decision === SpamDecision.RESTRICT ||
        input.decision === SpamDecision.WARN
      ) {
        await execute(
          'deleteMessage',
          {
            chat_id: chatId,
            message_id: Number(messageId),
          },
          Boolean(messageId),
        );
      }

      if (input.decision === SpamDecision.BAN) {
        await execute(
          'banChatMember',
          {
            chat_id: chatId,
            user_id: Number(userId),
            revoke_messages: true,
          },
          Boolean(userId),
        );
      }

      if (input.decision === SpamDecision.RESTRICT) {
        await execute(
          'restrictChatMember',
          this.buildRestrictPayload(chatId, userId, input.muteDurationHours),
          Boolean(userId),
        );
      }
    }

    if (input.eventType === 'join_request') {
      if (
        input.decision === SpamDecision.BAN ||
        input.decision === SpamDecision.RESTRICT
      ) {
        await execute(
          'declineChatJoinRequest',
          {
            chat_id: chatId,
            user_id: Number(userId),
          },
          Boolean(userId),
        );
      }

      if (input.decision === SpamDecision.BAN) {
        await execute(
          'banChatMember',
          {
            chat_id: chatId,
            user_id: Number(userId),
            revoke_messages: true,
          },
          Boolean(userId),
        );
      }
    }

    if (input.eventType === 'user_joined') {
      if (input.decision === SpamDecision.BAN) {
        await execute(
          'banChatMember',
          {
            chat_id: chatId,
            user_id: Number(userId),
            revoke_messages: true,
          },
          Boolean(userId),
        );
      }

      if (input.decision === SpamDecision.RESTRICT) {
        await execute(
          'restrictChatMember',
          this.buildRestrictPayload(chatId, userId, input.muteDurationHours),
          Boolean(userId),
        );
      }
    }

    const result = {
      enforced: operations.some((operation) => operation.ok),
      skipped: operations.length === 0,
      decision: input.decision,
      operations,
    };

    await this.persistActionLog(input.spamEventId, result, input);
    return result;
  }

  private buildRestrictPayload(
    chatId: string,
    userId?: string | null,
    muteDurationHours?: number,
  ) {
    return {
      chat_id: chatId,
      user_id: Number(userId),
      until_date:
        Math.floor(Date.now() / 1000) +
        Math.max(1, muteDurationHours || 24) * 3600,
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
        can_manage_topics: false,
      },
    };
  }

  private async persistActionLog(
    spamEventId: string | null | undefined,
    result: {
      enforced: boolean;
      skipped: boolean;
      decision: SpamDecision;
      operations: Array<{
        method: string;
        ok: boolean;
        description: string | null;
      }>;
      reason?: string;
    },
    input: ExecuteDecisionInput,
  ) {
    const payload = {
      source: input.source,
      eventType: input.eventType,
      decision: input.decision,
      note: input.note || null,
      result,
    };

    await this.systemLogsService.log({
      level:
        result.operations.some((operation) => !operation.ok) || result.reason
          ? 'WARN'
          : 'INFO',
      scope: 'telegram.enforcement',
      action: input.source === 'manual' ? 'manual_action' : 'auto_action',
      message: `Telegram enforcement ${result.enforced ? 'executed' : 'attempted'} for ${input.eventType}`,
      detail: result.reason || null,
      payload,
    });

    if (!process.env.DATABASE_URL || !spamEventId) {
      return;
    }

    const existing = (await this.prisma.spamEvent.findUnique({
      where: { id: spamEventId },
    })) as any;

    const currentLogs = Array.isArray(existing?.actionLogs)
      ? existing.actionLogs
      : [];

    await this.prisma.spamEvent.update({
      where: { id: spamEventId },
      data: {
        actionLogs: [
          ...currentLogs,
          {
            executedAt: new Date().toISOString(),
            source: input.source,
            decision: input.decision,
            note: input.note || null,
            result,
          },
        ],
        lastActionAt: new Date(),
      },
    });
  }

  private async getResolvedConfig() {
    const envConfig = {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    };

    if (!process.env.DATABASE_URL) {
      return envConfig;
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        key: 'telegram.bot_token',
      },
    });

    return {
      botToken: setting?.value
        ? decryptSecretValue(setting.value)
        : envConfig.botToken,
    };
  }

  private async callTelegram<T>(
    botToken: string,
    method: string,
    body?: Record<string, unknown>,
  ) {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/${method}`,
      {
        method: body ? 'POST' : 'GET',
        headers: body
          ? {
              'Content-Type': 'application/json',
            }
          : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
    );

    return (await response.json()) as TelegramApiResponse<T>;
  }
}

function botTokenOrThrow(value: string | undefined) {
  if (!value) {
    throw new Error('Missing Telegram bot token');
  }
  return value;
}
