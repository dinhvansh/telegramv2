import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
  targetIds?: string[];
  saveAsDraft?: boolean;
};

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
      targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
      saveAsDraft: Boolean(body.saveAsDraft),
    });
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
