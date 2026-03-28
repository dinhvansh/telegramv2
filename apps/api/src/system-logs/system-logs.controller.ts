import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SystemLogsService } from './system-logs.service';

@Controller('system-logs')
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  list(
    @Query('limit') limit?: string,
    @Query('scope') scope?: string,
    @Query('level') level?: string,
  ) {
    return this.systemLogsService.findRecent({
      limit: Number(limit || 100),
      scope: scope || undefined,
      level: level
        ? (String(level).toUpperCase() as 'INFO' | 'WARN' | 'ERROR')
        : undefined,
    });
  }
}
