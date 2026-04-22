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

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
    workspaceIds?: string[];
  };
};

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

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

    const defaultWorkspaceId = workspaceIds[0];
    if (!defaultWorkspaceId) {
      throw new ForbiddenException('Workspace access is required');
    }

    return defaultWorkspaceId;
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getStatus(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.getStatus(
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Get('groups')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  getGroups(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.getGroups(
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Get('groups/:groupId/moderation')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getGroupModeration(
    @Req() request: AuthenticatedRequest,
    @Param('groupId') groupId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.getGroupModerationSettings(
      groupId,
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Post('config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateConfig(
    @Req() request: AuthenticatedRequest,
    @Body() body: TelegramConfigBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.updateConfig(
      body,
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Post('verify-bot')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  verifyBot(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.verifyBot(
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Post('register-webhook')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  registerWebhook(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.registerWebhook(
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Post('discover-groups')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  discoverGroups(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.discoverGroups(
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Post('refresh-rights')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  refreshRights(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.refreshBotRights(
      undefined,
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Put('groups/:groupId/moderation')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateGroupModeration(
    @Req() request: AuthenticatedRequest,
    @Param('groupId') groupId: string,
    @Body() body: TelegramGroupModerationBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.updateGroupModerationSettings(
      groupId,
      body,
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Delete('groups/:groupId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  deleteGroup(
    @Req() request: AuthenticatedRequest,
    @Param('groupId') groupId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.deleteGroup(
      groupId,
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Post('groups/:groupId/refresh-rights')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  refreshGroupRights(
    @Req() request: AuthenticatedRequest,
    @Param('groupId') groupId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.telegramService.refreshBotRights(
      groupId,
      this.resolveWorkspaceId(request, workspaceId),
    );
  }

  @Post('invite-links')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  createInviteLink(
    @Req() request: AuthenticatedRequest,
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
      this.resolveWorkspaceId(request, workspaceId),
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
