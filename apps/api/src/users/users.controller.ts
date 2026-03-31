import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersService } from './users.service';

type CreateUserBody = {
  name: string;
  email: string;
  password: string;
  roleId: string;
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

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  getUsers() {
    return this.usersService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  createUser(@Body() body: CreateUserBody) {
    return this.usersService.create(body);
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  updateUser(@Param('userId') userId: string, @Body() body: UpdateUserBody) {
    return this.usersService.update(userId, body);
  }

  @Post(':userId/reset-password')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  resetPassword(
    @Param('userId') userId: string,
    @Body() body: ResetPasswordBody,
  ) {
    return this.usersService.resetPassword(userId, body.password);
  }
}
