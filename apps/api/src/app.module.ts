import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { AutopostModule } from './autopost/autopost.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ModerationModule } from './moderation/moderation.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { SettingsModule } from './settings/settings.module';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { TelegramModule } from './telegram/telegram.module';
import { TelegramActionsModule } from './telegram-actions/telegram-actions.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AutopostModule,
    PlatformModule,
    CampaignsModule,
    ModerationModule,
    RolesModule,
    UsersModule,
    SettingsModule,
    SystemLogsModule,
    TelegramActionsModule,
    TelegramModule,
    WorkspacesModule,
  ],
})
export class AppModule {}
