import { Controller, Get } from '@nestjs/common';
import { PlatformService } from './platform.service';

@Controller()
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('health')
  getHealth() {
    return this.platformService.getHealth();
  }

  @Get('platform')
  getSnapshot() {
    return this.platformService.getSnapshot();
  }
}
