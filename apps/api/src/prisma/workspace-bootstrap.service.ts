import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  decryptSecretValue,
  encryptSecretValue,
} from '../settings/settings-security';

export const DEFAULT_ORGANIZATION_SLUG = 'default-organization';
export const DEFAULT_WORKSPACE_SLUG = 'default-workspace';
export const DEFAULT_TELEGRAM_BOT_LEGACY_KEY = 'default';

type SyncDefaultTelegramBotInput = {
  externalId?: string | null;
  username?: string | null;
  displayName?: string | null;
  botToken?: string | null;
  webhookSecret?: string | null;
  publicBaseUrl?: string | null;
  webhookUrl?: string | null;
  isVerified?: boolean;
  webhookRegistered?: boolean;
  lastVerifiedAt?: Date | null;
  lastDiscoveredAt?: Date | null;
};

@Injectable()
export class WorkspaceBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (!process.env.DATABASE_URL) {
      return;
    }

    await this.bootstrapDefaultFoundation();
  }

  async bootstrapDefaultFoundation() {
    const { workspace } = await this.ensureDefaultScope();
    await this.syncDefaultTelegramBot();

    // Migrate existing UserRole records into WorkspaceMembership
    const userRoles = await this.prisma.userRole.findMany();
    if (userRoles.length > 0) {
      await this.prisma.workspaceMembership.createMany({
        data: userRoles.map((userRole) => ({
          userId: userRole.userId,
          roleId: userRole.roleId,
          workspaceId: workspace.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  async ensureDefaultScope() {
    const organization = await this.prisma.organization.upsert({
      where: { slug: DEFAULT_ORGANIZATION_SLUG },
      update: {
        isActive: true,
      },
      create: {
        name: 'Default Organization',
        slug: DEFAULT_ORGANIZATION_SLUG,
        isActive: true,
      },
    });

    const workspace = await this.prisma.workspace.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: DEFAULT_WORKSPACE_SLUG,
        },
      },
      update: {
        isActive: true,
      },
      create: {
        organizationId: organization.id,
        name: 'Default Workspace',
        slug: DEFAULT_WORKSPACE_SLUG,
        description: 'Backfilled workspace for current single-bot setup',
        isActive: true,
      },
    });

    return {
      organization,
      workspace,
    };
  }

  async syncDefaultTelegramBot(input?: SyncDefaultTelegramBotInput) {
    const { organization, workspace } = await this.ensureDefaultScope();

    const [
      botConfig,
      publicBaseUrlSetting,
      botTokenSetting,
      webhookSecretSetting,
    ] = await Promise.all([
      this.prisma.telegramBotConfig.findUnique({
        where: { singletonKey: DEFAULT_TELEGRAM_BOT_LEGACY_KEY },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'telegram.public_base_url' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'telegram.bot_token' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'telegram.webhook_secret' },
      }),
    ]);
    const botUsername = input?.username ?? botConfig?.botUsername ?? null;
    const displayName = input?.displayName ?? botConfig?.botDisplayName ?? null;
    const botToken =
      input?.botToken ??
      (botTokenSetting?.value
        ? decryptSecretValue(botTokenSetting.value)
        : null);
    const webhookSecret =
      input?.webhookSecret ??
      (webhookSecretSetting?.value
        ? decryptSecretValue(webhookSecretSetting.value)
        : null);
    const publicBaseUrl =
      input?.publicBaseUrl ??
      publicBaseUrlSetting?.value?.trim().replace(/\/$/, '') ??
      null;
    const webhookUrl = input?.webhookUrl ?? botConfig?.webhookUrl ?? null;

    return this.prisma.telegramBot.upsert({
      where: { legacyConfigKey: DEFAULT_TELEGRAM_BOT_LEGACY_KEY },
      update: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        externalId: input?.externalId ?? botConfig?.botExternalId ?? null,
        username: botUsername,
        displayName,
        label: displayName || botUsername || 'Default Telegram Bot',
        encryptedBotToken: botToken ? encryptSecretValue(botToken) : null,
        encryptedWebhookSecret: webhookSecret
          ? encryptSecretValue(webhookSecret)
          : null,
        publicBaseUrl,
        webhookUrl,
        isPrimary: true,
        isActive: true,
        isVerified: input?.isVerified ?? botConfig?.isVerified ?? false,
        webhookRegistered:
          input?.webhookRegistered ?? botConfig?.webhookRegistered ?? false,
        lastVerifiedAt:
          input?.lastVerifiedAt !== undefined
            ? input.lastVerifiedAt
            : (botConfig?.lastVerifiedAt ?? null),
        lastDiscoveredAt:
          input?.lastDiscoveredAt !== undefined
            ? input.lastDiscoveredAt
            : (botConfig?.lastDiscoveredAt ?? null),
      },
      create: {
        legacyConfigKey: DEFAULT_TELEGRAM_BOT_LEGACY_KEY,
        organizationId: organization.id,
        workspaceId: workspace.id,
        externalId: input?.externalId ?? botConfig?.botExternalId ?? null,
        username: botUsername,
        displayName,
        label: displayName || botUsername || 'Default Telegram Bot',
        encryptedBotToken: botToken ? encryptSecretValue(botToken) : null,
        encryptedWebhookSecret: webhookSecret
          ? encryptSecretValue(webhookSecret)
          : null,
        publicBaseUrl,
        webhookUrl,
        isPrimary: true,
        isActive: true,
        isVerified: input?.isVerified ?? botConfig?.isVerified ?? false,
        webhookRegistered:
          input?.webhookRegistered ?? botConfig?.webhookRegistered ?? false,
        lastVerifiedAt:
          input?.lastVerifiedAt !== undefined
            ? input.lastVerifiedAt
            : (botConfig?.lastVerifiedAt ?? null),
        lastDiscoveredAt:
          input?.lastDiscoveredAt !== undefined
            ? input.lastDiscoveredAt
            : (botConfig?.lastDiscoveredAt ?? null),
      },
    });
  }
}
