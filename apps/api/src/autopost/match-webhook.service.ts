import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutopostScheduleStatus,
  AutopostTargetPlatform,
} from '@prisma/client';
import { SystemLogsService } from '../system-logs/system-logs.service';

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

@Injectable()
export class MatchWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private buildMessage(match: MatchScheduleInput): string {
    const dateTime = `${match.start_date} ${match.start_time}`;
    const lines = [
      `⚽ *${match.home_team}* vs *${match.away_team}*`,
      ``,
      `🏆 ${match.league_name}`,
      `📅 ${dateTime}`,
      match.commentator_name ? `🎙️ BLV: ${match.commentator_name}` : ``,
      ``,
      `👉 Xem ngay: https://ngoaihang.live/${match.slug}`,
    ].filter((l) => l !== ``);

    return lines.join('\n');
  }

  private buildMediaUrl(match: MatchScheduleInput): string | null {
    // Prefer away_team logo, fallback to home_team logo
    return match.away_logo || match.home_logo || null;
  }

  private async getTelegramGroupIds(workspaceId?: string): Promise<string[]> {
    const groups = await this.prisma.telegramGroup.findMany({
      where: {
        isActive: true,
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }

  async createMatchSchedules(payload: MatchWebhookPayload, workspaceId?: string): Promise<{
    total: number;
    created: number;
    skipped: number;
    errors: string[];
  }> {
    const matches = payload.data || [];
    const groupIds = await this.getTelegramGroupIds(workspaceId);

    if (matches.length === 0) {
      return { total: 0, created: 0, skipped: 0, errors: ['No matches provided'] };
    }

    if (groupIds.length === 0) {
      return { total: matches.length, created: 0, skipped: 0, errors: ['No active telegram groups found'] };
    }

    const results = {
      total: matches.length,
      created: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const match of matches) {
      try {
        // Parse scheduled time — assume Vietnam timezone (UTC+7)
        const dateStr = match.start_date; // e.g. "2026-03-30"
        const timeStr = match.start_time; // e.g. "19:00:00"
        const scheduledFor = new Date(`${dateStr}T${timeStr}:00.000Z`);
        // Subtract 30 minutes for advance posting
        scheduledFor.setMinutes(scheduledFor.getMinutes() - 30);

        // Check if schedule already exists for this match_id
        const existing = await this.prisma.autopostSchedule.findFirst({
          where: {
            title: { contains: match.match_id },
          },
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        const message = this.buildMessage(match);
        const mediaUrl = this.buildMediaUrl(match);

        // Create one schedule per target group
        for (const groupId of groupIds) {
          const target = await this.prisma.autopostTarget.upsert({
            where: {
              platform_externalId: {
                platform: AutopostTargetPlatform.TELEGRAM,
                externalId: `match-${match.match_id}-group-${groupId}`,
              },
            },
            update: {},
            create: {
              platform: AutopostTargetPlatform.TELEGRAM,
              externalId: `match-${match.match_id}-group-${groupId}`,
              displayName: `${match.home_team} vs ${match.away_team}`,
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
            group_count: groupIds.length,
          },
        });
      } catch (err) {
        results.errors.push(`${match.match_id}: ${(err as Error).message}`);
      }
    }

    return results;
  }
}
