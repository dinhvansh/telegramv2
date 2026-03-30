import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { TelegramActionsModule } from '../telegram-actions/telegram-actions.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [ModerationModule, TelegramActionsModule, SystemLogsModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
