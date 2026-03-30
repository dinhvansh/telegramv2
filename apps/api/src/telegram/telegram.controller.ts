import {
  Body,
  Controller,
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
  isForwarded?: boolean;
  hasPhoto?: boolean;
  hasVideo?: boolean;
  hasDocument?: boolean;
  hasSticker?: boolean;
  hasContact?: boolean;
  viaBot?: boolean;
};

type TelegramCommandBody = {
  groupId?: string;
  groupExternalId?: string;
  groupTitle?: string;
  commandText?: string;
  actorExternalId?: string;
  actorUsername?: string;
  targetExternalId?: string;
  targetUsername?: string;
  targetMessageId?: string;
  note?: string;
};

type TelegramInviteLinkBody = {
  campaignId?: string;
  groupExternalId?: string;
  groupTitle?: string;
  name?: string;
  memberLimit?: number;
  createsJoinRequest?: boolean;
  expireHours?: number;
};

type TelegramGroupModerationBody = {
  moderationEnabled?: boolean;
  lockUrl?: boolean;
  lockInvitelink?: boolean;
  lockForward?: boolean;
  lockEmail?: boolean;
  lockPhone?: boolean;
  lockBot?: boolean;
  lockPhoto?: boolean;
  lockVideo?: boolean;
  lockDocument?: boolean;
  lockSticker?: boolean;
  trustedUsernames?: string;
  trustedExternalIds?: string;
  exemptAdmins?: boolean;
  exemptOwners?: boolean;
  lockWarns?: boolean;
  warnLimit?: number;
  warnAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  warnActionDurationSeconds?: number | null;
  antifloodEnabled?: boolean;
  antifloodLimit?: number;
  antifloodWindowSeconds?: number;
  antifloodAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  antifloodActionDurationSeconds?: number | null;
  antifloodDeleteAll?: boolean;
  aiModerationEnabled?: boolean;
  aiMode?: 'off' | 'fallback_only' | 'suspicious_only';
  aiConfidenceThreshold?: number;
  aiOverrideAction?: boolean;
  silentActions?: boolean;
  rawLoggingEnabled?: boolean;
  detailedLoggingEnabled?: boolean;
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
  @Permissions('campaign.manage')
  getGroups() {
    return this.telegramService.getGroups();
  }

  @Get('groups/:groupId/moderation')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getGroupModeration(@Param('groupId') groupId: string) {
    return this.telegramService.getGroupModerationSettings(groupId);
  }

  @Post('config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateConfig(@Body() body: TelegramConfigBody) {
    return this.telegramService.updateConfig(body);
  }

  @Post('verify-bot')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  verifyBot() {
    return this.telegramService.verifyBot();
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

  @Put('groups/:groupId/moderation')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateGroupModeration(
    @Param('groupId') groupId: string,
    @Body() body: TelegramGroupModerationBody,
  ) {
    return this.telegramService.updateGroupModerationSettings(groupId, body);
  }

  @Post('invite-links')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  createInviteLink(@Body() body: TelegramInviteLinkBody) {
    return this.telegramService.createInviteLink({
      campaignId: body.campaignId,
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

  @Post('commands/execute')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  executeCommand(@Body() body: TelegramCommandBody) {
    return this.telegramService.executeCommand(body);
  }

  @Post('webhook')
  handleWebhook(
    @Body() body: unknown,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    return this.telegramService.handleWebhook(body as never, secretToken);
  }
}
