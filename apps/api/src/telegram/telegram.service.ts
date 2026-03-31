import { Injectable, UnauthorizedException } from '@nestjs/common';
import { EventTone, SpamDecision } from '@prisma/client';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSecretValue,
  encryptSecretValue,
} from '../settings/settings-security';
import { ModerationEngineService } from '../moderation/moderation-engine.service';
import { ModerationService } from '../moderation/moderation.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { TelegramActionsService } from '../telegram-actions/telegram-actions.service';

type TelegramConfigInput = {
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
  publicBaseUrl?: string;
};

type TelegramApiResponse<T> = {
  ok?: boolean;
  description?: string;
  result?: T;
};

type TelegramBotProfile = {
  id: number;
  username?: string;
  first_name?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
};

type TelegramChat = {
  id: number | string;
  title?: string;
  username?: string;
  type?: string;
  is_forum?: boolean;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat?: TelegramChat;
  };
  chat_join_request?: {
    chat?: TelegramChat;
  };
  my_chat_member?: {
    chat?: TelegramChat;
  };
  channel_post?: {
    chat?: TelegramChat;
  };
};

type TelegramMockEventInput = {
  type?: 'user_joined' | 'user_left' | 'join_request' | 'message_received';
  campaignName?: string;
  groupTitle?: string;
  username?: string;
  externalId?: string;
  displayName?: string;
  memberCount?: number;
  messageText?: string;
  isForwarded?: boolean;
  hasPhoto?: boolean;
  hasVideo?: boolean;
  hasDocument?: boolean;
  hasSticker?: boolean;
  hasContact?: boolean;
  viaBot?: boolean;
};

type TelegramCommandInput = {
  groupId?: string;
  groupExternalId?: string;
  groupTitle?: string;
  commandText?: string;
  actorExternalId?: string;
  actorUsername?: string;
  targetExternalId?: string;
  targetUsername?: string;
  targetMessageId?: string;
  note?: string;
};

type TelegramInviteLinkInput = {
  campaignId?: string;
  groupExternalId?: string;
  groupTitle?: string;
  name?: string;
  memberLimit?: number;
  createsJoinRequest?: boolean;
  expireHours?: number;
};

type TelegramInviteLinkResult = {
  invite_link: string;
  name?: string;
  creates_join_request?: boolean;
  expire_date?: number;
  member_limit?: number;
  pending_join_request_count?: number;
};

type WebhookPayload = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    caption?: string;
    from?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
      is_bot?: boolean;
    };
    chat?: {
      id?: number | string;
      title?: string;
      username?: string;
      type?: string;
    };
    via_bot?: {
      id?: number | string;
      username?: string;
    };
    forward_origin?: unknown;
    forward_from?: {
      id?: number | string;
      username?: string;
    };
    forward_from_chat?: {
      id?: number | string;
      title?: string;
    };
    photo?: Array<{ file_id?: string }>;
    video?: { file_id?: string };
    document?: { file_id?: string };
    sticker?: { file_id?: string };
    contact?: {
      phone_number?: string;
      first_name?: string;
      user_id?: number | string;
    };
    reply_to_message?: {
      message_id?: number | string;
      text?: string;
      from?: {
        id?: number | string;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
    };
    new_chat_members?: Array<{
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    }>;
    left_chat_member?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    invite_link?: {
      invite_link?: string;
      name?: string;
    };
  };
  channel_post?: {
    chat?: {
      id?: number | string;
      title?: string;
      username?: string;
      type?: string;
    };
  };
  chat_join_request?: {
    chat?: {
      id?: number | string;
      title?: string;
      username?: string;
      type?: string;
    };
    from?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    invite_link?: {
      invite_link?: string;
      name?: string;
    };
  };
  my_chat_member?: TelegramMembershipUpdate;
  chat_member?: TelegramMembershipUpdate;
};

type TelegramMembershipUpdate = {
  chat?: TelegramChat;
  from?: {
    id?: number | string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  old_chat_member?: {
    status?: string;
    can_delete_messages?: boolean;
    can_restrict_members?: boolean;
    can_invite_users?: boolean;
    can_manage_topics?: boolean;
  };
  new_chat_member?: {
    status?: string;
    can_delete_messages?: boolean;
    can_restrict_members?: boolean;
    can_invite_users?: boolean;
    can_manage_topics?: boolean;
  };
};

type ResolvedTelegramConfig = {
  botToken: string;
  botUsername: string;
  webhookSecret: string;
  publicBaseUrl: string;
};

type TelegramGroupModerationInput = {
  moderationEnabled?: boolean;
  lockUrl?: boolean;
  lockInvitelink?: boolean;
  lockForward?: boolean;
  lockEmail?: boolean;
  lockPhone?: boolean;
  lockBot?: boolean;
  lockPhoto?: boolean;
  lockVideo?: boolean;
  lockDocument?: boolean;
  lockSticker?: boolean;
  trustedUsernames?: string;
  trustedExternalIds?: string;
  exemptAdmins?: boolean;
  exemptOwners?: boolean;
  lockWarns?: boolean;
  warnLimit?: number;
  warnAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  warnActionDurationSeconds?: number | null;
  antifloodEnabled?: boolean;
  antifloodLimit?: number;
  antifloodWindowSeconds?: number;
  antifloodAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  antifloodActionDurationSeconds?: number | null;
  antifloodDeleteAll?: boolean;
  aiModerationEnabled?: boolean;
  aiMode?: 'off' | 'fallback_only' | 'suspicious_only';
  aiConfidenceThreshold?: number;
  aiOverrideAction?: boolean;
  silentActions?: boolean;
  rawLoggingEnabled?: boolean;
  detailedLoggingEnabled?: boolean;
};

type RuntimeModerationRuleResult = {
  decision: 'ALLOW' | 'REVIEW' | 'WARN' | 'RESTRICT' | 'BAN';
  actionVariant: 'warn' | 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  matchedRules: string[];
  muteDurationHours: number | null;
  durationSeconds: number | null;
  deleteAll: boolean;
  deleteWindowSeconds: number | null;
  silentActions: boolean;
};

type ParsedTelegramCommand = {
  command:
    | 'warn'
    | 'mute'
    | 'tmute'
    | 'kick'
    | 'ban'
    | 'tban'
    | 'allow'
    | 'approve'
    | 'logs'
    | 'status';
  actionVariant: 'warn' | 'mute' | 'tmute' | 'kick' | 'ban' | 'tban' | 'allow';
  decision: SpamDecision;
  durationSeconds: number | null;
  note: string | null;
  rawText: string;
};

@Injectable()
export class TelegramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderationEngineService: ModerationEngineService,
    private readonly moderationService: ModerationService,
    private readonly telegramActionsService: TelegramActionsService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async getStatus() {
    const config = await this.getResolvedConfig();
    const botConfig = await this.getBotConfigState();
    const webhookUrl =
      botConfig?.webhookUrl || this.buildWebhookUrl(config.publicBaseUrl);

    return {
      mode: config.botToken ? 'token-configured' : 'mock-only',
      botConfigured: Boolean(config.botToken),
      botId: botConfig?.botExternalId || null,
      botVerified: botConfig?.isVerified ?? false,
      botDisplayName: botConfig?.botDisplayName || null,
      botUsername: botConfig?.botUsername || config.botUsername || null,
      publicBaseUrlConfigured: Boolean(config.publicBaseUrl),
      webhookSecretConfigured: Boolean(config.webhookSecret),
      webhookRegistered: botConfig?.webhookRegistered ?? false,
      webhookUrl,
      tokenPreview: this.maskToken(config.botToken),
      lastVerifiedAt: botConfig?.lastVerifiedAt?.toISOString() || null,
      lastDiscoveredAt: botConfig?.lastDiscoveredAt?.toISOString() || null,
    };
  }

  async getGroups() {
    if (!process.env.DATABASE_URL) {
      return {
        items: [],
      };
    }

    const groups = await this.prisma.telegramGroup.findMany({
      include: {
        moderationSettings: true,
      },
      orderBy: { title: 'asc' },
    });

    return {
      items: groups.map((group) => ({
        id: group.id,
        title: group.title,
        slug: group.slug,
        externalId: group.externalId,
        username: group.username
          ? `@${group.username.replace(/^@/, '')}`
          : null,
        type: group.type,
        isActive: group.isActive,
        discoveredFrom: group.discoveredFrom || null,
        lastSyncedAt: group.lastSyncedAt?.toISOString() || null,
        botMemberState: group.botMemberState || null,
        botRights: {
          canDeleteMessages: group.botCanDeleteMessages,
          canRestrictMembers: group.botCanRestrictMembers,
          canInviteUsers: group.botCanInviteUsers,
          canManageTopics: group.botCanManageTopics,
        },
        moderationEnabled: group.moderationSettings?.moderationEnabled ?? false,
      })),
    };
  }

  async getGroupModerationSettings(groupId: string) {
    if (!process.env.DATABASE_URL) {
      return this.buildDefaultModerationSettingsPayload(groupId);
    }

    const group = await this.prisma.telegramGroup.findUnique({
      where: { id: groupId },
      include: { moderationSettings: true },
    });

    if (!group) {
      return {
        found: false,
        groupId,
      };
    }

    const settings =
      group.moderationSettings ||
      (await this.ensureModerationSettings(group.id));
    if (!settings) {
      return this.buildDefaultModerationSettingsPayload(group.id);
    }

    return this.mapModerationSettings(group.id, settings);
  }

  async updateGroupModerationSettings(
    groupId: string,
    input: TelegramGroupModerationInput,
  ) {
    if (!process.env.DATABASE_URL) {
      return this.buildDefaultModerationSettingsPayload(groupId, input);
    }

    const group = await this.prisma.telegramGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return {
        updated: false,
        found: false,
        groupId,
      };
    }

    const current = await this.ensureModerationSettings(group.id);
    const warnAction = input.warnAction || current?.warnAction || 'kick';
    const antifloodAction =
      input.antifloodAction || current?.antifloodAction || 'tmute';
    const aiMode = input.aiMode || current?.aiMode || 'off';
    const aiConfidenceThreshold = Math.max(
      0,
      Math.min(
        1,
        Number(
          input.aiConfidenceThreshold ?? current?.aiConfidenceThreshold ?? 0.85,
        ),
      ),
    );
    const warnActionDurationSeconds =
      warnAction === 'tmute' || warnAction === 'tban'
        ? Math.max(
            60,
            Number(
              input.warnActionDurationSeconds ??
                current?.warnActionDurationSeconds ??
                600,
            ),
          )
        : null;
    const antifloodActionDurationSeconds = Math.max(
      60,
      Number(
        input.antifloodActionDurationSeconds ??
          current?.antifloodActionDurationSeconds ??
          600,
      ),
    );

    const settings = await this.prisma.telegramGroupModerationSettings.upsert({
      where: { telegramGroupId: group.id },
      update: {
        moderationEnabled:
          input.moderationEnabled ?? current?.moderationEnabled ?? false,
        lockUrl: input.lockUrl ?? current?.lockUrl ?? false,
        lockInvitelink:
          input.lockInvitelink ?? current?.lockInvitelink ?? false,
        lockForward: input.lockForward ?? current?.lockForward ?? false,
        lockEmail: input.lockEmail ?? current?.lockEmail ?? false,
        lockPhone: input.lockPhone ?? current?.lockPhone ?? false,
        lockBot: input.lockBot ?? current?.lockBot ?? false,
        lockPhoto: input.lockPhoto ?? current?.lockPhoto ?? false,
        lockVideo: input.lockVideo ?? current?.lockVideo ?? false,
        lockDocument: input.lockDocument ?? current?.lockDocument ?? false,
        lockSticker: input.lockSticker ?? current?.lockSticker ?? false,
        trustedUsernames:
          input.trustedUsernames ?? current?.trustedUsernames ?? '',
        trustedExternalIds:
          input.trustedExternalIds ?? current?.trustedExternalIds ?? '',
        exemptAdmins: input.exemptAdmins ?? current?.exemptAdmins ?? true,
        exemptOwners: input.exemptOwners ?? current?.exemptOwners ?? true,
        lockWarns: input.lockWarns ?? current?.lockWarns ?? true,
        warnLimit: Math.max(
          1,
          Number(input.warnLimit ?? current?.warnLimit ?? 2),
        ),
        warnAction,
        warnActionDurationSeconds,
        antifloodEnabled:
          input.antifloodEnabled ?? current?.antifloodEnabled ?? false,
        antifloodLimit: Math.max(
          1,
          Number(input.antifloodLimit ?? current?.antifloodLimit ?? 5),
        ),
        antifloodWindowSeconds: Math.max(
          1,
          Number(
            input.antifloodWindowSeconds ??
              current?.antifloodWindowSeconds ??
              10,
          ),
        ),
        antifloodAction,
        antifloodActionDurationSeconds,
        antifloodDeleteAll:
          input.antifloodDeleteAll ?? current?.antifloodDeleteAll ?? true,
        aiModerationEnabled:
          input.aiModerationEnabled ?? current?.aiModerationEnabled ?? false,
        aiMode,
        aiConfidenceThreshold,
        aiOverrideAction:
          input.aiOverrideAction ?? current?.aiOverrideAction ?? false,
        silentActions: input.silentActions ?? current?.silentActions ?? false,
        rawLoggingEnabled:
          input.rawLoggingEnabled ?? current?.rawLoggingEnabled ?? true,
        detailedLoggingEnabled:
          input.detailedLoggingEnabled ??
          current?.detailedLoggingEnabled ??
          true,
      },
      create: {
        telegramGroupId: group.id,
        moderationEnabled: input.moderationEnabled ?? false,
        lockUrl: input.lockUrl ?? false,
        lockInvitelink: input.lockInvitelink ?? false,
        lockForward: input.lockForward ?? false,
        lockEmail: input.lockEmail ?? false,
        lockPhone: input.lockPhone ?? false,
        lockBot: input.lockBot ?? false,
        lockPhoto: input.lockPhoto ?? false,
        lockVideo: input.lockVideo ?? false,
        lockDocument: input.lockDocument ?? false,
        lockSticker: input.lockSticker ?? false,
        trustedUsernames: input.trustedUsernames ?? '',
        trustedExternalIds: input.trustedExternalIds ?? '',
        exemptAdmins: input.exemptAdmins ?? true,
        exemptOwners: input.exemptOwners ?? true,
        lockWarns: input.lockWarns ?? true,
        warnLimit: Math.max(1, Number(input.warnLimit ?? 2)),
        warnAction,
        warnActionDurationSeconds,
        antifloodEnabled: input.antifloodEnabled ?? false,
        antifloodLimit: Math.max(1, Number(input.antifloodLimit ?? 5)),
        antifloodWindowSeconds: Math.max(
          1,
          Number(input.antifloodWindowSeconds ?? 10),
        ),
        antifloodAction,
        antifloodActionDurationSeconds,
        antifloodDeleteAll: input.antifloodDeleteAll ?? true,
        aiModerationEnabled: input.aiModerationEnabled ?? false,
        aiMode,
        aiConfidenceThreshold,
        aiOverrideAction: input.aiOverrideAction ?? false,
        silentActions: input.silentActions ?? false,
        rawLoggingEnabled: input.rawLoggingEnabled ?? true,
        detailedLoggingEnabled: input.detailedLoggingEnabled ?? true,
      },
    });

    await this.systemLogsService.log({
      scope: 'telegram.moderation',
      action: 'update_group_settings',
      message: `Telegram moderation settings updated for ${group.title}`,
      payload: {
        groupId: group.id,
        externalId: group.externalId,
      },
    });

    return {
      updated: true,
      ...this.mapModerationSettings(group.id, settings),
    };
  }

  async updateConfig(input: TelegramConfigInput) {
    const currentConfig = await this.getResolvedConfig();
    const nextConfig = {
      botToken:
        input.botToken !== undefined
          ? input.botToken.trim()
          : currentConfig.botToken,
      botUsername:
        input.botUsername !== undefined
          ? input.botUsername.trim()
          : currentConfig.botUsername,
      webhookSecret:
        input.webhookSecret !== undefined
          ? input.webhookSecret.trim()
          : currentConfig.webhookSecret,
      publicBaseUrl:
        input.publicBaseUrl !== undefined
          ? input.publicBaseUrl.trim().replace(/\/$/, '')
          : currentConfig.publicBaseUrl,
    };

    if (!process.env.DATABASE_URL) {
      return {
        persisted: false,
        ...this.presentConfig(nextConfig, null),
      };
    }

    const entries = Object.entries({
      'telegram.bot_token': nextConfig.botToken
        ? encryptSecretValue(nextConfig.botToken)
        : '',
      'telegram.bot_username': nextConfig.botUsername ?? '',
      'telegram.webhook_secret': nextConfig.webhookSecret
        ? encryptSecretValue(nextConfig.webhookSecret)
        : '',
      'telegram.public_base_url': nextConfig.publicBaseUrl ?? '',
    });

    await Promise.all(
      entries.map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );

    const botConfig = await this.prisma.telegramBotConfig.upsert({
      where: { singletonKey: 'default' },
      update: {
        botUsername: nextConfig.botUsername || null,
        webhookUrl: this.buildWebhookUrl(nextConfig.publicBaseUrl),
        webhookRegistered: false,
      },
      create: {
        singletonKey: 'default',
        botUsername: nextConfig.botUsername || null,
        webhookUrl: this.buildWebhookUrl(nextConfig.publicBaseUrl),
      },
    });

    await this.systemLogsService.log({
      scope: 'telegram.config',
      action: 'update_config',
      message: 'Telegram bot configuration updated',
      payload: {
        botConfigured: Boolean(nextConfig.botToken),
        publicBaseUrlConfigured: Boolean(nextConfig.publicBaseUrl),
        webhookSecretConfigured: Boolean(nextConfig.webhookSecret),
      },
    });

    return {
      persisted: true,
      ...this.presentConfig(nextConfig, botConfig),
    };
  }

  async verifyBot() {
    const config = await this.getResolvedConfig();
    if (!config.botToken) {
      return {
        ok: false,
        skipped: true,
        reason: 'Missing bot token',
      };
    }

    const response = await this.callTelegram<TelegramBotProfile>(
      config.botToken,
      'getMe',
    );

    if (!process.env.DATABASE_URL) {
      return {
        ok: Boolean(response.ok),
        skipped: false,
        isVerified: Boolean(response.ok),
        botId: response.result?.id ? String(response.result.id) : null,
        botUsername: response.result?.username || config.botUsername || null,
        botDisplayName: response.result?.first_name || null,
        description: response.description ?? null,
      };
    }

    const botConfig = await this.prisma.telegramBotConfig.upsert({
      where: { singletonKey: 'default' },
      update: {
        botExternalId: response.result?.id ? String(response.result.id) : null,
        botUsername: response.result?.username || config.botUsername || null,
        botDisplayName: response.result?.first_name || null,
        isVerified: Boolean(response.ok),
        lastVerifiedAt: response.ok ? new Date() : null,
      },
      create: {
        singletonKey: 'default',
        botExternalId: response.result?.id ? String(response.result.id) : null,
        botUsername: response.result?.username || config.botUsername || null,
        botDisplayName: response.result?.first_name || null,
        isVerified: Boolean(response.ok),
        lastVerifiedAt: response.ok ? new Date() : null,
      },
    });

    await this.systemLogsService.log({
      level: response.ok ? 'INFO' : 'WARN',
      scope: 'telegram.config',
      action: 'verify_bot',
      message: response.ok
        ? 'Telegram bot verified'
        : 'Telegram bot verification failed',
      detail: response.description ?? null,
      payload: {
        botId: botConfig.botExternalId,
        botUsername: botConfig.botUsername,
      },
    });

    return {
      ok: Boolean(response.ok),
      skipped: false,
      isVerified: botConfig.isVerified,
      botId: botConfig.botExternalId,
      botUsername: botConfig.botUsername,
      botDisplayName: botConfig.botDisplayName,
      description: response.description ?? null,
    };
  }

  async registerWebhook() {
    const config = await this.getResolvedConfig();
    const webhookUrl = this.buildWebhookUrl(config.publicBaseUrl);

    if (!config.botToken || !webhookUrl) {
      return {
        ok: false,
        skipped: true,
        reason: 'Missing bot token or public base URL',
        webhookUrl,
      };
    }

    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/setWebhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: [
            'message',
            'chat_join_request',
            'my_chat_member',
            'chat_member',
          ],
          ...(config.webhookSecret
            ? { secret_token: config.webhookSecret }
            : {}),
        }),
      },
    );

    const body = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    };

    await this.systemLogsService.log({
      level: body.ok ? 'INFO' : 'WARN',
      scope: 'telegram.webhook',
      action: 'register_webhook',
      message: body.ok
        ? 'Telegram webhook registered'
        : 'Telegram webhook registration failed',
      detail: body.description ?? null,
      payload: {
        webhookUrl,
      },
    });

    if (process.env.DATABASE_URL) {
      await this.prisma.telegramBotConfig.upsert({
        where: { singletonKey: 'default' },
        update: {
          webhookRegistered: Boolean(body.ok),
          webhookUrl,
        },
        create: {
          singletonKey: 'default',
          webhookRegistered: Boolean(body.ok),
          webhookUrl,
        },
      });
    }

    return {
      ok: Boolean(body.ok),
      skipped: false,
      webhookUrl,
      description: body.description ?? null,
      result: body.result ?? null,
    };
  }

  async discoverGroups() {
    const config = await this.getResolvedConfig();
    if (!config.botToken) {
      return {
        ok: false,
        skipped: true,
        reason: 'Missing bot token',
        bot: null,
        items: [],
        existingItems: [],
        source: 'missing_token',
        note: 'Missing bot token',
      };
    }

    const [botProfile, updates] = await Promise.all([
      this.callTelegram<TelegramBotProfile>(config.botToken, 'getMe'),
      this.callTelegram<TelegramUpdate[]>(config.botToken, 'getUpdates', {
        allowed_updates: [
          'message',
          'channel_post',
          'chat_join_request',
          'my_chat_member',
          'chat_member',
        ],
        limit: 100,
      }),
    ]);

    const discoveredChats = new Map<string, TelegramChat>();

    const pushChat = (chat?: TelegramChat) => {
      if (!chat?.id) {
        return;
      }

      const chatType = String(chat.type || '').toLowerCase();
      if (!['group', 'supergroup', 'channel'].includes(chatType)) {
        return;
      }

      discoveredChats.set(String(chat.id), chat);
    };

    for (const update of updates.result || []) {
      pushChat(update.message?.chat);
      pushChat(update.channel_post?.chat);
      pushChat(update.chat_join_request?.chat);
      pushChat(update.my_chat_member?.chat);
    }

    const discoveredItems = [...discoveredChats.values()]
      .map((chat) => ({
        externalId: String(chat.id),
        title:
          String(chat.title || '').trim() ||
          String(chat.username || '').trim() ||
          `telegram-${chat.id}`,
        username: chat.username
          ? `@${String(chat.username).replace(/^@/, '')}`
          : null,
        type: String(chat.type || 'group'),
        isForum: Boolean(chat.is_forum),
      }))
      .sort((left, right) => left.title.localeCompare(right.title));

    let existingItems: Array<{
      id: string;
      externalId: string;
      title: string;
      username: string | null;
      type: string;
      isActive: boolean;
      botMemberState: string | null;
      botCanDeleteMessages: boolean;
      botCanRestrictMembers: boolean;
      botCanInviteUsers: boolean;
      botCanManageTopics: boolean;
      lastSyncedAt: Date | null;
    }> = [];

    if (process.env.DATABASE_URL) {
      existingItems = await this.prisma.telegramGroup.findMany({
        orderBy: [{ title: 'asc' }],
        select: {
          id: true,
          externalId: true,
          title: true,
          username: true,
          type: true,
          isActive: true,
          botMemberState: true,
          botCanDeleteMessages: true,
          botCanRestrictMembers: true,
          botCanInviteUsers: true,
          botCanManageTopics: true,
          lastSyncedAt: true,
        },
      });
    }

    const items = [
      ...existingItems.map((group) => ({
        externalId: group.externalId,
        title: group.title,
        username: group.username
          ? `@${group.username.replace(/^@/, '')}`
          : null,
        type: group.type,
        isForum: false,
      })),
      ...discoveredItems.filter(
        (item) =>
          !existingItems.some((group) => group.externalId === item.externalId),
      ),
    ].sort((left, right) => left.title.localeCompare(right.title));

    if (process.env.DATABASE_URL) {
      for (const item of discoveredItems) {
        await this.upsertTelegramGroupRecord({
          externalId: item.externalId,
          title: item.title,
          username: item.username,
          type: item.type,
          discoveredFrom: 'manual_discovery',
          isActive: true,
        });
      }

      await this.prisma.telegramBotConfig.upsert({
        where: { singletonKey: 'default' },
        update: {
          botExternalId: botProfile.result?.id
            ? String(botProfile.result.id)
            : null,
          botUsername:
            botProfile.result?.username || config.botUsername || null,
          botDisplayName: botProfile.result?.first_name || null,
          isVerified: Boolean(botProfile.ok),
          lastDiscoveredAt: new Date(),
        },
        create: {
          singletonKey: 'default',
          botExternalId: botProfile.result?.id
            ? String(botProfile.result.id)
            : null,
          botUsername:
            botProfile.result?.username || config.botUsername || null,
          botDisplayName: botProfile.result?.first_name || null,
          isVerified: Boolean(botProfile.ok),
          lastDiscoveredAt: new Date(),
        },
      });
    }

    await this.systemLogsService.log({
      scope: 'telegram.discovery',
      action: 'discover_groups',
      message: `Telegram group discovery completed with ${items.length} group(s)`,
      payload: {
        updateCount: Array.isArray(updates.result) ? updates.result.length : 0,
        discoveredItems,
        existingItems,
        items,
      },
    });

    return {
      ok: Boolean(botProfile.ok),
      skipped: false,
      bot: botProfile.result
        ? {
            id: botProfile.result.id,
            username: botProfile.result.username || null,
            firstName: botProfile.result.first_name || null,
            canJoinGroups: Boolean(botProfile.result.can_join_groups),
            canReadAllGroupMessages: Boolean(
              botProfile.result.can_read_all_group_messages,
            ),
          }
        : null,
      items,
      existingItems,
      updateCount: Array.isArray(updates.result) ? updates.result.length : 0,
      source: discoveredItems.length
        ? 'telegram_updates_and_db'
        : 'db_only_or_empty',
      note: discoveredItems.length
        ? 'Groups discovered from Telegram updates and merged with CRM records.'
        : 'Telegram Bot API does not expose a full group list. When webhook is enabled, getUpdates may be empty; CRM can only show groups already synced from prior updates.',
    };
  }

  async createInviteLink(input: TelegramInviteLinkInput) {
    const config = await this.getResolvedConfig();

    if (!config.botToken) {
      return {
        ok: false,
        skipped: true,
        reason: 'Missing bot token',
        inviteLink: null,
      };
    }

    const targetGroup = await this.resolveTelegramGroup(input);
    if (!targetGroup) {
      return {
        ok: false,
        skipped: true,
        reason: 'Target Telegram group not found. Run group discovery first.',
        inviteLink: null,
      };
    }

    const expireHours = Math.max(
      1,
      Math.min(24 * 30, Math.round(Number(input.expireHours || 24))),
    );
    const memberLimit = input.memberLimit
      ? Math.max(1, Math.min(99999, Math.round(Number(input.memberLimit))))
      : undefined;

    const response = await this.callTelegram<TelegramInviteLinkResult>(
      config.botToken,
      'createChatInviteLink',
      {
        chat_id: targetGroup.externalId,
        ...(input.name ? { name: input.name.trim().slice(0, 32) } : {}),
        ...(memberLimit ? { member_limit: memberLimit } : {}),
        ...(input.createsJoinRequest !== undefined
          ? { creates_join_request: Boolean(input.createsJoinRequest) }
          : {}),
        expire_date: Math.floor(Date.now() / 1000) + expireHours * 3600,
      },
    );

    await this.systemLogsService.log({
      level: response.ok ? 'INFO' : 'WARN',
      scope: 'telegram.invite',
      action: 'create_invite_link',
      message: response.ok
        ? `Invite link created for ${targetGroup.title}`
        : `Invite link creation failed for ${targetGroup.title}`,
      detail: response.description ?? null,
      payload: {
        groupTitle: targetGroup.title,
        groupExternalId: targetGroup.externalId,
        name: input.name || null,
        memberLimit: memberLimit || null,
      },
    });

    if (
      process.env.DATABASE_URL &&
      response.ok &&
      response.result?.invite_link
    ) {
      const resolvedCampaignId = await this.resolveCampaignForInviteLink(
        input.campaignId,
        targetGroup.title,
      );
      if (resolvedCampaignId) {
        const inviteLink = await this.prisma.campaignInviteLink.upsert({
          where: {
            inviteUrl: response.result.invite_link,
          },
          update: {
            campaignId: resolvedCampaignId,
            telegramGroupId:
              'id' in targetGroup && typeof targetGroup.id === 'string'
                ? targetGroup.id
                : null,
            externalInviteId: input.name?.trim() || null,
            label:
              input.name?.trim() ||
              response.result.name ||
              `Invite ${targetGroup.title}`,
            memberLimit:
              response.result.member_limit || input.memberLimit || null,
            createsJoinRequest: Boolean(response.result.creates_join_request),
            expireAt: response.result.expire_date
              ? new Date(response.result.expire_date * 1000)
              : null,
            status: 'ACTIVE',
          },
          create: {
            campaignId: resolvedCampaignId,
            telegramGroupId:
              'id' in targetGroup && typeof targetGroup.id === 'string'
                ? targetGroup.id
                : null,
            externalInviteId: input.name?.trim() || null,
            inviteUrl: response.result.invite_link,
            label:
              input.name?.trim() ||
              response.result.name ||
              `Invite ${targetGroup.title}`,
            memberLimit:
              response.result.member_limit || input.memberLimit || null,
            createsJoinRequest: Boolean(response.result.creates_join_request),
            expireAt: response.result.expire_date
              ? new Date(response.result.expire_date * 1000)
              : null,
            status: 'ACTIVE',
          },
        });

        await this.prisma.inviteLinkEvent.create({
          data: {
            inviteLinkId: inviteLink.id,
            eventType: 'LINK_CREATED',
            groupTitle: targetGroup.title,
            groupExternalId: targetGroup.externalId,
            detail: `Invite link created for ${targetGroup.title}`,
          },
        });
      }
    }

    return {
      ok: Boolean(response.ok),
      skipped: false,
      group: {
        id: targetGroup.id,
        title: targetGroup.title,
        externalId: targetGroup.externalId,
      },
      inviteLink: response.result
        ? {
            url: response.result.invite_link,
            name: response.result.name || null,
            createsJoinRequest: Boolean(response.result.creates_join_request),
            expireDate: response.result.expire_date
              ? new Date(response.result.expire_date * 1000).toISOString()
              : null,
            memberLimit: response.result.member_limit || null,
            pendingJoinRequestCount:
              response.result.pending_join_request_count || 0,
          }
        : null,
      description: response.description ?? null,
    };
  }

  async handleWebhook(payload: WebhookPayload, secretToken?: string) {
    const config = await this.getResolvedConfig();

    if (config.webhookSecret && secretToken !== config.webhookSecret) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    const lifecycleSync = await this.syncGroupLifecycleFromWebhook(payload);
    if (lifecycleSync) {
      return {
        acknowledged: true,
        eventType: lifecycleSync.eventType,
        groupTitle: lifecycleSync.groupTitle,
        detail: lifecycleSync.detail,
        lifecycle: lifecycleSync,
      };
    }

    await this.syncGroupPresenceFromWebhook(payload);

    const processed = this.extractWebhookEvent(payload);
    if (processed.eventType === 'message_received') {
      const commandResult = await this.handleCommandFromWebhook(
        payload,
        processed,
      );
      if (commandResult) {
        return {
          acknowledged: true,
          eventType: 'command',
          groupTitle: processed.groupTitle,
          detail: commandResult.detail,
          command: commandResult,
        };
      }
    }
    await this.recordTelegramEvent(processed);
    await this.syncMembershipFromWebhook(payload, processed);
    const moderation =
      processed.eventType === 'message_received' ||
      processed.eventType === 'join_request' ||
      processed.eventType === 'user_joined'
        ? await this.moderationEngineService.evaluate({
            source: 'telegram.webhook',
            eventType: processed.eventType,
            actorUsername: processed.actorUsername,
            actorExternalId: processed.actorExternalId,
            groupTitle: processed.groupTitle,
            groupExternalId: processed.groupExternalId,
            campaignLabel: processed.campaignLabel,
            messageText: processed.messageText,
            messageExternalId: processed.messageExternalId,
          })
        : null;
    const runtimeModeration = moderation
      ? await this.evaluateRuntimeModerationRules({
          eventType: processed.eventType,
          groupTitle: processed.groupTitle,
          groupExternalId: processed.groupExternalId,
          actorExternalId: processed.actorExternalId,
          actorUsername: processed.actorUsername,
          messageText: processed.messageText,
          isForwarded: processed.isForwarded,
          hasPhoto: processed.hasPhoto,
          hasVideo: processed.hasVideo,
          hasDocument: processed.hasDocument,
          hasSticker: processed.hasSticker,
          hasContact: processed.hasContact,
          viaBot: processed.viaBot,
        })
      : null;
    const resolvedModeration = moderation
      ? await this.applyRuntimeModerationResult(moderation, runtimeModeration)
      : null;
    const memberImpact = moderation
      ? await this.moderationService.applyAutomatedDecisionEffect({
          actorExternalId: processed.actorExternalId,
          groupTitle: processed.groupTitle,
          incrementWarning: Boolean(
            resolvedModeration?.warningContext?.incrementWarning,
          ),
        })
      : null;
    const action =
      resolvedModeration && config.botToken
        ? await this.telegramActionsService.executeModerationDecision({
            source: 'webhook',
            spamEventId: resolvedModeration.eventId,
            eventType: processed.eventType,
            decision: resolvedModeration.decision,
            actionVariant:
              runtimeModeration?.actionVariant ||
              resolvedModeration.warningContext?.actionVariant ||
              undefined,
            chatId: processed.groupExternalId,
            userId: processed.actorExternalId,
            messageId: processed.messageExternalId,
            deleteMessageIds:
              runtimeModeration?.deleteAll && processed.actorExternalId
                ? await this.collectRecentFloodMessageIds({
                    actorExternalId: processed.actorExternalId,
                    groupTitle: processed.groupTitle,
                    windowSeconds: runtimeModeration.deleteWindowSeconds || 0,
                    currentMessageId: processed.messageExternalId,
                  })
                : null,
            muteDurationHours:
              runtimeModeration?.muteDurationHours ||
              resolvedModeration.warningContext?.muteDurationHours ||
              resolvedModeration.policySnapshot.muteDurationHours,
            durationSeconds:
              runtimeModeration?.durationSeconds ||
              resolvedModeration.warningContext?.durationSeconds ||
              null,
            groupTitle: processed.groupTitle,
            actorExternalId: processed.actorExternalId,
            actorUsername: processed.actorUsername,
            reasonSummary: this.buildAnnouncementReasonSummary(
              resolvedModeration?.matchedRules,
              null,
            ),
            operatorName: 'bot tự động',
            silentActions: runtimeModeration?.silentActions ?? false,
          })
        : null;

    await this.systemLogsService.log({
      level:
        moderation && action && !action.enforced && !action.skipped
          ? 'WARN'
          : 'INFO',
      scope: 'telegram.webhook',
      action: 'handle_webhook',
      message: `Webhook ${processed.eventType} processed for ${processed.groupTitle}`,
      payload: {
        moderationDecision: resolvedModeration?.decision || null,
        runtimeModeration,
        memberImpact,
        action,
      },
    });

    return {
      acknowledged: true,
      eventType: processed.eventType,
      groupTitle: processed.groupTitle,
      detail: processed.detail,
      moderation: resolvedModeration,
      runtimeModeration,
      memberImpact,
      action,
    };
  }

  async mockEvent(input: TelegramMockEventInput) {
    const eventType = input.type ?? 'user_joined';
    const groupTitle = input.groupTitle ?? 'Nexus Global';
    const campaignName = input.campaignName ?? 'Mock Campaign';
    const username = input.username ?? 'mock_user';
    const displayName = input.displayName ?? username;
    const externalId = input.externalId ?? username;
    const memberCount = input.memberCount ?? 1;
    const messageText = input.messageText ?? 'Mock Telegram message';

    const detailMap = {
      user_joined: `${memberCount} new member(s) joined ${groupTitle} from ${campaignName}.`,
      user_left: `${username} left ${groupTitle} from ${campaignName}.`,
      join_request: `${username} requested to join ${groupTitle} from ${campaignName}.`,
      message_received: `Message captured in ${groupTitle}: ${messageText}.`,
    };

    const processed = {
      eventType,
      tone:
        eventType === 'message_received'
          ? EventTone.PRIMARY
          : EventTone.SUCCESS,
      title: `telegram.${eventType}`,
      detail: detailMap[eventType],
      groupTitle,
    };

    await this.recordTelegramEvent(processed);
    const resolvedCampaignId = await this.resolveCampaignForInviteLink(
      undefined,
      groupTitle,
    );
    await this.persistCommunityMemberEvent({
      eventType,
      groupTitle,
      campaignLabel: campaignName,
      campaignId: resolvedCampaignId,
      actorUsername: username,
      actorExternalId: externalId,
      displayName,
    });
    const moderation =
      eventType === 'message_received' || eventType === 'join_request'
        ? await this.moderationEngineService.evaluate({
            source: 'telegram.mock',
            eventType,
            actorUsername: username,
            actorExternalId: externalId,
            groupTitle,
            campaignLabel: campaignName,
            messageText,
          })
        : null;
    const runtimeModeration = moderation
      ? await this.evaluateRuntimeModerationRules({
          eventType,
          groupTitle,
          actorExternalId: externalId,
          actorUsername: username,
          messageText,
          groupExternalId: null,
          isForwarded: input.isForwarded ?? false,
          hasPhoto: input.hasPhoto ?? false,
          hasVideo: input.hasVideo ?? false,
          hasDocument: input.hasDocument ?? false,
          hasSticker: input.hasSticker ?? false,
          hasContact: input.hasContact ?? false,
          viaBot: input.viaBot ?? false,
        })
      : null;
    const resolvedModeration = moderation
      ? await this.applyRuntimeModerationResult(moderation, runtimeModeration)
      : null;
    const memberImpact = moderation
      ? await this.moderationService.applyAutomatedDecisionEffect({
          actorExternalId: externalId,
          groupTitle,
          incrementWarning: Boolean(
            resolvedModeration?.warningContext?.incrementWarning,
          ),
        })
      : null;

    return {
      processed: true,
      ...processed,
      moderation: resolvedModeration,
      runtimeModeration,
      memberImpact,
    };
  }

  async executeCommand(input: TelegramCommandInput) {
    const command = this.parseTelegramCommand(input.commandText);
    if (!command) {
      return {
        executed: false,
        skipped: true,
        reason: 'Unknown command',
      };
    }

    const group = await this.resolveGroupReference({
      groupId: input.groupId,
      groupExternalId: input.groupExternalId,
      groupTitle: input.groupTitle,
    });

    if (!group) {
      return {
        executed: false,
        skipped: true,
        reason: 'Telegram group not found',
      };
    }

    const result = await this.executeParsedCommand({
      parsedCommand: command,
      groupTitle: group.title,
      groupExternalId: group.externalId,
      actorExternalId: input.actorExternalId ?? null,
      actorUsername: input.actorUsername ?? null,
      targetExternalId: input.targetExternalId ?? null,
      targetUsername: input.targetUsername ?? null,
      targetMessageId: input.targetMessageId ?? null,
      note: input.note ?? null,
      skipAdminCheck: true,
    });

    return {
      executed: true,
      group: {
        id: group.id,
        title: group.title,
        externalId: group.externalId,
      },
      command,
      ...result,
    };
  }

  private parseTelegramCommand(commandText?: string | null) {
    const rawText = String(commandText || '').trim();
    if (!rawText.startsWith('/')) {
      return null;
    }

    const segments = rawText.split(/\s+/).filter(Boolean);
    const commandToken = segments[0]?.toLowerCase().split('@')[0] || '';
    const durationCandidate = segments[1] || '';

    const build = (
      command: ParsedTelegramCommand['command'],
      actionVariant: ParsedTelegramCommand['actionVariant'],
      decision: SpamDecision,
      durationSeconds: number | null,
      noteStartIndex: number,
    ) => ({
      command,
      actionVariant,
      decision,
      durationSeconds,
      note: segments.slice(noteStartIndex).join(' ').trim() || null,
      rawText,
    });

    switch (commandToken) {
      case '/warn':
        return build('warn', 'warn', SpamDecision.WARN, null, 1);
      case '/mute':
        return build('mute', 'mute', SpamDecision.RESTRICT, null, 1);
      case '/tmute':
        return build(
          'tmute',
          'tmute',
          SpamDecision.RESTRICT,
          this.parseDurationToken(durationCandidate) || 3600,
          this.parseDurationToken(durationCandidate) ? 2 : 1,
        );
      case '/kick':
        return build('kick', 'kick', SpamDecision.BAN, null, 1);
      case '/ban':
        return build('ban', 'ban', SpamDecision.BAN, null, 1);
      case '/tban':
        return build(
          'tban',
          'tban',
          SpamDecision.BAN,
          this.parseDurationToken(durationCandidate) || 86400,
          this.parseDurationToken(durationCandidate) ? 2 : 1,
        );
      case '/allow':
      case '/approve':
        return build('approve', 'allow', SpamDecision.ALLOW, null, 1);
      case '/logs':
        return build('logs', 'allow', SpamDecision.ALLOW, null, 1);
      case '/status':
        return build('status', 'allow', SpamDecision.ALLOW, null, 1);
      default:
        return null;
    }
  }

  private parseDurationToken(token?: string | null) {
    const value = String(token || '')
      .trim()
      .toLowerCase();
    if (!value) {
      return null;
    }

    const match = value.match(/^(\d+)([smhd])?$/i);
    if (!match) {
      return null;
    }

    const amount = Math.max(1, Number(match[1]));
    const unit = (match[2] || 'h').toLowerCase();

    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'd':
        return amount * 86400;
      case 'h':
      default:
        return amount * 3600;
    }
  }

  private async handleCommandFromWebhook(
    payload: WebhookPayload,
    processed: {
      eventType: string;
      groupTitle: string;
      groupExternalId?: string | null;
      actorExternalId?: string | null;
      actorUsername?: string | null;
      messageText?: string | null;
    },
  ) {
    const command = this.parseTelegramCommand(processed.messageText);
    if (!command) {
      return null;
    }

    const replyTarget = payload.message?.reply_to_message;
    const targetExternalId = replyTarget?.from?.id
      ? String(replyTarget.from.id)
      : null;
    const targetUsername =
      replyTarget?.from?.username ?? replyTarget?.from?.first_name ?? null;
    const targetMessageId = replyTarget?.message_id
      ? String(replyTarget.message_id)
      : null;

    const result = await this.executeParsedCommand({
      parsedCommand: command,
      groupTitle: processed.groupTitle,
      groupExternalId: processed.groupExternalId ?? null,
      actorExternalId: processed.actorExternalId ?? null,
      actorUsername: processed.actorUsername ?? null,
      targetExternalId,
      targetUsername,
      targetMessageId,
      note: null,
      skipAdminCheck: false,
    });

    return {
      command: command.rawText,
      detail: result.reason || `Command ${command.command} processed`,
      ...result,
    };
  }

  private async executeParsedCommand(input: {
    parsedCommand: ParsedTelegramCommand;
    groupTitle: string;
    groupExternalId: string | null;
    actorExternalId: string | null;
    actorUsername: string | null;
    targetExternalId: string | null;
    targetUsername: string | null;
    targetMessageId: string | null;
    note: string | null;
    skipAdminCheck: boolean;
  }) {
    if (
      !input.skipAdminCheck &&
      (!input.groupExternalId ||
        !input.actorExternalId ||
        !(await this.isTelegramAdmin(
          input.groupExternalId,
          input.actorExternalId,
        )))
    ) {
      await this.systemLogsService.log({
        level: 'WARN',
        scope: 'telegram.command',
        action: 'reject_command',
        message: `Rejected command ${input.parsedCommand.rawText}`,
        detail: 'Operator is not an administrator in this Telegram group.',
        payload: input,
      });

      return {
        applied: false,
        skipped: true,
        reason: 'Người gửi lệnh chưa có quyền admin trong group Telegram.',
      };
    }

    if (input.parsedCommand.command === 'status') {
      const group = await this.resolveGroupReference({
        groupExternalId: input.groupExternalId ?? undefined,
        groupTitle: input.groupTitle,
      });
      return {
        applied: true,
        skipped: false,
        reason: group
          ? `Bot state: ${'botMemberState' in group ? group.botMemberState || 'unknown' : 'unknown'}`
          : 'Không tìm thấy group trong CRM.',
      };
    }

    if (input.parsedCommand.command === 'logs') {
      const recent = (await this.systemLogsService.findRecent({
        limit: 5,
        scope: 'telegram.enforcement',
      })) as Array<{
        id: string;
        level: 'INFO' | 'WARN' | 'ERROR';
        scope: string;
        action: string;
        message: string;
        detail: string | null;
        createdAt: string;
      }>;
      return {
        applied: true,
        skipped: false,
        reason: `Có ${Array.isArray(recent) ? recent.length : 0} log enforcement gần nhất trong CRM.`,
        logs: recent,
      };
    }

    if (!input.targetExternalId) {
      return {
        applied: false,
        skipped: true,
        reason: 'Lệnh cần target user qua reply hoặc targetExternalId.',
      };
    }

    const spamEventId = await this.createCommandAuditEvent({
      parsedCommand: input.parsedCommand,
      groupTitle: input.groupTitle,
      groupExternalId: input.groupExternalId,
      actorUsername: input.targetUsername,
      actorExternalId: input.targetExternalId,
      messageExternalId: input.targetMessageId,
      operatorUsername: input.actorUsername,
      note: input.note,
    });

    const action = await this.telegramActionsService.executeModerationDecision({
      source: 'command',
      spamEventId,
      eventType: 'message_received',
      decision: input.parsedCommand.decision,
      actionVariant: input.parsedCommand.actionVariant,
      chatId: input.groupExternalId,
      userId: input.targetExternalId,
      messageId: input.targetMessageId,
      durationSeconds: input.parsedCommand.durationSeconds,
      note:
        input.note ||
        input.parsedCommand.note ||
        `Command ${input.parsedCommand.rawText}`,
      groupTitle: input.groupTitle,
      actorExternalId: input.targetExternalId,
      actorUsername: input.targetUsername,
      reasonSummary: this.buildAnnouncementReasonSummary(
        [
          `command:${input.parsedCommand.command}`,
          input.note || input.parsedCommand.note || '',
        ],
        input.note || input.parsedCommand.note || null,
      ),
      operatorName: input.actorUsername
        ? `@${input.actorUsername.replace(/^@/, '')}`
        : 'CRM Admin',
      silentActions: await this.resolveSilentActionsForGroup({
        groupExternalId: input.groupExternalId,
        groupTitle: input.groupTitle,
      }),
      commandText: input.parsedCommand.rawText,
    });

    const memberImpact =
      await this.moderationService.applyAutomatedDecisionEffect({
        actorExternalId: input.targetExternalId,
        groupTitle: input.groupTitle,
        incrementWarning: input.parsedCommand.decision === SpamDecision.WARN,
      });

    await this.systemLogsService.log({
      level: action.enforced ? 'INFO' : 'WARN',
      scope: 'telegram.command',
      action: 'execute_command',
      message: `Executed command ${input.parsedCommand.rawText}`,
      detail: action.reason || null,
      payload: {
        command: input.parsedCommand,
        action,
        memberImpact,
      },
    });

    return {
      applied: true,
      skipped: false,
      reason: action.reason || `Đã xử lý lệnh ${input.parsedCommand.command}.`,
      action,
      memberImpact,
      spamEventId,
    };
  }

  private async createCommandAuditEvent(input: {
    parsedCommand: ParsedTelegramCommand;
    groupTitle: string;
    groupExternalId: string | null;
    actorUsername: string | null;
    actorExternalId: string;
    messageExternalId: string | null;
    operatorUsername: string | null;
    note: string | null;
  }) {
    if (!process.env.DATABASE_URL) {
      return null;
    }

    const created = await this.prisma.spamEvent.create({
      data: {
        source: 'telegram.command',
        eventType: 'message_received',
        actorUsername: input.actorUsername,
        actorExternalId: input.actorExternalId,
        groupTitle: input.groupTitle,
        groupExternalId: input.groupExternalId,
        campaignLabel: null,
        messageText: `Manual command ${input.parsedCommand.rawText}`,
        messageExternalId: input.messageExternalId,
        matchedRules: [
          `command:${input.parsedCommand.command}`,
          input.operatorUsername
            ? `operator:${input.operatorUsername}`
            : 'operator:crm',
        ],
        ruleScore: 0,
        aiScore: null,
        finalScore: 0,
        aiLabel: null,
        aiReason: null,
        decision: input.parsedCommand.decision,
        manualDecision: input.parsedCommand.decision,
        manualNote:
          input.note ||
          input.parsedCommand.note ||
          `Command ${input.parsedCommand.rawText}`,
        reviewedAt: new Date(),
      },
    });

    return created.id;
  }

  private containsUrl(value: string) {
    return /\b(?:https?:\/\/|www\.|\w+\.(?:com|net|org|io|me|app|ly))\S*/i.test(
      value,
    );
  }

  private containsInviteLink(value: string) {
    return /(t\.me\/\+|t\.me\/joinchat|telegram\.me\/joinchat)/i.test(value);
  }

  private containsEmail(value: string) {
    return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value);
  }

  private containsPhone(value: string) {
    return /(?:\+?\d[\d\s().-]{7,}\d)/.test(value);
  }

  private parseCsvValues(value: string | null | undefined) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private async isActorExempt(input: {
    actorExternalId: string | null;
    actorUsername: string | null;
    groupTitle: string;
    groupExternalId: string | null;
    trustedUsernames: string;
    trustedExternalIds: string;
    exemptAdmins: boolean;
    exemptOwners: boolean;
  }) {
    const trustedUsernames = this.parseCsvValues(input.trustedUsernames).map(
      (item) => item.replace(/^@/, ''),
    );
    const trustedExternalIds = this.parseCsvValues(input.trustedExternalIds);
    const normalizedUsername = String(input.actorUsername || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    const normalizedExternalId = String(input.actorExternalId || '')
      .trim()
      .toLowerCase();

    if (normalizedUsername && trustedUsernames.includes(normalizedUsername)) {
      return true;
    }

    if (
      normalizedExternalId &&
      trustedExternalIds.includes(normalizedExternalId)
    ) {
      return true;
    }

    if (
      input.exemptOwners &&
      process.env.DATABASE_URL &&
      input.actorExternalId
    ) {
      const member = await this.prisma.communityMember.findFirst({
        where: {
          externalId: input.actorExternalId,
          groupTitle: input.groupTitle,
          ownerName: {
            not: null,
          },
        },
        orderBy: {
          joinedAt: 'desc',
        },
      });

      if (member?.ownerName) {
        return true;
      }
    }

    if (
      input.exemptAdmins &&
      input.groupExternalId &&
      input.actorExternalId &&
      (await this.isTelegramAdmin(input.groupExternalId, input.actorExternalId))
    ) {
      return true;
    }

    return false;
  }

  private async isTelegramAdmin(chatId: string, userId: string) {
    const config = await this.getResolvedConfig();
    if (!config.botToken) {
      return false;
    }

    const response = await this.callTelegram<{ status?: string }>(
      config.botToken,
      'getChatMember',
      {
        chat_id: chatId,
        user_id: Number(userId),
      },
    );

    const status = String(response.result?.status || '').toLowerCase();
    return status === 'administrator' || status === 'creator';
  }

  private async isAntifloodTriggered(input: {
    actorExternalId: string;
    groupTitle: string;
    limit: number;
    windowSeconds: number;
  }) {
    if (!process.env.DATABASE_URL) {
      return false;
    }

    const recentCount = await this.prisma.spamEvent.count({
      where: {
        eventType: 'message_received',
        actorExternalId: input.actorExternalId,
        groupTitle: input.groupTitle,
        createdAt: {
          gte: new Date(Date.now() - input.windowSeconds * 1000),
        },
      },
    });

    return recentCount + 1 >= input.limit;
  }

  private async collectRecentFloodMessageIds(input: {
    actorExternalId: string;
    groupTitle: string;
    windowSeconds: number;
    currentMessageId?: string | null;
  }) {
    const currentMessageId = String(input.currentMessageId || '').trim();
    if (!process.env.DATABASE_URL || input.windowSeconds <= 0) {
      return currentMessageId ? [currentMessageId] : [];
    }

    const recentEvents = await this.prisma.spamEvent.findMany({
      where: {
        eventType: 'message_received',
        actorExternalId: input.actorExternalId,
        groupTitle: input.groupTitle,
        createdAt: {
          gte: new Date(Date.now() - input.windowSeconds * 1000),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return Array.from(
      new Set(
        [
          currentMessageId,
          ...recentEvents.map((event) => String(event.messageExternalId || '')),
        ].filter(Boolean),
      ),
    );
  }

  private mapTelegramActionToDecision(action: string) {
    switch (action) {
      case 'mute':
      case 'tmute':
        return 'RESTRICT' as const;
      case 'kick':
      case 'ban':
      case 'tban':
      default:
        return 'BAN' as const;
    }
  }

  private getDecisionPriority(decision: string) {
    switch (decision) {
      case 'BAN':
        return 5;
      case 'RESTRICT':
        return 4;
      case 'WARN':
        return 3;
      case 'REVIEW':
        return 2;
      default:
        return 1;
    }
  }

  private escalateSpamDecision(
    current: RuntimeModerationRuleResult['decision'],
    incoming: RuntimeModerationRuleResult['decision'],
  ) {
    return this.getDecisionPriority(incoming) >
      this.getDecisionPriority(current)
      ? incoming
      : current;
  }

  private getDecisionMinimumScore(decision: string) {
    switch (decision) {
      case 'BAN':
        return 95;
      case 'RESTRICT':
        return 80;
      case 'WARN':
        return 60;
      case 'REVIEW':
        return 40;
      default:
        return 0;
    }
  }

  private getDecisionLabel(decision: string) {
    switch (decision) {
      case 'BAN':
        return 'Ban ngay';
      case 'RESTRICT':
        return 'Restrict / mute';
      case 'WARN':
        return 'Cảnh báo';
      case 'REVIEW':
        return 'Chờ review';
      default:
        return 'Cho phép';
    }
  }

  private async evaluateRuntimeModerationRules(input: {
    eventType: string;
    groupTitle: string;
    groupExternalId?: string | null;
    actorExternalId?: string | null;
    actorUsername?: string | null;
    messageText?: string | null;
    isForwarded?: boolean;
    hasPhoto?: boolean;
    hasVideo?: boolean;
    hasDocument?: boolean;
    hasSticker?: boolean;
    hasContact?: boolean;
    viaBot?: boolean;
  }): Promise<RuntimeModerationRuleResult | null> {
    if (!process.env.DATABASE_URL || input.eventType !== 'message_received') {
      return null;
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
    if (!settings?.moderationEnabled) {
      return null;
    }

    const isExempt = await this.isActorExempt({
      actorExternalId: input.actorExternalId ?? null,
      actorUsername: input.actorUsername ?? null,
      groupTitle: input.groupTitle,
      groupExternalId: input.groupExternalId ?? null,
      trustedExternalIds: settings.trustedExternalIds,
      trustedUsernames: settings.trustedUsernames,
      exemptAdmins: settings.exemptAdmins,
      exemptOwners: settings.exemptOwners,
    });

    if (isExempt) {
      return null;
    }

    const messageText = String(input.messageText || '');
    const matchedRules: string[] = [];
    let decision: RuntimeModerationRuleResult['decision'] = 'ALLOW';
    let actionVariant: RuntimeModerationRuleResult['actionVariant'] = 'warn';
    let muteDurationHours: number | null = null;
    let durationSeconds: number | null = null;
    let deleteAll = false;
    let deleteWindowSeconds: number | null = null;

    if (settings.lockUrl && this.containsUrl(messageText)) {
      matchedRules.push('lock:url');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockInvitelink && this.containsInviteLink(messageText)) {
      matchedRules.push('lock:invitelink');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockForward && input.isForwarded) {
      matchedRules.push('lock:forward');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockEmail && this.containsEmail(messageText)) {
      matchedRules.push('lock:email');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (
      (settings.lockPhone && this.containsPhone(messageText)) ||
      (settings.lockPhone && input.hasContact)
    ) {
      matchedRules.push('lock:phone');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockBot && input.viaBot) {
      matchedRules.push('lock:bot');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockPhoto && input.hasPhoto) {
      matchedRules.push('lock:photo');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockVideo && input.hasVideo) {
      matchedRules.push('lock:video');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockDocument && input.hasDocument) {
      matchedRules.push('lock:document');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (settings.lockSticker && input.hasSticker) {
      matchedRules.push('lock:sticker');
      decision = this.escalateSpamDecision(decision, 'WARN');
    }

    if (
      settings.antifloodEnabled &&
      input.actorExternalId &&
      (await this.isAntifloodTriggered({
        actorExternalId: input.actorExternalId,
        groupTitle: input.groupTitle,
        limit: settings.antifloodLimit,
        windowSeconds: settings.antifloodWindowSeconds,
      }))
    ) {
      matchedRules.push(
        `antiflood:${settings.antifloodLimit}/${settings.antifloodWindowSeconds}s`,
      );
      actionVariant =
        settings.antifloodAction as RuntimeModerationRuleResult['actionVariant'];
      decision = this.escalateSpamDecision(
        decision,
        this.mapTelegramActionToDecision(settings.antifloodAction),
      );
      durationSeconds = settings.antifloodActionDurationSeconds
        ? Math.max(60, Number(settings.antifloodActionDurationSeconds))
        : null;
      muteDurationHours = settings.antifloodActionDurationSeconds
        ? Math.max(1, Math.ceil(settings.antifloodActionDurationSeconds / 3600))
        : 24;
      deleteAll = settings.antifloodDeleteAll;
      deleteWindowSeconds = settings.antifloodWindowSeconds;
    }

    if (decision === 'ALLOW') {
      return null;
    }

    return {
      decision,
      actionVariant,
      matchedRules,
      muteDurationHours,
      durationSeconds,
      deleteAll,
      deleteWindowSeconds,
      silentActions: settings.silentActions,
    };
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

    if (normalizedRule.startsWith('command:')) {
      return `lệnh ${normalizedRule.slice('command:'.length)}`;
    }

    return normalizedRule.replace(/_/g, ' ');
  }

  private async applyRuntimeModerationResult(
    moderation: Awaited<ReturnType<ModerationEngineService['evaluate']>>,
    runtimeModeration: RuntimeModerationRuleResult | null,
  ) {
    if (!runtimeModeration) {
      return moderation;
    }

    const mergedRules = Array.from(
      new Set([
        ...(moderation.matchedRules || []),
        ...runtimeModeration.matchedRules,
      ]),
    );
    const mergedDecision = this.escalateSpamDecision(
      moderation.decision,
      runtimeModeration.decision,
    );
    const nextModeration = {
      ...moderation,
      matchedRules: mergedRules,
      decision: mergedDecision,
      decisionLabel: this.getDecisionLabel(mergedDecision),
      reviewRequired: mergedDecision === 'REVIEW' || mergedDecision === 'WARN',
      finalScore: Math.max(
        moderation.finalScore,
        this.getDecisionMinimumScore(mergedDecision),
      ),
    };

    if (process.env.DATABASE_URL && moderation.eventId) {
      await this.prisma.spamEvent.update({
        where: { id: moderation.eventId },
        data: {
          matchedRules: mergedRules,
          decision: mergedDecision,
          finalScore: nextModeration.finalScore,
        },
      });
    }

    return nextModeration;
  }

  private async getResolvedConfig(): Promise<ResolvedTelegramConfig> {
    const envConfig = {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
      publicBaseUrl: process.env.TELEGRAM_PUBLIC_BASE_URL ?? '',
    };

    if (!process.env.DATABASE_URL) {
      return envConfig;
    }

    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'telegram.bot_token',
            'telegram.bot_username',
            'telegram.webhook_secret',
            'telegram.public_base_url',
          ],
        },
      },
    });

    const map = settings.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});

    return {
      botToken: map['telegram.bot_token']
        ? decryptSecretValue(map['telegram.bot_token'])
        : envConfig.botToken,
      botUsername: map['telegram.bot_username'] || envConfig.botUsername,
      webhookSecret: map['telegram.webhook_secret']
        ? decryptSecretValue(map['telegram.webhook_secret'])
        : envConfig.webhookSecret,
      publicBaseUrl: map['telegram.public_base_url'] || envConfig.publicBaseUrl,
    };
  }

  private presentConfig(
    config: TelegramConfigInput,
    botConfig: {
      botExternalId?: string | null;
      botUsername?: string | null;
      botDisplayName?: string | null;
      isVerified?: boolean;
      webhookRegistered?: boolean;
      lastVerifiedAt?: Date | null;
      lastDiscoveredAt?: Date | null;
      webhookUrl?: string | null;
    } | null,
  ) {
    const webhookUrl = this.buildWebhookUrl(config.publicBaseUrl);

    return {
      botConfigured: Boolean(config.botToken),
      botId: botConfig?.botExternalId || null,
      botVerified: botConfig?.isVerified ?? false,
      botDisplayName: botConfig?.botDisplayName || null,
      botUsername: botConfig?.botUsername || config.botUsername || null,
      publicBaseUrlConfigured: Boolean(config.publicBaseUrl),
      webhookSecretConfigured: Boolean(config.webhookSecret),
      webhookRegistered: botConfig?.webhookRegistered ?? false,
      webhookUrl: botConfig?.webhookUrl || webhookUrl,
      tokenPreview: this.maskToken(config.botToken),
      lastVerifiedAt: botConfig?.lastVerifiedAt?.toISOString() || null,
      lastDiscoveredAt: botConfig?.lastDiscoveredAt?.toISOString() || null,
    };
  }

  private maskToken(token?: string) {
    if (!token) {
      return null;
    }

    if (token.length <= 8) {
      return '********';
    }

    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }

  private buildWebhookUrl(publicBaseUrl?: string) {
    if (!publicBaseUrl) {
      return null;
    }

    return `${publicBaseUrl.replace(/\/$/, '')}/api/telegram/webhook`;
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

  private async getBotConfigState() {
    if (!process.env.DATABASE_URL) {
      return null;
    }

    return this.prisma.telegramBotConfig.findUnique({
      where: { singletonKey: 'default' },
    });
  }

  private buildDefaultModerationSettingsPayload(
    groupId: string,
    overrides?: TelegramGroupModerationInput,
  ) {
    return {
      found: true,
      groupId,
      moderationEnabled: overrides?.moderationEnabled ?? false,
      lockUrl: overrides?.lockUrl ?? false,
      lockInvitelink: overrides?.lockInvitelink ?? false,
      lockForward: overrides?.lockForward ?? false,
      lockEmail: overrides?.lockEmail ?? false,
      lockPhone: overrides?.lockPhone ?? false,
      lockBot: overrides?.lockBot ?? false,
      lockPhoto: overrides?.lockPhoto ?? false,
      lockVideo: overrides?.lockVideo ?? false,
      lockDocument: overrides?.lockDocument ?? false,
      lockSticker: overrides?.lockSticker ?? false,
      trustedUsernames: overrides?.trustedUsernames ?? '',
      trustedExternalIds: overrides?.trustedExternalIds ?? '',
      exemptAdmins: overrides?.exemptAdmins ?? true,
      exemptOwners: overrides?.exemptOwners ?? true,
      lockWarns: overrides?.lockWarns ?? true,
      warnLimit: Math.max(1, Number(overrides?.warnLimit ?? 2)),
      warnAction: overrides?.warnAction ?? 'kick',
      warnActionDurationSeconds:
        overrides?.warnAction === 'tmute' || overrides?.warnAction === 'tban'
          ? Math.max(60, Number(overrides?.warnActionDurationSeconds ?? 600))
          : null,
      antifloodEnabled: overrides?.antifloodEnabled ?? false,
      antifloodLimit: Math.max(1, Number(overrides?.antifloodLimit ?? 5)),
      antifloodWindowSeconds: Math.max(
        1,
        Number(overrides?.antifloodWindowSeconds ?? 10),
      ),
      antifloodAction: overrides?.antifloodAction ?? 'tmute',
      antifloodActionDurationSeconds:
        overrides?.antifloodAction === 'tmute' ||
        overrides?.antifloodAction === 'tban'
          ? Math.max(
              60,
              Number(overrides?.antifloodActionDurationSeconds ?? 600),
            )
          : null,
      antifloodDeleteAll: overrides?.antifloodDeleteAll ?? true,
      aiModerationEnabled: overrides?.aiModerationEnabled ?? false,
      aiMode: overrides?.aiMode ?? 'off',
      aiConfidenceThreshold: Math.max(
        0,
        Math.min(1, Number(overrides?.aiConfidenceThreshold ?? 0.85)),
      ),
      aiOverrideAction: overrides?.aiOverrideAction ?? false,
      silentActions: overrides?.silentActions ?? false,
      rawLoggingEnabled: overrides?.rawLoggingEnabled ?? true,
      detailedLoggingEnabled: overrides?.detailedLoggingEnabled ?? true,
    };
  }

  private mapModerationSettings(
    groupId: string,
    settings: {
      moderationEnabled: boolean;
      lockUrl: boolean;
      lockInvitelink: boolean;
      lockForward: boolean;
      lockEmail: boolean;
      lockPhone: boolean;
      lockBot: boolean;
      lockPhoto: boolean;
      lockVideo: boolean;
      lockDocument: boolean;
      lockSticker: boolean;
      trustedUsernames: string;
      trustedExternalIds: string;
      exemptAdmins: boolean;
      exemptOwners: boolean;
      lockWarns: boolean;
      warnLimit: number;
      warnAction: string;
      warnActionDurationSeconds: number | null;
      antifloodEnabled: boolean;
      antifloodLimit: number;
      antifloodWindowSeconds: number;
      antifloodAction: string;
      antifloodActionDurationSeconds: number | null;
      antifloodDeleteAll: boolean;
      aiModerationEnabled: boolean;
      aiMode: string;
      aiConfidenceThreshold: number;
      aiOverrideAction: boolean;
      silentActions: boolean;
      rawLoggingEnabled: boolean;
      detailedLoggingEnabled: boolean;
    },
  ) {
    return {
      found: true,
      groupId,
      moderationEnabled: settings.moderationEnabled,
      lockUrl: settings.lockUrl,
      lockInvitelink: settings.lockInvitelink,
      lockForward: settings.lockForward,
      lockEmail: settings.lockEmail,
      lockPhone: settings.lockPhone,
      lockBot: settings.lockBot,
      lockPhoto: settings.lockPhoto,
      lockVideo: settings.lockVideo,
      lockDocument: settings.lockDocument,
      lockSticker: settings.lockSticker,
      trustedUsernames: settings.trustedUsernames,
      trustedExternalIds: settings.trustedExternalIds,
      exemptAdmins: settings.exemptAdmins,
      exemptOwners: settings.exemptOwners,
      lockWarns: settings.lockWarns,
      warnLimit: settings.warnLimit,
      warnAction: settings.warnAction,
      warnActionDurationSeconds: settings.warnActionDurationSeconds,
      antifloodEnabled: settings.antifloodEnabled,
      antifloodLimit: settings.antifloodLimit,
      antifloodWindowSeconds: settings.antifloodWindowSeconds,
      antifloodAction: settings.antifloodAction,
      antifloodActionDurationSeconds: settings.antifloodActionDurationSeconds,
      antifloodDeleteAll: settings.antifloodDeleteAll,
      aiModerationEnabled: settings.aiModerationEnabled,
      aiMode: settings.aiMode,
      aiConfidenceThreshold: settings.aiConfidenceThreshold,
      aiOverrideAction: settings.aiOverrideAction,
      silentActions: settings.silentActions,
      rawLoggingEnabled: settings.rawLoggingEnabled,
      detailedLoggingEnabled: settings.detailedLoggingEnabled,
    };
  }

  private async ensureModerationSettings(telegramGroupId: string) {
    if (!process.env.DATABASE_URL) {
      return null;
    }

    return this.prisma.telegramGroupModerationSettings.upsert({
      where: { telegramGroupId },
      update: {},
      create: {
        telegramGroupId,
      },
    });
  }

  private async upsertTelegramGroupRecord(input: {
    externalId: string;
    title: string;
    username?: string | null;
    type?: string | null;
    discoveredFrom: string;
    isActive: boolean;
    botMemberState?: string | null;
    botCanDeleteMessages?: boolean;
    botCanRestrictMembers?: boolean;
    botCanInviteUsers?: boolean;
    botCanManageTopics?: boolean;
  }) {
    if (!process.env.DATABASE_URL) {
      return null;
    }

    const slugBase =
      this.slugify(input.title) || `telegram-${input.externalId}`;
    const group = await this.prisma.telegramGroup.upsert({
      where: {
        externalId: input.externalId,
      },
      update: {
        title: input.title,
        username: input.username?.replace(/^@/, '') || null,
        type: String(input.type || 'supergroup').toLowerCase(),
        isActive: input.isActive,
        discoveredFrom: input.discoveredFrom,
        lastSyncedAt: new Date(),
        botMemberState: input.botMemberState || null,
        botCanDeleteMessages: Boolean(input.botCanDeleteMessages),
        botCanRestrictMembers: Boolean(input.botCanRestrictMembers),
        botCanInviteUsers: Boolean(input.botCanInviteUsers),
        botCanManageTopics: Boolean(input.botCanManageTopics),
        slug: `${slugBase}-${String(input.externalId).replace(/[^0-9a-zA-Z_-]/g, '')}`,
      },
      create: {
        title: input.title,
        externalId: input.externalId,
        username: input.username?.replace(/^@/, '') || null,
        type: String(input.type || 'supergroup').toLowerCase(),
        isActive: input.isActive,
        discoveredFrom: input.discoveredFrom,
        lastSyncedAt: new Date(),
        botMemberState: input.botMemberState || null,
        botCanDeleteMessages: Boolean(input.botCanDeleteMessages),
        botCanRestrictMembers: Boolean(input.botCanRestrictMembers),
        botCanInviteUsers: Boolean(input.botCanInviteUsers),
        botCanManageTopics: Boolean(input.botCanManageTopics),
        slug: `${slugBase}-${String(input.externalId).replace(/[^0-9a-zA-Z_-]/g, '')}`,
      },
    });

    await this.ensureModerationSettings(group.id);

    return group;
  }

  private async syncGroupLifecycleFromWebhook(payload: WebhookPayload) {
    const membershipUpdate =
      payload.my_chat_member || payload.chat_member || null;
    if (!membershipUpdate?.chat?.id) {
      return null;
    }

    const chatType = String(membershipUpdate.chat.type || '').toLowerCase();
    if (!['group', 'supergroup', 'channel'].includes(chatType)) {
      return null;
    }

    const groupTitle =
      String(membershipUpdate.chat.title || '').trim() ||
      String(membershipUpdate.chat.username || '').trim() ||
      `telegram-${membershipUpdate.chat.id}`;
    const nextStatus = String(
      membershipUpdate.new_chat_member?.status || 'member',
    ).toLowerCase();
    const isActive = !['left', 'kicked'].includes(nextStatus);

    const group = await this.upsertTelegramGroupRecord({
      externalId: String(membershipUpdate.chat.id),
      title: groupTitle,
      username: membershipUpdate.chat.username || null,
      type: membershipUpdate.chat.type || 'supergroup',
      discoveredFrom: 'webhook_sync',
      isActive,
      botMemberState: nextStatus,
      botCanDeleteMessages:
        membershipUpdate.new_chat_member?.can_delete_messages || false,
      botCanRestrictMembers:
        membershipUpdate.new_chat_member?.can_restrict_members || false,
      botCanInviteUsers:
        membershipUpdate.new_chat_member?.can_invite_users || false,
      botCanManageTopics:
        membershipUpdate.new_chat_member?.can_manage_topics || false,
    });

    await this.systemLogsService.log({
      level: isActive ? 'INFO' : 'WARN',
      scope: 'telegram.lifecycle',
      action: payload.my_chat_member
        ? 'sync_my_chat_member'
        : 'sync_chat_member',
      message: `Telegram group lifecycle synced for ${groupTitle}`,
      payload: {
        externalId: String(membershipUpdate.chat.id),
        oldStatus: membershipUpdate.old_chat_member?.status || null,
        newStatus: nextStatus,
        isActive,
      },
    });

    return {
      eventType: payload.my_chat_member ? 'my_chat_member' : 'chat_member',
      groupId: group?.id || null,
      groupTitle,
      detail: isActive
        ? `Bot membership synced as ${nextStatus}.`
        : `Bot is no longer active in ${groupTitle}.`,
    };
  }

  private async syncGroupPresenceFromWebhook(payload: WebhookPayload) {
    const chat =
      payload.message?.chat ||
      payload.channel_post?.chat ||
      payload.chat_join_request?.chat ||
      null;

    if (!chat?.id) {
      return null;
    }

    const chatType = String(chat.type || '').toLowerCase();
    if (!['group', 'supergroup', 'channel'].includes(chatType)) {
      return null;
    }

    const groupTitle =
      String(chat.title || '').trim() ||
      String(chat.username || '').trim() ||
      `telegram-${chat.id}`;

    return this.upsertTelegramGroupRecord({
      externalId: String(chat.id),
      title: groupTitle,
      username: chat.username || null,
      type: chat.type || 'supergroup',
      discoveredFrom: 'webhook_presence',
      isActive: true,
    });
  }

  private async resolveTelegramGroup(input: TelegramInviteLinkInput) {
    if (input.groupExternalId && !process.env.DATABASE_URL) {
      return {
        id: 'direct-external-id',
        title: input.groupTitle || input.groupExternalId,
        externalId: input.groupExternalId,
      };
    }

    if (!process.env.DATABASE_URL) {
      return null;
    }

    if (input.groupExternalId) {
      const byExternalId = await this.prisma.telegramGroup.findUnique({
        where: {
          externalId: input.groupExternalId,
        },
      });

      if (byExternalId) {
        return byExternalId;
      }

      return {
        id: 'direct-external-id',
        title: input.groupTitle || input.groupExternalId,
        externalId: input.groupExternalId,
      };
    }

    if (input.groupTitle) {
      return this.prisma.telegramGroup.findFirst({
        where: {
          title: input.groupTitle,
        },
      });
    }

    return null;
  }

  private async resolveGroupReference(input: {
    groupId?: string;
    groupExternalId?: string;
    groupTitle?: string;
  }) {
    if (!process.env.DATABASE_URL) {
      if (input.groupExternalId || input.groupTitle) {
        return {
          id: input.groupId || 'local-group',
          title: input.groupTitle || input.groupExternalId || 'Telegram Group',
          externalId: input.groupExternalId || input.groupId || 'local-group',
        };
      }

      return null;
    }

    if (input.groupId) {
      const byId = await this.prisma.telegramGroup.findUnique({
        where: { id: input.groupId },
      });
      if (byId) {
        return byId;
      }
    }

    if (input.groupExternalId) {
      const byExternalId = await this.prisma.telegramGroup.findUnique({
        where: { externalId: input.groupExternalId },
      });
      if (byExternalId) {
        return byExternalId;
      }
    }

    if (input.groupTitle) {
      return this.prisma.telegramGroup.findFirst({
        where: { title: input.groupTitle },
      });
    }

    return null;
  }

  private slugify(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private extractWebhookEvent(payload: WebhookPayload) {
    const joinMembers = payload.message?.new_chat_members;
    if (joinMembers?.length) {
      const groupTitle = payload.message?.chat?.title ?? 'Telegram Group';
      const inviteName =
        payload.message?.invite_link?.name ??
        payload.message?.invite_link?.invite_link ??
        'direct invite';

      return {
        eventType: 'user_joined',
        tone: EventTone.SUCCESS,
        title: 'telegram.user_joined',
        detail: `${joinMembers.length} member(s) joined ${groupTitle} via ${inviteName}.`,
        groupTitle,
        actorUsername:
          joinMembers[0]?.username ?? joinMembers[0]?.first_name ?? null,
        actorExternalId: null,
        campaignLabel: inviteName,
        messageText: null,
        groupExternalId: payload.message?.chat?.id
          ? String(payload.message.chat.id)
          : null,
        messageExternalId: payload.message?.message_id
          ? String(payload.message.message_id)
          : null,
      };
    }

    const leftMember = payload.message?.left_chat_member;
    if (leftMember) {
      const groupTitle = payload.message?.chat?.title ?? 'Telegram Group';
      const actor =
        leftMember.username ||
        [leftMember.first_name, leftMember.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        'unknown-user';

      return {
        eventType: 'user_left',
        tone: EventTone.WARNING,
        title: 'telegram.user_left',
        detail: `${actor} left ${groupTitle}.`,
        groupTitle,
        actorUsername: leftMember.username ?? actor,
        actorExternalId: leftMember.id ? String(leftMember.id) : null,
        campaignLabel:
          payload.message?.invite_link?.name ??
          payload.message?.invite_link?.invite_link ??
          null,
        messageText: null,
        groupExternalId: payload.message?.chat?.id
          ? String(payload.message.chat.id)
          : null,
        messageExternalId: payload.message?.message_id
          ? String(payload.message.message_id)
          : null,
      };
    }

    if (payload.chat_join_request) {
      const groupTitle =
        payload.chat_join_request.chat?.title ?? 'Telegram Group';
      const actor =
        payload.chat_join_request.from?.username ??
        payload.chat_join_request.from?.first_name ??
        'unknown-user';

      return {
        eventType: 'join_request',
        tone: EventTone.WARNING,
        title: 'telegram.join_request',
        detail: `${actor} requested to join ${groupTitle}.`,
        groupTitle,
        actorUsername: actor,
        actorExternalId: payload.chat_join_request.from?.id
          ? String(payload.chat_join_request.from.id)
          : null,
        campaignLabel:
          payload.chat_join_request.invite_link?.name ??
          payload.chat_join_request.invite_link?.invite_link ??
          null,
        messageText: null,
        groupExternalId: payload.chat_join_request.chat?.id
          ? String(payload.chat_join_request.chat.id)
          : null,
        messageExternalId: null,
      };
    }

    const groupTitle = payload.message?.chat?.title ?? 'Telegram Group';
    const messageText =
      payload.message?.text ||
      payload.message?.caption ||
      'Non-text message received.';

    return {
      eventType: 'message_received',
      tone: EventTone.PRIMARY,
      title: 'telegram.message_received',
      detail: `${groupTitle}: ${messageText}`,
      groupTitle,
      actorUsername: payload.message?.from?.username ?? null,
      actorExternalId: payload.message?.from?.id
        ? String(payload.message.from.id)
        : null,
      campaignLabel: null,
      messageText,
      isForwarded: Boolean(
        payload.message?.forward_origin ||
        payload.message?.forward_from ||
        payload.message?.forward_from_chat,
      ),
      hasPhoto: Boolean(payload.message?.photo?.length),
      hasVideo: Boolean(payload.message?.video),
      hasDocument: Boolean(payload.message?.document),
      hasSticker: Boolean(payload.message?.sticker),
      hasContact: Boolean(payload.message?.contact),
      viaBot: Boolean(
        payload.message?.via_bot || payload.message?.from?.is_bot,
      ),
      groupExternalId: payload.message?.chat?.id
        ? String(payload.message.chat.id)
        : null,
      messageExternalId: payload.message?.message_id
        ? String(payload.message.message_id)
        : null,
    };
  }

  private async syncMembershipFromWebhook(
    payload: WebhookPayload,
    processed: {
      eventType: string;
      groupTitle: string;
      groupExternalId?: string | null;
      campaignLabel?: string | null;
    },
  ) {
    const inviteLabel = processed.campaignLabel || 'direct invite';
    const inviteRecord = await this.resolveInviteLinkFromWebhook(payload);
    const resolvedCampaignLabel =
      inviteRecord?.label || inviteLabel || 'direct invite';
    const resolvedCampaignId =
      inviteRecord?.campaignId ||
      (await this.resolveCampaignForInviteLink(
        undefined,
        processed.groupTitle,
      ));

    if (payload.message?.new_chat_members?.length) {
      for (const member of payload.message.new_chat_members) {
        await this.persistCommunityMemberEvent({
          eventType: 'user_joined',
          groupTitle: processed.groupTitle,
          campaignLabel: resolvedCampaignLabel,
          campaignId: resolvedCampaignId,
          actorUsername: member.username ?? null,
          actorExternalId: member.id ? String(member.id) : null,
          displayName: [member.first_name, member.last_name]
            .filter(Boolean)
            .join(' ')
            .trim(),
        });
        await this.persistInviteLinkEvent({
          inviteLinkId: inviteRecord?.id || null,
          eventType: 'USER_JOINED',
          actorExternalId: member.id ? String(member.id) : null,
          actorUsername: member.username ?? null,
          groupTitle: processed.groupTitle,
          groupExternalId: processed.groupExternalId || null,
          detail: `Joined via ${resolvedCampaignLabel}`,
        });
      }
      return;
    }

    if (payload.message?.left_chat_member) {
      const member = payload.message.left_chat_member;
      await this.persistCommunityMemberEvent({
        eventType: 'user_left',
        groupTitle: processed.groupTitle,
        campaignLabel: resolvedCampaignLabel,
        campaignId: resolvedCampaignId,
        actorUsername: member.username ?? null,
        actorExternalId: member.id ? String(member.id) : null,
        displayName: [member.first_name, member.last_name]
          .filter(Boolean)
          .join(' ')
          .trim(),
      });
      await this.persistInviteLinkEvent({
        inviteLinkId: inviteRecord?.id || null,
        eventType: 'USER_LEFT',
        actorExternalId: member.id ? String(member.id) : null,
        actorUsername: member.username ?? null,
        groupTitle: processed.groupTitle,
        groupExternalId: processed.groupExternalId || null,
        detail: `Left group previously tied to ${resolvedCampaignLabel}`,
      });
    }

    if (payload.chat_join_request) {
      await this.persistInviteLinkEvent({
        inviteLinkId: inviteRecord?.id || null,
        eventType: 'JOIN_REQUEST',
        actorExternalId: payload.chat_join_request.from?.id
          ? String(payload.chat_join_request.from.id)
          : null,
        actorUsername: payload.chat_join_request.from?.username ?? null,
        groupTitle: processed.groupTitle,
        groupExternalId: processed.groupExternalId || null,
        detail: `Join request via ${resolvedCampaignLabel}`,
      });
    }
  }

  private async resolveCampaignForInviteLink(
    campaignId: string | undefined,
    groupTitle: string,
  ) {
    if (!process.env.DATABASE_URL) {
      return null;
    }

    if (campaignId) {
      const byId = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      });
      if (byId) {
        return byId.id;
      }
    }

    const byChannel = await this.prisma.campaign.findFirst({
      where: {
        channel: groupTitle,
      },
      orderBy: { createdAt: 'desc' },
    });

    return byChannel?.id || null;
  }

  private async resolveInviteLinkFromWebhook(payload: WebhookPayload) {
    if (!process.env.DATABASE_URL) {
      return null;
    }

    const inviteUrl =
      payload.message?.invite_link?.invite_link ||
      payload.chat_join_request?.invite_link?.invite_link ||
      null;
    const inviteName =
      payload.message?.invite_link?.name ||
      payload.chat_join_request?.invite_link?.name ||
      null;

    if (inviteUrl) {
      const byUrl = await this.prisma.campaignInviteLink.findUnique({
        where: { inviteUrl },
      });
      if (byUrl) {
        return byUrl;
      }
    }

    if (inviteName) {
      return this.prisma.campaignInviteLink.findFirst({
        where: {
          OR: [{ label: inviteName }, { externalInviteId: inviteName }],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return null;
  }

  private async persistInviteLinkEvent(input: {
    inviteLinkId?: string | null;
    eventType: 'USER_JOINED' | 'USER_LEFT' | 'JOIN_REQUEST';
    actorExternalId?: string | null;
    actorUsername?: string | null;
    groupTitle: string;
    groupExternalId?: string | null;
    detail?: string | null;
  }) {
    if (!process.env.DATABASE_URL) {
      return;
    }

    await this.prisma.inviteLinkEvent.create({
      data: {
        inviteLinkId: input.inviteLinkId || null,
        eventType: input.eventType,
        actorExternalId: input.actorExternalId || null,
        actorUsername: input.actorUsername || null,
        groupTitle: input.groupTitle,
        groupExternalId: input.groupExternalId || null,
        detail: input.detail || null,
      },
    });
  }

  private async persistCommunityMemberEvent(input: {
    eventType: string;
    groupTitle: string;
    campaignLabel: string;
    campaignId?: string | null;
    actorUsername?: string | null;
    actorExternalId?: string | null;
    displayName?: string | null;
  }) {
    if (!process.env.DATABASE_URL) {
      return;
    }

    if (!['user_joined', 'user_left'].includes(input.eventType)) {
      return;
    }

    const externalId =
      String(input.actorExternalId || '').trim() ||
      String(input.actorUsername || '').trim();
    const username = String(input.actorUsername || '').trim() || null;
    const displayName =
      String(input.displayName || '').trim() || username || 'Telegram member';

    if (!externalId && !username) {
      return;
    }

    const whereClause = externalId
      ? {
          externalId,
          groupTitle: input.groupTitle,
        }
      : {
          username,
          groupTitle: input.groupTitle,
        };

    const latestMember = await this.prisma.communityMember.findFirst({
      where: whereClause,
      orderBy: [{ leftAt: 'asc' }, { joinedAt: 'desc' }],
    });

    if (input.eventType === 'user_joined') {
      if (latestMember && !latestMember.leftAt) {
        await this.prisma.communityMember.update({
          where: { id: latestMember.id },
          data: {
            displayName,
            avatarInitials: this.buildAvatarInitials(displayName),
            username,
            campaignLabel: input.campaignLabel,
            campaignId: input.campaignId || latestMember.campaignId || null,
            joinedAt: new Date(),
            leftAt: null,
          },
        });
        return;
      }

      await this.prisma.communityMember.create({
        data: {
          displayName,
          avatarInitials: this.buildAvatarInitials(displayName),
          externalId: externalId || username || displayName,
          username,
          campaignLabel: input.campaignLabel,
          campaignId: input.campaignId || null,
          groupTitle: input.groupTitle,
          joinedAt: new Date(),
          leftAt: null,
        },
      });
      return;
    }

    if (latestMember && !latestMember.leftAt) {
      await this.prisma.communityMember.update({
        where: { id: latestMember.id },
        data: {
          leftAt: new Date(),
        },
      });
    }
  }

  private buildAvatarInitials(displayName: string) {
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');

    return initials || 'TG';
  }

  private async recordTelegramEvent(event: {
    eventType: string;
    tone: EventTone;
    title: string;
    detail: string;
    groupTitle: string;
  }) {
    if (!process.env.DATABASE_URL) {
      return {
        fallback: true,
        event,
        settings: fallbackSnapshot.settings,
      };
    }

    await this.prisma.eventFeedItem.create({
      data: {
        timeLabel: new Date().toISOString().slice(11, 16),
        title: event.title,
        detail: event.detail,
        tone: event.tone,
      },
    });

    return {
      fallback: false,
      event,
    };
  }
}
