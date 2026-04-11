import { Injectable, Logger } from '@nestjs/common';
import {
  MtprotoService,
  ResolvedUser,
} from '../telegram-mtproto/mtproto.service';
import {
  ContactsService,
  ContactInput,
  ResolvedContact,
} from './contacts.service';

const RESOLVE_DELAY_MS = 1000;

type ResolverError = {
  message?: string;
  errorMessage?: string;
};

function getResolverErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as ResolverError;
    if (
      typeof maybeError.errorMessage === 'string' &&
      maybeError.errorMessage.trim()
    ) {
      return maybeError.errorMessage;
    }
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return maybeError.message;
    }
  }

  return 'Unknown resolve error';
}

@Injectable()
export class TelegramResolverService {
  private readonly logger = new Logger(TelegramResolverService.name);

  constructor(
    private readonly mtprotoService: MtprotoService,
    private readonly contactsService: ContactsService,
  ) {}

  async resolveContacts(contacts: ContactInput[]): Promise<{
    total: number;
    resolved: number;
    skipped: number;
    failed: number;
    results: ResolvedContact[];
  }> {
    const results: ResolvedContact[] = [];
    let resolved = 0;
    let skipped = 0;
    let failed = 0;
    let pending = 0;

    // First pass: filter out already-resolved or invalid entries
    const importResult = await this.contactsService.importContacts(contacts);
    for (const r of importResult.results) {
      if (r.status === 'skipped') {
        results.push(r);
        skipped++;
      } else if (r.status === 'failed') {
        results.push(r);
        failed++;
      } else {
        pending++;
      }
    }

    if (pending === 0) {
      return {
        total: contacts.length,
        resolved: 0,
        skipped,
        failed,
        results,
      };
    }

    // Check auth
    const isAuth = await this.mtprotoService.isAuthenticated();
    if (!isAuth) {
      this.logger.warn(
        'MTProto not authenticated — contacts queued but not resolved',
      );
      return {
        total: contacts.length,
        resolved: 0,
        skipped,
        failed: failed + pending,
        results: results.concat(
          importResult.results
            .filter((r) => r.status === 'pending')
            .map((r) => ({
              ...r,
              status: 'failed' as const,
              error: 'MTProto not authenticated. Complete auth first.',
            })),
        ),
      };
    }

    // Second pass: resolve each pending contact with rate limiting
    let delay = 0;
    for (const contact of contacts) {
      const phone = this.normalizePhone(contact.phone_number);
      const existing = results.find((r) => r.phone_number === phone);

      if (existing && existing.status === 'skipped') continue;
      if (existing && existing.status === 'failed') continue;

      await this.sleep(delay);
      delay = RESOLVE_DELAY_MS;

      try {
        const resolvedUser =
          await this.mtprotoService.resolvePhoneToUserId(phone);

        if (!resolvedUser) {
          // User not found on Telegram — save what we have from JSON
          await this.contactsService.upsertTelegramUser({
            phoneNumber: phone,
            displayName: this.buildDisplayName(contact),
          });
          results.push({
            phone_number: phone,
            displayName: this.buildDisplayName(contact),
            status: 'failed',
            error: 'User not found on Telegram',
          });
          failed++;
        } else {
          await this.contactsService.upsertTelegramUser({
            phoneNumber: phone,
            externalId: resolvedUser.userId,
            username: resolvedUser.username,
            displayName: this.buildDisplayName(contact, resolvedUser),
          });
          results.push({
            phone_number: phone,
            externalId: resolvedUser.userId,
            username: resolvedUser.username,
            displayName: this.buildDisplayName(contact, resolvedUser),
            status: 'resolved',
          });
          resolved++;
          this.logger.log(
            `Resolved ${phone} → ${resolvedUser.userId} (@${resolvedUser.username || 'no username'})`,
          );
        }
      } catch (error: unknown) {
        const errorMessage = getResolverErrorMessage(error);
        this.logger.error(`Failed to resolve ${phone}: ${errorMessage}`);
        results.push({
          phone_number: phone,
          displayName: this.buildDisplayName(contact),
          status: 'failed',
          error: errorMessage,
        });
        failed++;
      }
    }

    return {
      total: contacts.length,
      resolved,
      skipped,
      failed,
      results,
    };
  }

  private normalizePhone(phone: string): string {
    let p = phone.replace(/\s/g, '').replace(/^0/, '');
    if (!p.startsWith('+')) {
      p = '+' + p;
    }
    return p;
  }

  private buildDisplayName(
    contact: ContactInput,
    resolved?: ResolvedUser,
  ): string {
    const parts: string[] = [];
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    if (parts.length > 0) return parts.join(' ');
    if (resolved?.firstName) return resolved.firstName;
    return contact.phone_number;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
