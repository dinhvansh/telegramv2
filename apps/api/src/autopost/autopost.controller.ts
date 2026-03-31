import {
  Body,
  Controller,
  Delete,
  Get,
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
  getSnapshot() {
    return this.autopostService.getSnapshot();
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
  createSchedule(@Body() body: CreateScheduleBody) {
    return this.autopostService.createSchedules({
      title: body.title || '',
      message: body.message || '',
      frequency: body.frequency || 'IMMEDIATE',
      scheduledFor: body.scheduledFor || null,
      mediaUrl: body.mediaUrl || null,
      targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
      telegramGroupIds: Array.isArray(body.telegramGroupIds)
        ? body.telegramGroupIds
        : [],
      selectAllTelegramGroups: Boolean(body.selectAllTelegramGroups),
      saveAsDraft: Boolean(body.saveAsDraft),
    });
  }

  @Put('schedules/:scheduleId')
  updateSchedule(
    @Param('scheduleId') scheduleId: string,
    @Body() body: UpdateScheduleBody,
  ) {
    return this.autopostService.updateSchedule(scheduleId, {
      title: body.title || '',
      message: body.message || '',
      frequency: body.frequency || 'IMMEDIATE',
      scheduledFor: body.scheduledFor || null,
      mediaUrl: body.mediaUrl || null,
      targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
      telegramGroupIds: Array.isArray(body.telegramGroupIds)
        ? body.telegramGroupIds
        : [],
      selectAllTelegramGroups: Boolean(body.selectAllTelegramGroups),
      saveAsDraft: Boolean(body.saveAsDraft),
    });
  }

  @Post('schedules/:scheduleId/toggle')
  toggleSchedule(@Param('scheduleId') scheduleId: string) {
    return this.autopostService.toggleSchedule(scheduleId);
  }

  @Delete('schedules/:scheduleId')
  deleteSchedule(@Param('scheduleId') scheduleId: string) {
    return this.autopostService.deleteSchedule(scheduleId);
  }

  @Post('dispatch')
  dispatchDue() {
    return this.autopostService.dispatch();
  }

  @Post('schedules/:scheduleId/dispatch')
  dispatchOne(@Param('scheduleId') scheduleId: string) {
    return this.autopostService.dispatch({ scheduleId });
  }
}
