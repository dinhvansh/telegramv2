import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { WorkspaceBootstrapService } from './workspace-bootstrap.service';

@Global()
@Module({
  providers: [PrismaService, WorkspaceBootstrapService],
  exports: [PrismaService, WorkspaceBootstrapService],
})
export class PrismaModule {}
