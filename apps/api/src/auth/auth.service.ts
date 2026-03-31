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
    id: 'fallback-admin',
    email: 'admin@nexus.local',
    password: 'admin123',
    name: 'Nexus Admin',
    roles: ['Admin'],
    permissions: [
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
      });

      return {
        accessToken: token,
        user: {
          id: fallbackUser.id,
          email: fallbackUser.email,
          name: fallbackUser.name,
          roles: [...fallbackUser.roles],
          permissions: [...fallbackUser.permissions],
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

    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      roles,
      permissions,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions: [...new Set(permissions)],
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

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions: [...new Set(permissions)],
    };
  }
}
