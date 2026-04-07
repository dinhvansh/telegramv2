import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesService } from './roles.service';

type UpdateRoleBody = {
  description?: string;
  permissions: string[];
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

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getRoles(@Req() request: AuthenticatedRequest) {
    return this.rolesService.findAll({
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
    });
  }

  @Get('catalog')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getPermissionCatalog(@Req() request: AuthenticatedRequest) {
    return this.rolesService.findPermissionCatalog({
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
    });
  }

  @Patch(':roleId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateRole(
    @Req() request: AuthenticatedRequest,
    @Param('roleId') roleId: string,
    @Body() body: UpdateRoleBody,
  ) {
    return this.rolesService.updateRolePermissions(roleId, body, {
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
    });
  }
}
