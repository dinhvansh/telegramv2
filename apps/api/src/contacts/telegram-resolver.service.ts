import { Injectable, Logger } from '@nestjs/common';
import { MtprotoService } from '../telegram-mtproto/mtproto.service';
import { ContactsService, ResolvedContact } from './contacts.service';
import { ContactInput } from './import-payload';

const RESOLVE_MIN_DELAY_MS = Number.parseInt(
  process.env.CONTACT_RESOLVE_MIN_DELAY_MS ?? '4000',
  10,
);
const RESOLVE_MAX_DELAY_MS = Number.parseInt(
  process.env.CONTACT_RESOLVE_MAX_DELAY_MS ?? '7000',
  10,
);
const RESOLVE_BATCH_SIZE = Number.parseInt(
  process.env.CONTACT_RESOLVE_BATCH_SIZE ?? '20',
  10,
);
const RESOLVE_BATCH_COOLDOWN_MS = Number.parseInt(
  process.env.CONTACT_RESOLVE_BATCH_COOLDOWN_MS ?? '60000',
  10,
);

function getResolverErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown resolve error';
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

    const isAuth = await this.mtprotoService.isAuthenticated();
    if (!isAuth) {
      return {
        total: contacts.length,
        resolved: 0,
        skipped: 0,
        failed: contacts.length,
        results: contacts.map((contact) => ({
          phone_number: contact.phone_number,
          displayName: this.contactsService.buildDisplayName(contact),
          status: 'failed' as const,
          error: 'MTProto not authenticated. Complete auth first.',
        })),
      };
    }

    let processedPendingCount = 0;
    for (const contact of contacts) {
      const phone = this.contactsService.normalizePhone(contact.phone_number);
      const existing =
        await this.contactsService.findExistingResolvedUserByPhone(phone);

      if (existing?.externalId && !existing.externalId.startsWith('temp_')) {
        results.push({
          phone_number: phone,
          externalId: existing.externalId,
          username: existing.username || undefined,
          displayName: existing.displayName || undefined,
          status: 'skipped',
        });
        skipped++;
        continue;
      }

      if (processedPendingCount > 0) {
        await this.sleep(this.getRandomDelayMs());
      }

      if (
        processedPendingCount > 0 &&
        processedPendingCount % RESOLVE_BATCH_SIZE === 0
      ) {
        this.logger.warn(
          `Resolve cooldown after ${processedPendingCount} contacts. Waiting ${RESOLVE_BATCH_COOLDOWN_MS}ms before continuing.`,
        );
        await this.sleep(RESOLVE_BATCH_COOLDOWN_MS);
      }

      try {
        const resolvedUser = await this.mtprotoService.resolvePhoneToUserId(
          phone,
          {
            firstName: contact.first_name,
            lastName: contact.last_name,
          },
        );

        if (!resolvedUser) {
          await this.contactsService.upsertTelegramUser({
            phoneNumber: phone,
            displayName: this.contactsService.buildDisplayName(contact),
          });
          results.push({
            phone_number: phone,
            displayName: this.contactsService.buildDisplayName(contact),
            status: 'failed',
            error: 'User not found on Telegram',
          });
          failed++;
        } else {
          const resolvedPhone = this.contactsService.normalizePhone(
            resolvedUser.phone || phone,
          );
          const displayName = this.contactsService.buildTelegramDisplayName(
            {
              firstName: resolvedUser.firstName,
              lastName: resolvedUser.lastName,
              username: resolvedUser.username,
            },
            contact,
          );
          await this.contactsService.upsertTelegramUser({
            phoneNumber: resolvedPhone,
            externalId: resolvedUser.userId,
            username: resolvedUser.username,
            displayName,
          });
          results.push({
            phone_number: resolvedPhone,
            externalId: resolvedUser.userId,
            username: resolvedUser.username,
            displayName,
            status: 'resolved',
          });
          resolved++;
        }
      } catch (error: unknown) {
        const errorMessage = getResolverErrorMessage(error);
        this.logger.error(`Failed to resolve ${phone}: ${errorMessage}`);
        results.push({
          phone_number: phone,
          displayName: this.contactsService.buildDisplayName(contact),
          status: 'failed',
          error: errorMessage,
        });
        failed++;
      }

      processedPendingCount++;
    }

    return {
      total: contacts.length,
      resolved,
      skipped,
      failed,
      results,
    };
  }
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRandomDelayMs() {
    const safeMin = Math.max(1000, RESOLVE_MIN_DELAY_MS);
    const safeMax = Math.max(safeMin, RESOLVE_MAX_DELAY_MS);

    return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
  }
}
