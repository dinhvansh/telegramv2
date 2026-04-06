import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
            name: 'Default Workspace',
            slug: 'default-workspace',
            organizationName: 'Default Organization',
            botCount: 1,
            groupCount: 0,
            campaignCount: 0,
            membershipCount: 0,
          },
        ],
        bots: [
          {
            id: 'fallback-default-bot',
            label: 'Default Telegram Bot',
            username: null,
            workspaceName: 'Default Workspace',
            groupCount: 0,
            campaignCount: 0,
            isVerified: false,
            webhookRegistered: false,
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
        orderBy: { createdAt: 'asc' },
        include: {
          organization: true,
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
        name: workspace.name,
        slug: workspace.slug,
        organizationName: workspace.organization.name,
        botCount: workspace._count.telegramBots,
        groupCount: workspace._count.telegramGroups,
        campaignCount: workspace._count.campaigns,
        membershipCount: workspace._count.memberships,
      })),
      bots: bots.map((bot) => ({
        id: bot.id,
        label: bot.label,
        username: bot.username,
        workspaceName: bot.workspace.name,
        groupCount: bot._count.telegramGroups,
        campaignCount: bot._count.campaigns,
        isVerified: bot.isVerified,
        webhookRegistered: bot.webhookRegistered,
      })),
    };
  }
}
