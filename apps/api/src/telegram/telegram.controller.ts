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
  lockInlineButtons?: boolean;
  lockInlineButtonUrls?: boolean;
  trustedUsernames?: string;
  trustedExternalIds?: string;
  exemptAdmins?: boolean;
  exemptOwners?: boolean;
  lockWarns?: boolean;
  warnLimit?: number;
  warnAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  warnActionDurationSeconds?: number | null;
  warningExpirySeconds?: number;
  antifloodEnabled?: boolean;
  antifloodLimit?: number;
  antifloodWindowSeconds?: number;
  antifloodAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  antifloodActionDurationSeconds?: number | null;
  antifloodDeleteAll?: boolean;
  resetAntifloodOnRejoin?: boolean;
  probationEnabled?: boolean;
  probationSeconds?: number;
  probationAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  probationActionDurationSeconds?: number | null;
  antiRaidEnabled?: boolean;
  antiRaidAction?: 'mute' | 'tmute' | 'kick' | 'ban' | 'tban';
  antiRaidActionDurationSeconds?: number | null;
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
  getStatus(@Headers('x-workspace-id') workspaceId?: string) {
    return this.telegramService.getStatus(workspaceId);
  }

  @Get('groups')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  getGroups(@Headers('x-workspace-id') workspaceId?: string) {
    return this.telegramService.getGroups(workspaceId);
  }

  @Get('groups/:groupId/moderation')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getGroupModeration(
    @Param('groupId') groupId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.getGroupModerationSettings(
      groupId,
      workspaceId,
    );
  }

  @Post('config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateConfig(
    @Body() body: TelegramConfigBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.updateConfig(body, workspaceId);
  }

  @Post('verify-bot')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  verifyBot(@Headers('x-workspace-id') workspaceId?: string) {
    return this.telegramService.verifyBot(workspaceId);
  }

  @Post('register-webhook')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  registerWebhook(@Headers('x-workspace-id') workspaceId?: string) {
    return this.telegramService.registerWebhook(workspaceId);
  }

  @Post('discover-groups')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  discoverGroups(@Headers('x-workspace-id') workspaceId?: string) {
    return this.telegramService.discoverGroups(workspaceId);
  }

  @Post('refresh-rights')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  refreshRights(@Headers('x-workspace-id') workspaceId?: string) {
    return this.telegramService.refreshBotRights(undefined, workspaceId);
  }

  @Put('groups/:groupId/moderation')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateGroupModeration(
    @Param('groupId') groupId: string,
    @Body() body: TelegramGroupModerationBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.updateGroupModerationSettings(
      groupId,
      body,
      workspaceId,
    );
  }

  @Delete('groups/:groupId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  deleteGroup(
    @Param('groupId') groupId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.deleteGroup(groupId, workspaceId);
  }

  @Post('groups/:groupId/refresh-rights')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  refreshGroupRights(
    @Param('groupId') groupId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.refreshBotRights(groupId, workspaceId);
  }

  @Post('invite-links')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  createInviteLink(
    @Body() body: TelegramInviteLinkBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.createInviteLink(
      {
        campaignId: body.campaignId,
        groupExternalId: body.groupExternalId,
        groupTitle: body.groupTitle,
        name: body.name,
        memberLimit: body.memberLimit,
        createsJoinRequest: body.createsJoinRequest,
        expireHours: body.expireHours,
      },
      workspaceId,
    );
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
