import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';

const fallbackPermissionCatalog = [
  {
    code: 'organization.manage',
    description: 'Manage organizations and tenant-level configuration',
  },
  {
    code: 'workspace.manage',
    description: 'Manage workspaces, memberships and bot assignments',
  },
  {
    code: 'campaign.view',
    description: 'View assigned campaigns and member progress',
  },
  {
    code: 'campaign.manage',
    description: 'Manage campaigns and invite links',
  },
  {
    code: 'moderation.review',
    description: 'Review spam and moderation alerts',
  },
  {
    code: 'settings.manage',
    description: 'Manage bot settings and security config',
  },
  {
    code: 'autopost.execute',
    description: 'Manage autopost schedules and logs',
  },
] as const;

type RolesViewer = {
  userId: string;
  permissions: string[];
  workspaceIds?: string[];
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private isOrganizationManager(viewer?: RolesViewer) {
    return Boolean(viewer?.permissions.includes('organization.manage'));
  }

  async findAll(viewer?: RolesViewer) {
    if (!process.env.DATABASE_URL) {
      return fallbackSnapshot.roles
        .filter(
          (role) =>
            this.isOrganizationManager(viewer) || role.title !== 'SuperAdmin',
        )
        .map((role) => ({
          id:
            role.title === 'SuperAdmin'
              ? 'fallback-role-superadmin'
              : role.title === 'Admin'
                ? 'fallback-role-admin'
                : role.title === 'Moderator'
                  ? 'fallback-role-moderator'
                  : role.title === 'Viewer'
                    ? 'fallback-role-viewer'
                    : 'fallback-role-operator',
          name: role.title,
          description: role.detail,
          permissions:
            role.title === 'SuperAdmin'
              ? [
                  ...fallbackPermissionCatalog.map(
                    (permission) => permission.code,
                  ),
                ]
              : role.title === 'Admin'
                ? [
                    ...fallbackPermissionCatalog
                      .map((permission) => permission.code)
                      .filter((code) => code !== 'organization.manage'),
                  ]
                : role.title === 'Moderator'
                  ? ['moderation.review']
                  : role.title === 'Viewer'
                    ? ['campaign.view']
                    : ['campaign.manage', 'autopost.execute'],
        }));
    }

    const roles = await this.prisma.role.findMany({
      where: this.isOrganizationManager(viewer)
        ? undefined
        : {
            name: {
              not: 'SuperAdmin',
            },
          },
      orderBy: { createdAt: 'asc' },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.rolePermissions.map((item) => item.permission.code),
    }));
  }

  async findPermissionCatalog(viewer?: RolesViewer) {
    if (!process.env.DATABASE_URL) {
      return fallbackPermissionCatalog
        .filter(
          (permission) =>
            this.isOrganizationManager(viewer) ||
            permission.code !== 'organization.manage',
        )
        .map((permission) => ({
          code: permission.code,
          description: permission.description,
        }));
    }

    const permissions = await this.prisma.permission.findMany({
      where: this.isOrganizationManager(viewer)
        ? undefined
        : {
            code: {
              not: 'organization.manage',
            },
          },
      orderBy: { code: 'asc' },
    });

    return permissions.map((permission) => ({
      code: permission.code,
      description: permission.description,
    }));
  }

  async updateRolePermissions(
    roleId: string,
    input: {
      description?: string;
      permissions: string[];
    },
    viewer?: RolesViewer,
  ) {
    const permissionCodes = [
      ...new Set(input.permissions.map((code) => code.trim()).filter(Boolean)),
    ];

    if (!process.env.DATABASE_URL) {
      throw new UnauthorizedException(
        'Role permission editing requires database mode',
      );
    }

    const existingRole = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });

    if (!existingRole) {
      throw new NotFoundException('Role not found');
    }
    if (
      existingRole.name === 'SuperAdmin' &&
      !this.isOrganizationManager(viewer)
    ) {
      throw new ForbiddenException('Only superadmin can edit SuperAdmin role');
    }
    if (
      !this.isOrganizationManager(viewer) &&
      permissionCodes.includes('organization.manage')
    ) {
      throw new ForbiddenException(
        'Only superadmin can assign organization.manage',
      );
    }

    const permissions = await this.prisma.permission.findMany({
      where: {
        code: {
          in: permissionCodes,
        },
      },
    });

    if (permissions.length !== permissionCodes.length) {
      throw new UnauthorizedException(
        'Permission catalog contains unknown code',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      if (input.description !== undefined) {
        await transaction.role.update({
          where: { id: roleId },
          data: {
            description: input.description.trim(),
          },
        });
      }

      await transaction.rolePermission.deleteMany({
        where: { roleId },
      });

      if (permissions.length > 0) {
        await transaction.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId,
            permissionId: permission.id,
          })),
        });
      }
    });

    const updatedRole = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!updatedRole) {
      throw new NotFoundException('Role not found');
    }

    return {
      id: updatedRole.id,
      name: updatedRole.name,
      description: updatedRole.description,
      permissions: updatedRole.rolePermissions.map(
        (item) => item.permission.code,
      ),
    };
  }
}
