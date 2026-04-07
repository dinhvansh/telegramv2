import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AutopostController } from './autopost.controller';
import { MatchWebhookController } from './match-webhook.controller';
import { AutopostSchedulerService } from './autopost-scheduler.service';
import { AutopostService } from './autopost.service';
import { MatchWebhookService } from './match-webhook.service';

@Module({
  imports: [PrismaModule, SystemLogsModule],
  controllers: [AutopostController, MatchWebhookController],
  providers: [AutopostService, AutopostSchedulerService, MatchWebhookService],
})
export class AutopostModule {}
