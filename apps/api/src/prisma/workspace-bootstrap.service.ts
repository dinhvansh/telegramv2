import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import {
  decryptSecretValue,
  encryptSecretValue,
} from '../settings/settings-security';

export const DEFAULT_ORGANIZATION_SLUG = 'default-organization';
export const DEFAULT_WORKSPACE_SLUG = 'default-workspace';
export const DEFAULT_TELEGRAM_BOT_LEGACY_KEY = 'default';
const SUPERADMIN_EMAIL = 'superadmin@nexus.local';
const SUPERADMIN_PASSWORD = 'superadmin123';

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

    await this.ensureSuperAdminFoundation();
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

  private async ensureSuperAdminFoundation() {
    const permissions = await Promise.all([
      this.prisma.permission.upsert({
        where: { code: 'organization.manage' },
        update: {
          description: 'Manage organizations and tenant-level configuration',
        },
        create: {
          code: 'organization.manage',
          description: 'Manage organizations and tenant-level configuration',
        },
      }),
      this.prisma.permission.upsert({
        where: { code: 'workspace.manage' },
        update: {
          description: 'Manage workspaces, memberships and bot assignments',
        },
        create: {
          code: 'workspace.manage',
          description: 'Manage workspaces, memberships and bot assignments',
        },
      }),
      this.prisma.permission.upsert({
        where: { code: 'campaign.view' },
        update: { description: 'View assigned campaigns and member progress' },
        create: {
          code: 'campaign.view',
          description: 'View assigned campaigns and member progress',
        },
      }),
      this.prisma.permission.upsert({
        where: { code: 'campaign.manage' },
        update: { description: 'Manage campaigns and invite links' },
        create: {
          code: 'campaign.manage',
          description: 'Manage campaigns and invite links',
        },
      }),
      this.prisma.permission.upsert({
        where: { code: 'moderation.review' },
        update: { description: 'Review spam and moderation alerts' },
        create: {
          code: 'moderation.review',
          description: 'Review spam and moderation alerts',
        },
      }),
      this.prisma.permission.upsert({
        where: { code: 'settings.manage' },
        update: { description: 'Manage bot settings and security config' },
        create: {
          code: 'settings.manage',
          description: 'Manage bot settings and security config',
        },
      }),
      this.prisma.permission.upsert({
        where: { code: 'autopost.execute' },
        update: { description: 'Manage autopost schedules and logs' },
        create: {
          code: 'autopost.execute',
          description: 'Manage autopost schedules and logs',
        },
      }),
    ]);

    const superAdminRole = await this.prisma.role.upsert({
      where: { name: 'SuperAdmin' },
      update: {
        description:
          'Toàn quyền tenant, workspace, bot và cấu hình toàn hệ thống.',
      },
      create: {
        name: 'SuperAdmin',
        description:
          'Toàn quyền tenant, workspace, bot và cấu hình toàn hệ thống.',
      },
    });

    await this.prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: superAdminRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
    const superAdminUser = await this.prisma.user.upsert({
      where: { email: SUPERADMIN_EMAIL },
      update: {
        name: 'System Super Admin',
        username: 'system_superadmin',
        department: 'Nền tảng',
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      create: {
        email: SUPERADMIN_EMAIL,
        username: 'system_superadmin',
        name: 'System Super Admin',
        department: 'Nền tảng',
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: superAdminUser.id,
          roleId: superAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
      },
    });

    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true },
    });

    if (workspaces.length > 0) {
      await this.prisma.workspaceMembership.createMany({
        data: workspaces.map((workspace) => ({
          userId: superAdminUser.id,
          workspaceId: workspace.id,
          roleId: superAdminRole.id,
        })),
        skipDuplicates: true,
      });
    }
  }
}
