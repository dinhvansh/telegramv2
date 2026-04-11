import { Injectable } from '@nestjs/common';
import {
  AutopostScheduleStatus,
  AutopostTargetPlatform,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { MatchAiService } from './match-ai.service';

export type MatchScheduleInput = {
  match_id: string;
  home_team: string;
  away_team: string;
  start_date: string;
  start_time: string;
  slug: string;
  league_name: string;
  commentator_name: string;
  home_logo?: string;
  away_logo?: string;
};

export type MatchWebhookPayload = {
  success: boolean;
  from_date?: string;
  to_date?: string;
  count?: number;
  data: MatchScheduleInput[];
};

type ActiveTelegramGroup = {
  id: string;
  title: string;
  externalId: string;
};

@Injectable()
export class MatchWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogsService: SystemLogsService,
    private readonly matchAiService: MatchAiService,
  ) {}

  private buildMessage(match: MatchScheduleInput): string {
    const dateTime = `${match.start_date} ${match.start_time}`;
    const lines = [
      `*${match.home_team}* vs *${match.away_team}*`,
      '',
      `Giai dau: ${match.league_name}`,
      `Thoi gian: ${dateTime}`,
      match.commentator_name ? `BLV: ${match.commentator_name}` : '',
      '',
      `Xem ngay: https://ngoaihang.live/${match.slug}`,
    ].filter(Boolean);

    return lines.join('\n');
  }

  private buildMediaUrl(match: MatchScheduleInput): string | null {
    return match.away_logo || match.home_logo || null;
  }

  private async getActiveTelegramGroups(
    workspaceId?: string,
  ): Promise<ActiveTelegramGroup[]> {
    const select = {
      id: true,
      title: true,
      externalId: true,
    } as const;

    if (!workspaceId) {
      return this.prisma.telegramGroup.findMany({
        where: {
          isActive: true,
        },
        select,
        orderBy: { title: 'asc' },
      });
    }

    const scopedGroups = await this.prisma.telegramGroup.findMany({
      where: {
        isActive: true,
        workspaceId,
      },
      select,
      orderBy: { title: 'asc' },
    });

    if (scopedGroups.length > 0) {
      return scopedGroups;
    }

    // Backward-compatible fallback for legacy groups created before workspace
    // ownership was enforced.
    return this.prisma.telegramGroup.findMany({
      where: {
        isActive: true,
        OR: [{ workspaceId: null }, { workspaceId: '' }],
      },
      select,
      orderBy: { title: 'asc' },
    });
  }

  async createMatchSchedules(
    payload: MatchWebhookPayload,
    workspaceId?: string,
    useAi?: boolean,
  ): Promise<{
    total: number;
    created: number;
    skipped: number;
    errors: string[];
    aiUsed: boolean;
  }> {
    const matches = payload.data || [];
    const groups = await this.getActiveTelegramGroups(workspaceId);

    if (matches.length === 0) {
      return {
        total: 0,
        created: 0,
        skipped: 0,
        errors: ['No matches provided'],
        aiUsed: false,
      };
    }

    if (groups.length === 0) {
      return {
        total: matches.length,
        created: 0,
        skipped: 0,
        errors: ['No active telegram groups found'],
        aiUsed: false,
      };
    }

    const results = {
      total: matches.length,
      created: 0,
      skipped: 0,
      errors: [] as string[],
      aiUsed: false,
    };

    for (const match of matches) {
      try {
        const dateStr = match.start_date;
        const timeStr = match.start_time;
        const scheduledFor = new Date(`${dateStr}T${timeStr}Z`);
        if (Number.isNaN(scheduledFor.getTime())) {
          throw new Error(`Invalid date: ${dateStr}T${timeStr}Z`);
        }

        // Schedule the post 30 minutes before kickoff.
        scheduledFor.setMinutes(scheduledFor.getMinutes() - 30);

        const existing = await this.prisma.autopostSchedule.findFirst({
          where: {
            title: { contains: match.match_id },
            target: {
              externalId: { in: groups.map((group) => group.externalId) },
            },
          },
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        let message: string;
        if (useAi) {
          const aiResult = await this.matchAiService.enhanceMatchPost({
            home_team: match.home_team,
            away_team: match.away_team,
            league_name: match.league_name,
            start_date: match.start_date,
            start_time: match.start_time,
            commentator_name: match.commentator_name,
            home_logo: match.home_logo,
            away_logo: match.away_logo,
          });

          if (aiResult.success && aiResult.content) {
            message = aiResult.content;
            results.aiUsed = true;
          } else {
            message = this.buildMessage(match);
          }
        } else {
          message = this.buildMessage(match);
        }

        const mediaUrl = this.buildMediaUrl(match);

        for (const group of groups) {
          const target = await this.prisma.autopostTarget.upsert({
            where: {
              platform_externalId: {
                platform: AutopostTargetPlatform.TELEGRAM,
                externalId: group.externalId,
              },
            },
            update: {
              displayName: group.title,
              status: 'CONNECTED',
            },
            create: {
              platform: AutopostTargetPlatform.TELEGRAM,
              externalId: group.externalId,
              displayName: group.title,
              status: 'CONNECTED',
            },
          });

          await this.prisma.autopostSchedule.create({
            data: {
              title: `[${match.match_id}] ${match.home_team} vs ${match.away_team}`,
              message,
              mediaUrl,
              frequency: 'SCHEDULED',
              scheduledFor,
              status: AutopostScheduleStatus.SCHEDULED,
              targetId: target.id,
            },
          });

          results.created++;
        }

        await this.systemLogsService.log({
          scope: 'match-webhook',
          action: 'schedule_created',
          message: `Match scheduled: ${match.home_team} vs ${match.away_team}`,
          payload: {
            match_id: match.match_id,
            league: match.league_name,
            scheduled_for: scheduledFor.toISOString(),
            group_count: groups.length,
          },
        });
      } catch (error) {
        results.errors.push(`${match.match_id}: ${(error as Error).message}`);
      }
    }

    if (workspaceId && groups.length > 0) {
      await this.systemLogsService.log({
        scope: 'match-webhook',
        action: 'workspace_group_resolution',
        message: `Resolved ${groups.length} active Telegram group(s) for workspace webhook import.`,
        payload: {
          workspaceId,
          groupIds: groups.map((group) => group.id),
        },
      });
    }

    return results;
  }
}
