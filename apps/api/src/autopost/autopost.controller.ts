import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AutopostService } from './autopost.service';

type CreateTargetBody = {
  platform?: 'TELEGRAM' | 'DISCORD' | 'TWITTER';
  externalId?: string;
  displayName?: string;
};

type CreateScheduleBody = {
  title?: string;
  message?: string;
  frequency?: string;
  scheduledFor?: string;
  baseDate?: string;
  timeSlots?: string[];
  mediaUrl?: string;
  targetIds?: string[];
  telegramGroupIds?: string[];
  selectAllTelegramGroups?: boolean;
  saveAsDraft?: boolean;
};

type UpdateScheduleBody = CreateScheduleBody;

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
    workspaceIds?: string[];
  };
};

@Controller('autopost')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('autopost.execute')
export class AutopostController {
  constructor(private readonly autopostService: AutopostService) {}

  private resolveWorkspaceId(
    request: AuthenticatedRequest,
    requestedWorkspaceId?: string,
  ) {
    const permissions = request.user.permissions ?? [];
    const workspaceIds = request.user.workspaceIds ?? [];
    const canManageOrganization = permissions.includes('organization.manage');

    if (requestedWorkspaceId) {
      if (
        canManageOrganization ||
        workspaceIds.includes(requestedWorkspaceId)
      ) {
        return requestedWorkspaceId;
      }

      throw new ForbiddenException('Workspace is outside your scope');
    }

    if (canManageOrganization) {
      return undefined;
    }

    return workspaceIds[0];
  }

  private buildViewer(
    request: AuthenticatedRequest,
    requestedWorkspaceId?: string,
  ) {
    return {
      userId: request.user.sub,
      permissions: request.user.permissions ?? [],
      workspaceIds: request.user.workspaceIds ?? [],
      workspaceId: this.resolveWorkspaceId(request, requestedWorkspaceId),
    };
  }

  @Get()
  getSnapshot(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.getSnapshot(
      this.buildViewer(request, workspaceId),
    );
  }

  @Post('targets')
  createTarget(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateTargetBody,
  ) {
    return this.autopostService.createTarget(
      {
        platform: body.platform || 'TELEGRAM',
        externalId: body.externalId || '',
        displayName: body.displayName || '',
      },
      this.buildViewer(request),
    );
  }

  @Post('schedules')
  createSchedule(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateScheduleBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.createSchedules(
      {
        title: body.title || '',
        message: body.message || '',
        frequency: body.frequency || 'IMMEDIATE',
        scheduledFor: body.scheduledFor || null,
        baseDate: body.baseDate || null,
        timeSlots: Array.isArray(body.timeSlots) ? body.timeSlots : [],
        mediaUrl: body.mediaUrl || null,
        targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
        telegramGroupIds: Array.isArray(body.telegramGroupIds)
          ? body.telegramGroupIds
          : [],
        selectAllTelegramGroups: Boolean(body.selectAllTelegramGroups),
        saveAsDraft: Boolean(body.saveAsDraft),
      },
      this.buildViewer(request, workspaceId),
    );
  }

  @Post('send-now')
  sendNow(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateScheduleBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.sendNow(
      {
        title: body.title || '',
        message: body.message || '',
        frequency: body.frequency || 'IMMEDIATE',
        scheduledFor: body.scheduledFor || null,
        baseDate: body.baseDate || null,
        timeSlots: Array.isArray(body.timeSlots) ? body.timeSlots : [],
        mediaUrl: body.mediaUrl || null,
        targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
        telegramGroupIds: Array.isArray(body.telegramGroupIds)
          ? body.telegramGroupIds
          : [],
        selectAllTelegramGroups: Boolean(body.selectAllTelegramGroups),
        saveAsDraft: false,
      },
      this.buildViewer(request, workspaceId),
    );
  }

  @Put('schedules/:scheduleId')
  updateSchedule(
    @Req() request: AuthenticatedRequest,
    @Param('scheduleId') scheduleId: string,
    @Body() body: UpdateScheduleBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.updateSchedule(
      scheduleId,
      {
        title: body.title || '',
        message: body.message || '',
        frequency: body.frequency || 'IMMEDIATE',
        scheduledFor: body.scheduledFor || null,
        baseDate: body.baseDate || null,
        timeSlots: Array.isArray(body.timeSlots) ? body.timeSlots : [],
        mediaUrl: body.mediaUrl || null,
        targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
        telegramGroupIds: Array.isArray(body.telegramGroupIds)
          ? body.telegramGroupIds
          : [],
        selectAllTelegramGroups: Boolean(body.selectAllTelegramGroups),
        saveAsDraft: Boolean(body.saveAsDraft),
      },
      this.buildViewer(request, workspaceId),
    );
  }

  @Post('schedules/:scheduleId/toggle')
  toggleSchedule(
    @Req() request: AuthenticatedRequest,
    @Param('scheduleId') scheduleId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.toggleSchedule(
      scheduleId,
      this.buildViewer(request, workspaceId),
    );
  }

  @Delete('schedules/:scheduleId')
  deleteSchedule(
    @Req() request: AuthenticatedRequest,
    @Param('scheduleId') scheduleId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.deleteSchedule(
      scheduleId,
      this.buildViewer(request, workspaceId),
    );
  }

  @Post('dispatch')
  dispatchDue(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.dispatch(
      undefined,
      this.buildViewer(request, workspaceId),
    );
  }

  @Post('schedules/:scheduleId/dispatch')
  dispatchOne(
    @Req() request: AuthenticatedRequest,
    @Param('scheduleId') scheduleId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.dispatch(
      { scheduleId },
      this.buildViewer(request, workspaceId),
    );
  }
}
