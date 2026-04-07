import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type FallbackUserRecord = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  department: string;
  status: 'ACTIVE' | 'AWAY' | 'DISABLED';
  passwordHash: string;
  roles: Array<{ id: string; name: string; permissions: string[] }>;
};

type UserViewer = {
  userId: string;
  permissions: string[];
  workspaceIds?: string[];
};

const fallbackRoleCatalog = [
  {
    id: 'fallback-role-superadmin',
    name: 'SuperAdmin',
    permissions: [
      'organization.manage',
      'workspace.manage',
      'campaign.view',
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
    ],
  },
  {
    id: 'fallback-role-viewer',
    name: 'Viewer',
    permissions: ['campaign.view'],
  },
  {
    id: 'fallback-role-admin',
    name: 'Admin',
    permissions: [
      'workspace.manage',
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
    ],
  },
  {
    id: 'fallback-role-moderator',
    name: 'Moderator',
    permissions: ['moderation.review'],
  },
  {
    id: 'fallback-role-operator',
    name: 'Operator',
    permissions: ['campaign.manage', 'autopost.execute'],
  },
] as const;

function getStatusLabel(status: string) {
  switch (status) {
    case 'AWAY':
      return 'Vắng mặt';
    case 'DISABLED':
      return 'Tạm khóa';
    default:
      return 'Hoạt động';
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case 'AWAY':
      return 'warning';
    case 'DISABLED':
      return 'danger';
    default:
      return 'success';
  }
}

@Injectable()
export class UsersService {
  private fallbackUsers: FallbackUserRecord[] = [
    {
      id: 'fallback-user-superadmin',
      email: 'superadmin@nexus.local',
      username: 'system_superadmin',
      name: 'System Super Admin',
      department: 'Nền tảng',
      status: 'ACTIVE',
      passwordHash: bcrypt.hashSync('superadmin123', 10),
      roles: [
        {
          id: fallbackRoleCatalog[0].id,
          name: fallbackRoleCatalog[0].name,
          permissions: [...fallbackRoleCatalog[0].permissions],
        },
      ],
    },
    {
      id: 'fallback-user-admin',
      email: 'admin@nexus.local',
      username: 'nexus_admin',
      name: 'Nexus Admin',
      department: 'Hạ tầng',
      status: 'ACTIVE',
      passwordHash: bcrypt.hashSync('admin123', 10),
      roles: [
        {
          id: fallbackRoleCatalog[2].id,
          name: fallbackRoleCatalog[2].name,
          permissions: [...fallbackRoleCatalog[2].permissions],
        },
      ],
    },
    {
      id: 'fallback-user-operator',
      email: 'operator@nexus.local',
      username: 'campaign_operator',
      name: 'Campaign Operator',
      department: 'Tăng trưởng',
      status: 'ACTIVE',
      passwordHash: bcrypt.hashSync('operator123', 10),
      roles: [
        {
          id: fallbackRoleCatalog[4].id,
          name: fallbackRoleCatalog[4].name,
          permissions: [...fallbackRoleCatalog[4].permissions],
        },
      ],
    },
    {
      id: 'fallback-user-viewer',
      email: 'viewer@nexus.local',
      username: 'campaign_viewer',
      name: 'Campaign Viewer',
      department: 'Quan sát',
      status: 'ACTIVE',
      passwordHash: bcrypt.hashSync('viewer123', 10),
      roles: [
        {
          id: fallbackRoleCatalog[1].id,
          name: fallbackRoleCatalog[1].name,
          permissions: [...fallbackRoleCatalog[1].permissions],
        },
      ],
    },
    {
      id: 'fallback-user-moderator',
      email: 'moderator@nexus.local',
      username: 'mod_guard',
      name: 'Trust Moderator',
      department: 'Cộng đồng',
      status: 'ACTIVE',
      passwordHash: bcrypt.hashSync('moderator123', 10),
      roles: [
        {
          id: fallbackRoleCatalog[3].id,
          name: fallbackRoleCatalog[3].name,
          permissions: [...fallbackRoleCatalog[3].permissions],
        },
      ],
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  private isOrganizationManager(viewer?: UserViewer) {
    return Boolean(viewer?.permissions.includes('organization.manage'));
  }

  async findAll(viewer?: UserViewer) {
    if (!process.env.DATABASE_URL) {
      return this.fallbackUsers
        .filter(
          (user) =>
            this.isOrganizationManager(viewer) ||
            !user.roles.some((role) => role.name === 'SuperAdmin'),
        )
        .map((user) => this.serializeFallbackUser(user));
    }

    const users = await this.prisma.user.findMany({
      where: this.isOrganizationManager(viewer)
        ? undefined
        : {
            userRoles: {
              none: {
                role: {
                  name: 'SuperAdmin',
                },
              },
            },
          },
      orderBy: { createdAt: 'asc' },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return users.map((user) => this.serializeDatabaseUser(user));
  }

  async create(
    input: {
      name: string;
      email: string;
      password: string;
      roleId: string;
      workspaceId?: string;
      department?: string;
      username?: string;
      status?: string;
    },
    viewer?: UserViewer,
  ) {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const roleId = input.roleId?.trim();
    const workspaceId = input.workspaceId?.trim();
    const department = input.department?.trim() || 'Chưa gán';
    const username = input.username?.trim() || email?.split('@')[0] || null;
    const status = (input.status?.trim().toUpperCase() ||
      'ACTIVE') as keyof typeof UserStatus;

    if (!name || !email || !password || !roleId) {
      throw new UnauthorizedException('Missing user payload');
    }

    if (!process.env.DATABASE_URL) {
      const fallbackRole = fallbackRoleCatalog.find(
        (role) => role.id === roleId,
      );
      if (!fallbackRole) {
        throw new UnauthorizedException('Role not found');
      }
      if (
        fallbackRole.name === 'SuperAdmin' &&
        !this.isOrganizationManager(viewer)
      ) {
        throw new ForbiddenException('Only superadmin can assign SuperAdmin');
      }

      const created: FallbackUserRecord = {
        id: `fallback-user-${this.fallbackUsers.length + 1}`,
        name,
        email,
        username,
        department,
        status: status === 'AWAY' || status === 'DISABLED' ? status : 'ACTIVE',
        passwordHash: await bcrypt.hash(password, 10),
        roles: [
          {
            id: fallbackRole.id,
            name: fallbackRole.name,
            permissions: [...fallbackRole.permissions],
          },
        ],
      };
      this.fallbackUsers.push(created);
      return this.serializeFallbackUser(created);
    }

    const existingRole = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!existingRole) {
      throw new UnauthorizedException('Role not found');
    }
    if (
      existingRole.name === 'SuperAdmin' &&
      !this.isOrganizationManager(viewer)
    ) {
      throw new ForbiddenException('Only superadmin can assign SuperAdmin');
    }

    const created = await this.prisma.user.create({
      data: {
        name,
        email,
        username,
        department,
        status: UserStatus[status] || UserStatus.ACTIVE,
        passwordHash: await bcrypt.hash(password, 10),
        userRoles: {
          create: {
            roleId: existingRole.id,
          },
        },
        ...(workspaceId
          ? {
              workspaceMemberships: {
                create: {
                  workspaceId,
                  roleId: existingRole.id,
                  isActive: true,
                },
              },
            }
          : {}),
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.serializeDatabaseUser(created);
  }

  async update(
    userId: string,
    input: {
      name?: string;
      username?: string;
      department?: string;
      roleId?: string;
      status?: string;
    },
    viewer?: UserViewer,
  ) {
    const normalizedRoleId = input.roleId?.trim();
    const normalizedStatus = input.status?.trim().toUpperCase() as
      | keyof typeof UserStatus
      | undefined;

    if (!process.env.DATABASE_URL) {
      const target = this.fallbackUsers.find((user) => user.id === userId);
      if (!target) {
        throw new NotFoundException('User not found');
      }

      if (input.name !== undefined) {
        target.name = input.name.trim() || target.name;
      }
      if (input.username !== undefined) {
        target.username = input.username.trim() || null;
      }
      if (input.department !== undefined) {
        target.department = input.department.trim() || 'Chưa gán';
      }
      if (
        normalizedStatus &&
        (normalizedStatus === 'ACTIVE' ||
          normalizedStatus === 'AWAY' ||
          normalizedStatus === 'DISABLED')
      ) {
        target.status = normalizedStatus;
      }
      if (normalizedRoleId) {
        const fallbackRole = fallbackRoleCatalog.find(
          (role) => role.id === normalizedRoleId,
        );
        if (!fallbackRole) {
          throw new UnauthorizedException('Role not found');
        }
        if (
          fallbackRole.name === 'SuperAdmin' &&
          !this.isOrganizationManager(viewer)
        ) {
          throw new ForbiddenException('Only superadmin can assign SuperAdmin');
        }
        target.roles = [
          {
            id: fallbackRole.id,
            name: fallbackRole.name,
            permissions: [...fallbackRole.permissions],
          },
        ];
      }

      return this.serializeFallbackUser(target);
    }

    if (normalizedRoleId) {
      const existingRole = await this.prisma.role.findUnique({
        where: { id: normalizedRoleId },
      });
      if (!existingRole) {
        throw new UnauthorizedException('Role not found');
      }
      if (
        existingRole.name === 'SuperAdmin' &&
        !this.isOrganizationManager(viewer)
      ) {
        throw new ForbiddenException('Only superadmin can assign SuperAdmin');
      }
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined
            ? { name: input.name.trim() || existingUser.name }
            : {}),
          ...(input.username !== undefined
            ? { username: input.username.trim() || null }
            : {}),
          ...(input.department !== undefined
            ? { department: input.department.trim() || 'Chưa gán' }
            : {}),
          ...(normalizedStatus && UserStatus[normalizedStatus]
            ? { status: UserStatus[normalizedStatus] }
            : {}),
        },
      });

      if (normalizedRoleId) {
        await transaction.userRole.deleteMany({
          where: { userId },
        });
        await transaction.userRole.create({
          data: {
            userId,
            roleId: normalizedRoleId,
          },
        });
      }
    });

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return this.serializeDatabaseUser(updated);
  }

  async resetPassword(userId: string, nextPassword?: string) {
    const normalizedPassword = nextPassword?.trim();
    const temporaryPassword =
      normalizedPassword || `Temp${randomBytes(4).toString('hex')}!`;

    if (!process.env.DATABASE_URL) {
      const target = this.fallbackUsers.find((user) => user.id === userId);
      if (!target) {
        throw new NotFoundException('User not found');
      }

      target.passwordHash = await bcrypt.hash(temporaryPassword, 10);
      return {
        reset: true,
        userId,
        temporaryPassword,
      };
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
      },
    });

    return {
      reset: true,
      userId,
      temporaryPassword,
    };
  }

  private serializeDatabaseUser(user: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    department: string | null;
    status: string;
    userRoles: Array<{
      role: {
        id: string;
        name: string;
        rolePermissions: Array<{
          permission: {
            code: string;
          };
        }>;
      };
    }>;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      department: user.department || 'Chưa gán',
      status: user.status,
      statusLabel: getStatusLabel(user.status),
      statusTone: getStatusTone(user.status),
      roles: user.userRoles.map((item) => ({
        id: item.role.id,
        name: item.role.name,
        permissions: item.role.rolePermissions.map(
          (permissionItem) => permissionItem.permission.code,
        ),
      })),
      primaryRole: user.userRoles[0]?.role.name || 'Chưa gán',
      permissionCount: [
        ...new Set(
          user.userRoles.flatMap((item) =>
            item.role.rolePermissions.map(
              (permissionItem) => permissionItem.permission.code,
            ),
          ),
        ),
      ].length,
    };
  }

  private serializeFallbackUser(user: FallbackUserRecord) {
    const permissions = [
      ...new Set(user.roles.flatMap((role) => role.permissions)),
    ];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      department: user.department,
      status: user.status,
      statusLabel: getStatusLabel(user.status),
      statusTone: getStatusTone(user.status),
      roles: user.roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: [...role.permissions],
      })),
      primaryRole: user.roles[0]?.name || 'Chưa gán',
      permissionCount: permissions.length,
    };
  }
}
