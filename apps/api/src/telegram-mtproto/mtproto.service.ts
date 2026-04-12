import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { signInUserWithQrCode } from 'telegram/client/auth';
import bigInt from 'big-integer';

export interface ResolvedUser {
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface QrCodeResult {
  token: string; // base64url — render as QR image
  expiresIn: number; // seconds remaining
}

export interface QrPollResult {
  ready: boolean;
  token?: string;
  expiresIn?: number;
}

type TelegramApiError = {
  message?: string;
  errorMessage?: string;
};

type TelegramAuthUser = {
  id: string | number | bigint;
  username?: string | null;
};

type ImportedTelegramUser = {
  _: string;
  id?: string | number | bigint;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
};

function getTelegramErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as TelegramApiError;
    if (
      typeof maybeError.errorMessage === 'string' &&
      maybeError.errorMessage
    ) {
      return maybeError.errorMessage;
    }
    if (typeof maybeError.message === 'string' && maybeError.message) {
      return maybeError.message;
    }
  }

  return 'Unknown Telegram error';
}

@Injectable()
export class MtprotoService {
  private readonly logger = new Logger(MtprotoService.name);
  private client: TelegramClient | null = null;
  private qrToken: string | null = null;
  private qrExpiresAt: number = 0;
  private qrLoginDone = false;
  private apiId: number;
  private apiHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.apiId = Number(
      this.configService.get<string>('TELEGRAM_API_ID') ?? '0',
    );
    this.apiHash = this.configService.get<string>('TELEGRAM_API_HASH')!;
  }

  /**
   * POST /contacts/auth/qr/start
   * Starts QR code login. Returns the token immediately (non-blocking).
   * The qrCode callback captures the token and returns it to the caller.
   */
  async startQrLogin(): Promise<QrCodeResult> {
    if (this.client) {
      await this.client.disconnect();
    }
    this.client = null;
    this.qrToken = null;
    this.qrExpiresAt = 0;
    this.qrLoginDone = false;

    const client = new TelegramClient(
      new StringSession(''),
      this.apiId,
      this.apiHash,
      { connectionRetries: 3, useWSS: true },
    );
    await client.connect();

    let resolveStart: (v: QrCodeResult) => void;
    let rejectStart: (e: Error) => void;
    const startPromise = new Promise<QrCodeResult>((res, rej) => {
      resolveStart = res;
      rejectStart = rej;
    });

    // Kick off QR auth — the qrCode callback fires when the QR is ready
    signInUserWithQrCode(
      client,
      { apiId: this.apiId, apiHash: this.apiHash },
      {
        qrCode: ({ token, expires }) => {
          const expiresAt = expires * 1000;
          const expiresIn = Math.max(
            0,
            Math.floor((expiresAt - Date.now()) / 1000),
          );

          this.qrToken = token.toString('base64url');
          this.qrExpiresAt = expiresAt;
          this.client = client;
          this.logger.log(`QR code ready, expires in ${expiresIn}s`);
          resolveStart({
            token: this.qrToken,
            expiresIn,
          });
          return Promise.resolve();
        },
        onError: (err: Error) => {
          rejectStart(err);
        },
      },
    )
      .then(async (user) => {
        // User scanned and authenticated — save session
        this.qrLoginDone = true;
        await this.saveSession(client);
        const authUser = user as unknown as TelegramAuthUser;
        this.logger.log(
          `QR login complete, logged in as ${authUser.username ?? 'unknown'} (${String(authUser.id)})`,
        );
      })
      .catch((err: Error) => {
        // Auth error (user cancelled, etc.) — don't throw here, let poll/report it
        this.logger.error(`QR login error: ${err.message}`);
      });

    // Return token immediately — caller renders QR
    return startPromise;
  }

  /**
   * GET /contacts/auth/qr/poll
   * Poll this every 2-3s. Returns token + remaining time.
   * When ready=true, call /contacts/auth/qr/confirm to save session.
   */
  pollQrCode(): QrPollResult {
    if (this.qrLoginDone && this.client) {
      return { ready: true };
    }

    if (!this.qrToken || !this.client) {
      throw new Error(
        'No active QR session. Call /contacts/auth/qr/start first.',
      );
    }

    const remaining = Math.max(
      0,
      Math.floor((this.qrExpiresAt - Date.now()) / 1000),
    );
    if (remaining <= 0) {
      throw new Error('QR code expired. Call /contacts/auth/qr/start again.');
    }

    return {
      ready: this.qrLoginDone,
      token: this.qrToken,
      expiresIn: remaining,
    };
  }

  /**
   * POST /contacts/auth/qr/confirm
   * Confirms session is saved. Returns user info.
   */
  async confirmQrLogin(): Promise<{ userId: string; username?: string }> {
    if (!this.client) {
      throw new Error('No active session. Call /contacts/auth/qr/start first.');
    }
    if (!this.qrLoginDone) {
      throw new Error(
        'QR code not yet scanned. Poll /contacts/auth/qr/poll first.',
      );
    }

    const me = await this.client.getMe();
    this.logger.log(
      `QR session confirmed for ${me.username} (${String(me.id)})`,
    );
    return { userId: String(me.id), username: me.username };
  }

  async resolvePhoneToUserId(phone: string): Promise<ResolvedUser | null> {
    const client = await this.getClient();
    const normalized = this.normalizePhone(phone);

    try {
      const importResult = await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: bigInt(Date.now()),
              phone: normalized,
              firstName: 'Temp',
              lastName: '',
            }),
          ],
        }),
      );

      const users = (importResult.users ??
        []) as unknown as ImportedTelegramUser[];
      if (!users || users.length === 0) return null;

      const user = users.find((u) => u._ === 'user' && u.id);
      if (!user) return null;

      return {
        userId: String(user.id),
        username: user.username || undefined,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        phone: user.phone || undefined,
      };
    } catch (error: unknown) {
      const message = getTelegramErrorMessage(error);
      this.logger.error(`resolvePhone failed for ${phone}: ${message}`);
      throw new Error(message);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getClient();
      return true;
    } catch {
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }

  private async getClient(): Promise<TelegramClient> {
    if (this.client) return this.client;

    const session = await this.prisma.telegramSession.findUnique({
      where: { phoneNumber: 'MTPROTO_SESSION' },
    });

    if (session) {
      try {
        const stringSession = new StringSession(session.sessionData);
        const client = new TelegramClient(
          stringSession,
          this.apiId,
          this.apiHash,
          {
            connectionRetries: 3,
            useWSS: true,
          },
        );
        await client.connect();
        if (await client.checkAuthorization()) {
          this.client = client;
          this.logger.log('Reconnected existing MTProto session');
          return this.client;
        }
      } catch {
        this.logger.warn('Existing MTProto session invalid');
      }
    }

    throw new Error('MTProto session not found. Scan QR code first.');
  }

  private async saveSession(client: TelegramClient) {
    const sessionString = (client.session as StringSession).save();
    await this.prisma.telegramSession.upsert({
      where: { phoneNumber: 'MTPROTO_SESSION' },
      update: { sessionData: sessionString },
      create: {
        phoneNumber: 'MTPROTO_SESSION',
        sessionData: sessionString,
      },
    });
    this.logger.log('MTProto session saved to database');
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^\d+]/g, '');
  }
}
