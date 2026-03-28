import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SettingsService } from './settings.service';

type UpdateSettingsBody = {
  entries?: Array<{
    key: string;
    value: string;
  }>;
};

type LoadAiModelsBody = {
  baseUrl?: string;
  apiToken?: string;
};

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getSettings() {
    return this.settingsService.findAll();
  }

  @Put()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateSettings(@Body() body: UpdateSettingsBody) {
    return this.settingsService.upsertMany(body.entries ?? []);
  }

  @Post('ai/models')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  loadAiModels(@Body() body: LoadAiModelsBody) {
    return this.settingsService.loadAiModels(body);
  }
}
