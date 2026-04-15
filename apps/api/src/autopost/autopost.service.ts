/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import {
  AutopostDeliveryStatus,
  AutopostScheduleStatus,
  AutopostTargetPlatform,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecretValue } from '../settings/settings-security';
import { SystemLogsService } from '../system-logs/system-logs.service';

type CreateTargetInput = {
  platform: 'TELEGRAM' | 'DISCORD' | 'TWITTER';
  externalId: string;
  displayName: string;
};

type CreateScheduleInput = {
  title: string;
  message: string;
  frequency: string;
  scheduledFor?: string | null;
  baseDate?: string | null;
  timeSlots?: string[];
  mediaUrl?: string | null;
  targetIds: string[];
  telegramGroupIds?: string[];
  selectAllTelegramGroups?: boolean;
  saveAsDraft?: boolean;
};

type AutopostViewer = {
  userId?: string;
  permissions: string[];
  workspaceIds?: string[];
  workspaceId?: string;
};

@Injectable()
export class AutopostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private canManageOrganization(viewer?: AutopostViewer) {
    return Boolean(viewer?.permissions.includes('organization.manage'));
  }

  private resolveWorkspaceScope(viewer?: AutopostViewer) {
    if (!viewer) {
      return undefined;
    }

    if (viewer.workspaceId) {
      if (
        this.canManageOrganization(viewer) ||
        viewer.workspaceIds?.includes(viewer.workspaceId)
      ) {
        return viewer.workspaceId;
      }
    }

    if (this.canManageOrganization(viewer)) {
      return undefined;
    }

    return viewer.workspaceIds?.[0];
  }

  async getSnapshot(viewer?: AutopostViewer) {
    if (!process.env.DATABASE_URL) {
      return {
        targets: [],
        telegramGroups: [],
        schedules: [],
        logs: [],
        stats: {
          telegramTargets: 0,
          discordTargets: 0,
          sentCount: 0,
          scheduledCount: 0,
        },
      };
    }

    const workspaceId = this.resolveWorkspaceScope(viewer);
    const groups = (await this.prisma.telegramGroup.findMany({
      where: {
        isActive: true,
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: [{ title: 'asc' }],
    })) as any[];

    const allowedTelegramExternalIds = new Set<string>(
      groups.map((group) => group.externalId as string),
    );

    const targets = (await this.prisma.autopostTarget.findMany({
      where: workspaceId
        ? {
            OR: [
              { platform: { not: AutopostTargetPlatform.TELEGRAM } },
              {
                platform: AutopostTargetPlatform.TELEGRAM,
                externalId: { in: [...allowedTelegramExternalIds] },
              },
            ],
          }
        : undefined,
      orderBy: [{ platform: 'asc' }, { displayName: 'asc' }],
    })) as any[];

    const allowedTargetIds = new Set<string>(
      targets.map((target) => target.id),
    );

    const schedules = (await this.prisma.autopostSchedule.findMany({
      where: workspaceId
        ? {
            targetId: {
              in: [...allowedTargetIds],
            },
          }
        : undefined,
      include: {
        target: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    })) as any[];

    const logs = (await this.prisma.autopostLog.findMany({
      where: workspaceId
        ? {
            schedule: {
              targetId: {
                in: [...allowedTargetIds],
              },
            },
          }
        : undefined,
      include: {
        schedule: {
          include: {
            target: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })) as any[];

    const workspaces = (await this.prisma.workspace.findMany({
      where:
        workspaceId && !this.canManageOrganization(viewer)
          ? { id: workspaceId }
          : undefined,
      select: {
        id: true,
        name: true,
        slug: true,
        organizationId: true,
      },
      orderBy: { name: 'asc' },
    })) as any[];

    return {
      targets: targets.map((target: any) => ({
        id: target.id,
        platform: target.platform,
        externalId: target.externalId,
        displayName: target.displayName,
        status: target.status,
      })),
      telegramGroups: groups.map((group: any) => ({
        id: group.id,
        title: group.title,
        externalId: group.externalId,
        username: group.username
          ? `@${String(group.username).replace(/^@/, '')}`
          : null,
        type: group.type,
      })),
      schedules: schedules.map((schedule: any) => ({
        id: schedule.id,
        title: schedule.title,
        message: schedule.message,
        mediaUrl: schedule.mediaUrl,
        frequency: schedule.frequency,
        scheduledFor: schedule.scheduledFor?.toISOString() || null,
        status: schedule.status,
        target: {
          id: schedule.target.id,
          platform: schedule.target.platform,
          displayName: schedule.target.displayName,
          externalId: schedule.target.externalId,
        },
        latestLog: schedule.logs[0]
          ? {
              status: schedule.logs[0].status,
              detail: schedule.logs[0].detail,
              createdAt: schedule.logs[0].createdAt.toISOString(),
            }
          : null,
      })),
      logs: logs.map((log: any) => ({
        id: log.id,
        status: log.status,
        detail: log.detail,
        externalPostId: log.externalPostId,
        createdAt: log.createdAt.toISOString(),
        schedule: {
          id: log.schedule.id,
          title: log.schedule.title,
          targetName: log.schedule.target.displayName,
          platform: log.schedule.target.platform,
        },
      })),
      stats: {
        telegramTargets: targets.filter(
          (target: any) => target.platform === AutopostTargetPlatform.TELEGRAM,
        ).length,
        discordTargets: targets.filter(
          (target: any) => target.platform === AutopostTargetPlatform.DISCORD,
        ).length,
        sentCount: logs.filter(
          (log: any) => log.status === AutopostDeliveryStatus.SENT,
        ).length,
        scheduledCount: schedules.filter(
          (schedule: any) =>
            schedule.status === AutopostScheduleStatus.SCHEDULED ||
            schedule.status === AutopostScheduleStatus.DRAFT,
        ).length,
      },
      workspaces: workspaces.map((workspace: any) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        organizationId: workspace.organizationId,
      })),
    };
  }

  async createTarget(input: CreateTargetInput, viewer?: AutopostViewer) {
    if (!process.env.DATABASE_URL) {
      return this.getSnapshot(viewer);
    }

    const externalId = String(input.externalId || '').trim();
    const displayName = String(input.displayName || '').trim();
    if (!externalId || !displayName) {
      return this.getSnapshot(viewer);
    }

    await this.prisma.autopostTarget.upsert({
      where: {
        platform_externalId: {
          platform: this.toPlatform(input.platform),
          externalId,
        },
      },
      update: {
        displayName,
        status: 'CONNECTED',
      },
      create: {
        platform: this.toPlatform(input.platform),
        externalId,
        displayName,
        status: 'CONNECTED',
      },
    });

    await this.systemLogsService.log({
      scope: 'autopost.target',
      action: 'create_target',
      message: `Autopost target registered: ${displayName}`,
      payload: {
        platform: input.platform,
        externalId,
      },
    });

    return this.getSnapshot(viewer);
  }

  async createSchedules(input: CreateScheduleInput, viewer?: AutopostViewer) {
    const workspaceId = this.resolveWorkspaceScope(viewer);
    if (!process.env.DATABASE_URL) {
      return {
        created: 0,
        items: [],
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const title = String(input.title || '').trim();
    const message = String(input.message || '').trim();
    const mediaUrl = String(input.mediaUrl || '').trim() || null;
    const targetIds = Array.isArray(input.targetIds)
      ? input.targetIds.filter(Boolean)
      : [];
    const telegramGroupIds = Array.isArray(input.telegramGroupIds)
      ? input.telegramGroupIds.filter(Boolean)
      : [];

    const resolvedTargetIds = process.env.DATABASE_URL
      ? await this.resolveTelegramTargetIds(
          {
            targetIds,
            telegramGroupIds,
            selectAllTelegramGroups: Boolean(input.selectAllTelegramGroups),
          },
          workspaceId,
        )
      : targetIds;

    if ((!title && !message) || !resolvedTargetIds.length) {
      return {
        created: 0,
        items: [],
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const scheduleDates = this.resolveScheduleDates(input);
    const status = input.saveAsDraft
      ? AutopostScheduleStatus.DRAFT
      : AutopostScheduleStatus.SCHEDULED;

    const createdItems = [];
    const scheduleDatesToCreate = scheduleDates.length ? scheduleDates : [null];
    for (const targetId of resolvedTargetIds) {
      for (const scheduledFor of scheduleDatesToCreate) {
        const item = await this.prisma.autopostSchedule.create({
          data: {
            title,
            message,
            mediaUrl,
            frequency:
              String(input.frequency || 'IMMEDIATE').trim() || 'IMMEDIATE',
            scheduledFor,
            status,
            targetId,
          },
          include: {
            target: true,
          },
        });
        createdItems.push(item);
      }
    }

    await this.systemLogsService.log({
      scope: 'autopost.schedule',
      action: input.saveAsDraft ? 'save_draft' : 'create_schedule',
      message: `Autopost ${input.saveAsDraft ? 'draft' : 'schedule'} created for ${createdItems.length} target(s)`,
      payload: {
        title,
        targetIds: resolvedTargetIds,
        telegramGroupIds,
        selectAllTelegramGroups: Boolean(input.selectAllTelegramGroups),
        mediaUrl,
        scheduledFor: scheduleDatesToCreate.map(
          (item) => item?.toISOString() || null,
        ),
      },
    });

    return {
      created: createdItems.length,
      items: createdItems.map((item) => ({
        id: item.id,
        title: item.title,
        targetName: item.target.displayName,
        status: item.status,
      })),
      snapshot: await this.getSnapshot(viewer),
    };
  }

  async sendNow(input: CreateScheduleInput, viewer?: AutopostViewer) {
    const workspaceId = this.resolveWorkspaceScope(viewer);
    if (!process.env.DATABASE_URL) {
      return {
        dispatched: 0,
        items: [],
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const title = String(input.title || '').trim();
    const message = String(input.message || '').trim();
    const mediaUrl = String(input.mediaUrl || '').trim() || null;
    const targetIds = Array.isArray(input.targetIds)
      ? input.targetIds.filter(Boolean)
      : [];
    const telegramGroupIds = Array.isArray(input.telegramGroupIds)
      ? input.telegramGroupIds.filter(Boolean)
      : [];

    const resolvedTargetIds = await this.resolveTelegramTargetIds(
      {
        targetIds,
        telegramGroupIds,
        selectAllTelegramGroups: Boolean(input.selectAllTelegramGroups),
      },
      workspaceId,
    );

    if ((!title && !message) || !resolvedTargetIds.length) {
      return {
        dispatched: 0,
        items: [],
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const targets = await this.prisma.autopostTarget.findMany({
      where: {
        id: { in: resolvedTargetIds },
      },
      orderBy: { displayName: 'asc' },
    });

    const items = [];

    for (const target of targets) {
      let status: AutopostDeliveryStatus = AutopostDeliveryStatus.SENT;
      let detail = 'Message delivered.';
      let externalPostId: string | null = `instant-${Date.now()}`;

      if (target.platform === AutopostTargetPlatform.TELEGRAM) {
        const botToken = await this.getTelegramBotToken({
          workspaceId,
          chatExternalId: target.externalId,
        });
        if (!botToken) {
          status = AutopostDeliveryStatus.FAILED;
          detail = 'Missing Telegram bot token.';
          externalPostId = null;
        } else {
          const response = await this.sendTelegramAutopost(
            botToken,
            target.externalId,
            title,
            message,
            mediaUrl,
          );
          const body = (await response.json()) as {
            ok?: boolean;
            description?: string;
            result?: { message_id?: number };
          };
          if (!body.ok) {
            status = AutopostDeliveryStatus.FAILED;
            detail = body.description || 'Telegram send failed.';
            externalPostId = null;
          } else {
            detail = mediaUrl
              ? 'Telegram photo post sent.'
              : 'Telegram message sent.';
            externalPostId = body.result?.message_id
              ? String(body.result.message_id)
              : externalPostId;
          }
        }
      } else if (target.platform === AutopostTargetPlatform.DISCORD) {
        status = AutopostDeliveryStatus.FAILED;
        detail = 'Discord delivery is not implemented yet.';
        externalPostId = null;
      } else {
        status = AutopostDeliveryStatus.FAILED;
        detail = 'Target platform is not implemented yet.';
        externalPostId = null;
      }

      items.push({
        targetId: target.id,
        targetName: target.displayName,
        platform: target.platform,
        status,
        detail,
        externalPostId,
      });
    }

    await this.systemLogsService.log({
      scope: 'autopost.dispatch',
      action: 'send_now',
      message: `Autopost send-now executed for ${items.length} target(s)`,
      payload: {
        title,
        mediaUrl,
        targetIds: resolvedTargetIds,
        telegramGroupIds,
        selectAllTelegramGroups: Boolean(input.selectAllTelegramGroups),
        items,
      },
    });

    return {
      dispatched: items.length,
      items,
      snapshot: await this.getSnapshot(viewer),
    };
  }

  async updateSchedule(
    scheduleId: string,
    input: CreateScheduleInput,
    viewer?: AutopostViewer,
  ) {
    const workspaceId = this.resolveWorkspaceScope(viewer);
    if (!process.env.DATABASE_URL) {
      return {
        updated: false,
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const existing = await this.prisma.autopostSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!existing) {
      return {
        updated: false,
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const title = String(input.title || '').trim();
    const message = String(input.message || '').trim();
    const mediaUrl = String(input.mediaUrl || '').trim() || null;
    const targetIds = await this.resolveTelegramTargetIds(
      {
        targetIds: Array.isArray(input.targetIds)
          ? input.targetIds.filter(Boolean)
          : [],
        telegramGroupIds: Array.isArray(input.telegramGroupIds)
          ? input.telegramGroupIds.filter(Boolean)
          : [],
        selectAllTelegramGroups: Boolean(input.selectAllTelegramGroups),
      },
      workspaceId,
    );
    const primaryTargetId = targetIds[0] || existing.targetId;
    const scheduledFor =
      this.resolveScheduleDates(input)[0] ||
      (input.scheduledFor ? new Date(input.scheduledFor) : null);

    await this.prisma.autopostSchedule.update({
      where: { id: scheduleId },
      data: {
        title,
        message,
        mediaUrl,
        frequency:
          String(input.frequency || existing.frequency).trim() ||
          existing.frequency,
        scheduledFor,
        status: input.saveAsDraft
          ? AutopostScheduleStatus.DRAFT
          : existing.status === AutopostScheduleStatus.DRAFT
            ? AutopostScheduleStatus.SCHEDULED
            : existing.status,
        targetId: primaryTargetId,
      },
    });

    await this.systemLogsService.log({
      scope: 'autopost.schedule',
      action: 'update_schedule',
      message: `Autopost schedule updated: ${scheduleId}`,
      payload: {
        scheduleId,
        targetId: primaryTargetId,
        mediaUrl,
      },
    });

    return {
      updated: true,
      snapshot: await this.getSnapshot(viewer),
    };
  }

  async toggleSchedule(scheduleId: string, viewer?: AutopostViewer) {
    const workspaceId = this.resolveWorkspaceScope(viewer);
    if (!process.env.DATABASE_URL) {
      return {
        toggled: false,
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const existing = await this.prisma.autopostSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!existing) {
      return {
        toggled: false,
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const nextStatus =
      existing.status === AutopostScheduleStatus.DRAFT
        ? AutopostScheduleStatus.SCHEDULED
        : existing.status === AutopostScheduleStatus.SCHEDULED
          ? AutopostScheduleStatus.DRAFT
          : existing.status;

    await this.prisma.autopostSchedule.update({
      where: { id: scheduleId },
      data: { status: nextStatus },
    });

    await this.systemLogsService.log({
      scope: 'autopost.schedule',
      action: 'toggle_schedule',
      message: `Autopost schedule toggled to ${nextStatus}: ${scheduleId}`,
      payload: {
        scheduleId,
        status: nextStatus,
      },
    });

    return {
      toggled: true,
      status: nextStatus,
      snapshot: await this.getSnapshot(viewer),
    };
  }

  async deleteSchedule(scheduleId: string, viewer?: AutopostViewer) {
    const workspaceId = this.resolveWorkspaceScope(viewer);
    if (!process.env.DATABASE_URL) {
      return {
        deleted: false,
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const existing = await this.prisma.autopostSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!existing) {
      return {
        deleted: false,
        snapshot: await this.getSnapshot(viewer),
      };
    }

    await this.prisma.autopostSchedule.delete({
      where: { id: scheduleId },
    });

    await this.systemLogsService.log({
      scope: 'autopost.schedule',
      action: 'delete_schedule',
      message: `Autopost schedule deleted: ${scheduleId}`,
      payload: {
        scheduleId,
      },
    });

    return {
      deleted: true,
      snapshot: await this.getSnapshot(viewer),
    };
  }

  async dispatch(input?: { scheduleId?: string }, viewer?: AutopostViewer) {
    const workspaceId = this.resolveWorkspaceScope(viewer);
    if (!process.env.DATABASE_URL) {
      return {
        dispatched: 0,
        items: [],
        snapshot: await this.getSnapshot(viewer),
      };
    }

    const where = input?.scheduleId
      ? { id: input.scheduleId }
      : {
          status: AutopostScheduleStatus.SCHEDULED,
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
        };

    const schedules = await this.prisma.autopostSchedule.findMany({
      where,
      include: {
        target: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dispatched = [];
    for (const schedule of schedules) {
      const result = await this.dispatchOne(schedule, workspaceId);
      dispatched.push(result);
    }

    await this.systemLogsService.log({
      scope: 'autopost.dispatch',
      action: 'dispatch',
      message: `Autopost dispatch executed for ${dispatched.length} schedule(s)`,
      payload: {
        scheduleId: input?.scheduleId || null,
        dispatched,
      },
    });

    return {
      dispatched: dispatched.length,
      items: dispatched,
      snapshot: await this.getSnapshot(viewer),
    };
  }

  private async dispatchOne(
    schedule: {
      id: string;
      title: string;
      message: string;
      mediaUrl?: string | null;
      frequency: string;
      scheduledFor?: Date | null;
      target: {
        id: string;
        platform: AutopostTargetPlatform;
        externalId: string;
        displayName: string;
      };
    },
    workspaceId?: string,
  ) {
    await this.prisma.autopostSchedule.update({
      where: { id: schedule.id },
      data: { status: AutopostScheduleStatus.RUNNING },
    });

    let logStatus: AutopostDeliveryStatus = AutopostDeliveryStatus.SENT;
    let detail = 'Message delivered.';
    let externalPostId: string | null = `local-${Date.now()}`;

    if (schedule.target.platform === AutopostTargetPlatform.TELEGRAM) {
      const botToken = await this.getTelegramBotToken({
        workspaceId,
        chatExternalId: schedule.target.externalId,
      });
      if (!botToken) {
        logStatus = AutopostDeliveryStatus.FAILED;
        detail = 'Missing Telegram bot token.';
        externalPostId = null;
      } else {
        const method = schedule.mediaUrl ? 'sendPhoto' : 'sendMessage';
        const response = await this.sendTelegramAutopost(
          botToken,
          schedule.target.externalId,
          schedule.title,
          schedule.message,
          schedule.mediaUrl || null,
        );
        const body = (await response.json()) as {
          ok?: boolean;
          description?: string;
          result?: { message_id?: number };
        };
        if (!body.ok) {
          logStatus = AutopostDeliveryStatus.FAILED;
          detail = body.description || `Telegram ${method} failed.`;
          externalPostId = null;
        } else {
          detail = schedule.mediaUrl
            ? 'Telegram photo post sent.'
            : 'Telegram message sent.';
          externalPostId = body.result?.message_id
            ? String(body.result.message_id)
            : externalPostId;
        }
      }
    } else if (schedule.target.platform === AutopostTargetPlatform.DISCORD) {
      logStatus = AutopostDeliveryStatus.FAILED;
      detail = 'Discord delivery is not implemented yet.';
      externalPostId = null;
    } else {
      logStatus = AutopostDeliveryStatus.FAILED;
      detail = 'Target platform is not implemented yet.';
      externalPostId = null;
    }

    await this.prisma.autopostLog.create({
      data: {
        scheduleId: schedule.id,
        status: logStatus,
        detail,
        externalPostId,
      },
    });

    await this.prisma.autopostSchedule.update({
      where: { id: schedule.id },
      data: {
        ...(logStatus === AutopostDeliveryStatus.SENT
          ? this.resolveNextScheduleState(
              schedule.frequency,
              schedule.scheduledFor,
            )
          : { status: AutopostScheduleStatus.FAILED }),
      },
    });

    return {
      scheduleId: schedule.id,
      targetName: schedule.target.displayName,
      platform: schedule.target.platform,
      status: logStatus,
      detail,
      externalPostId,
    };
  }

  private resolveNextScheduleState(
    frequency: string,
    scheduledFor?: Date | null,
  ) {
    const normalized = String(frequency || 'ONCE')
      .trim()
      .toUpperCase();
    const base = scheduledFor ? new Date(scheduledFor) : new Date();

    if (normalized === 'DAILY') {
      const next = new Date(base);
      next.setDate(next.getDate() + 1);
      return {
        status: AutopostScheduleStatus.SCHEDULED,
        scheduledFor: next,
      };
    }

    if (normalized === 'WEEKLY') {
      const next = new Date(base);
      next.setDate(next.getDate() + 7);
      return {
        status: AutopostScheduleStatus.SCHEDULED,
        scheduledFor: next,
      };
    }

    if (normalized === 'MONTHLY') {
      const next = new Date(base);
      next.setMonth(next.getMonth() + 1);
      return {
        status: AutopostScheduleStatus.SCHEDULED,
        scheduledFor: next,
      };
    }

    return {
      status: AutopostScheduleStatus.COMPLETED,
    };
  }

  private resolveScheduleDates(input: CreateScheduleInput) {
    const normalizedFrequency = String(input.frequency || 'ONCE')
      .trim()
      .toUpperCase();

    if (normalizedFrequency === 'ONCE') {
      if (!input.scheduledFor) {
        return [];
      }

      const date = new Date(input.scheduledFor);
      return Number.isNaN(date.getTime()) ? [] : [date];
    }

    const slots = this.normalizeTimeSlots(
      Array.isArray(input.timeSlots) ? input.timeSlots : [],
    );
    if (!slots.length) {
      return [];
    }

    const baseDate = this.resolveBaseDate(input.baseDate, input.scheduledFor);
    const dates = slots
      .map((slot) => this.combineDateAndTime(baseDate, slot))
      .filter((item): item is Date => Boolean(item))
      .map((item) => this.rollRecurringForward(item, normalizedFrequency))
      .sort((a, b) => a.getTime() - b.getTime());

    return dates;
  }

  private normalizeTimeSlots(timeSlots: string[]) {
    return Array.from(
      new Set(
        timeSlots
          .map((item) => String(item || '').trim())
          .filter((item) => /^\d{2}:\d{2}$/.test(item)),
      ),
    );
  }

  private resolveBaseDate(
    baseDate: string | null | undefined,
    scheduledFor: string | null | undefined,
  ) {
    if (baseDate) {
      const parsed = new Date(`${baseDate}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (scheduledFor) {
      const parsed = new Date(scheduledFor);
      if (!Number.isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        return parsed;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private combineDateAndTime(baseDate: Date, timeSlot: string) {
    const [hoursText, minutesText] = timeSlot.split(':');
    const hours = Number(hoursText);
    const minutes = Number(minutesText);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    const scheduled = new Date(baseDate);
    scheduled.setHours(hours, minutes, 0, 0);
    return scheduled;
  }

  private rollRecurringForward(date: Date, frequency: string) {
    const now = new Date();
    const next = new Date(date);

    while (next.getTime() <= now.getTime()) {
      if (frequency === 'DAILY') {
        next.setDate(next.getDate() + 1);
        continue;
      }

      if (frequency === 'WEEKLY') {
        next.setDate(next.getDate() + 7);
        continue;
      }

      if (frequency === 'MONTHLY') {
        next.setMonth(next.getMonth() + 1);
        continue;
      }

      break;
    }

    return next;
  }

  private async getTelegramBotToken(input?: {
    workspaceId?: string;
    chatExternalId?: string;
  }) {
    const envToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!process.env.DATABASE_URL) {
      return envToken;
    }

    if (input?.chatExternalId) {
      const group = await this.prisma.telegramGroup.findUnique({
        where: { externalId: input.chatExternalId },
        include: {
          telegramBot: true,
        },
      });

      if (group?.telegramBot?.encryptedBotToken) {
        return decryptSecretValue(group.telegramBot.encryptedBotToken);
      }
    }

    if (input?.workspaceId) {
      const workspaceBot = await this.prisma.telegramBot.findFirst({
        where: {
          workspaceId: input.workspaceId,
          isActive: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      if (workspaceBot?.encryptedBotToken) {
        return decryptSecretValue(workspaceBot.encryptedBotToken);
      }
    }

    const primaryBot = await this.prisma.telegramBot.findFirst({
      where: {
        isActive: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    if (primaryBot?.encryptedBotToken) {
      return decryptSecretValue(primaryBot.encryptedBotToken);
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'telegram.bot_token' },
    });

    return setting?.value ? decryptSecretValue(setting.value) : envToken;
  }

  private async sendTelegramAutopost(
    botToken: string,
    chatId: string,
    title: string,
    message: string,
    mediaUrl: string | null,
  ) {
    const caption = this.formatTelegramPost(title, message);
    if (mediaUrl && this.isDataUrl(mediaUrl)) {
      const form = new FormData();
      form.set('chat_id', chatId);
      form.set('caption', caption);
      form.set(
        'photo',
        this.dataUrlToBlob(mediaUrl),
        this.buildMediaFilename(mediaUrl),
      );
      return fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
    }

    const method = mediaUrl ? 'sendPhoto' : 'sendMessage';
    return fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        mediaUrl
          ? {
              chat_id: chatId,
              photo: mediaUrl,
              caption,
            }
          : {
              chat_id: chatId,
              text: caption,
            },
      ),
    });
  }

  private async resolveTelegramTargetIds(
    input: {
      targetIds: string[];
      telegramGroupIds: string[];
      selectAllTelegramGroups: boolean;
    },
    workspaceId?: string,
  ) {
    const directTargetIds = input.targetIds.filter(Boolean);
    const groups = await this.prisma.telegramGroup.findMany({
      where: input.selectAllTelegramGroups
        ? {
            isActive: true,
            ...(workspaceId ? { workspaceId } : {}),
          }
        : {
            id: { in: input.telegramGroupIds.filter(Boolean) },
            isActive: true,
            ...(workspaceId ? { workspaceId } : {}),
          },
      orderBy: { title: 'asc' },
    });

    const syncedTargets = [];
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
      syncedTargets.push(target.id);
    }

    return [...new Set([...directTargetIds, ...syncedTargets])];
  }

  private formatTelegramPost(title: string, message: string) {
    const normalizedTitle = String(title || '').trim();
    const normalizedMessage = String(message || '').trim();
    if (normalizedTitle && normalizedMessage) {
      return `${normalizedTitle}\n\n${normalizedMessage}`;
    }

    return normalizedTitle || normalizedMessage;
  }

  private isDataUrl(value: string) {
    return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
  }

  private dataUrlToBlob(dataUrl: string) {
    const [meta, base64Payload] = dataUrl.split(',', 2);
    const mimeMatch = meta.match(/^data:([^;]+);base64$/);
    const mimeType = mimeMatch?.[1] || 'image/png';
    const bytes = Buffer.from(base64Payload || '', 'base64');
    return new Blob([bytes], { type: mimeType });
  }

  private buildMediaFilename(dataUrl: string) {
    const mimeMatch = dataUrl.match(/^data:image\/([^;]+);base64,/);
    const extension = mimeMatch?.[1]?.replace('jpeg', 'jpg') || 'png';
    return `autopost-${Date.now()}.${extension}`;
  }

  private toPlatform(value: string) {
    return value === 'DISCORD'
      ? AutopostTargetPlatform.DISCORD
      : value === 'TWITTER'
        ? AutopostTargetPlatform.TWITTER
        : AutopostTargetPlatform.TELEGRAM;
  }
}
