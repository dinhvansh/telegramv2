import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { TelegramActionsService } from './telegram-actions.service';

@Module({
  imports: [SystemLogsModule],
  providers: [TelegramActionsService],
  exports: [TelegramActionsService],
})
export class TelegramActionsModule {}
