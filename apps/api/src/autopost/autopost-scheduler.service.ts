import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutopostService } from './autopost.service';

@Injectable()
export class AutopostSchedulerService {
  private readonly logger = new Logger(AutopostSchedulerService.name);
  private isRunning = false;

  constructor(private readonly autopostService: AutopostService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDueSchedules() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.autopostService.dispatch();
      if (result?.dispatched) {
        this.logger.log(
          `Auto-dispatched ${result.dispatched} autopost schedule(s).`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown autopost scheduler error';
      this.logger.error(`Autopost scheduler failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
