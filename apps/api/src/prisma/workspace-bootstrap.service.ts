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

type CanonicalRoleSpec = {
  name: string;
  description: string;
  aliases: string[];
  permissionCodes: string[];
};

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

  private buildCanonicalRoleSpecs() {
    const sharedWorkspacePermissions = [
      'workspace.manage',
      'campaign.view',
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
    ];

    return [
      {
        name: 'Quản trị hệ thống',
        description:
          'Toàn quyền tenant, workspace, bot và cấu hình toàn hệ thống.',
        aliases: ['Quản trị hệ thống', 'SuperAdmin'],
        permissionCodes: ['organization.manage', ...sharedWorkspacePermissions],
      },
      {
        name: 'Quản trị workspace',
        description:
          'Toàn quyền vận hành trong workspace, gồm user, role, settings, campaign, moderation và autopost.',
        aliases: ['Quản trị workspace', 'Admin'],
        permissionCodes: [...sharedWorkspacePermissions],
      },
      {
        name: 'Kiểm duyệt viên',
        description: 'Review spam, mute, ban và xử lý manual review.',
        aliases: ['Kiểm duyệt viên', 'Moderator'],
        permissionCodes: ['moderation.review'],
      },
      {
        name: 'Vận hành',
        description:
          'Toàn quyền vận hành trong workspace, trừ quản lý user và phân quyền.',
        aliases: ['Vận hành', 'Operator'],
        permissionCodes: [
          'campaign.manage',
          'moderation.review',
          'settings.manage',
          'autopost.execute',
        ],
      },
      {
        name: 'Cộng tác viên',
        description: 'Chỉ xem campaign được giao và kết quả link mời cá nhân.',
        aliases: ['Cộng tác viên', 'Viewer'],
        permissionCodes: ['campaign.view'],
      },
    ] satisfies CanonicalRoleSpec[];
  }

  private async normalizeLegacyRolesAndMemberships(
    permissionMap: Map<string, { id: string }>,
  ) {
    const canonicalRoleByName = new Map<string, { id: string; name: string }>();

    for (const spec of this.buildCanonicalRoleSpecs()) {
      let canonicalRole = await this.prisma.role.findUnique({
        where: { name: spec.name },
        select: { id: true, name: true },
      });

      if (!canonicalRole) {
        canonicalRole = await this.prisma.role.create({
          data: {
            name: spec.name,
            description: spec.description,
          },
          select: { id: true, name: true },
        });
      } else {
        await this.prisma.role.update({
          where: { id: canonicalRole.id },
          data: { description: spec.description },
        });
      }

      const legacyRoles = await this.prisma.role.findMany({
        where: {
          name: {
            in: spec.aliases.filter((alias) => alias !== spec.name),
          },
        },
        select: { id: true, name: true },
      });

      for (const legacyRole of legacyRoles) {
        const [legacyUserRoles, legacyMemberships] = await Promise.all([
          this.prisma.userRole.findMany({
            where: { roleId: legacyRole.id },
            select: { userId: true, assignedAt: true },
          }),
          this.prisma.workspaceMembership.findMany({
            where: { roleId: legacyRole.id },
            select: {
              userId: true,
              workspaceId: true,
              isActive: true,
              assignedAt: true,
            },
          }),
        ]);

        if (legacyUserRoles.length > 0) {
          await this.prisma.userRole.createMany({
            data: legacyUserRoles.map((item) => ({
              userId: item.userId,
              roleId: canonicalRole.id,
              assignedAt: item.assignedAt,
            })),
            skipDuplicates: true,
          });
        }

        if (legacyMemberships.length > 0) {
          await this.prisma.workspaceMembership.createMany({
            data: legacyMemberships.map((item) => ({
              userId: item.userId,
              workspaceId: item.workspaceId,
              roleId: canonicalRole.id,
              isActive: item.isActive,
              assignedAt: item.assignedAt,
            })),
            skipDuplicates: true,
          });
        }

        await this.prisma.rolePermission.deleteMany({
          where: { roleId: legacyRole.id },
        });
        await this.prisma.userRole.deleteMany({
          where: { roleId: legacyRole.id },
        });
        await this.prisma.workspaceMembership.deleteMany({
          where: { roleId: legacyRole.id },
        });
        await this.prisma.role.delete({
          where: { id: legacyRole.id },
        });
      }

      await this.prisma.rolePermission.deleteMany({
        where: { roleId: canonicalRole.id },
      });
      await this.prisma.rolePermission.createMany({
        data: spec.permissionCodes.map((code) => ({
          roleId: canonicalRole.id,
          permissionId: permissionMap.get(code)!.id,
        })),
        skipDuplicates: true,
      });

      canonicalRoleByName.set(spec.name, canonicalRole);
    }

    return canonicalRoleByName;
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
      this.prisma.permission.upsert({
        where: { code: 'contacts.manage' },
        update: {
          description: 'Import contacts and resolve Telegram user IDs',
        },
        create: {
          code: 'contacts.manage',
          description: 'Import contacts and resolve Telegram user IDs',
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

    const permissionMap = new Map(
      permissions.map((permission) => [permission.code, { id: permission.id }]),
    );
    const canonicalRoles =
      await this.normalizeLegacyRolesAndMemberships(permissionMap);
    const activeSuperAdminRole =
      canonicalRoles.get('Quản trị hệ thống') ?? superAdminRole;

    const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
    const superAdminUser = await this.prisma.user.upsert({
      where: { email: SUPERADMIN_EMAIL },
      update: {
        name: 'Quản trị hệ thống',
        username: 'system_superadmin',
        department: 'Nền tảng',
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      create: {
        email: SUPERADMIN_EMAIL,
        username: 'system_superadmin',
        name: 'Quản trị hệ thống',
        department: 'Nền tảng',
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: superAdminUser.id,
          roleId: activeSuperAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: superAdminUser.id,
        roleId: activeSuperAdminRole.id,
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
          roleId: activeSuperAdminRole.id,
        })),
        skipDuplicates: true,
      });
    }

    await Promise.all([
      this.prisma.user.updateMany({
        where: { email: 'admin@nexus.local' },
        data: { name: 'Quản trị workspace', department: 'Hạ tầng' },
      }),
      this.prisma.user.updateMany({
        where: { email: 'operator@nexus.local' },
        data: { name: 'Vận hành', department: 'Tăng trưởng' },
      }),
      this.prisma.user.updateMany({
        where: { email: 'moderator@nexus.local' },
        data: { name: 'Kiểm duyệt viên', department: 'Cộng đồng' },
      }),
      this.prisma.user.updateMany({
        where: { email: 'viewer@nexus.local' },
        data: { name: 'Cộng tác viên', department: 'Cộng tác viên' },
      }),
    ]);
  }
}
