import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  MtprotoService,
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

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    roles: string[];
    permissions: string[];
    workspaceIds?: string[];
  };
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

  @Get('auth/qr/poll')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  pollQr(): QrPollResult {
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

  @Post('import')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async createImportBatch(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const extracted = extractNormalizedPayload(body);

    if (!extracted) {
      return {
        error:
          'Body must be a JSON array of contacts or a Telegram export object with contacts.list/frequent_contacts.list',
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

    return result;
  }
}
