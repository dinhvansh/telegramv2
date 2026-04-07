import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutopostScheduleStatus,
  AutopostTargetPlatform,
} from '@prisma/client';
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
    const groupIds = await this.getTelegramGroupIds(workspaceId);

    if (matches.length === 0) {
      return { total: 0, created: 0, skipped: 0, errors: ['No matches provided'], aiUsed: false };
    }

    if (groupIds.length === 0) {
      return { total: matches.length, created: 0, skipped: 0, errors: ['No active telegram groups found'], aiUsed: false };
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
        if (isNaN(scheduledFor.getTime())) {
          throw new Error(`Invalid date: ${dateStr}T${timeStr}Z`);
        }
        scheduledFor.setMinutes(scheduledFor.getMinutes() - 30);

        const existing = await this.prisma.autopostSchedule.findFirst({
          where: { title: { contains: match.match_id } },
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        // Build message — use AI if requested
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
