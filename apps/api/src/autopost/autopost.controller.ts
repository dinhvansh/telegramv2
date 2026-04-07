import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
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

@Controller('autopost')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('autopost.execute')
export class AutopostController {
  constructor(private readonly autopostService: AutopostService) {}

  @Get()
  getSnapshot(@Headers('x-workspace-id') workspaceId?: string) {
    return this.autopostService.getSnapshot(workspaceId);
  }

  @Post('targets')
  createTarget(@Body() body: CreateTargetBody) {
    return this.autopostService.createTarget({
      platform: body.platform || 'TELEGRAM',
      externalId: body.externalId || '',
      displayName: body.displayName || '',
    });
  }

  @Post('schedules')
  createSchedule(
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
      workspaceId,
    );
  }

  @Post('send-now')
  sendNow(
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
      workspaceId,
    );
  }

  @Put('schedules/:scheduleId')
  updateSchedule(
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
      workspaceId,
    );
  }

  @Post('schedules/:scheduleId/toggle')
  toggleSchedule(
    @Param('scheduleId') scheduleId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.toggleSchedule(scheduleId, workspaceId);
  }

  @Delete('schedules/:scheduleId')
  deleteSchedule(
    @Param('scheduleId') scheduleId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.deleteSchedule(scheduleId, workspaceId);
  }

  @Post('dispatch')
  dispatchDue(@Headers('x-workspace-id') workspaceId?: string) {
    return this.autopostService.dispatch(undefined, workspaceId);
  }

  @Post('schedules/:scheduleId/dispatch')
  dispatchOne(
    @Param('scheduleId') scheduleId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.autopostService.dispatch({ scheduleId }, workspaceId);
  }
}
