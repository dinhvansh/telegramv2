import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AutopostController } from './autopost.controller';
import { MatchWebhookController } from './match-webhook.controller';
import { AutopostSchedulerService } from './autopost-scheduler.service';
import { AutopostService } from './autopost.service';
import { MatchWebhookService } from './match-webhook.service';
import { MatchAiService } from './match-ai.service';

@Module({
  imports: [PrismaModule, SystemLogsModule, SettingsModule],
  controllers: [AutopostController, MatchWebhookController],
  providers: [
    AutopostService,
    AutopostSchedulerService,
    MatchWebhookService,
    MatchAiService,
  ],
})
export class AutopostModule {}
