import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  MtprotoService,
  QrCodeResult,
} from '../telegram-mtproto/mtproto.service';
import type { QrPollResult } from '../telegram-mtproto/mtproto.service';
import { TelegramResolverService } from './telegram-resolver.service';
import type { ContactInput } from './contacts.service';

type ContactsImportObject = {
  contacts?: {
    list?: ContactInput[];
  };
  list?: ContactInput[];
};

function normalizeContactsPayload(body: unknown): ContactInput[] | null {
  if (Array.isArray(body)) {
    return body as ContactInput[];
  }

  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const payload = body as ContactsImportObject;
  if (Array.isArray(payload.contacts?.list)) {
    return payload.contacts.list;
  }

  if (Array.isArray(payload.list)) {
    return payload.list;
  }

  return null;
}

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly mtprotoService: MtprotoService,
    private readonly telegramResolverService: TelegramResolverService,
  ) {}

  // POST /contacts/auth/qr/start
  // Initiates QR code login. Returns the QR token.
  // Frontend should render this as a QR code image.
  @Post('auth/qr/start')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async startQr(): Promise<QrCodeResult> {
    return this.mtprotoService.startQrLogin();
  }

  // GET /contacts/auth/qr/poll
  // Poll this endpoint every 2-3s to check if QR was scanned.
  // Returns { ready: false, token, expiresIn } until scanned.
  // After scan, returns { ready: true }.
  @Get('auth/qr/poll')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  pollQr(): QrPollResult {
    return this.mtprotoService.pollQrCode();
  }

  // GET /contacts/auth/qr/confirm
  // Call this after ready=true to save the session.
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

  // GET /contacts/auth/status
  @Get('auth/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async authStatus(): Promise<{ authenticated: boolean }> {
    const authenticated = await this.mtprotoService.isAuthenticated();
    return { authenticated };
  }

  // POST /contacts/import
  // Body: ContactInput[]
  @Post('import')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('contacts.manage')
  async importContacts(@Body() body: unknown) {
    const contacts = normalizeContactsPayload(body);

    if (!contacts) {
      return {
        error:
          'Body must be a JSON array of contacts or a Telegram export object with contacts.list',
      };
    }

    return this.telegramResolverService.resolveContacts(contacts);
  }
}
