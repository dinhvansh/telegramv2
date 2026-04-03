import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformService } from './platform.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
};

@Controller()
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('health')
  getHealth() {
    return this.platformService.getHealth();
  }

  @Get('platform')
  @UseGuards(JwtAuthGuard)
  getSnapshot(@Req() request: AuthenticatedRequest) {
    return this.platformService.getSnapshot({
      userId: request.user.sub,
      permissions: request.user.permissions,
    });
  }
}
