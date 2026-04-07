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
import { CampaignsService } from './campaigns.service';

type CreateCampaignBody = {
  name: string;
  telegramGroupId: string;
  assigneeUserId?: string | null;
  joinRate?: string;
  status?: 'Active' | 'Paused' | 'Review';
  inviteMemberLimit?: number | null;
  inviteRequiresApproval?: boolean;
};

type UpdateCampaignBody = {
  name?: string;
  assigneeUserId?: string | null;
  joinRate?: string;
  status?: 'Active' | 'Paused' | 'Review';
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

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  private assertCampaignReadAccess(request: AuthenticatedRequest) {
    const permissions = request.user.permissions ?? [];
    return (
      permissions.includes('campaign.manage') ||
      permissions.includes('campaign.view')
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getCampaigns(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    if (!this.assertCampaignReadAccess(request)) {
      throw new ForbiddenException('Missing required permission');
    }
    return this.campaignsService.findAll({
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
      workspaceId: workspaceId || undefined,
    });
  }

  @Get('assignees')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  getAssignees() {
    return this.campaignsService.findAssignees();
  }

  @Get(':campaignId/invite-links')
  @UseGuards(JwtAuthGuard)
  getInviteLinks(
    @Param('campaignId') campaignId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    if (!this.assertCampaignReadAccess(request)) {
      throw new ForbiddenException('Missing required permission');
    }
    return this.campaignsService.findInviteLinks(campaignId, {
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
      workspaceId: workspaceId || undefined,
    });
  }

  @Get(':campaignId')
  @UseGuards(JwtAuthGuard)
  getCampaign(
    @Param('campaignId') campaignId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    if (!this.assertCampaignReadAccess(request)) {
      throw new ForbiddenException('Missing required permission');
    }
    return this.campaignsService.findOne(campaignId, {
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
      workspaceId: workspaceId || undefined,
    });
  }

  @Get(':campaignId/members')
  @UseGuards(JwtAuthGuard)
  getCampaignMembers(
    @Param('campaignId') campaignId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    if (!this.assertCampaignReadAccess(request)) {
      throw new ForbiddenException('Missing required permission');
    }
    return this.campaignsService.findMembers(campaignId, {
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
      workspaceId: workspaceId || undefined,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  createCampaign(@Body() body: CreateCampaignBody) {
    return this.campaignsService.create(body);
  }

  @Put(':campaignId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  updateCampaign(
    @Param('campaignId') campaignId: string,
    @Body() body: UpdateCampaignBody,
  ) {
    return this.campaignsService.update(campaignId, body);
  }

  @Delete(':campaignId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  deleteCampaign(@Param('campaignId') campaignId: string) {
    return this.campaignsService.delete(campaignId);
  }
}
