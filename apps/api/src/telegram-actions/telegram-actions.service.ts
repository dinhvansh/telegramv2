/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
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

export type ModerationActionVariant =
  | 'allow'
  | 'warn'
  | 'mute'
  | 'tmute'
  | 'kick'
  | 'ban'
  | 'tban';

type ExecuteDecisionInput = {
  source: 'webhook' | 'manual' | 'command' | 'job';
  spamEventId?: string | null;
  eventType: string;
  decision: SpamDecision;
  actionVariant?: ModerationActionVariant | null;
  chatId?: string | null;
  userId?: string | null;
  messageId?: string | null;
  deleteMessageIds?: string[] | null;
  muteDurationHours?: number | null;
  durationSeconds?: number | null;
  note?: string | null;
  groupTitle?: string | null;
  actorExternalId?: string | null;
  actorUsername?: string | null;
  reasonSummary?: string | null;
  operatorName?: string | null;
  silentActions?: boolean | null;
  commandText?: string | null;
};

type PermissionRequirement = {
  code: 'delete_messages' | 'restrict_members' | 'ban_members' | 'invite_users';
  label: string;
  adminPermission: string;
};

type ExecutionOperation = {
  method: string;
  ok: boolean;
  description: string | null;
  missingPermission: PermissionRequirement | null;
  userGuidance: string | null;
  payload?: Record<string, unknown>;
};

type PersistedActionResult = {
  enforced: boolean;
  skipped: boolean;
  reason?: string;
  decision: SpamDecision;
  actionVariant: ModerationActionVariant;
  scheduledJobs?: Array<{
    id: string;
    expiresAt: string;
    actionVariant: string;
  }>;
  operations: ExecutionOperation[];
  missingPermissions?: PermissionRequirement[];
  userGuidance?: string | null;
};

@Injectable()
export class TelegramActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async executeModerationDecision(input: ExecuteDecisionInput) {
    if (input.source !== 'job') {
      await this.processDueActionJobs();
    }

    const config = await this.getResolvedConfig();
    const actionVariant = this.resolveActionVariant(input);
    if (!config.botToken) {
      const result = {
        enforced: false,
        skipped: true,
        reason: 'Missing Telegram bot token',
        decision: input.decision,
        actionVariant,
        missingPermissions: [],
        userGuidance:
          'CRM chưa có bot token Telegram. Cần cấu hình bot token trước khi thực thi.',
        operations: [],
      } satisfies PersistedActionResult;
      await this.persistActionLog(input.spamEventId, result, input);
      return result;
    }

    const chatId = input.chatId;
    const userId = input.userId;

    if (!chatId) {
      const result = {
        enforced: false,
        skipped: true,
        reason: 'Missing Telegram chat id',
        decision: input.decision,
        actionVariant,
        missingPermissions: [],
        userGuidance:
          'Sự kiện chưa có chat id của Telegram nên CRM chưa thể gọi API thực thi.',
        operations: [],
      } satisfies PersistedActionResult;
      await this.persistActionLog(input.spamEventId, result, input);
      return result;
    }

    const operations: ExecutionOperation[] = [];
    const scheduledJobs: Array<{
      id: string;
      expiresAt: string;
      actionVariant: string;
    }> = [];
    const durationSeconds = this.resolveDurationSeconds(input, actionVariant);
    const deleteMessageIds = this.collectDeleteMessageIds(input);

    const execute = async (
      method: string,
      body: Record<string, unknown>,
      required = true,
    ) => {
      if (!required) {
        return false;
      }

      const response = await this.callTelegram(
        botTokenOrThrow(config.botToken),
        method,
        body,
      );
      const permissionIssue = this.getPermissionRequirement(
        method,
        response.description ?? null,
      );
      const ok = Boolean(response.ok);
      operations.push({
        method,
        ok,
        description: response.description ?? null,
        missingPermission: permissionIssue,
        userGuidance: permissionIssue
          ? `Cần cấp quyền admin "${permissionIssue.adminPermission}" cho bot trong group Telegram.`
          : null,
        payload: body,
      });
      return ok;
    };

    if (actionVariant === 'allow') {
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

    if (input.eventType === 'message_received' && deleteMessageIds.length > 0) {
      for (const messageId of deleteMessageIds) {
        await execute(
          'deleteMessage',
          {
            chat_id: chatId,
            message_id: Number(messageId),
          },
          true,
        );
      }
    }

    if (input.eventType === 'join_request' && actionVariant !== 'allow') {
      await execute(
        'declineChatJoinRequest',
        {
          chat_id: chatId,
          user_id: Number(userId),
        },
        Boolean(userId),
      );
    }

    if (
      input.eventType === 'message_received' ||
      input.eventType === 'user_joined' ||
      input.eventType === 'join_request'
    ) {
      switch (actionVariant) {
        case 'warn':
          break;
        case 'mute': {
          await execute(
            'restrictChatMember',
            this.buildRestrictPayload(chatId, userId, null),
            Boolean(userId),
          );
          break;
        }
        case 'tmute': {
          const restricted = await execute(
            'restrictChatMember',
            this.buildRestrictPayload(chatId, userId, durationSeconds),
            Boolean(userId),
          );
          if (restricted && durationSeconds && userId) {
            const job = await this.scheduleActionExpiryJob({
              source: input.source,
              spamEventId: input.spamEventId ?? null,
              eventType: input.eventType,
              actionVariant,
              chatId,
              userId,
              groupTitle: input.groupTitle ?? null,
              actorExternalId: input.actorExternalId ?? null,
              note: input.note ?? null,
              commandText: input.commandText ?? null,
              expireAt: new Date(Date.now() + durationSeconds * 1000),
              payload: {
                reverseAction: 'unmute',
                durationSeconds,
              },
            });
            if (job) {
              scheduledJobs.push(job);
            }
          }
          break;
        }
        case 'kick': {
          const banned = await execute(
            'banChatMember',
            {
              chat_id: chatId,
              user_id: Number(userId),
              revoke_messages: true,
            },
            Boolean(userId),
          );
          if (banned) {
            await execute(
              'unbanChatMember',
              {
                chat_id: chatId,
                user_id: Number(userId),
                only_if_banned: true,
              },
              Boolean(userId),
            );
          }
          break;
        }
        case 'ban': {
          await execute(
            'banChatMember',
            {
              chat_id: chatId,
              user_id: Number(userId),
              revoke_messages: true,
            },
            Boolean(userId),
          );
          break;
        }
        case 'tban': {
          const banned = await execute(
            'banChatMember',
            {
              chat_id: chatId,
              user_id: Number(userId),
              revoke_messages: true,
              until_date: durationSeconds
                ? Math.floor(Date.now() / 1000) + durationSeconds
                : undefined,
            },
            Boolean(userId),
          );
          if (banned && durationSeconds && userId) {
            const job = await this.scheduleActionExpiryJob({
              source: input.source,
              spamEventId: input.spamEventId ?? null,
              eventType: input.eventType,
              actionVariant,
              chatId,
              userId,
              groupTitle: input.groupTitle ?? null,
              actorExternalId: input.actorExternalId ?? null,
              note: input.note ?? null,
              commandText: input.commandText ?? null,
              expireAt: new Date(Date.now() + durationSeconds * 1000),
              payload: {
                reverseAction: 'unban',
                durationSeconds,
              },
            });
            if (job) {
              scheduledJobs.push(job);
            }
          }
          break;
        }
        default:
          break;
      }
    }

    const missingPermissions = operations
      .map((operation) => operation.missingPermission)
      .filter(
        (permission): permission is PermissionRequirement =>
          permission !== null,
      )
      .filter(
        (permission, index, array) =>
          array.findIndex((item) => item.code === permission.code) === index,
      );

    const result = {
      enforced: operations.some((operation) => operation.ok),
      skipped: operations.length === 0,
      reason:
        missingPermissions.length > 0
          ? `Bot thiếu quyền Telegram: ${missingPermissions
              .map((permission) => permission.adminPermission)
              .join(', ')}`
          : undefined,
      decision: input.decision,
      actionVariant,
      scheduledJobs,
      missingPermissions,
      userGuidance:
        missingPermissions.length > 0
          ? `Cần mở quyền admin cho bot: ${missingPermissions
              .map((permission) => permission.adminPermission)
              .join(', ')}.`
          : null,
      operations,
    } satisfies PersistedActionResult;

    if (result.enforced && !input.silentActions) {
      await this.sendActionAnnouncement(config.botToken, input, result);
    }

    await this.persistActionLog(input.spamEventId, result, input);
    return result;
  }

  async processDueActionJobs(limit = 20) {
    if (!process.env.DATABASE_URL) {
      return { processed: 0, jobs: [] };
    }

    const config = await this.getResolvedConfig();
    if (!config.botToken) {
      return { processed: 0, jobs: [] };
    }

    const jobs = await (this.prisma as any).moderationActionJob.findMany({
      where: {
        status: 'PENDING',
        expireAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        expireAt: 'asc',
      },
      take: Math.max(1, Math.min(100, limit)),
    });

    const results: Array<{
      id: string;
      status: string;
      completedAt: string | null;
      lastError: string | null;
    }> = [];

    for (const job of jobs) {
      const outcome = await this.executeScheduledJob(job, config.botToken);
      results.push(outcome);
    }

    return {
      processed: results.length,
      jobs: results,
    };
  }

  async listActionJobs(limit = 50) {
    if (!process.env.DATABASE_URL) {
      return [];
    }

    const items = await (this.prisma as any).moderationActionJob.findMany({
      orderBy: [{ status: 'asc' }, { expireAt: 'asc' }],
      take: Math.max(1, Math.min(200, limit)),
    });

    return items.map((item: any) => ({
      id: item.id,
      source: item.source,
      status: item.status,
      eventType: item.eventType,
      actionVariant: item.actionVariant,
      spamEventId: item.spamEventId,
      chatId: item.chatId,
      userId: item.userId,
      groupTitle: item.groupTitle,
      actorExternalId: item.actorExternalId,
      note: item.note,
      commandText: item.commandText,
      executeAt: item.executeAt?.toISOString?.() ?? null,
      expireAt: item.expireAt?.toISOString?.() ?? null,
      completedAt: item.completedAt?.toISOString?.() ?? null,
      lastError: item.lastError ?? null,
      payload: item.payload ?? null,
      createdAt: item.createdAt?.toISOString?.() ?? null,
    }));
  }

  private resolveActionVariant(input: ExecuteDecisionInput) {
    if (input.actionVariant) {
      return input.actionVariant;
    }

    switch (input.decision) {
      case SpamDecision.ALLOW:
        return 'allow';
      case SpamDecision.WARN:
        return 'warn';
      case SpamDecision.RESTRICT:
        return input.durationSeconds || input.muteDurationHours
          ? 'tmute'
          : 'mute';
      case SpamDecision.BAN:
      default:
        return 'ban';
    }
  }

  private resolveDurationSeconds(
    input: ExecuteDecisionInput,
    actionVariant: ModerationActionVariant,
  ) {
    if (input.durationSeconds) {
      return Math.max(60, Number(input.durationSeconds));
    }

    if (actionVariant === 'tmute' || actionVariant === 'tban') {
      const hours = Math.max(1, Number(input.muteDurationHours || 24));
      return hours * 3600;
    }

    return null;
  }

  private collectDeleteMessageIds(input: ExecuteDecisionInput) {
    if (
      input.decision !== SpamDecision.WARN &&
      input.decision !== SpamDecision.RESTRICT &&
      input.decision !== SpamDecision.BAN
    ) {
      return [];
    }

    return Array.from(
      new Set(
        [input.messageId, ...(input.deleteMessageIds || [])]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    );
  }

  private buildRestrictPayload(
    chatId: string,
    userId?: string | null,
    durationSeconds?: number | null,
  ) {
    return {
      chat_id: chatId,
      user_id: Number(userId),
      until_date: durationSeconds
        ? Math.floor(Date.now() / 1000) + durationSeconds
        : undefined,
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

  private buildUnrestrictPayload(chatId: string, userId: string) {
    return {
      chat_id: chatId,
      user_id: Number(userId),
      permissions: {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: false,
        can_manage_topics: false,
      },
    };
  }

  private async scheduleActionExpiryJob(input: {
    source: string;
    spamEventId: string | null;
    eventType: string;
    actionVariant: ModerationActionVariant;
    chatId: string;
    userId: string;
    groupTitle: string | null;
    actorExternalId: string | null;
    note: string | null;
    commandText: string | null;
    expireAt: Date;
    payload: Record<string, unknown>;
  }) {
    if (!process.env.DATABASE_URL) {
      return null;
    }

    const created = await (this.prisma as any).moderationActionJob.create({
      data: {
        source: input.source,
        eventType: input.eventType,
        actionVariant: input.actionVariant,
        spamEventId: input.spamEventId,
        chatId: input.chatId,
        userId: input.userId,
        groupTitle: input.groupTitle,
        actorExternalId: input.actorExternalId,
        note: input.note,
        commandText: input.commandText,
        expireAt: input.expireAt,
        payload: input.payload,
      },
    });

    return {
      id: created.id as string,
      expiresAt: created.expireAt.toISOString() as string,
      actionVariant: created.actionVariant as string,
    };
  }

  private async executeScheduledJob(job: any, botToken: string) {
    let status = 'COMPLETED';
    let lastError: string | null = null;

    try {
      if (job.actionVariant === 'tmute') {
        const response = await this.callTelegram(
          botToken,
          'restrictChatMember',
          this.buildUnrestrictPayload(
            job.chatId as string,
            job.userId as string,
          ),
        );
        if (!response.ok) {
          throw new Error(response.description || 'Failed to lift mute');
        }
      } else if (job.actionVariant === 'tban') {
        const response = await this.callTelegram(botToken, 'unbanChatMember', {
          chat_id: job.chatId,
          user_id: Number(job.userId),
          only_if_banned: true,
        });
        if (!response.ok) {
          throw new Error(response.description || 'Failed to unban user');
        }
      } else {
        status = 'SKIPPED';
      }
    } catch (error) {
      status = 'FAILED';
      lastError =
        error instanceof Error ? error.message : 'Unknown job failure';
    }

    await (this.prisma as any).moderationActionJob.update({
      where: { id: job.id },
      data: {
        status,
        completedAt: new Date(),
        lastError,
      },
    });

    await this.systemLogsService.log({
      level: status === 'FAILED' ? 'WARN' : 'INFO',
      scope: 'telegram.enforcement.job',
      action: 'process_expiry_job',
      message: `Processed moderation expiry job ${job.id}`,
      detail: lastError,
      payload: {
        jobId: job.id,
        actionVariant: job.actionVariant,
        status,
      },
    });

    return {
      id: String(job.id),
      status,
      completedAt: new Date().toISOString(),
      lastError,
    };
  }

  private async persistActionLog(
    spamEventId: string | null | undefined,
    result: PersistedActionResult,
    input: ExecuteDecisionInput,
  ) {
    const payload = {
      source: input.source,
      eventType: input.eventType,
      decision: input.decision,
      actionVariant: result.actionVariant,
      note: input.note || null,
      commandText: input.commandText || null,
      result,
    };

    await this.systemLogsService.log({
      level:
        result.operations.some((operation) => !operation.ok) || result.reason
          ? 'WARN'
          : 'INFO',
      scope: 'telegram.enforcement',
      action:
        input.source === 'manual'
          ? 'manual_action'
          : input.source === 'command'
            ? 'command_action'
            : 'auto_action',
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
            actionVariant: result.actionVariant,
            note: input.note || null,
            commandText: input.commandText || null,
            result,
          },
        ],
        lastActionAt: new Date(),
      },
    });
  }

  private async sendActionAnnouncement(
    botToken: string,
    input: ExecuteDecisionInput,
    result: PersistedActionResult,
  ) {
    if (!input.chatId || result.actionVariant === 'allow') {
      return;
    }

    const text = this.buildAnnouncementText(input, result);
    if (!text) {
      return;
    }

    const response = await this.callTelegram<{ message_id?: number }>(
      botToken,
      'sendMessage',
      {
        chat_id: input.chatId,
        text,
      },
    );

    if (!response.ok) {
      await this.systemLogsService.log({
        level: 'WARN',
        scope: 'telegram.announcement',
        action: 'send_action_announcement',
        message: `Failed to announce ${result.actionVariant} in group`,
        detail: response.description || null,
        payload: {
          chatId: input.chatId,
          actionVariant: result.actionVariant,
          actorExternalId: input.actorExternalId || null,
          actorUsername: input.actorUsername || null,
        },
      });
    }
  }

  private buildAnnouncementText(
    input: ExecuteDecisionInput,
    result: PersistedActionResult,
  ) {
    const targetLabel = input.actorUsername
      ? `@${String(input.actorUsername).replace(/^@/, '')}`
      : input.actorExternalId
        ? `user ${input.actorExternalId}`
        : 'một thành viên';
    const actionLabel = this.getAnnouncementActionLabel(
      result.actionVariant,
      input.durationSeconds,
      input.muteDurationHours,
    );
    const reasonLine = input.reasonSummary
      ? `Lý do: ${input.reasonSummary}`
      : null;
    const operatorLine = input.operatorName
      ? `Thực hiện bởi: ${input.operatorName}`
      : input.source === 'webhook'
        ? 'Thực hiện bởi: bot tự động'
        : null;
    const expiryLine = this.getExpiryLine(
      result.actionVariant,
      input.durationSeconds,
      input.muteDurationHours,
    );

    return [
      `${targetLabel} ${actionLabel}.`,
      reasonLine,
      expiryLine,
      operatorLine,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private getAnnouncementActionLabel(
    actionVariant: ModerationActionVariant,
    durationSeconds?: number | null,
    muteDurationHours?: number | null,
  ) {
    switch (actionVariant) {
      case 'warn':
        return 'đã bị cảnh báo';
      case 'mute':
        return 'đã bị khóa chat';
      case 'tmute':
        return `đã bị khóa chat tạm thời${this.formatDurationSuffix(durationSeconds, muteDurationHours)}`;
      case 'kick':
        return 'đã bị kick khỏi nhóm';
      case 'tban':
        return `đã bị cấm tạm thời${this.formatDurationSuffix(durationSeconds, muteDurationHours)}`;
      case 'ban':
      default:
        return 'đã bị cấm khỏi nhóm';
    }
  }

  private getExpiryLine(
    actionVariant: ModerationActionVariant,
    durationSeconds?: number | null,
    muteDurationHours?: number | null,
  ) {
    if (actionVariant !== 'tmute' && actionVariant !== 'tban') {
      return null;
    }

    const durationText = this.formatDuration(
      durationSeconds,
      muteDurationHours,
    );
    return durationText ? `Thời hạn: ${durationText}` : null;
  }

  private formatDurationSuffix(
    durationSeconds?: number | null,
    muteDurationHours?: number | null,
  ) {
    const durationText = this.formatDuration(
      durationSeconds,
      muteDurationHours,
    );
    return durationText ? ` (${durationText})` : '';
  }

  private formatDuration(
    durationSeconds?: number | null,
    muteDurationHours?: number | null,
  ) {
    const totalSeconds = durationSeconds
      ? Math.max(60, Number(durationSeconds))
      : muteDurationHours
        ? Math.max(1, Number(muteDurationHours)) * 3600
        : null;

    if (!totalSeconds) {
      return null;
    }

    if (totalSeconds % 86400 === 0) {
      return `${totalSeconds / 86400} ngày`;
    }
    if (totalSeconds % 3600 === 0) {
      return `${totalSeconds / 3600} giờ`;
    }
    if (totalSeconds % 60 === 0) {
      return `${totalSeconds / 60} phút`;
    }
    return `${totalSeconds} giây`;
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

  private getPermissionRequirement(
    method: string,
    description: string | null,
  ): PermissionRequirement | null {
    const normalizedDescription = String(description || '').toLowerCase();

    if (
      method === 'deleteMessage' ||
      normalizedDescription.includes('message can') ||
      normalizedDescription.includes('not enough rights to delete')
    ) {
      return {
        code: 'delete_messages',
        label: 'Xóa tin nhắn',
        adminPermission: 'Delete messages',
      };
    }

    if (
      method === 'restrictChatMember' ||
      normalizedDescription.includes('restrict chat member') ||
      normalizedDescription.includes('not enough rights to restrict')
    ) {
      return {
        code: 'restrict_members',
        label: 'Hạn chế thành viên',
        adminPermission: 'Restrict members',
      };
    }

    if (
      method === 'banChatMember' ||
      method === 'unbanChatMember' ||
      normalizedDescription.includes(
        'not enough rights to restrict/unrestrict',
      ) ||
      normalizedDescription.includes('not enough rights to ban')
    ) {
      return {
        code: 'ban_members',
        label: 'Cấm thành viên',
        adminPermission: 'Ban users',
      };
    }

    if (
      method === 'approveChatJoinRequest' ||
      method === 'declineChatJoinRequest' ||
      normalizedDescription.includes('invite users')
    ) {
      return {
        code: 'invite_users',
        label: 'Duyệt lời mời',
        adminPermission: 'Invite users via link',
      };
    }

    return null;
  }
}

function botTokenOrThrow(value: string | undefined) {
  if (!value) {
    throw new Error('Missing Telegram bot token');
  }
  return value;
}
