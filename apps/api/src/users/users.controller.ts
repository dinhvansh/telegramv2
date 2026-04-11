import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersService } from './users.service';

type CreateUserBody = {
  name: string;
  email: string;
  password: string;
  roleId: string;
  workspaceId?: string;
  department?: string;
  username?: string;
  status?: string;
};

type UpdateUserBody = {
  name?: string;
  username?: string;
  department?: string;
  roleId?: string;
  status?: string;
};

type ResetPasswordBody = {
  password?: string;
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

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('workspace.manage')
  getUsers(@Req() request: AuthenticatedRequest) {
    return this.usersService.findAll({
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('workspace.manage')
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateUserBody,
  ) {
    return this.usersService.create(body, {
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
    });
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('workspace.manage')
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: UpdateUserBody,
  ) {
    return this.usersService.update(userId, body, {
      userId: request.user.sub,
      permissions: request.user.permissions,
      workspaceIds: request.user.workspaceIds ?? [],
    });
  }

  @Post(':userId/reset-password')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('workspace.manage')
  resetPassword(
    @Param('userId') userId: string,
    @Body() body: ResetPasswordBody,
  ) {
    return this.usersService.resetPassword(userId, body.password);
  }
}
