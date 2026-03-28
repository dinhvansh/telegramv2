import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getUsers() {
    return this.usersService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings.manage')
  createUser(@Body() body: CreateUserBody) {
    return this.usersService.create(body);
  }
}
