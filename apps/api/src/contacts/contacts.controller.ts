import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  MtprotoService,
  PhoneLoginStartResult,
  PhoneLoginVerifyResult,
  QrCodeResult,
} from '../telegram-mtproto/mtproto.service';
import type { QrPollResult } from '../telegram-mtproto/mtproto.service';
import { ContactsService } from './contacts.service';
import {
  normalizeContactsImportPayload,
  type NormalizedImportPayload,
} from './import-payload';

type ImportBatchRequestBody = {
  fileName?: string;
  workspaceId?: string;
  payload?: unknown;
};

type PhoneLoginStartBody = {
  phoneNumber?: string;
};

type PhoneCodeVerifyBody = {
  phoneCode?: string;
};

type PasswordVerifyBody = {
  password?: string;
};

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
    workspaceIds?: string[];
  };
};

type UploadedJsonFile = {
  buffer: Buffer;
  originalname: string;
};

function extractNormalizedPayload(body: unknown): {
  fileName?: string;
  workspaceId?: string;
  payload: NormalizedImportPayload;
} | null {
  if (typeof body === 'object' && body !== null && 'payload' in body) {
    const requestBody = body as ImportBatchRequestBody;
    const payload = normalizeContactsImportPayload(requestBody.payload);
    if (!payload) {
      return null;
    }

    return {
      fileName: requestBody.fileName,
      workspaceId: requestBody.workspaceId,
      payload,
    };
  }

  const payload = normalizeContactsImportPayload(body);
  if (!payload) {
    return null;
  }

  return { payload };
}

function extractPayloadFromUpload(
  file: UploadedJsonFile | undefined,
  body: unknown,
): {
  fileName?: string;
  workspaceId?: string;
  payload: NormalizedImportPayload;
} | null {
  if (file) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(file.buffer.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Uploaded file must be valid JSON');
    }

    const payload = normalizeContactsImportPayload(parsed);
    if (!payload) {
      return null;
    }

    const requestBody =
      typeof body === 'object' && body !== null
        ? (body as ImportBatchRequestBody)
        : undefined;

    return {
      fileName: requestBody?.fileName || file.originalname,
      workspaceId: requestBody?.workspaceId,
      payload,
    };
  }

  return extractNormalizedPayload(body);
}

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly mtprotoService: MtprotoService,
    private readonly contactsService: ContactsService,
  ) {}

  @Post('auth/qr/start')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async startQr(): Promise<QrCodeResult> {
    return this.mtprotoService.startQrLogin();
  }

  @Post('auth/phone/start')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async startPhoneLogin(
    @Body() body: PhoneLoginStartBody,
  ): Promise<PhoneLoginStartResult> {
    return this.mtprotoService.startPhoneLogin(body.phoneNumber ?? '');
  }

  @Post('auth/phone/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async verifyPhoneCode(
    @Body() body: PhoneCodeVerifyBody,
  ): Promise<PhoneLoginVerifyResult> {
    return this.mtprotoService.verifyPhoneCode(body.phoneCode ?? '');
  }

  @Post('auth/phone/password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async verifyPassword(
    @Body() body: PasswordVerifyBody,
  ): Promise<PhoneLoginVerifyResult> {
    return this.mtprotoService.verifyPassword(body.password ?? '');
  }

  @Get('auth/qr/poll')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async pollQr(): Promise<QrPollResult> {
    return this.mtprotoService.pollQrCode();
  }

  @Get('auth/qr/confirm')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async confirmQr(): Promise<{
    success: boolean;
    userId: string;
    username?: string;
  }> {
    const result = await this.mtprotoService.confirmQrLogin();
    return { success: true, userId: result.userId, username: result.username };
  }

  @Get('auth/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async authStatus(): Promise<{ authenticated: boolean }> {
    const authenticated = await this.mtprotoService.isAuthenticated();
    return { authenticated };
  }

  @Post('auth/session/reset')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async resetSession(): Promise<{ success: boolean }> {
    await this.mtprotoService.resetSession();
    return { success: true };
  }

  @Post('import')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  @UseInterceptors(FileInterceptor('file'))
  async createImportBatch(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: UploadedJsonFile | undefined,
    @Body() body: unknown,
  ) {
    const authenticated = await this.mtprotoService.isAuthenticated();
    if (!authenticated) {
      return {
        error:
          'Telegram session expired. Reconnect your Telegram session in /contacts before importing.',
      };
    }

    const extracted = extractPayloadFromUpload(file, body);

    if (!extracted) {
      return {
        error:
          'Request must include a JSON file upload or a JSON body with contacts.list/frequent_contacts.list',
      };
    }

    const canManageOrganization = request.user.permissions.includes(
      'organization.manage',
    );
    const requestedWorkspaceId = extracted.workspaceId;
    const allowedWorkspaceId = requestedWorkspaceId
      ? canManageOrganization ||
        (request.user.workspaceIds ?? []).includes(requestedWorkspaceId)
        ? requestedWorkspaceId
        : null
      : ((request.user.workspaceIds ?? [])[0] ?? null);

    const batch = await this.contactsService.createImportBatch({
      workspaceId: allowedWorkspaceId ?? undefined,
      createdByUserId: request.user.sub,
      sourceFileName: extracted.fileName,
      contacts: extracted.payload.contacts,
      frequentContacts: extracted.payload.frequentContacts,
    });

    return {
      batch,
      message: 'Import batch created. Processing will continue in background.',
    };
  }

  @Get('import-batches')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  getImportBatches(@Req() request: AuthenticatedRequest) {
    return this.contactsService.listImportBatches({
      workspaceIds: request.user.workspaceIds ?? [],
      canManageOrganization: request.user.permissions.includes(
        'organization.manage',
      ),
    });
  }

  @Get('import-batches/:batchId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  getImportBatch(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string,
  ) {
    return this.contactsService.getImportBatch(batchId, {
      workspaceIds: request.user.workspaceIds ?? [],
      canManageOrganization: request.user.permissions.includes(
        'organization.manage',
      ),
    });
  }

  @Post('import-batches/:batchId/retry')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async retryFailedBatchItems(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string,
  ) {
    const result = await this.contactsService.retryFailedItems(batchId, {
      workspaceIds: request.user.workspaceIds ?? [],
      canManageOrganization: request.user.permissions.includes(
        'organization.manage',
      ),
    });

    if (!result) {
      throw new NotFoundException('Contact import batch not found');
    }

    return {
      batch: result,
      message: 'Failed items moved back to queue',
    };
  }

  @Post('import-batches/:batchId/cancel')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async cancelImportBatch(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string,
  ) {
    const result = await this.contactsService.cancelImportBatch(batchId, {
      workspaceIds: request.user.workspaceIds ?? [],
      canManageOrganization: request.user.permissions.includes(
        'organization.manage',
      ),
    });

    if (!result) {
      throw new NotFoundException('Contact import batch not found');
    }

    return {
      batch: result,
      message: 'Batch cancelled',
    };
  }

  @Get('import-batches/:batchId/items')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  getImportBatchItems(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contactsService.getImportBatchItems(batchId, {
      workspaceIds: request.user.workspaceIds ?? [],
      canManageOrganization: request.user.permissions.includes(
        'organization.manage',
      ),
      page: Number.parseInt(page ?? '1', 10),
      pageSize: Number.parseInt(pageSize ?? '25', 10),
    });
  }

  @Get('import-batches/:batchId/export')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async exportImportBatch(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const result = await this.contactsService.exportImportBatch(batchId, {
      workspaceIds: request.user.workspaceIds ?? [],
      canManageOrganization: request.user.permissions.includes(
        'organization.manage',
      ),
    });

    if (!result) {
      throw new NotFoundException('Contact import batch not found');
    }

    if (format === 'xlsx' && response) {
      const workbook = XLSX.utils.book_new();
      const rows = result.items.map((item) => ({
        Kind: item.kind,
        Status: item.status,
        'Phone Number': item.phoneNumber,
        'Telegram ID': item.telegramExternalId,
        Username: item.telegramUsername,
        'Display Name': item.displayName,
        'Error Message': item.errorMessage,
        'Attempt Count': item.attemptCount,
        'Processed At': item.processedAt,
        'Created At': item.createdAt,
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Contacts');

      const buffer = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      }) as Buffer;
      const safeName = result.batch.sourceFileName || 'contact-import';

      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}-${result.batch.id}.xlsx"`,
      );
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      return new StreamableFile(buffer);
    }

    return result;
  }
}
