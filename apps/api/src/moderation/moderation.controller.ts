import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SpamDecision } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ModerationEngineService } from './moderation-engine.service';
import { ModerationService } from './moderation.service';

type AnalyzeBody = {
  source?: 'telegram.webhook' | 'telegram.mock' | 'manual';
  eventType?: 'message_received' | 'join_request' | 'user_joined';
  actorUsername?: string;
  actorExternalId?: string;
  groupTitle?: string;
  campaignLabel?: string;
  messageText?: string;
};

type UpsertConfigBody = {
  scopeKey?: string;
  autoBanSpam?: boolean;
  muteNewMembers?: boolean;
  muteDurationHours?: number;
};

type AddKeywordBody = {
  scopeKey?: string;
  value?: string;
};

type AddDomainBody = {
  scopeKey?: string;
  value?: string;
  mode?: 'BLOCK' | 'ALLOW';
};

type ApplyActionBody = {
  decision?: SpamDecision;
  note?: string;
};

@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly moderationService: ModerationService,
    private readonly moderationEngineService: ModerationEngineService,
  ) {}

  @Get('members')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  getMembers() {
    return this.moderationService.getMembers();
  }

  @Get('events')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  getEvents() {
    return this.moderationEngineService.getEvents();
  }

  @Get('config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  getConfig() {
    return this.moderationService.getConfig();
  }

  @Put('config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  updateConfig(@Body() body: UpsertConfigBody) {
    return this.moderationService.upsertScopePolicy({
      scopeKey: body.scopeKey || 'global',
      autoBanSpam: body.autoBanSpam !== false,
      muteNewMembers: Boolean(body.muteNewMembers),
      muteDurationHours: Number(body.muteDurationHours || 24),
    });
  }

  @Post('keywords')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  addKeyword(@Body() body: AddKeywordBody) {
    return this.moderationService.addKeyword({
      scopeKey: body.scopeKey || 'global',
      value: body.value || '',
    });
  }

  @Delete('keywords/:keywordId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  removeKeyword(@Param('keywordId') keywordId: string) {
    return this.moderationService.removeKeyword(keywordId);
  }

  @Post('domains')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  addDomain(@Body() body: AddDomainBody) {
    return this.moderationService.addDomain({
      scopeKey: body.scopeKey || 'global',
      value: body.value || '',
      mode: body.mode === 'ALLOW' ? 'ALLOW' : 'BLOCK',
    });
  }

  @Delete('domains/:domainId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  removeDomain(@Param('domainId') domainId: string) {
    return this.moderationService.removeDomain(domainId);
  }

  @Post('events/:eventId/action')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  applyAction(
    @Param('eventId') eventId: string,
    @Body() body: ApplyActionBody,
  ) {
    return this.moderationService.applyManualAction({
      eventId,
      decision: body.decision || SpamDecision.REVIEW,
      note: body.note || '',
    });
  }

  @Post('analyze')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  analyze(@Body() body: AnalyzeBody) {
    return this.moderationEngineService.evaluate({
      source: body.source || 'manual',
      eventType: body.eventType || 'message_received',
      actorUsername: body.actorUsername || null,
      actorExternalId: body.actorExternalId || null,
      groupTitle: body.groupTitle || 'Telegram Group',
      campaignLabel: body.campaignLabel || null,
      messageText: body.messageText || null,
    });
  }
}
