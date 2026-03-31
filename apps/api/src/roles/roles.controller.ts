import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesService } from './roles.service';

type UpdateRoleBody = {
  description?: string;
  permissions: string[];
};

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getRoles() {
    return this.rolesService.findAll();
  }

  @Get('catalog')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getPermissionCatalog() {
    return this.rolesService.findPermissionCatalog();
  }

  @Patch(':roleId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateRole(@Param('roleId') roleId: string, @Body() body: UpdateRoleBody) {
    return this.rolesService.updateRolePermissions(roleId, body);
  }
}
