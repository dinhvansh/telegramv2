import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AutopostController } from './autopost.controller';
import { AutopostService } from './autopost.service';

@Module({
  imports: [PrismaModule, SystemLogsModule],
  controllers: [AutopostController],
  providers: [AutopostService],
})
export class AutopostModule {}
