import { Injectable } from '@nestjs/common';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    if (!process.env.DATABASE_URL) {
      return fallbackSnapshot.roles.map((role) => ({
        id:
          role.title === 'Admin'
            ? 'fallback-role-admin'
            : role.title === 'Moderator'
              ? 'fallback-role-moderator'
              : 'fallback-role-operator',
        name: role.title,
        description: role.detail,
        permissions:
          role.title === 'Admin'
            ? [
                'campaign.manage',
                'moderation.review',
                'settings.manage',
                'autopost.execute',
              ]
            : role.title === 'Moderator'
              ? ['moderation.review']
              : ['campaign.manage', 'autopost.execute'],
      }));
    }

    const roles = await this.prisma.role.findMany({
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
}
