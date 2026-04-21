import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CampaignStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecretValue } from '../settings/settings-security';

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    if (!process.env.DATABASE_URL) {
      return {
        organizations: [
          {
            id: 'fallback-default-organization',
            name: 'Default Organization',
            slug: 'default-organization',
            workspaceCount: 1,
          },
        ],
        workspaces: [
          {
            id: 'fallback-default-workspace',
            organizationId: 'fallback-default-organization',
            name: 'Default Workspace',
            slug: 'default-workspace',
            organizationName: 'Default Organization',
            description: null,
            isActive: true,
            botCount: 1,
            groupCount: 0,
            campaignCount: 0,
            membershipCount: 0,
            memberships: [],
          },
        ],
        bots: [
          {
            id: 'fallback-default-bot',
            label: 'Default Telegram Bot',
            username: null,
            displayName: null,
            workspaceId: 'fallback-default-workspace',
            workspaceName: 'Default Workspace',
            groupCount: 0,
            campaignCount: 0,
            isVerified: false,
            webhookRegistered: false,
            hasToken: false,
            publicBaseUrl: null,
            isPrimary: true,
            isActive: true,
          },
        ],
      };
    }

    const [organizations, workspaces, bots] = await Promise.all([
      this.prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: {
              workspaces: true,
            },
          },
        },
      }),
      this.prisma.workspace.findMany({
        orderBy: [{ organizationId: 'asc' }, { createdAt: 'asc' }],
        include: {
          organization: true,
          memberships: {
            orderBy: [{ assignedAt: 'asc' }],
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  status: true,
                },
              },
              role: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              telegramBots: true,
              telegramGroups: true,
              campaigns: true,
              memberships: true,
            },
          },
        },
      }),
      this.prisma.telegramBot.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          workspace: true,
          _count: {
            select: {
              telegramGroups: true,
              campaigns: true,
            },
          },
        },
      }),
    ]);

    return {
      organizations: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        workspaceCount: organization._count.workspaces,
      })),
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        organizationId: workspace.organizationId,
        name: workspace.name,
        slug: workspace.slug,
        organizationName: workspace.organization.name,
        description: workspace.description,
        isActive: workspace.isActive,
        botCount: workspace._count.telegramBots,
        groupCount: workspace._count.telegramGroups,
        campaignCount: workspace._count.campaigns,
        membershipCount: workspace._count.memberships,
        memberships: workspace.memberships.map((membership) => ({
          id: membership.id,
          isActive: membership.isActive,
          userId: membership.userId,
          userName: membership.user.name,
          userEmail: membership.user.email,
          userStatus: membership.user.status,
          roleId: membership.roleId,
          roleName: membership.role.name,
        })),
      })),
      bots: bots.map((bot) => ({
        id: bot.id,
        label: bot.label,
        username: bot.username,
        displayName: bot.displayName,
        workspaceId: bot.workspaceId,
        workspaceName: bot.workspace.name,
        groupCount: bot._count.telegramGroups,
        campaignCount: bot._count.campaigns,
        isVerified: bot.isVerified,
        webhookRegistered: bot.webhookRegistered,
        hasToken: Boolean(bot.encryptedBotToken),
        publicBaseUrl: bot.publicBaseUrl,
        isPrimary: bot.isPrimary,
        isActive: bot.isActive,
      })),
    };
  }

  async getCatalog() {
    if (!process.env.DATABASE_URL) {
      return {
        organizations: [
          {
            id: 'fallback-default-organization',
            name: 'Default Organization',
            slug: 'default-organization',
          },
        ],
        workspaces: [
          {
            id: 'fallback-default-workspace',
            name: 'Default Workspace',
            slug: 'default-workspace',
            organizationId: 'fallback-default-organization',
          },
        ],
        users: [
          {
            id: 'fallback-user-admin',
            name: 'Quản trị workspace',
            email: 'admin@nexus.local',
            status: 'ACTIVE',
          },
        ],
        roles: [
          { id: 'fallback-role-admin', name: 'Quản trị workspace' },
          { id: 'fallback-role-operator', name: 'Vận hành' },
          { id: 'fallback-role-viewer', name: 'Cộng tác viên' },
        ],
      };
    }

    const [organizations, workspaces, users, roles] = await Promise.all([
      this.prisma.organization.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.workspace.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findMany({
        where: {
          status: {
            not: UserStatus.DISABLED,
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
        },
      }),
      this.prisma.role.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    return {
      organizations: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })),
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        organizationId: workspace.organizationId,
      })),
      users,
      roles: roles.filter(
        (role) =>
          role.name !== 'SuperAdmin' && role.name !== 'Quản trị hệ thống',
      ),
    };
  }

  async createOrganization(input: { name: string; slug?: string }) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Organization management requires database mode',
      );
    }

    const name = input.name?.trim();
    const slug = normalizeSlug(input.slug?.trim() || name || '');

    if (!name || !slug) {
      throw new BadRequestException('Thiếu tên hoặc slug của organization');
    }

    const existing = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Slug organization đã tồn tại');
    }

    return this.prisma.organization.create({
      data: {
        name,
        slug,
      },
    });
  }

  async updateOrganization(
    organizationId: string,
    input: {
      name?: string;
      slug?: string;
      isActive?: boolean;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Organization management requires database mode',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, slug: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization không tồn tại');
    }

    const name = input.name !== undefined ? input.name.trim() : undefined;
    const slug =
      input.slug !== undefined
        ? normalizeSlug(input.slug.trim() || name || organization.slug)
        : undefined;

    if (name !== undefined && !name) {
      throw new BadRequestException('Thiếu tên organization');
    }
    if (slug !== undefined && !slug) {
      throw new BadRequestException('Thiếu slug organization');
    }

    if (slug && slug !== organization.slug) {
      const existing = await this.prisma.organization.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existing && existing.id !== organization.id) {
        throw new BadRequestException('Slug organization đã tồn tại');
      }
    }

    return this.prisma.organization.update({
      where: { id: organization.id },
      data: {
        name,
        slug,
        isActive:
          typeof input.isActive === 'boolean' ? input.isActive : undefined,
      },
    });
  }

  async deleteOrganization(organizationId: string) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Organization management requires database mode',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization không tồn tại');
    }

    return this.prisma.$transaction(async (tx) => {
      const organizationWorkspaces = await tx.workspace.findMany({
        where: { organizationId: organization.id },
        select: { id: true },
      });
      const workspaceIds = organizationWorkspaces.map(
        (workspace) => workspace.id,
      );

      const deactivatedMemberships = workspaceIds.length
        ? (
            await tx.workspaceMembership.updateMany({
              where: { workspaceId: { in: workspaceIds } },
              data: { isActive: false },
            })
          ).count
        : 0;

      const deactivatedBots = (
        await tx.telegramBot.updateMany({
          where: { organizationId: organization.id },
          data: { isActive: false, isPrimary: false },
        })
      ).count;

      const deactivatedGroups = (
        await tx.telegramGroup.updateMany({
          where: { organizationId: organization.id },
          data: { isActive: false },
        })
      ).count;

      const pausedCampaigns = (
        await tx.campaign.updateMany({
          where: {
            organizationId: organization.id,
            status: CampaignStatus.ACTIVE,
          },
          data: { status: CampaignStatus.PAUSED },
        })
      ).count;

      const deactivatedWorkspaces = (
        await tx.workspace.updateMany({
          where: { organizationId: organization.id },
          data: { isActive: false },
        })
      ).count;

      await tx.organization.update({
        where: { id: organization.id },
        data: { isActive: false },
      });

      return {
        deleted: true,
        archived: true,
        organizationId: organization.id,
        organizationName: organization.name,
        deactivatedWorkspaces,
        deactivatedMemberships,
        deactivatedBots,
        deactivatedGroups,
        pausedCampaigns,
      };
    });
  }

  async createWorkspace(input: {
    organizationId: string;
    name: string;
    slug?: string;
    description?: string;
  }) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Workspace management requires database mode',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization không tồn tại');
    }

    const name = input.name?.trim();
    const slug = normalizeSlug(input.slug?.trim() || name || '');
    const description = input.description?.trim() || null;

    if (!name || !slug) {
      throw new BadRequestException('Thiếu tên hoặc slug của workspace');
    }

    const existing = await this.prisma.workspace.findFirst({
      where: {
        organizationId: input.organizationId,
        slug,
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(
        'Slug workspace đã tồn tại trong organization này',
      );
    }

    return this.prisma.workspace.create({
      data: {
        organizationId: input.organizationId,
        name,
        slug,
        description,
      },
    });
  }

  async createWorkspaceBundle(input: {
    organizationMode: 'existing' | 'new';
    organizationId?: string;
    organizationName?: string;
    organizationSlug?: string;
    workspaceName: string;
    workspaceSlug?: string;
    workspaceDescription?: string;
    adminMode: 'existing' | 'new';
    existingUserId?: string;
    adminName?: string;
    adminEmail?: string;
    adminPassword?: string;
    adminUsername?: string;
    adminDepartment?: string;
    roleId: string;
    botLabel?: string;
    botUsername?: string;
    botDisplayName?: string;
    botToken?: string;
    webhookSecret?: string;
    publicBaseUrl?: string;
  }) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Workspace onboarding requires database mode',
      );
    }

    const workspaceName = input.workspaceName?.trim();
    const workspaceSlug = normalizeSlug(
      input.workspaceSlug?.trim() || workspaceName || '',
    );
    const workspaceDescription = input.workspaceDescription?.trim() || null;

    if (!workspaceName || !workspaceSlug) {
      throw new BadRequestException('Thiếu tên hoặc slug của workspace');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: input.roleId },
      select: { id: true, name: true },
    });

    if (!role) {
      throw new NotFoundException('Role không tồn tại');
    }
    if (role.name === 'SuperAdmin') {
      throw new BadRequestException(
        'Không thể gán role SuperAdmin cho workspace',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let organizationId = input.organizationId?.trim() || '';

      if (input.organizationMode === 'new') {
        const organizationName = input.organizationName?.trim();
        const organizationSlug = normalizeSlug(
          input.organizationSlug?.trim() || organizationName || '',
        );

        if (!organizationName || !organizationSlug) {
          throw new BadRequestException('Thiếu thông tin organization mới');
        }

        const existingOrganization = await tx.organization.findUnique({
          where: { slug: organizationSlug },
          select: { id: true },
        });
        if (existingOrganization) {
          throw new BadRequestException('Slug organization đã tồn tại');
        }

        const organization = await tx.organization.create({
          data: {
            name: organizationName,
            slug: organizationSlug,
          },
        });
        organizationId = organization.id;
      } else {
        if (!organizationId) {
          throw new BadRequestException('Thiếu organization để tạo workspace');
        }
        const existingOrganization = await tx.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!existingOrganization) {
          throw new NotFoundException('Organization không tồn tại');
        }
      }

      const duplicateWorkspace = await tx.workspace.findFirst({
        where: {
          organizationId,
          slug: workspaceSlug,
        },
        select: { id: true },
      });
      if (duplicateWorkspace) {
        throw new BadRequestException(
          'Slug workspace đã tồn tại trong organization này',
        );
      }

      const workspace = await tx.workspace.create({
        data: {
          organizationId,
          name: workspaceName,
          slug: workspaceSlug,
          description: workspaceDescription,
        },
      });

      let userId = input.existingUserId?.trim() || '';

      if (input.adminMode === 'new') {
        const adminName = input.adminName?.trim();
        const adminEmail = input.adminEmail?.trim().toLowerCase();
        const adminPassword = input.adminPassword ?? '';
        const adminUsername =
          input.adminUsername?.trim() || adminEmail?.split('@')[0] || null;
        const adminDepartment = input.adminDepartment?.trim() || workspace.name;

        if (!adminName || !adminEmail || !adminPassword) {
          throw new BadRequestException(
            'Thiếu thông tin admin đầu tiên của workspace',
          );
        }

        const existingUser = await tx.user.findFirst({
          where: {
            OR: [
              { email: adminEmail },
              ...(adminUsername ? [{ username: adminUsername }] : []),
            ],
          },
          select: { id: true },
        });
        if (existingUser) {
          throw new BadRequestException('Email hoặc username admin đã tồn tại');
        }

        const createdUser = await tx.user.create({
          data: {
            name: adminName,
            email: adminEmail,
            username: adminUsername,
            department: adminDepartment,
            status: UserStatus.ACTIVE,
            passwordHash: await bcrypt.hash(adminPassword, 10),
            userRoles: {
              create: {
                roleId: role.id,
              },
            },
          },
          select: { id: true },
        });
        userId = createdUser.id;
      } else {
        if (!userId) {
          throw new BadRequestException('Thiếu user để gán vào workspace');
        }
        const existingUser = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!existingUser) {
          throw new NotFoundException('User không tồn tại');
        }
      }

      const membership = await tx.workspaceMembership.upsert({
        where: {
          userId_workspaceId_roleId: {
            userId,
            workspaceId: workspace.id,
            roleId: role.id,
          },
        },
        update: {
          isActive: true,
        },
        create: {
          userId,
          workspaceId: workspace.id,
          roleId: role.id,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      let bot: {
        id: string;
        label: string;
        username: string | null;
        isPrimary: boolean;
      } | null = null;

      if (input.botLabel?.trim()) {
        const existingPrimaryBot = await tx.telegramBot.findFirst({
          where: {
            workspaceId: workspace.id,
            isActive: true,
            isPrimary: true,
          },
          select: { id: true },
        });

        const createdBot = await tx.telegramBot.create({
          data: {
            organizationId,
            workspaceId: workspace.id,
            label: input.botLabel.trim(),
            username: input.botUsername?.trim().replace(/^@+/, '') || null,
            displayName: input.botDisplayName?.trim() || null,
            encryptedBotToken: input.botToken?.trim()
              ? encryptSecretValue(input.botToken.trim())
              : null,
            encryptedWebhookSecret: input.webhookSecret?.trim()
              ? encryptSecretValue(input.webhookSecret.trim())
              : null,
            publicBaseUrl:
              input.publicBaseUrl?.trim().replace(/\/$/, '') || null,
            isPrimary: !existingPrimaryBot,
          },
          select: {
            id: true,
            label: true,
            username: true,
            isPrimary: true,
          },
        });

        bot = createdBot;
      }

      return {
        organizationId,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        },
        admin: {
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          roleId: membership.role.id,
          roleName: membership.role.name,
        },
        bot,
      };
    });
  }

  async updateWorkspace(
    workspaceId: string,
    input: {
      name?: string;
      slug?: string;
      description?: string | null;
      isActive?: boolean;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Workspace management requires database mode',
      );
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace không tồn tại');
    }

    const nextName = input.name?.trim() || workspace.name;
    const nextSlug = normalizeSlug(input.slug?.trim() || nextName);

    const duplicate = await this.prisma.workspace.findFirst({
      where: {
        organizationId: workspace.organizationId,
        slug: nextSlug,
        id: { not: workspace.id },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException(
        'Slug workspace đã tồn tại trong organization này',
      );
    }

    return this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        name: nextName,
        slug: nextSlug,
        description:
          input.description === undefined
            ? undefined
            : input.description?.trim() || null,
        isActive:
          typeof input.isActive === 'boolean' ? input.isActive : undefined,
      },
    });
  }

  async deleteWorkspace(workspaceId: string) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Workspace management requires database mode',
      );
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace không tồn tại');
    }

    return this.prisma.$transaction(async (tx) => {
      const [memberships, bots, groups] = await Promise.all([
        tx.workspaceMembership.updateMany({
          where: { workspaceId: workspace.id },
          data: { isActive: false },
        }),
        tx.telegramBot.updateMany({
          where: { workspaceId: workspace.id },
          data: { isActive: false, isPrimary: false },
        }),
        tx.telegramGroup.updateMany({
          where: { workspaceId: workspace.id },
          data: { isActive: false },
        }),
      ]);

      await tx.workspace.update({
        where: { id: workspace.id },
        data: { isActive: false },
      });

      return {
        deleted: true,
        archived: true,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        deactivatedMemberships: memberships.count,
        deactivatedBots: bots.count,
        deactivatedGroups: groups.count,
      };
    });
  }

  async deleteWorkspacePermanently(workspaceId: string) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Workspace management requires database mode',
      );
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace khÃ´ng tá»“n táº¡i');
    }

    await this.prisma.workspace.delete({
      where: { id: workspace.id },
    });

    return {
      deleted: true,
      permanent: true,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    };
  }

  async createBot(
    workspaceId: string,
    input: {
      label: string;
      username?: string;
      displayName?: string;
      botToken?: string;
      webhookSecret?: string;
      publicBaseUrl?: string;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException('Bot management requires database mode');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace không tồn tại');
    }

    const label = input.label?.trim();
    const username = input.username?.trim().replace(/^@+/, '') || null;
    const displayName = input.displayName?.trim() || null;
    const botToken = input.botToken?.trim() || null;
    const webhookSecret = input.webhookSecret?.trim() || null;
    const publicBaseUrl =
      input.publicBaseUrl?.trim().replace(/\/$/, '') || null;

    if (!label) {
      throw new BadRequestException('Thiếu tên bot');
    }

    const existingPrimaryBot = await this.prisma.telegramBot.findFirst({
      where: {
        workspaceId: workspace.id,
        isActive: true,
        isPrimary: true,
      },
      select: { id: true },
    });

    return this.prisma.telegramBot.create({
      data: {
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        label,
        username,
        displayName,
        encryptedBotToken: botToken ? encryptSecretValue(botToken) : null,
        encryptedWebhookSecret: webhookSecret
          ? encryptSecretValue(webhookSecret)
          : null,
        publicBaseUrl,
        isPrimary: !existingPrimaryBot,
      },
    });
  }

  async updateBot(
    botId: string,
    input: {
      label?: string;
      username?: string | null;
      displayName?: string | null;
      botToken?: string | null;
      webhookSecret?: string | null;
      publicBaseUrl?: string | null;
      isActive?: boolean;
      isPrimary?: boolean;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException('Bot management requires database mode');
    }

    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: botId },
      select: {
        id: true,
        workspaceId: true,
        label: true,
      },
    });

    if (!bot) {
      throw new NotFoundException('Bot không tồn tại');
    }

    const label = input.label !== undefined ? input.label.trim() : undefined;
    if (label !== undefined && !label) {
      throw new BadRequestException('Thiếu tên bot');
    }

    const username =
      input.username === undefined
        ? undefined
        : input.username?.trim().replace(/^@+/, '') || null;
    const displayName =
      input.displayName === undefined
        ? undefined
        : input.displayName?.trim() || null;
    const publicBaseUrl =
      input.publicBaseUrl === undefined
        ? undefined
        : input.publicBaseUrl?.trim().replace(/\/$/, '') || null;
    const encryptedBotToken =
      input.botToken === undefined
        ? undefined
        : input.botToken?.trim()
          ? encryptSecretValue(input.botToken.trim())
          : null;
    const encryptedWebhookSecret =
      input.webhookSecret === undefined
        ? undefined
        : input.webhookSecret?.trim()
          ? encryptSecretValue(input.webhookSecret.trim())
          : null;

    const shouldSetPrimary = input.isPrimary === true;

    return this.prisma.$transaction(async (tx) => {
      if (shouldSetPrimary) {
        await tx.telegramBot.updateMany({
          where: {
            workspaceId: bot.workspaceId,
            id: { not: bot.id },
          },
          data: { isPrimary: false },
        });
      }

      const updatedBot = await tx.telegramBot.update({
        where: { id: bot.id },
        data: {
          label,
          username,
          displayName,
          publicBaseUrl,
          encryptedBotToken,
          encryptedWebhookSecret,
          isActive:
            typeof input.isActive === 'boolean' ? input.isActive : undefined,
          isPrimary: shouldSetPrimary ? true : undefined,
        },
      });

      if (input.isActive === false && updatedBot.isPrimary) {
        const fallbackBot = await tx.telegramBot.findFirst({
          where: {
            workspaceId: bot.workspaceId,
            isActive: true,
            id: { not: updatedBot.id },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (fallbackBot) {
          await tx.telegramBot.update({
            where: { id: fallbackBot.id },
            data: { isPrimary: true },
          });
          await tx.telegramBot.update({
            where: { id: updatedBot.id },
            data: { isPrimary: false },
          });
        }
      }

      return tx.telegramBot.findUnique({
        where: { id: bot.id },
      });
    });
  }

  async deleteBot(botId: string) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException('Bot management requires database mode');
    }

    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: botId },
      select: {
        id: true,
        workspaceId: true,
        label: true,
        isPrimary: true,
      },
    });

    if (!bot) {
      throw new NotFoundException('Bot không tồn tại');
    }

    return this.prisma.$transaction(async (tx) => {
      const impactedGroups = await tx.telegramGroup.updateMany({
        where: { telegramBotId: bot.id },
        data: { isActive: false },
      });

      await tx.telegramBot.update({
        where: { id: bot.id },
        data: {
          isActive: false,
          isPrimary: false,
        },
      });

      if (bot.isPrimary) {
        const fallbackBot = await tx.telegramBot.findFirst({
          where: {
            workspaceId: bot.workspaceId,
            isActive: true,
            id: { not: bot.id },
          },
          orderBy: [{ createdAt: 'asc' }],
        });

        if (fallbackBot) {
          await tx.telegramBot.update({
            where: { id: fallbackBot.id },
            data: { isPrimary: true },
          });
        }
      }

      return {
        deleted: true,
        archived: true,
        botId: bot.id,
        label: bot.label,
        deactivatedGroups: impactedGroups.count,
      };
    });
  }

  async createMembership(
    workspaceId: string,
    input: {
      userId: string;
      roleId: string;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Workspace membership requires database mode',
      );
    }

    const [workspace, user, role] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.role.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true },
      }),
    ]);

    if (!workspace) {
      throw new NotFoundException('Workspace không tồn tại');
    }
    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }
    if (!role) {
      throw new NotFoundException('Role không tồn tại');
    }
    if (role.name === 'SuperAdmin') {
      throw new BadRequestException('Không gán role SuperAdmin vào workspace');
    }

    const membership = await this.prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId_roleId: {
          userId: user.id,
          workspaceId: workspace.id,
          roleId: role.id,
        },
      },
      update: {
        isActive: true,
      },
      create: {
        userId: user.id,
        workspaceId: workspace.id,
        roleId: role.id,
        isActive: true,
      },
      include: {
        workspace: true,
        user: true,
        role: true,
      },
    });

    return {
      id: membership.id,
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace.name,
      userId: membership.userId,
      userName: membership.user.name,
      userEmail: membership.user.email,
      roleId: membership.roleId,
      roleName: membership.role.name,
      isActive: membership.isActive,
    };
  }

  async updateMembership(
    membershipId: string,
    input: {
      isActive?: boolean;
    },
  ) {
    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Workspace membership requires database mode',
      );
    }

    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      include: {
        workspace: true,
        user: true,
        role: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Workspace membership không tồn tại');
    }

    const updated = await this.prisma.workspaceMembership.update({
      where: { id: membership.id },
      data: {
        isActive:
          typeof input.isActive === 'boolean' ? input.isActive : undefined,
      },
      include: {
        workspace: true,
        user: true,
        role: true,
      },
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      workspaceName: updated.workspace.name,
      userId: updated.userId,
      userName: updated.user.name,
      userEmail: updated.user.email,
      roleId: updated.roleId,
      roleName: updated.role.name,
      isActive: updated.isActive,
    };
  }
}
