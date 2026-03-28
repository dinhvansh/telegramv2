import { Injectable, UnauthorizedException } from '@nestjs/common';
import { EventTone } from '@prisma/client';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSecretValue,
  encryptSecretValue,
} from '../settings/settings-security';
import { ModerationEngineService } from '../moderation/moderation-engine.service';
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
};

type TelegramInviteLinkInput = {
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
  message?: {
    message_id?: number;
    text?: string;
    from?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    chat?: {
      id?: number | string;
      title?: string;
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
  chat_join_request?: {
    chat?: {
      id?: number | string;
      title?: string;
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
};

@Injectable()
export class TelegramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderationEngineService: ModerationEngineService,
    private readonly telegramActionsService: TelegramActionsService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async getStatus() {
    const config = await this.getResolvedConfig();
    const webhookUrl = this.buildWebhookUrl(config.publicBaseUrl);

    return {
      mode: config.botToken ? 'token-configured' : 'mock-only',
      botConfigured: Boolean(config.botToken),
      botUsername: config.botUsername || null,
      publicBaseUrlConfigured: Boolean(config.publicBaseUrl),
      webhookSecretConfigured: Boolean(config.webhookSecret),
      webhookUrl,
      tokenPreview: this.maskToken(config.botToken),
    };
  }

  async getGroups() {
    if (!process.env.DATABASE_URL) {
      return {
        items: [],
      };
    }

    const groups = await this.prisma.telegramGroup.findMany({
      orderBy: { title: 'asc' },
    });

    return {
      items: groups.map((group) => ({
        id: group.id,
        title: group.title,
        slug: group.slug,
        externalId: group.externalId,
      })),
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
        ...this.presentConfig(nextConfig),
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
      ...this.presentConfig(nextConfig),
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

    const items = [...discoveredChats.values()]
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

    if (process.env.DATABASE_URL) {
      for (const item of items) {
        const slugBase =
          this.slugify(item.title) || `telegram-${item.externalId}`;
        await this.prisma.telegramGroup.upsert({
          where: {
            externalId: item.externalId,
          },
          update: {
            title: item.title,
            slug: `${slugBase}-${String(item.externalId).replace(/[^0-9a-zA-Z_-]/g, '')}`,
          },
          create: {
            title: item.title,
            externalId: item.externalId,
            slug: `${slugBase}-${String(item.externalId).replace(/[^0-9a-zA-Z_-]/g, '')}`,
          },
        });
      }
    }

    await this.systemLogsService.log({
      scope: 'telegram.discovery',
      action: 'discover_groups',
      message: `Telegram group discovery completed with ${items.length} group(s)`,
      payload: {
        updateCount: Array.isArray(updates.result) ? updates.result.length : 0,
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
      updateCount: Array.isArray(updates.result) ? updates.result.length : 0,
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

    const processed = this.extractWebhookEvent(payload);
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
    const action =
      moderation && config.botToken
        ? await this.telegramActionsService.executeModerationDecision({
            source: 'webhook',
            spamEventId: moderation.eventId,
            eventType: processed.eventType,
            decision: moderation.decision,
            chatId: processed.groupExternalId,
            userId: processed.actorExternalId,
            messageId: processed.messageExternalId,
            muteDurationHours: moderation.policySnapshot.muteDurationHours,
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
        moderationDecision: moderation?.decision || null,
        action,
      },
    });

    return {
      acknowledged: true,
      eventType: processed.eventType,
      groupTitle: processed.groupTitle,
      detail: processed.detail,
      moderation,
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
    await this.persistCommunityMemberEvent({
      eventType,
      groupTitle,
      campaignLabel: campaignName,
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
            actorExternalId: null,
            groupTitle,
            campaignLabel: campaignName,
            messageText,
          })
        : null;

    return {
      processed: true,
      ...processed,
      moderation,
    };
  }

  private async getResolvedConfig() {
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

  private presentConfig(config: TelegramConfigInput) {
    const webhookUrl = this.buildWebhookUrl(config.publicBaseUrl);

    return {
      botConfigured: Boolean(config.botToken),
      botUsername: config.botUsername || null,
      publicBaseUrlConfigured: Boolean(config.publicBaseUrl),
      webhookSecretConfigured: Boolean(config.webhookSecret),
      webhookUrl,
      tokenPreview: this.maskToken(config.botToken),
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
    const messageText = payload.message?.text ?? 'Non-text message received.';

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
      campaignLabel?: string | null;
    },
  ) {
    const inviteLabel = processed.campaignLabel || 'direct invite';

    if (payload.message?.new_chat_members?.length) {
      for (const member of payload.message.new_chat_members) {
        await this.persistCommunityMemberEvent({
          eventType: 'user_joined',
          groupTitle: processed.groupTitle,
          campaignLabel: inviteLabel,
          actorUsername: member.username ?? null,
          actorExternalId: member.id ? String(member.id) : null,
          displayName: [member.first_name, member.last_name]
            .filter(Boolean)
            .join(' ')
            .trim(),
        });
      }
      return;
    }

    if (payload.message?.left_chat_member) {
      const member = payload.message.left_chat_member;
      await this.persistCommunityMemberEvent({
        eventType: 'user_left',
        groupTitle: processed.groupTitle,
        campaignLabel: inviteLabel,
        actorUsername: member.username ?? null,
        actorExternalId: member.id ? String(member.id) : null,
        displayName: [member.first_name, member.last_name]
          .filter(Boolean)
          .join(' ')
          .trim(),
      });
    }
  }

  private async persistCommunityMemberEvent(input: {
    eventType: string;
    groupTitle: string;
    campaignLabel: string;
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
