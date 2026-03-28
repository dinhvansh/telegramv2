import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { TelegramActionsModule } from '../telegram-actions/telegram-actions.module';
import { ModerationController } from './moderation.controller';
import { ModerationEngineService } from './moderation-engine.service';
import { ModerationService } from './moderation.service';

@Module({
  imports: [SettingsModule, TelegramActionsModule, SystemLogsModule],
  controllers: [ModerationController],
  providers: [ModerationService, ModerationEngineService],
  exports: [ModerationEngineService],
})
export class ModerationModule {}
