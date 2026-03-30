import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CampaignsService } from './campaigns.service';

type CreateCampaignBody = {
  name: string;
  channel: string;
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
}
