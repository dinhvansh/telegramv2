import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramClient, Api } from 'telegram';
import { computeCheck } from 'telegram/Password';
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
  authenticated?: boolean;
}

export interface PhoneLoginStartResult {
  phoneNumber: string;
  sent: boolean;
  isCodeViaApp: boolean;
}

export interface PhoneLoginVerifyResult {
  success: boolean;
  requiresPassword: boolean;
  userId?: string;
  username?: string;
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

type PendingPhoneAuth = {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash: string;
  passwordRequired: boolean;
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

function isSessionPasswordNeededError(message: string) {
  return message.includes('SESSION_PASSWORD_NEEDED');
}

function isUnauthorizedSessionError(message: string) {
  return (
    message.includes('AUTH_KEY_UNREGISTERED') ||
    message.includes('SESSION_REVOKED') ||
    message.includes('SESSION_EXPIRED') ||
    message.includes('USER_DEACTIVATED')
  );
}

function getSessionRecoveryMessage(message: string) {
  if (isSessionPasswordNeededError(message)) {
    return 'Telegram session requires the account 2FA password. Reconnect your Telegram session in /contacts and complete the 2FA step.';
  }

  if (isUnauthorizedSessionError(message)) {
    return 'Telegram session is no longer valid. Reconnect your Telegram session in /contacts.';
  }

  return message;
}

@Injectable()
export class MtprotoService {
  private readonly logger = new Logger(MtprotoService.name);
  private client: TelegramClient | null = null;
  private qrToken: string | null = null;
  private qrExpiresAt: number = 0;
  private qrLoginDone = false;
  private pendingPhoneAuth: PendingPhoneAuth | null = null;
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
    await this.resetPendingPhoneAuth();
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

  async startPhoneLogin(phoneNumber: string): Promise<PhoneLoginStartResult> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Phone number is required');
    }

    await this.resetPendingPhoneAuth();
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    this.qrToken = null;
    this.qrExpiresAt = 0;
    this.qrLoginDone = false;

    const client = new TelegramClient(
      new StringSession(''),
      this.apiId,
      this.apiHash,
      { connectionRetries: 3, useWSS: true },
    );

    try {
      await client.connect();

      const sentCode = await client.sendCode(
        { apiId: this.apiId, apiHash: this.apiHash },
        normalizedPhone,
        false,
      );

      if (!sentCode.phoneCodeHash) {
        await client.disconnect();
        throw new BadRequestException('Failed to start phone login');
      }

      this.pendingPhoneAuth = {
        client,
        phoneNumber: normalizedPhone,
        phoneCodeHash: sentCode.phoneCodeHash,
        passwordRequired: false,
      };

      this.logger.log(`Phone login code sent to ${normalizedPhone}`);

      return {
        phoneNumber: normalizedPhone,
        sent: true,
        isCodeViaApp: sentCode.isCodeViaApp,
      };
    } catch (error: unknown) {
      await client.disconnect().catch(() => undefined);
      throw new BadRequestException(getTelegramErrorMessage(error));
    }
  }

  async verifyPhoneCode(phoneCode: string): Promise<PhoneLoginVerifyResult> {
    if (!this.pendingPhoneAuth) {
      throw new BadRequestException('No pending phone login. Start again.');
    }

    const normalizedCode = phoneCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException('Phone code is required');
    }

    try {
      const result = await this.pendingPhoneAuth.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.pendingPhoneAuth.phoneNumber,
          phoneCodeHash: this.pendingPhoneAuth.phoneCodeHash,
          phoneCode: normalizedCode,
        }),
      );

      if (!(result instanceof Api.auth.Authorization)) {
        throw new Error('Telegram account requires sign-up before login');
      }

      const telegramUser = result.user as unknown as {
        id: string | number | bigint;
        username?: string | null;
      };

      await this.saveAuthorizedClient(this.pendingPhoneAuth.client);

      return {
        success: true,
        requiresPassword: false,
        userId: String(telegramUser.id),
        username: telegramUser.username || undefined,
      };
    } catch (error: unknown) {
      const message = getTelegramErrorMessage(error);
      if (message === 'SESSION_PASSWORD_NEEDED') {
        this.pendingPhoneAuth.passwordRequired = true;
        return {
          success: false,
          requiresPassword: true,
        };
      }

      throw new BadRequestException(message);
    }
  }

  async verifyPassword(password: string): Promise<PhoneLoginVerifyResult> {
    if (!this.pendingPhoneAuth) {
      throw new BadRequestException('No pending phone login. Start again.');
    }

    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new BadRequestException('Two-factor password is required');
    }

    const passwordInfo = await this.pendingPhoneAuth.client.invoke(
      new Api.account.GetPassword(),
    );
    const passwordCheck = await computeCheck(passwordInfo, normalizedPassword);
    const result = await this.pendingPhoneAuth.client.invoke(
      new Api.auth.CheckPassword({
        password: passwordCheck,
      }),
    );

    if (!(result instanceof Api.auth.Authorization)) {
      throw new BadRequestException(
        'Telegram password verification did not complete login',
      );
    }

    const telegramUser = result.user as unknown as {
      id: string | number | bigint;
      username?: string | null;
    };

    await this.saveAuthorizedClient(this.pendingPhoneAuth.client);

    return {
      success: true,
      requiresPassword: false,
      userId: String(telegramUser.id),
      username: telegramUser.username || undefined,
    };
  }

  /**
   * GET /contacts/auth/qr/poll
   * Poll this every 2-3s. Returns token + remaining time.
   * When ready=true, call /contacts/auth/qr/confirm to save session.
   */
  async pollQrCode(): Promise<QrPollResult> {
    if (!this.qrToken || !this.client) {
      throw new Error(
        'No active QR session. Call /contacts/auth/qr/start first.',
      );
    }

    const authorized = await this.syncQrAuthorizationState();
    if (authorized) {
      return { ready: true, authenticated: true };
    }

    const remaining = Math.max(
      0,
      Math.floor((this.qrExpiresAt - Date.now()) / 1000),
    );
    if (remaining <= 0) {
      throw new Error('QR code expired. Call /contacts/auth/qr/start again.');
    }

    return {
      ready: false,
      authenticated: false,
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
    const authorized = await this.syncQrAuthorizationState();
    if (!authorized) {
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
      if (
        isSessionPasswordNeededError(message) ||
        isUnauthorizedSessionError(message)
      ) {
        await this.clearStaleSession();
      }
      throw new Error(getSessionRecoveryMessage(message));
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const client = await this.getClient();
      return await client.checkAuthorization();
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

  async resetSession(): Promise<void> {
    await this.resetPendingPhoneAuth();
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.qrToken = null;
    this.qrExpiresAt = 0;
    this.qrLoginDone = false;
    await this.prisma.telegramSession.deleteMany({
      where: { phoneNumber: 'MTPROTO_SESSION' },
    });
    this.logger.log('MTProto session reset');
  }

  private async getClient(): Promise<TelegramClient> {
    if (this.client) {
      try {
        if (await this.client.checkAuthorization()) {
          return this.client;
        }
        this.logger.warn('In-memory MTProto session is no longer authorized');
        await this.clearStaleSession();
      } catch (error) {
        const message = getTelegramErrorMessage(error);
        this.logger.warn(
          `In-memory MTProto authorization check failed: ${message}`,
        );
        if (
          isSessionPasswordNeededError(message) ||
          isUnauthorizedSessionError(message)
        ) {
          await this.clearStaleSession();
        }
      }
      this.client = null;
    }

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
        await client.disconnect();
        await this.clearStaleSession();
      } catch (error) {
        const message = getTelegramErrorMessage(error);
        this.logger.warn(`Existing MTProto session reconnect failed: ${message}`);
        if (
          isSessionPasswordNeededError(message) ||
          isUnauthorizedSessionError(message)
        ) {
          await this.clearStaleSession();
        }
      }
    }

    throw new Error(
      'MTProto session not found. Reconnect your Telegram session in /contacts.',
    );
  }

  private async saveAuthorizedClient(client: TelegramClient) {
    this.client = client;
    this.qrToken = null;
    this.qrExpiresAt = 0;
    this.qrLoginDone = false;
    await this.saveSession(client);
    this.pendingPhoneAuth = null;
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

  private async syncQrAuthorizationState(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    if (this.qrLoginDone) {
      return true;
    }

    try {
      const authorized = await this.client.checkAuthorization();
      if (!authorized) {
        return false;
      }

      this.qrLoginDone = true;
      this.qrToken = null;
      this.qrExpiresAt = 0;
      await this.saveSession(this.client);
      this.logger.log('QR authorization detected during poll');
      return true;
    } catch (error: unknown) {
      this.logger.warn(
        `QR authorization check failed: ${getTelegramErrorMessage(error)}`,
      );
      return false;
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^\d+]/g, '');
  }

  private async clearStaleSession(removePersisted = true) {
    if (this.client) {
      await this.client.disconnect().catch(() => undefined);
      this.client = null;
    }

    this.qrToken = null;
    this.qrExpiresAt = 0;
    this.qrLoginDone = false;

    if (removePersisted) {
      await this.prisma.telegramSession.deleteMany({
        where: { phoneNumber: 'MTPROTO_SESSION' },
      });
    }
  }

  private async resetPendingPhoneAuth() {
    if (this.pendingPhoneAuth) {
      await this.pendingPhoneAuth.client.disconnect();
      this.pendingPhoneAuth = null;
    }
  }
}
