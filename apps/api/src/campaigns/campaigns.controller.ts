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
import { CampaignsService } from './campaigns.service';

type CreateCampaignBody = {
  name: string;
  telegramGroupId: string;
  joinRate?: string;
  status?: 'Active' | 'Paused' | 'Review';
  inviteMemberLimit?: number | null;
  inviteRequiresApproval?: boolean;
};

type UpdateCampaignBody = {
  name?: string;
  joinRate?: string;
  status?: 'Active' | 'Paused' | 'Review';
};

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  getCampaigns() {
    return this.campaignsService.findAll();
  }

  @Get(':campaignId/invite-links')
  getInviteLinks(@Param('campaignId') campaignId: string) {
    return this.campaignsService.findInviteLinks(campaignId);
  }

  @Get(':campaignId')
  getCampaign(@Param('campaignId') campaignId: string) {
    return this.campaignsService.findOne(campaignId);
  }

  @Get(':campaignId/members')
  getCampaignMembers(@Param('campaignId') campaignId: string) {
    return this.campaignsService.findMembers(campaignId);
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
