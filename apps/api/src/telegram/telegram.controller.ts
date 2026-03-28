import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TelegramService } from './telegram.service';

type TelegramConfigBody = {
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
  publicBaseUrl?: string;
};

type TelegramMockBody = {
  type?: 'user_joined' | 'user_left' | 'join_request' | 'message_received';
  campaignName?: string;
  groupTitle?: string;
  username?: string;
  externalId?: string;
  displayName?: string;
  memberCount?: number;
  messageText?: string;
};

type TelegramInviteLinkBody = {
  groupExternalId?: string;
  groupTitle?: string;
  name?: string;
  memberLimit?: number;
  createsJoinRequest?: boolean;
  expireHours?: number;
};

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getStatus() {
    return this.telegramService.getStatus();
  }

  @Get('groups')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getGroups() {
    return this.telegramService.getGroups();
  }

  @Post('config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateConfig(@Body() body: TelegramConfigBody) {
    return this.telegramService.updateConfig(body);
  }

  @Post('register-webhook')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  registerWebhook() {
    return this.telegramService.registerWebhook();
  }

  @Post('discover-groups')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  discoverGroups() {
    return this.telegramService.discoverGroups();
  }

  @Post('invite-links')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  createInviteLink(@Body() body: TelegramInviteLinkBody) {
    return this.telegramService.createInviteLink({
      groupExternalId: body.groupExternalId,
      groupTitle: body.groupTitle,
      name: body.name,
      memberLimit: body.memberLimit,
      createsJoinRequest: body.createsJoinRequest,
      expireHours: body.expireHours,
    });
  }

  @Post('mock')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  mockEvent(@Body() body: TelegramMockBody) {
    return this.telegramService.mockEvent(body);
  }

  @Post('webhook')
  handleWebhook(
    @Body() body: unknown,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    return this.telegramService.handleWebhook(body as never, secretToken);
  }
}
