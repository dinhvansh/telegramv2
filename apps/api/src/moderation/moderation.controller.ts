import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  MaxFileSizeValidator,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { SpamDecision } from '@prisma/client';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
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

type UpdateMemberBody = {
  ownerName?: string | null;
  note?: string | null;
  phoneNumber?: string | null;
  customerSource?: string | null;
};

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
};

@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly moderationService: ModerationService,
    private readonly moderationEngineService: ModerationEngineService,
  ) {}

  private assertMemberAccess(request: AuthenticatedRequest) {
    const permissions = request.user?.permissions ?? [];
    const allowed =
      permissions.includes('moderation.review') ||
      permissions.includes('campaign.manage') ||
      permissions.includes('campaign.view');

    if (!allowed) {
      throw new ForbiddenException('Missing required permission');
    }
  }

  private assertMemberWriteAccess(request: AuthenticatedRequest) {
    const permissions = request.user?.permissions ?? [];
    const allowed =
      permissions.includes('moderation.review') ||
      permissions.includes('campaign.manage');

    if (!allowed) {
      throw new ForbiddenException('Missing required permission');
    }
  }

  @Get('members')
  @UseGuards(JwtAuthGuard)
  getMembers(
    @Req() request: AuthenticatedRequest,
    @Query('campaignId') campaignId?: string,
  ) {
    this.assertMemberAccess(request);
    return this.moderationService.getMembers(campaignId, {
      userId: request.user.sub,
      permissions: request.user.permissions,
    });
  }

  @Get('member360')
  @UseGuards(JwtAuthGuard)
  getMember360Summary(@Req() request: AuthenticatedRequest) {
    this.assertMemberAccess(request);
    return this.moderationService.getMember360Summary({
      userId: request.user.sub,
      permissions: request.user.permissions,
    });
  }

  @Get('member360/:externalId')
  @UseGuards(JwtAuthGuard)
  getMember360Profile(
    @Req() request: AuthenticatedRequest,
    @Param('externalId') externalId: string,
  ) {
    this.assertMemberAccess(request);
    return this.moderationService.getMember360Profile(externalId, {
      userId: request.user.sub,
      permissions: request.user.permissions,
    });
  }

  @Get('members/:memberId')
  @UseGuards(JwtAuthGuard)
  getMemberDetail(
    @Req() request: AuthenticatedRequest,
    @Param('memberId') memberId: string,
  ) {
    this.assertMemberAccess(request);
    return this.moderationService.getMemberDetail(memberId, {
      userId: request.user.sub,
      permissions: request.user.permissions,
    });
  }

  @Put('members/:memberId')
  @UseGuards(JwtAuthGuard)
  updateMember(
    @Req() request: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberBody,
  ) {
    this.assertMemberWriteAccess(request);
    return this.moderationService.updateMember(memberId, {
      ownerName: body.ownerName ?? null,
      note: body.note ?? null,
      phoneNumber: body.phoneNumber ?? null,
      customerSource: body.customerSource ?? null,
      viewer: {
        userId: request.user.sub,
        permissions: request.user.permissions,
      },
    });
  }

  @Post('members/:memberId/reset-warning')
  @UseGuards(JwtAuthGuard)
  resetMemberWarning(
    @Req() request: AuthenticatedRequest,
    @Param('memberId') memberId: string,
  ) {
    this.assertMemberWriteAccess(request);
    return this.moderationService.resetMemberWarning(memberId, {
      userId: request.user.sub,
      permissions: request.user.permissions,
    });
  }

  @Post('member360/import')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  @UseInterceptors(FileInterceptor('file'))
  async importMember360Excel(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 8 * 1024 * 1024 })],
      }),
    )
    file: { buffer?: Buffer } | undefined,
  ) {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
      throw new BadRequestException('Thiếu file Excel để import.');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('File Excel không có sheet nào để đọc.');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });

    return this.moderationService.importMember360Customers(rows);
  }

  @Get('member360/template')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  downloadMember360Template(
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        'ID số': '5029112',
        SĐT: '0905123456',
        'Nguồn khách': 'CRM import',
      },
    ]);

    XLSX.utils.book_append_sheet(workbook, sheet, 'Member360');
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    response.setHeader(
      'Content-Disposition',
      'attachment; filename="member360-import-template.xlsx"',
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    return new StreamableFile(buffer);
  }

  @Get('events')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  getEvents() {
    return this.moderationEngineService.getEvents();
  }

  @Get('debug')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  getDebugOverview() {
    return this.moderationService.getDebugOverview();
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

  @Post('jobs/process-due')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('moderation.review')
  processDueJobs() {
    return this.moderationService.processDueActionJobs();
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
