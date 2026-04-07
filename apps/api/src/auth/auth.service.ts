import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';

type LoginInput = {
  email: string;
  password: string;
};

const fallbackUsers = [
  {
    id: 'fallback-superadmin',
    email: 'superadmin@nexus.local',
    password: 'superadmin123',
    name: 'System Super Admin',
    roles: ['SuperAdmin'],
    permissions: [
      'campaign.view',
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
      'workspace.manage',
      'organization.manage',
    ],
  },
  {
    id: 'fallback-viewer',
    email: 'viewer@nexus.local',
    password: 'viewer123',
    name: 'Campaign Viewer',
    roles: ['Viewer'],
    permissions: ['campaign.view'],
  },
  {
    id: 'fallback-admin',
    email: 'admin@nexus.local',
    password: 'admin123',
    name: 'Nexus Admin',
    roles: ['Admin'],
    permissions: [
      'workspace.manage',
      'campaign.manage',
      'moderation.review',
      'settings.manage',
      'autopost.execute',
    ],
  },
  {
    id: 'fallback-operator',
    email: 'operator@nexus.local',
    password: 'operator123',
    name: 'Campaign Operator',
    roles: ['Operator'],
    permissions: ['campaign.manage', 'autopost.execute'],
  },
] as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginInput) {
    if (!process.env.DATABASE_URL) {
      const fallbackUser = fallbackUsers.find(
        (user) =>
          user.email === input.email && user.password === input.password,
      );

      if (!fallbackUser) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const token = await this.jwtService.signAsync({
        sub: fallbackUser.id,
        email: fallbackUser.email,
        roles: fallbackUser.roles,
        permissions: fallbackUser.permissions,
        workspaceIds: ['fallback-default-workspace'],
        organizationIds: ['fallback-default-organization'],
      });

      return {
        accessToken: token,
        user: {
          id: fallbackUser.id,
          email: fallbackUser.email,
          name: fallbackUser.name,
          roles: [...fallbackUser.roles],
          permissions: [...fallbackUser.permissions],
          defaultWorkspaceId: 'fallback-default-workspace',
          defaultOrganizationId: 'fallback-default-organization',
          workspaces: [
            {
              id: 'fallback-default-workspace',
              name: 'Default Workspace',
              slug: 'default-workspace',
              organizationId: 'fallback-default-organization',
              organizationName: 'Default Organization',
              roles: [...fallbackUser.roles],
            },
          ],
        },
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        passwordHash: true,
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
            workspace: {
              include: {
                organization: true,
              },
            },
            role: true,
          },
          orderBy: {
            assignedAt: 'asc',
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException('User is disabled');
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const roles = user.userRoles.map((item) => item.role.name);
    const permissions = user.userRoles.flatMap((item) =>
      item.role.rolePermissions.map(
        (permissionItem) => permissionItem.permission.code,
      ),
    );
    const uniquePermissions = [...new Set(permissions)];
    const scopedMemberships = uniquePermissions.includes('organization.manage')
      ? user.workspaceMemberships
      : user.workspaceMemberships.slice(0, 1);
    const workspaceIds = [
      ...new Set(scopedMemberships.map((membership) => membership.workspaceId)),
    ];
    const organizationIds = [
      ...new Set(
        scopedMemberships.map(
          (membership) => membership.workspace.organizationId,
        ),
      ),
    ];
    const workspaces = scopedMemberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      organizationId: membership.workspace.organizationId,
      organizationName: membership.workspace.organization.name,
      roles: [membership.role.name],
    }));

    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      roles,
      permissions: uniquePermissions,
      workspaceIds,
      organizationIds,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions: uniquePermissions,
        defaultWorkspaceId: workspaceIds[0] ?? null,
        defaultOrganizationId: organizationIds[0] ?? null,
        workspaces,
      },
    };
  }

  async getProfile(userId: string) {
    if (!process.env.DATABASE_URL) {
      const fallbackUser =
        fallbackUsers.find((user) => user.id === userId) ?? fallbackUsers[0];

      return {
        id: fallbackUser.id,
        email: fallbackUser.email,
        name: fallbackUser.name,
        roles: [...fallbackUser.roles],
        permissions: [...fallbackUser.permissions],
        defaultWorkspaceId: 'fallback-default-workspace',
        defaultOrganizationId: 'fallback-default-organization',
        workspaces: [
          {
            id: 'fallback-default-workspace',
            name: 'Default Workspace',
            slug: 'default-workspace',
            organizationId: 'fallback-default-organization',
            organizationName: 'Default Organization',
            roles: [...fallbackUser.roles],
          },
        ],
        settings: fallbackSnapshot.settings,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
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
            workspace: {
              include: {
                organization: true,
              },
            },
            role: true,
          },
          orderBy: {
            assignedAt: 'asc',
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException('User is disabled');
    }

    const roles = user.userRoles.map((item) => item.role.name);
    const permissions = user.userRoles.flatMap((item) =>
      item.role.rolePermissions.map(
        (permissionItem) => permissionItem.permission.code,
      ),
    );
    const uniquePermissions = [...new Set(permissions)];
    const scopedMemberships = uniquePermissions.includes('organization.manage')
      ? user.workspaceMemberships
      : user.workspaceMemberships.slice(0, 1);
    const workspaceIds = [
      ...new Set(scopedMemberships.map((membership) => membership.workspaceId)),
    ];
    const organizationIds = [
      ...new Set(
        scopedMemberships.map(
          (membership) => membership.workspace.organizationId,
        ),
      ),
    ];
    const workspaces = scopedMemberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      organizationId: membership.workspace.organizationId,
      organizationName: membership.workspace.organization.name,
      roles: [membership.role.name],
    }));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions: uniquePermissions,
      defaultWorkspaceId: workspaceIds[0] ?? null,
      defaultOrganizationId: organizationIds[0] ?? null,
      workspaces,
    };
  }
}
