import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

@Injectable()
export class ModerationCleanupService {
  private readonly logger = new Logger(ModerationCleanupService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  @Cron('10 0 * * *', {
    timeZone: 'Asia/Saigon',
  })
  async cleanupAllowedSpamEvents() {
    if (this.isRunning || !process.env.DATABASE_URL) {
      return;
    }

    this.isRunning = true;
    try {
      const cutoff = this.getStartOfTodayInSaigonUtc();
      const blockedSpamEventIds = new Set(
        (
          await this.prisma.moderationActionJob.findMany({
            where: { spamEventId: { not: null } },
            select: { spamEventId: true },
          })
        )
          .map((item) => item.spamEventId)
          .filter((value): value is string => Boolean(value)),
      );

      const candidates = await this.prisma.spamEvent.findMany({
        where: {
          decision: 'ALLOW',
          createdAt: { lt: cutoff },
          manualDecision: null,
          reviewedAt: null,
          lastActionAt: null,
        },
        select: { id: true },
      });

      const deletableIds = candidates
        .map((item) => item.id)
        .filter((id) => !blockedSpamEventIds.has(id));

      if (!deletableIds.length) {
        return;
      }

      const result = await this.prisma.spamEvent.deleteMany({
        where: { id: { in: deletableIds } },
      });

      await this.systemLogsService.log({
        scope: 'moderation.cleanup',
        action: 'purge_allow_events',
        message: `Deleted ${result.count} ALLOW moderation event(s) before ${cutoff.toISOString()}.`,
        payload: {
          count: result.count,
          cutoff: cutoff.toISOString(),
        },
      });

      this.logger.log(`Deleted ${result.count} ALLOW moderation event(s).`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown moderation cleanup error';
      this.logger.error(`Moderation cleanup failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private getStartOfTodayInSaigonUtc() {
    const now = new Date();
    const saigonNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Saigon' }),
    );
    saigonNow.setHours(0, 0, 0, 0);
    const utcMillis = saigonNow.getTime() - 7 * 60 * 60 * 1000;
    return new Date(utcMillis);
  }
}
