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

  private buildViewer(
    request: AuthenticatedRequest,
    workspaceId?: string,
  ) {
    return {
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
      workspaceId: workspaceId || undefined,
    };
  }

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
  getAssignees(
    @Req() request: AuthenticatedRequest,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.campaignsService.findAssignees(
      this.buildViewer(request, workspaceId),
    );
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
  createCampaign(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateCampaignBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.campaignsService.create(
      body,
      this.buildViewer(request, workspaceId),
    );
  }

  @Put(':campaignId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  updateCampaign(
    @Req() request: AuthenticatedRequest,
    @Param('campaignId') campaignId: string,
    @Body() body: UpdateCampaignBody,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.campaignsService.update(
      campaignId,
      body,
      this.buildViewer(request, workspaceId),
    );
  }

  @Delete(':campaignId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('campaign.manage')
  deleteCampaign(
    @Req() request: AuthenticatedRequest,
    @Param('campaignId') campaignId: string,
    @Headers('x-workspace-id') workspaceId?: string,
  ) {
    return this.campaignsService.delete(
      campaignId,
      this.buildViewer(request, workspaceId),
    );
  }
}
