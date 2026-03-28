import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';
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

const fallbackRoleCatalog = [
  {
    id: 'fallback-role-admin',
    name: 'Admin',
    permissions: [
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
      id: 'fallback-user-admin',
      email: 'admin@nexus.local',
      username: 'nexus_admin',
      name: 'Nexus Admin',
      department: 'Hạ tầng',
      status: 'ACTIVE',
      passwordHash: bcrypt.hashSync('admin123', 10),
      roles: [
        {
          id: fallbackRoleCatalog[0].id,
          name: fallbackRoleCatalog[0].name,
          permissions: [...fallbackRoleCatalog[0].permissions],
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
          id: fallbackRoleCatalog[2].id,
          name: fallbackRoleCatalog[2].name,
          permissions: [...fallbackRoleCatalog[2].permissions],
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
          id: fallbackRoleCatalog[1].id,
          name: fallbackRoleCatalog[1].name,
          permissions: [...fallbackRoleCatalog[1].permissions],
        },
      ],
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    if (!process.env.DATABASE_URL) {
      return this.fallbackUsers.map((user) => this.serializeFallbackUser(user));
    }

    const users = await this.prisma.user.findMany({
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

    return users.map((user) => ({
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
    }));
  }

  async create(input: {
    name: string;
    email: string;
    password: string;
    roleId: string;
    department?: string;
    username?: string;
    status?: string;
  }) {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const roleId = input.roleId?.trim();
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

    return {
      id: created.id,
      name: created.name,
      email: created.email,
      username: created.username,
      department: created.department || 'Chưa gán',
      status: created.status,
      statusLabel: getStatusLabel(created.status),
      statusTone: getStatusTone(created.status),
      roles: created.userRoles.map((item) => ({
        id: item.role.id,
        name: item.role.name,
        permissions: item.role.rolePermissions.map(
          (permissionItem) => permissionItem.permission.code,
        ),
      })),
      primaryRole: created.userRoles[0]?.role.name || 'Chưa gán',
      permissionCount: [
        ...new Set(
          created.userRoles.flatMap((item) =>
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
