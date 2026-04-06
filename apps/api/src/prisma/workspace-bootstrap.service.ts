import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export const DEFAULT_ORGANIZATION_SLUG = 'default-organization';
export const DEFAULT_WORKSPACE_SLUG = 'default-workspace';
export const DEFAULT_TELEGRAM_BOT_LEGACY_KEY = 'default';

type SyncDefaultTelegramBotInput = {
  externalId?: string | null;
  username?: string | null;
  displayName?: string | null;
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
    const { organization, workspace } = await this.ensureDefaultScope();
    const defaultBot = await this.syncDefaultTelegramBot();

    await this.prisma.telegramGroup.updateMany({
      where: {
        OR: [
          { organizationId: null },
          { workspaceId: null },
          { telegramBotId: null },
        ],
      },
      data: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        telegramBotId: defaultBot.id,
      },
    });

    await this.prisma.campaign.updateMany({
      where: {
        OR: [
          { organizationId: null },
          { workspaceId: null },
          { telegramBotId: null },
        ],
      },
      data: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        telegramBotId: defaultBot.id,
      },
    });

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

    const [botConfig, publicBaseUrlSetting] = await Promise.all([
      this.prisma.telegramBotConfig.findUnique({
        where: { singletonKey: DEFAULT_TELEGRAM_BOT_LEGACY_KEY },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'telegram.public_base_url' },
      }),
    ]);

    const botUsername = input?.username ?? botConfig?.botUsername ?? null;
    const displayName = input?.displayName ?? botConfig?.botDisplayName ?? null;
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
        publicBaseUrl,
        webhookUrl,
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
        publicBaseUrl,
        webhookUrl,
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
