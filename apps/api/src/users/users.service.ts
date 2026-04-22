import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeVietnameseText } from '../common/vietnamese-normalizer';

type FallbackUserRecord = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  department: string;
  status: 'ACTIVE' | 'AWAY' | 'DISABLED';
  passwordHash: string;
  workspaces?: Array<{ id: string; name: string; roleName: string }>;
  roles: Array<{ id: string; name: string; permissions: string[] }>;
};

type UserViewer = {
  userId: string;
  permissions: string[];
  workspaceIds?: string[];
  workspaceId?: string;
};

const fallbackRoleCatalog = [
  {
    id: 'fallback-role-superadmin',
    name: 'Quản trị hệ thống',
    permissions: [
      'organization.manage',
      'workspace.manage',
      'campaign.view',
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
      'contacts.manage',
    ],
  },
  {
    id: 'fallback-role-viewer',
    name: 'Cộng tác viên',
    permissions: ['campaign.view'],
  },
  {
    id: 'fallback-role-admin',
    name: 'Quản trị workspace',
    permissions: [
      'workspace.manage',
      'campaign.view',
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
      'contacts.manage',
    ],
  },
  {
    id: 'fallback-role-moderator',
    name: 'Kiểm duyệt viên',
    permissions: ['moderation.review'],
  },
  {
    id: 'fallback-role-operator',
    name: 'Vận hành',
    permissions: [
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
      'contacts.manage',
    ],
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
      name: 'Quản trị hệ thống',
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
      workspaces: [
        {
          id: 'fallback-default-workspace',
          name: 'Default Workspace',
          roleName: fallbackRoleCatalog[0].name,
        },
      ],
    },
    {
      id: 'fallback-user-admin',
      email: 'admin@nexus.local',
      username: 'nexus_admin',
      name: 'Quản trị workspace',
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
      workspaces: [
        {
          id: 'fallback-default-workspace',
          name: 'Default Workspace',
          roleName: fallbackRoleCatalog[2].name,
        },
      ],
    },
    {
      id: 'fallback-user-operator',
      email: 'operator@nexus.local',
      username: 'campaign_operator',
      name: 'Vận hành',
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
      workspaces: [
        {
          id: 'fallback-default-workspace',
          name: 'Default Workspace',
          roleName: fallbackRoleCatalog[4].name,
        },
      ],
    },
    {
      id: 'fallback-user-viewer',
      email: 'viewer@nexus.local',
      username: 'campaign_viewer',
      name: 'Cộng tác viên',
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
      workspaces: [
        {
          id: 'fallback-default-workspace',
          name: 'Default Workspace',
          roleName: fallbackRoleCatalog[1].name,
        },
      ],
    },
    {
      id: 'fallback-user-moderator',
      email: 'moderator@nexus.local',
      username: 'mod_guard',
      name: 'Kiểm duyệt viên',
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
      workspaces: [
        {
          id: 'fallback-default-workspace',
          name: 'Default Workspace',
          roleName: fallbackRoleCatalog[3].name,
        },
      ],
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  private isOrganizationManager(viewer?: UserViewer) {
    return Boolean(viewer?.permissions.includes('organization.manage'));
  }

  private resolveWorkspaceScope(viewer?: UserViewer) {
    const requestedWorkspaceId = viewer?.workspaceId?.trim();

    if (this.isOrganizationManager(viewer)) {
      return requestedWorkspaceId || undefined;
    }

    const allowedWorkspaceIds = viewer?.workspaceIds ?? [];

    if (requestedWorkspaceId) {
      if (allowedWorkspaceIds.includes(requestedWorkspaceId)) {
        return requestedWorkspaceId;
      }

      throw new ForbiddenException('Workspace is outside your scope');
    }

    const defaultWorkspaceId = allowedWorkspaceIds[0];

    if (!defaultWorkspaceId) {
      throw new ForbiddenException('Workspace access is required');
    }

    return defaultWorkspaceId;
  }

  private buildWorkspaceMembershipWhere(viewer?: UserViewer) {
    const workspaceId = this.resolveWorkspaceScope(viewer);

    return {
      isActive: true,
      ...(workspaceId ? { workspaceId } : {}),
    };
  }

  private assertWorkspaceInScope(
    workspaceId: string | undefined,
    viewer?: UserViewer,
  ) {
    const normalizedWorkspaceId = workspaceId?.trim();

    if (!normalizedWorkspaceId) {
      if (this.isOrganizationManager(viewer)) {
        return undefined;
      }

      throw new ForbiddenException('Workspace access is required');
    }

    if (!this.isOrganizationManager(viewer)) {
      this.resolveWorkspaceScope({
        userId: viewer?.userId ?? '',
        permissions: viewer?.permissions ?? [],
        workspaceIds: viewer?.workspaceIds ?? [],
        workspaceId: normalizedWorkspaceId,
      });
    }

    return normalizedWorkspaceId;
  }

  private async assertUserInScope(userId: string, viewer?: UserViewer) {
    if (this.isOrganizationManager(viewer) && !viewer?.workspaceId?.trim()) {
      return;
    }

    const workspaceId = this.resolveWorkspaceScope(viewer);

    const membership = await this.prisma.workspaceMembership.findFirst({
      where: {
        userId,
        workspaceId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('User is outside your workspace scope');
    }
  }

  private isSystemSuperadminRole(roleName: string) {
    const normalizedRoleName = normalizeVietnameseText(roleName)
      .trim()
      .toLowerCase();

    return (
      normalizedRoleName === 'superadmin' ||
      normalizedRoleName === 'quản trị hệ thống'
    );
  }

  private rethrowKnownPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const targets = Array.isArray(error.meta?.target)
          ? error.meta.target.map(String)
          : [];

        if (targets.includes('email')) {
          throw new ConflictException('Email already exists');
        }

        if (targets.includes('username')) {
          throw new ConflictException('Username already exists');
        }

        throw new ConflictException('User data already exists');
      }
    }

    throw error;
  }

  private normalizeOptionalString(value: unknown, fieldName: string) {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }

    return value.trim();
  }

  async findAll(viewer?: UserViewer) {
    if (!process.env.DATABASE_URL) {
      return this.fallbackUsers
        .filter(
          (user) =>
            this.isOrganizationManager(viewer) ||
            !user.roles.some(
              (role) =>
                role.name === 'SuperAdmin' || role.name === 'Quản trị hệ thống',
            ),
        )
        .map((user) =>
          this.normalizeUserRecord(this.serializeFallbackUser(user)),
        );
    }

    const membershipWhere = this.buildWorkspaceMembershipWhere(viewer);

    const users = await this.prisma.user.findMany({
      where: this.isOrganizationManager(viewer)
        ? membershipWhere.workspaceId
          ? {
              workspaceMemberships: {
                some: membershipWhere,
              },
            }
          : undefined
        : {
            workspaceMemberships: {
              some: membershipWhere,
            },
            userRoles: {
              none: {
                role: {
                  name: {
                    in: ['SuperAdmin', 'Quản trị hệ thống'],
                  },
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
        workspaceMemberships: {
          where: membershipWhere,
          include: {
            workspace: true,
            role: true,
          },
          orderBy: {
            assignedAt: 'asc',
          },
        },
      },
    });

    return users.map((user) =>
      this.normalizeUserRecord(this.serializeDatabaseUser(user)),
    );
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
    const name = this.normalizeOptionalString(input.name, 'name');
    const email =
      this.normalizeOptionalString(input.email, 'email')?.toLowerCase();
    const password =
      typeof input.password === 'string' ? input.password : input.password ?? '';
    const roleId = this.normalizeOptionalString(input.roleId, 'roleId');
    const workspaceId = await this.assertWorkspaceInScope(
      this.normalizeOptionalString(input.workspaceId, 'workspaceId'),
      viewer,
    );
    const department =
      this.normalizeOptionalString(input.department, 'department') ||
      'Chưa gán';
    const username =
      this.normalizeOptionalString(input.username, 'username') ||
      email?.split('@')[0] ||
      null;
    const normalizedDepartment = normalizeVietnameseText(department);
    const status = (
      this.normalizeOptionalString(input.status, 'status')?.toUpperCase() ||
      'ACTIVE'
    ) as keyof typeof UserStatus;

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
        fallbackRole.name === 'Quản trị hệ thống' &&
        !this.isOrganizationManager(viewer)
      ) {
        throw new ForbiddenException(
          'Only superadmin can assign Quản trị hệ thống',
        );
      }

      const created: FallbackUserRecord = {
        id: `fallback-user-${this.fallbackUsers.length + 1}`,
        name,
        email,
        username,
        department: normalizedDepartment,
        status: status === 'AWAY' || status === 'DISABLED' ? status : 'ACTIVE',
        passwordHash: await bcrypt.hash(password, 10),
        roles: [
          {
            id: fallbackRole.id,
            name: fallbackRole.name,
            permissions: [...fallbackRole.permissions],
          },
        ],
        workspaces: workspaceId
          ? [
              {
                id: workspaceId,
                name: 'Workspace đã chọn',
                roleName: fallbackRole.name,
              },
            ]
          : [],
      };
      this.fallbackUsers.push(created);
      return this.normalizeUserRecord(this.serializeFallbackUser(created));
    }

    const existingRole = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!existingRole) {
      throw new UnauthorizedException('Role not found');
    }
    if (
      (existingRole.name === 'SuperAdmin' ||
        existingRole.name === 'Quản trị hệ thống') &&
      !this.isOrganizationManager(viewer)
    ) {
      throw new ForbiddenException(
        'Only superadmin can assign Quản trị hệ thống',
      );
    }

    let created;

    try {
      created = await this.prisma.user.create({
        data: {
          name,
          email,
          username,
          department: normalizedDepartment,
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
          workspaceMemberships: {
            where: this.buildWorkspaceMembershipWhere(viewer),
            include: {
              workspace: true,
              role: true,
            },
            orderBy: {
              assignedAt: 'asc',
            },
          },
        },
      });
    } catch (error) {
      this.rethrowKnownPrismaError(error);
    }

    return this.normalizeUserRecord(this.serializeDatabaseUser(created));
  }

  async update(
    userId: string,
    input: {
      name?: string;
      username?: string;
      department?: string;
      roleId?: string;
      workspaceId?: string;
      status?: string;
    },
    viewer?: UserViewer,
  ) {
    const normalizedRoleId = this.normalizeOptionalString(input.roleId, 'roleId');
    const requestedWorkspaceId = this.normalizeOptionalString(
      input.workspaceId,
      'workspaceId',
    );
    const normalizedWorkspaceId = requestedWorkspaceId
      ? await this.assertWorkspaceInScope(requestedWorkspaceId, viewer)
      : undefined;
    const normalizedStatus = this.normalizeOptionalString(
      input.status,
      'status',
    )?.toUpperCase() as keyof typeof UserStatus | undefined;

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
          fallbackRole.name === 'Quản trị hệ thống' &&
          !this.isOrganizationManager(viewer)
        ) {
          throw new ForbiddenException(
            'Only superadmin can assign Quản trị hệ thống',
          );
        }
        target.roles = [
          {
            id: fallbackRole.id,
            name: fallbackRole.name,
            permissions: [...fallbackRole.permissions],
          },
        ];

        if (target.workspaces?.length) {
          target.workspaces = target.workspaces.map((workspace) => ({
            ...workspace,
            roleName: fallbackRole.name,
          }));
        }
      }

      if (normalizedWorkspaceId) {
        const activeRole = target.roles[0] ?? fallbackRoleCatalog[2];
        target.workspaces = [
          {
            id: normalizedWorkspaceId,
            name: 'Workspace đã chọn',
            roleName: activeRole.name,
          },
        ];
      }

      return this.normalizeUserRecord(this.serializeFallbackUser(target));
    }

    await this.assertUserInScope(userId, viewer);

    if (normalizedWorkspaceId) {
      const existingWorkspace = await this.prisma.workspace.findUnique({
        where: { id: normalizedWorkspaceId },
        select: { id: true },
      });

      if (!existingWorkspace) {
        throw new NotFoundException('Workspace not found');
      }
    }

    if (normalizedRoleId) {
      const existingRole = await this.prisma.role.findUnique({
        where: { id: normalizedRoleId },
      });
      if (!existingRole) {
        throw new UnauthorizedException('Role not found');
      }
      if (
        (existingRole.name === 'SuperAdmin' ||
          existingRole.name === 'Quản trị hệ thống') &&
        !this.isOrganizationManager(viewer)
      ) {
        throw new ForbiddenException(
          'Only superadmin can assign Quản trị hệ thống',
        );
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

      if (normalizedWorkspaceId || normalizedRoleId) {
        const activeMemberships = await transaction.workspaceMembership.findMany({
          where: {
            userId,
            isActive: true,
          },
          orderBy: {
            assignedAt: 'asc',
          },
        });

        const targetWorkspaceId =
          normalizedWorkspaceId ?? activeMemberships[0]?.workspaceId;
        const targetRoleId = normalizedRoleId ?? activeMemberships[0]?.roleId;

        if (targetWorkspaceId && targetRoleId) {
          await transaction.workspaceMembership.updateMany({
            where: {
              userId,
              isActive: true,
            },
            data: {
              isActive: false,
            },
          });

          await transaction.workspaceMembership.upsert({
            where: {
              userId_workspaceId_roleId: {
                userId,
                workspaceId: targetWorkspaceId,
                roleId: targetRoleId,
              },
            },
            update: {
              isActive: true,
            },
            create: {
              userId,
              workspaceId: targetWorkspaceId,
              roleId: targetRoleId,
              isActive: true,
            },
          });
        }
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
        workspaceMemberships: {
          where: {
            isActive: true,
          },
          include: {
            workspace: true,
            role: true,
          },
          orderBy: {
            assignedAt: 'asc',
          },
        },
      },
    });

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return this.normalizeUserRecord(this.serializeDatabaseUser(updated));
  }

  async delete(userId: string, viewer?: UserViewer) {
    if (viewer?.userId === userId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    if (!process.env.DATABASE_URL) {
      const targetIndex = this.fallbackUsers.findIndex(
        (user) => user.id === userId,
      );
      if (targetIndex === -1) {
        throw new NotFoundException('User not found');
      }

      const target = this.fallbackUsers[targetIndex];
      const targetIsOrganizationManager = target.roles.some(
        (role) =>
          role.permissions.includes('organization.manage') ||
          this.isSystemSuperadminRole(role.name),
      );

      if (targetIsOrganizationManager && !this.isOrganizationManager(viewer)) {
        throw new ForbiddenException(
          'Only superadmin can delete Quản trị hệ thống',
        );
      }

      this.fallbackUsers.splice(targetIndex, 1);

      return {
        deleted: true,
        userId,
      };
    }

    await this.assertUserInScope(userId, viewer);

    const existingUser = await this.prisma.user.findUnique({
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

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const targetIsOrganizationManager = existingUser.userRoles.some(
      ({ role }) =>
        role.rolePermissions.some(
          ({ permission }) => permission.code === 'organization.manage',
        ) || this.isSystemSuperadminRole(role.name),
    );

    if (targetIsOrganizationManager && !this.isOrganizationManager(viewer)) {
      throw new ForbiddenException(
        'Only superadmin can delete Quản trị hệ thống',
      );
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      deleted: true,
      userId,
    };
  }

  async resetPassword(
    userId: string,
    nextPassword?: string,
    viewer?: UserViewer,
  ) {
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

    await this.assertUserInScope(userId, viewer);

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
    workspaceMemberships?: Array<{
      workspaceId: string;
      workspace: {
        id: string;
        name: string;
      };
      role: {
        id: string;
        name: string;
      };
    }>;
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
    const roleMap = new Map<
      string,
      { id: string; name: string; permissions: string[] }
    >();

    for (const item of user.userRoles) {
      const normalizedRoleName = normalizeVietnameseText(item.role.name);
      const permissionCodes = [
        ...new Set(
          item.role.rolePermissions.map(
            (permissionItem) => permissionItem.permission.code,
          ),
        ),
      ];
      const existingRole = roleMap.get(normalizedRoleName);

      if (!existingRole) {
        roleMap.set(normalizedRoleName, {
          id: item.role.id,
          name: normalizedRoleName,
          permissions: permissionCodes,
        });
        continue;
      }

      existingRole.permissions = [
        ...new Set([...existingRole.permissions, ...permissionCodes]),
      ];
    }

    const workspaceMap = new Map<
      string,
      { id: string; name: string; roleName: string }
    >();

    for (const membership of user.workspaceMemberships ?? []) {
      const normalizedRoleName = normalizeVietnameseText(membership.role.name);
      const key = `${membership.workspace.id}:${normalizedRoleName}`;

      if (!workspaceMap.has(key)) {
        workspaceMap.set(key, {
          id: membership.workspace.id,
          name: membership.workspace.name,
          roleName: normalizedRoleName,
        });
      }
    }

    const roles = [...roleMap.values()];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      department: user.department || 'Chưa gán',
      status: user.status,
      statusLabel: getStatusLabel(user.status),
      statusTone: getStatusTone(user.status),
      roles,
      primaryRole: user.userRoles[0]?.role.name || 'Chưa gán',
      workspaces: (user.workspaceMemberships ?? []).map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        roleName: membership.role.name,
      })),
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
      workspaces: (user.workspaces ?? []).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        roleName: workspace.roleName,
      })),
      permissionCount: permissions.length,
    };
  }

  private normalizeUserRecord<
    T extends {
      name: string;
      department: string | null;
      statusLabel: string;
      primaryRole: string;
      roles: Array<{ id: string; name: string; permissions: string[] }>;
      workspaces?: Array<{ id: string; name: string; roleName: string }>;
    },
  >(user: T): T {
    const normalizedRoles = [
      ...new Map(
        user.roles.map((role) => {
          const normalizedName = normalizeVietnameseText(role.name);
          return [
            normalizedName,
            {
              ...role,
              name: normalizedName,
              permissions: [...new Set(role.permissions)],
            },
          ];
        }),
      ).values(),
    ];

    const normalizedWorkspaces = [
      ...new Map(
        (user.workspaces ?? []).map((workspace) => {
          const normalizedRoleName = normalizeVietnameseText(
            workspace.roleName,
          );
          return [
            `${workspace.id}:${normalizedRoleName}`,
            {
              ...workspace,
              name: normalizeVietnameseText(workspace.name),
              roleName: normalizedRoleName,
            },
          ];
        }),
      ).values(),
    ];

    return {
      ...user,
      name: normalizeVietnameseText(user.name),
      department: normalizeVietnameseText(user.department),
      statusLabel: normalizeVietnameseText(user.statusLabel),
      primaryRole:
        normalizedRoles[0]?.name ?? normalizeVietnameseText(user.primaryRole),
      roles: normalizedRoles,
      workspaces: normalizedWorkspaces,
    };
  }
}
