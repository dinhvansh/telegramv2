import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Prisma } from '../../node_modules/.prisma/client';
import { MtprotoService } from '../telegram-mtproto/mtproto.service';
import { ContactsService } from './contacts.service';
import type { ContactInput } from './import-payload';

const WORKER_INTERVAL_MS = Number.parseInt(
  process.env.CONTACT_IMPORT_WORKER_INTERVAL_MS ?? '15000',
  10,
);
const WORKER_MAX_ITEMS_PER_RUN = Number.parseInt(
  process.env.CONTACT_IMPORT_WORKER_MAX_ITEMS_PER_RUN ??
    process.env.CONTACT_RESOLVE_BATCH_SIZE ??
    '20',
  10,
);
const RESOLVE_MIN_DELAY_MS = Number.parseInt(
  process.env.CONTACT_RESOLVE_MIN_DELAY_MS ?? '4000',
  10,
);
const RESOLVE_MAX_DELAY_MS = Number.parseInt(
  process.env.CONTACT_RESOLVE_MAX_DELAY_MS ?? '7000',
  10,
);
const RESOLVE_BATCH_COOLDOWN_MS = Number.parseInt(
  process.env.CONTACT_RESOLVE_BATCH_COOLDOWN_MS ?? '60000',
  10,
);

@Injectable()
export class ContactImportProcessorService {
  private readonly logger = new Logger(ContactImportProcessorService.name);
  private isRunning = false;

  constructor(
    private readonly contactsService: ContactsService,
    private readonly mtprotoService: MtprotoService,
  ) {}

  @Interval(WORKER_INTERVAL_MS)
  async processQueue() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      await this.processNextBatch();
    } finally {
      this.isRunning = false;
    }
  }

  private async processNextBatch() {
    const batch = await this.contactsService.getNextBatchToProcess();
    if (!batch) {
      return;
    }

    if (batch.status !== 'PROCESSING') {
      await this.contactsService.markBatchProcessing(batch.id);
    }

    const items = await this.contactsService.getPendingItems(
      batch.id,
      Math.max(1, WORKER_MAX_ITEMS_PER_RUN),
    );

    if (items.length === 0) {
      await this.contactsService.completeBatchIfDone(batch.id);
      return;
    }

    const requiresMtproto = items.some(
      (item: { kind: string }) => item.kind === 'CONTACT',
    );

    if (requiresMtproto) {
      const authenticated = await this.mtprotoService.isAuthenticated();
      if (!authenticated) {
        await this.contactsService.markBatchFailed(
          batch.id,
          'MTProto not authenticated. Reconnect your Telegram session in /contacts and retry this batch.',
        );
        return;
      }
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const batchStatus = await this.contactsService.getBatchStatus(batch.id);
      if (batchStatus === 'CANCELLED' || batchStatus === 'FAILED') {
        this.logger.warn(
          `Stop processing batch ${batch.id} because status is ${batchStatus}.`,
        );
        return;
      }

      await this.contactsService.markItemProcessing(item.id);

      try {
        if (item.kind === 'FREQUENT') {
          await this.processFrequentItem(batch.id, item);
        } else {
          await this.processContactItem(
            batch.id,
            batch.workspaceId ?? undefined,
            batch.createdByUser?.name ?? null,
            item,
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown import error';

        this.logger.error(
          `Failed to process contact import item ${item.id}: ${errorMessage}`,
        );

        await this.contactsService.markItemResult({
          itemId: item.id,
          batchId: batch.id,
          status: 'FAILED',
          displayName: item.displayName,
          errorMessage,
        });

        if (
          errorMessage.includes('requires the account 2FA password') ||
          errorMessage.includes('AUTH_KEY_UNREGISTERED') ||
          errorMessage.includes('MTProto session not found') ||
          errorMessage.includes('Telegram session is no longer valid')
        ) {
          await this.contactsService.markBatchFailed(batch.id, errorMessage);
          return;
        }
      }

      if (index < items.length - 1) {
        await this.sleep(this.getRandomDelayMs());
      }
    }

    if (items.length >= WORKER_MAX_ITEMS_PER_RUN) {
      this.logger.warn(
        `Contact import cooldown after ${items.length} items. Waiting ${RESOLVE_BATCH_COOLDOWN_MS}ms before next loop.`,
      );
      await this.sleep(RESOLVE_BATCH_COOLDOWN_MS);
    }

    await this.contactsService.completeBatchIfDone(batch.id);
  }

  private async processFrequentItem(
    batchId: string,
    item: {
      id: string;
      telegramExternalId: string | null;
      displayName: string | null;
      telegramType: string | null;
    },
  ) {
    if (!item.telegramExternalId) {
      await this.contactsService.markItemResult({
        itemId: item.id,
        batchId,
        status: 'FAILED',
        displayName: item.displayName,
        errorMessage: 'Missing Telegram ID in frequent contact entry',
      });
      return;
    }

    await this.contactsService.upsertTelegramUser({
      externalId: item.telegramExternalId,
      displayName: item.displayName || `Telegram ${item.telegramExternalId}`,
    });

    await this.contactsService.markItemResult({
      itemId: item.id,
      batchId,
      status: 'RESOLVED',
      telegramExternalId: item.telegramExternalId,
      displayName: item.displayName,
    });
  }

  private async processContactItem(
    batchId: string,
    workspaceId: string | undefined,
    ownerName: string | null,
    item: {
      id: string;
      phoneNumber: string | null;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
    },
  ) {
    if (!item.phoneNumber) {
      await this.contactsService.markItemResult({
        itemId: item.id,
        batchId,
        status: 'FAILED',
        phoneNumber: null,
        displayName: item.displayName,
        errorMessage: 'Missing phone number',
      });
      return;
    }

    const phone = this.contactsService.normalizePhone(item.phoneNumber);
    const existing = await this.contactsService.findExistingResolvedUserByPhone(
      phone,
      workspaceId,
    );

    if (existing?.externalId && !existing.externalId.startsWith('temp_')) {
      const resolveResult =
        await this.mtprotoService.resolvePhoneToUserIdWithDebug(phone, {
          firstName: item.firstName,
          lastName: item.lastName,
        });
      const resolvedUser = resolveResult.user;

      const displayName = resolvedUser
        ? this.contactsService.buildTelegramDisplayName(
            {
              firstName: resolvedUser.firstName,
              lastName: resolvedUser.lastName,
              username: resolvedUser.username,
            },
            {
              phone_number: phone,
              first_name: phone,
            },
          )
        : (existing.displayName ?? phone);

      const telegramUser = await this.contactsService.upsertTelegramUser({
        externalId: existing.externalId,
        username: resolvedUser?.username ?? existing.username ?? undefined,
        displayName,
      });

      await this.contactsService.upsertTelegramUserWorkspaceMeta({
        telegramUserId: telegramUser.id,
        workspaceId,
        phoneNumber: phone,
        customerSource: 'Contacts import',
        ownerName,
      });

      await this.contactsService.markItemResult({
        itemId: item.id,
        batchId,
        status: 'SKIPPED',
        phoneNumber: phone,
        telegramExternalId: existing.externalId,
        telegramUsername: resolvedUser?.username ?? existing.username,
        displayName,
        debugRequest:
          resolveResult.debugRequest as unknown as Prisma.InputJsonValue,
        debugResponse:
          resolveResult.debugResponse as unknown as Prisma.InputJsonValue,
      });
      return;
    }

    const fallbackContact: ContactInput = {
      phone_number: phone,
      first_name: item.firstName || undefined,
      last_name: item.lastName || undefined,
    };

    const resolveResult =
      await this.mtprotoService.resolvePhoneToUserIdWithDebug(phone, {
        firstName: fallbackContact.first_name,
        lastName: fallbackContact.last_name,
      });
    const resolvedUser = resolveResult.user;

    if (!resolvedUser) {
      const displayName =
        this.contactsService.buildDisplayName(fallbackContact);

      await this.contactsService.upsertTelegramUser({
        phoneNumber: phone,
        displayName,
      });

      await this.contactsService.markItemResult({
        itemId: item.id,
        batchId,
        status: 'FAILED',
        phoneNumber: phone,
        displayName,
        errorMessage: 'User not found on Telegram',
        debugRequest:
          resolveResult.debugRequest as unknown as Prisma.InputJsonValue,
        debugResponse:
          resolveResult.debugResponse as unknown as Prisma.InputJsonValue,
      });
      return;
    }

    const resolvedPhone = this.contactsService.normalizePhone(
      resolvedUser.phone || phone,
    );
    const displayName = this.contactsService.buildTelegramDisplayName(
      {
        firstName: resolvedUser.firstName,
        lastName: resolvedUser.lastName,
        username: resolvedUser.username,
      },
      fallbackContact,
    );

    const telegramUser = await this.contactsService.upsertTelegramUser({
      phoneNumber: resolvedPhone,
      externalId: resolvedUser.userId,
      username: resolvedUser.username,
      displayName,
    });

    await this.contactsService.upsertTelegramUserWorkspaceMeta({
      telegramUserId: telegramUser.id,
      workspaceId,
      phoneNumber: resolvedPhone,
      customerSource: 'Contacts import',
      ownerName,
    });

    await this.contactsService.markItemResult({
      itemId: item.id,
      batchId,
      status: 'RESOLVED',
      phoneNumber: resolvedPhone,
      telegramExternalId: resolvedUser.userId,
      telegramUsername: resolvedUser.username,
      displayName,
      debugRequest:
        resolveResult.debugRequest as unknown as Prisma.InputJsonValue,
      debugResponse:
        resolveResult.debugResponse as unknown as Prisma.InputJsonValue,
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRandomDelayMs() {
    const safeMin = Math.max(1000, RESOLVE_MIN_DELAY_MS);
    const safeMax = Math.max(safeMin, RESOLVE_MAX_DELAY_MS);

    return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
  }
}
