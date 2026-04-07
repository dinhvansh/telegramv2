import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { WorkspacesService } from './workspaces.service';

type CreateOrganizationBody = {
  name: string;
  slug?: string;
};

type CreateWorkspaceBody = {
  organizationId: string;
  name: string;
  slug?: string;
  description?: string;
};

type CreateBotBody = {
  label: string;
  username?: string;
  displayName?: string;
  botToken?: string;
  webhookSecret?: string;
  publicBaseUrl?: string;
};

type CreateMembershipBody = {
  userId: string;
  roleId: string;
};

type CreateWorkspaceBundleBody = {
  organizationMode: 'existing' | 'new';
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  workspaceName: string;
  workspaceSlug?: string;
  workspaceDescription?: string;
  adminMode: 'existing' | 'new';
  existingUserId?: string;
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminUsername?: string;
  adminDepartment?: string;
  roleId: string;
  botLabel?: string;
  botUsername?: string;
  botDisplayName?: string;
  botToken?: string;
  webhookSecret?: string;
  publicBaseUrl?: string;
};

type UpdateWorkspaceBody = {
  name?: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
};

type UpdateOrganizationBody = {
  name?: string;
  slug?: string;
  isActive?: boolean;
};

type UpdateBotBody = {
  label?: string;
  username?: string | null;
  displayName?: string | null;
  botToken?: string | null;
  webhookSecret?: string | null;
  publicBaseUrl?: string | null;
  isActive?: boolean;
  isPrimary?: boolean;
};

type UpdateMembershipBody = {
  isActive?: boolean;
};

@Controller('workspaces')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('organization.manage')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('overview')
  getOverview() {
    return this.workspacesService.getOverview();
  }

  @Get('catalog')
  getCatalog() {
    return this.workspacesService.getCatalog();
  }

  @Post('organizations')
  createOrganization(@Body() body: CreateOrganizationBody) {
    return this.workspacesService.createOrganization(body);
  }

  @Patch('organizations/:organizationId')
  updateOrganization(
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateOrganizationBody,
  ) {
    return this.workspacesService.updateOrganization(organizationId, body);
  }

  @Delete('organizations/:organizationId')
  deleteOrganization(@Param('organizationId') organizationId: string) {
    return this.workspacesService.deleteOrganization(organizationId);
  }

  @Post()
  createWorkspace(@Body() body: CreateWorkspaceBody) {
    return this.workspacesService.createWorkspace(body);
  }

  @Post('onboard')
  createWorkspaceBundle(@Body() body: CreateWorkspaceBundleBody) {
    return this.workspacesService.createWorkspaceBundle(body);
  }

  @Patch(':workspaceId')
  updateWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() body: UpdateWorkspaceBody,
  ) {
    return this.workspacesService.updateWorkspace(workspaceId, body);
  }

  @Delete(':workspaceId')
  deleteWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.deleteWorkspace(workspaceId);
  }

  @Post(':workspaceId/bots')
  createBot(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateBotBody,
  ) {
    return this.workspacesService.createBot(workspaceId, body);
  }

  @Patch('bots/:botId')
  updateBot(@Param('botId') botId: string, @Body() body: UpdateBotBody) {
    return this.workspacesService.updateBot(botId, body);
  }

  @Delete('bots/:botId')
  deleteBot(@Param('botId') botId: string) {
    return this.workspacesService.deleteBot(botId);
  }

  @Post(':workspaceId/memberships')
  createMembership(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateMembershipBody,
  ) {
    return this.workspacesService.createMembership(workspaceId, body);
  }

  @Patch('memberships/:membershipId')
  updateMembership(
    @Param('membershipId') membershipId: string,
    @Body() body: UpdateMembershipBody,
  ) {
    return this.workspacesService.updateMembership(membershipId, body);
  }
}
