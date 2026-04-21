import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../node_modules/.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ContactInput, FrequentContactInput } from './import-payload';

export interface ResolvedContact {
  phone_number: string;
  externalId?: string;
  username?: string;
  displayName?: string;
  status: 'resolved' | 'skipped' | 'failed' | 'pending';
  error?: string;
}

type ContactImportBatchStatusValue =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

type ContactImportItemStatusValue =
  | 'PENDING'
  | 'PROCESSING'
  | 'RESOLVED'
  | 'SKIPPED'
  | 'FAILED';

type ContactImportItemKindValue = 'CONTACT' | 'FREQUENT';

type CreateBatchInput = {
  workspaceId?: string;
  createdByUserId?: string;
  sourceFileName?: string;
  contacts: ContactInput[];
  frequentContacts: FrequentContactInput[];
};

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  normalizePhone(phone: string): string {
    const raw = String(phone ?? '').trim();
    if (!raw) {
      return '';
    }

    let sanitized = raw.startsWith('+')
      ? `+${raw.slice(1).replace(/\D/g, '')}`
      : raw.replace(/\D/g, '');

    if (sanitized.startsWith('00')) {
      sanitized = `+${sanitized.slice(2)}`;
    }

    if (sanitized.startsWith('+')) {
      return sanitized;
    }

    if (sanitized.startsWith('0') && sanitized.length >= 9) {
      return `+84${sanitized.slice(1)}`;
    }

    if (sanitized.startsWith('84') && sanitized.length >= 10) {
      return `+${sanitized}`;
    }

    return sanitized ? `+${sanitized}` : '';
  }

  buildTelegramDisplayName(
    telegramUser?: {
      firstName?: string | null;
      lastName?: string | null;
      username?: string | null;
    },
    fallbackContact?: ContactInput,
  ): string {
    const telegramName = [
      telegramUser?.firstName?.trim(),
      telegramUser?.lastName?.trim(),
    ]
      .filter((part): part is string => Boolean(part))
      .join(' ')
      .trim();

    if (telegramName) {
      return telegramName;
    }

    if (telegramUser?.username?.trim()) {
      return telegramUser.username.trim();
    }

    if (fallbackContact) {
      return this.buildDisplayName(fallbackContact);
    }

    return 'Telegram user';
  }

  buildDisplayName(
    contact: ContactInput,
    fallback?: { firstName?: string; username?: string },
  ): string {
    const parts: string[] = [];
    if (contact.first_name) parts.push(contact.first_name);
    if (contact.last_name) parts.push(contact.last_name);
    if (parts.length > 0) return parts.join(' ');
    if (fallback?.firstName) return fallback.firstName;
    if (fallback?.username) return fallback.username;
    return contact.phone_number;
  }

  async findExistingResolvedUserByPhone(
    phoneNumber: string,
    workspaceId?: string,
  ) {
    if (workspaceId) {
      const workspaceMeta =
        await this.prisma.telegramUserWorkspaceMeta.findFirst({
          where: {
            workspaceId,
            phoneNumber,
            telegramUser: {
              externalId: {
                not: {
                  startsWith: 'temp_',
                },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            telegramUser: {
              select: {
                externalId: true,
                username: true,
                displayName: true,
              },
            },
          },
        });

      if (workspaceMeta?.telegramUser?.externalId) {
        return {
          externalId: workspaceMeta.telegramUser.externalId,
          username: workspaceMeta.telegramUser.username,
          displayName: workspaceMeta.telegramUser.displayName,
        };
      }
    }

    const item = await this.prisma.contactImportItem.findFirst({
      where: {
        phoneNumber,
        telegramExternalId: { not: null },
        status: {
          in: ['RESOLVED', 'SKIPPED'] as ContactImportItemStatusValue[],
        },
        ...(workspaceId !== undefined
          ? {
              batch: {
                workspaceId,
              },
            }
          : {}),
      },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        telegramExternalId: true,
        telegramUsername: true,
        displayName: true,
      },
    });

    if (!item?.telegramExternalId) {
      return null;
    }

    return {
      externalId: item.telegramExternalId,
      username: item.telegramUsername,
      displayName: item.displayName,
    };
  }

  async upsertTelegramUser(data: {
    phoneNumber?: string;
    externalId?: string;
    username?: string;
    displayName?: string;
  }): Promise<{ id: string; externalId: string }> {
    const identity =
      data.externalId ||
      (data.phoneNumber ? `temp_${data.phoneNumber}` : undefined);

    if (!identity) {
      this.logger.warn('Skip upsertTelegramUser because identity is missing');
      throw new Error('Skip upsertTelegramUser because identity is missing');
    }

    const initials = this.getInitials(
      data.displayName || data.username || data.phoneNumber || identity,
    );

    const telegramUser = await this.prisma.telegramUser.upsert({
      where: { externalId: identity },
      update: {
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        lastSeenAt: new Date(),
      },
      create: {
        externalId: identity,
        username: data.username || null,
        displayName:
          data.displayName || data.username || data.phoneNumber || identity,
        avatarInitials: initials,
      },
    });

    return {
      id: telegramUser.id,
      externalId: telegramUser.externalId,
    };
  }

  async upsertTelegramUserWorkspaceMeta(data: {
    telegramUserId: string;
    workspaceId?: string;
    phoneNumber?: string | null;
    customerSource?: string | null;
    ownerName?: string | null;
    note?: string | null;
  }): Promise<void> {
    if (!data.workspaceId) {
      return;
    }

    await this.prisma.telegramUserWorkspaceMeta.upsert({
      where: {
        telegramUserId_workspaceId: {
          telegramUserId: data.telegramUserId,
          workspaceId: data.workspaceId,
        },
      },
      update: {
        ...(data.phoneNumber !== undefined ? { phoneNumber: data.phoneNumber } : {}),
        ...(data.customerSource !== undefined ? { customerSource: data.customerSource } : {}),
        ...(data.ownerName !== undefined ? { ownerName: data.ownerName } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
      },
      create: {
        telegramUserId: data.telegramUserId,
        workspaceId: data.workspaceId,
        phoneNumber: data.phoneNumber ?? null,
        customerSource: data.customerSource ?? null,
        ownerName: data.ownerName ?? null,
        note: data.note ?? null,
      },
    });
  }

  async createImportBatch(input: CreateBatchInput) {
    const contactItems = input.contacts.map((contact) => ({
      kind: 'CONTACT' as ContactImportItemKindValue,
      status: 'PENDING' as ContactImportItemStatusValue,
      phoneNumber: this.normalizePhone(contact.phone_number) || null,
      firstName: contact.first_name || null,
      lastName: contact.last_name || null,
      displayName: this.buildDisplayName(contact),
      rawPayload: contact as unknown as Prisma.InputJsonValue,
    }));

    const frequentItems = input.frequentContacts.map((entry) => ({
      kind: 'FREQUENT' as ContactImportItemKindValue,
      status: 'PENDING' as ContactImportItemStatusValue,
      telegramExternalId:
        entry.id === undefined || entry.id === null ? null : String(entry.id),
      telegramType: entry.type || entry.category || null,
      displayName: entry.name || null,
      rating: typeof entry.rating === 'number' ? entry.rating : null,
      rawPayload: entry as unknown as Prisma.InputJsonValue,
    }));

    const batch = await this.prisma.contactImportBatch.create({
      data: {
        workspaceId: input.workspaceId || null,
        createdByUserId: input.createdByUserId || null,
        sourceFileName: input.sourceFileName || null,
        totalCount: contactItems.length + frequentItems.length,
        contactsCount: contactItems.length,
        frequentCount: frequentItems.length,
        items: {
          create: [...contactItems, ...frequentItems],
        },
      },
      include: {
        workspace: true,
        createdByUser: true,
      },
    });

    return this.serializeBatch(batch);
  }

  async listImportBatches(args: {
    workspaceIds: string[];
    canManageOrganization: boolean;
  }) {
    const where = this.buildBatchAccessWhere(args);

    const batches = await this.prisma.contactImportBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        workspace: true,
        createdByUser: true,
      },
    });

    return batches.map((batch) => this.serializeBatch(batch));
  }

  async getImportBatch(
    batchId: string,
    args: { workspaceIds: string[]; canManageOrganization: boolean },
  ) {
    const batch = await this.prisma.contactImportBatch.findFirst({
      where: {
        id: batchId,
        ...this.buildBatchAccessWhere(args),
      },
      include: {
        workspace: true,
        createdByUser: true,
      },
    });

    if (!batch) {
      return null;
    }

    return this.serializeBatch(batch);
  }

  async getImportBatchItems(
    batchId: string,
    args: {
      workspaceIds: string[];
      canManageOrganization: boolean;
      page: number;
      pageSize: number;
    },
  ) {
    const batch = await this.prisma.contactImportBatch.findFirst({
      where: {
        id: batchId,
        ...this.buildBatchAccessWhere(args),
      },
      select: { id: true },
    });

    if (!batch) {
      return null;
    }

    const safePage = Math.max(1, args.page);
    const safePageSize = Math.min(100, Math.max(1, args.pageSize));
    const [total, items] = await this.prisma.$transaction([
      this.prisma.contactImportItem.count({ where: { batchId } }),
      this.prisma.contactImportItem.findMany({
        where: { batchId },
        orderBy: { createdAt: 'asc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
    ]);

    return {
      items: items.map((item) => this.serializeBatchItem(item)),
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  }

  async exportImportBatch(
    batchId: string,
    args: { workspaceIds: string[]; canManageOrganization: boolean },
  ) {
    const batch = await this.prisma.contactImportBatch.findFirst({
      where: {
        id: batchId,
        ...this.buildBatchAccessWhere(args),
      },
      include: {
        workspace: true,
        createdByUser: true,
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!batch) {
      return null;
    }

    return {
      batch: this.serializeBatch(batch),
      items: batch.items.map((item) => this.serializeBatchItem(item)),
    };
  }

  async cancelImportBatch(
    batchId: string,
    args: { workspaceIds: string[]; canManageOrganization: boolean },
  ) {
    const batch = await this.getAuthorizedBatchForMutation(batchId, args);
    if (!batch) {
      return null;
    }

    if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
      return this.serializeBatch(batch);
    }

    const pendingCount = await this.prisma.contactImportItem.count({
      where: {
        batchId,
        status: {
          in: ['PENDING', 'PROCESSING'] as ContactImportItemStatusValue[],
        },
      },
    });

    await this.prisma.$transaction([
      this.prisma.contactImportItem.updateMany({
        where: {
          batchId,
          status: {
            in: ['PENDING', 'PROCESSING'] as ContactImportItemStatusValue[],
          },
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Batch cancelled by user',
          processedAt: new Date(),
        },
      }),
      this.prisma.contactImportBatch.update({
        where: { id: batchId },
        data: {
          status: 'CANCELLED',
          errorMessage: 'Batch cancelled by user',
          processedCount: { increment: pendingCount },
          failedCount: { increment: pendingCount },
          finishedAt: new Date(),
        },
      }),
    ]);

    return this.getImportBatch(batchId, args);
  }

  async retryFailedItems(
    batchId: string,
    args: { workspaceIds: string[]; canManageOrganization: boolean },
  ) {
    const batch = await this.getAuthorizedBatchForMutation(batchId, args);
    if (!batch) {
      return null;
    }

    const failedItems = await this.prisma.contactImportItem.findMany({
      where: {
        batchId,
        status: 'FAILED',
      },
      select: { id: true },
    });

    if (failedItems.length === 0) {
      return this.getImportBatch(batchId, args);
    }

    await this.prisma.$transaction([
      this.prisma.contactImportItem.updateMany({
        where: {
          id: { in: failedItems.map((item) => item.id) },
        },
        data: {
          status: 'PENDING',
          errorMessage: null,
          processedAt: null,
        },
      }),
      this.prisma.contactImportBatch.update({
        where: { id: batchId },
        data: {
          status: 'QUEUED',
          errorMessage: null,
          finishedAt: null,
          failedCount: { decrement: failedItems.length },
          processedCount: { decrement: failedItems.length },
        },
      }),
    ]);

    return this.getImportBatch(batchId, args);
  }

  async getNextBatchToProcess() {
    return this.prisma.contactImportBatch.findFirst({
      where: {
        status: {
          in: ['QUEUED', 'PROCESSING'] as ContactImportBatchStatusValue[],
        },
      },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async markBatchProcessing(batchId: string) {
    return this.prisma.contactImportBatch.update({
      where: { id: batchId },
      data: {
        status: 'PROCESSING' as ContactImportBatchStatusValue,
        startedAt: new Date(),
      },
    });
  }

  async markBatchFailed(batchId: string, errorMessage: string) {
    return this.prisma.contactImportBatch.update({
      where: { id: batchId },
      data: {
        status: 'FAILED' as ContactImportBatchStatusValue,
        errorMessage,
        finishedAt: new Date(),
      },
    });
  }

  async completeBatchIfDone(batchId: string) {
    const pending = await this.prisma.contactImportItem.count({
      where: {
        batchId,
        status: {
          in: ['PENDING', 'PROCESSING'] as ContactImportItemStatusValue[],
        },
      },
    });

    if (pending > 0) {
      return false;
    }

    await this.prisma.contactImportBatch.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED' as ContactImportBatchStatusValue,
        finishedAt: new Date(),
      },
    });
    return true;
  }

  async getPendingItems(batchId: string, limit: number) {
    return this.prisma.contactImportItem.findMany({
      where: {
        batchId,
        status: 'PENDING' as ContactImportItemStatusValue,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async getBatchStatus(batchId: string) {
    const batch = await this.prisma.contactImportBatch.findUnique({
      where: { id: batchId },
      select: { status: true },
    });

    return batch?.status ?? null;
  }

  async markItemProcessing(itemId: string) {
    return this.prisma.contactImportItem.update({
      where: { id: itemId },
      data: {
        status: 'PROCESSING' as ContactImportItemStatusValue,
        attemptCount: { increment: 1 },
      },
    });
  }

  async markItemResult(args: {
    itemId: string;
    batchId: string;
    status: ContactImportItemStatusValue;
    phoneNumber?: string | null;
    telegramExternalId?: string | null;
    telegramUsername?: string | null;
    displayName?: string | null;
    errorMessage?: string | null;
    debugRequest?: Prisma.InputJsonValue | null;
    debugResponse?: Prisma.InputJsonValue | null;
  }) {
    const countField =
      args.status === 'RESOLVED'
        ? 'resolvedCount'
        : args.status === 'SKIPPED'
          ? 'skippedCount'
          : 'failedCount';
    const currentItem = await this.prisma.contactImportItem.findUnique({
      where: { id: args.itemId },
      select: { rawPayload: true },
    });

    const existingRawPayload =
      currentItem?.rawPayload &&
      typeof currentItem.rawPayload === 'object' &&
      !Array.isArray(currentItem.rawPayload)
        ? { ...currentItem.rawPayload }
        : currentItem?.rawPayload !== undefined
          ? {
              source:
                (currentItem.rawPayload as Prisma.InputJsonValue | null) ??
                null,
            }
          : {};

    const nextRawPayload: Prisma.InputJsonValue = {
      ...existingRawPayload,
      __debug: {
        request: args.debugRequest ?? null,
        response: args.debugResponse ?? null,
      },
    };

    await this.prisma.$transaction([
      this.prisma.contactImportItem.update({
        where: { id: args.itemId },
        data: {
          status: args.status,
          phoneNumber: args.phoneNumber ?? undefined,
          telegramExternalId: args.telegramExternalId ?? undefined,
          telegramUsername: args.telegramUsername ?? undefined,
          displayName: args.displayName ?? undefined,
          errorMessage: args.errorMessage ?? undefined,
          rawPayload: nextRawPayload,
          processedAt: new Date(),
        },
      }),
      this.prisma.contactImportBatch.update({
        where: { id: args.batchId },
        data: {
          processedCount: { increment: 1 },
          [countField]: { increment: 1 },
        },
      }),
    ]);
  }

  private serializeBatch(batch: {
    id: string;
    workspaceId: string | null;
    createdByUserId: string | null;
    sourceType: string;
    sourceFileName: string | null;
    status: ContactImportBatchStatusValue;
    totalCount: number;
    contactsCount: number;
    frequentCount: number;
    processedCount: number;
    resolvedCount: number;
    skippedCount: number;
    failedCount: number;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    workspace?: { id: string; name: string; slug: string } | null;
    createdByUser?: { id: string; name: string; email: string } | null;
  }) {
    return {
      id: batch.id,
      workspaceId: batch.workspaceId,
      workspaceName: batch.workspace?.name ?? null,
      createdByUserId: batch.createdByUserId,
      createdByName: batch.createdByUser?.name ?? null,
      sourceType: batch.sourceType,
      sourceFileName: batch.sourceFileName,
      status: batch.status,
      totalCount: batch.totalCount,
      contactsCount: batch.contactsCount,
      frequentCount: batch.frequentCount,
      processedCount: batch.processedCount,
      resolvedCount: batch.resolvedCount,
      skippedCount: batch.skippedCount,
      failedCount: batch.failedCount,
      errorMessage: batch.errorMessage,
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }

  private serializeBatchItem(item: {
    id: string;
    kind: ContactImportItemKindValue;
    status: ContactImportItemStatusValue;
    phoneNumber: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    telegramExternalId: string | null;
    telegramUsername: string | null;
    telegramType: string | null;
    rating: number | null;
    errorMessage: string | null;
    attemptCount: number;
    processedAt: Date | null;
    createdAt: Date;
    rawPayload?: Prisma.JsonValue | null;
  }) {
    const debugPayload =
      item.rawPayload &&
      typeof item.rawPayload === 'object' &&
      !Array.isArray(item.rawPayload) &&
      '__debug' in item.rawPayload
        ? item.rawPayload.__debug
        : null;
    const debugRequest =
      debugPayload &&
      typeof debugPayload === 'object' &&
      !Array.isArray(debugPayload) &&
      'request' in debugPayload
        ? debugPayload.request
        : null;
    const debugResponse =
      debugPayload &&
      typeof debugPayload === 'object' &&
      !Array.isArray(debugPayload) &&
      'response' in debugPayload
        ? debugPayload.response
        : null;

    return {
      id: item.id,
      kind: item.kind,
      status: item.status,
      phoneNumber: item.phoneNumber,
      firstName: item.firstName,
      lastName: item.lastName,
      displayName: item.displayName,
      telegramExternalId: item.telegramExternalId,
      telegramUsername: item.telegramUsername,
      telegramType: item.telegramType,
      rating: item.rating,
      errorMessage: item.errorMessage,
      attemptCount: item.attemptCount,
      processedAt: item.processedAt,
      createdAt: item.createdAt,
      debugRequest: debugRequest ?? {
        kind: item.kind,
        phoneNumber: item.phoneNumber,
        firstName: item.firstName,
        lastName: item.lastName,
        displayName: item.displayName,
        rawPayload: item.rawPayload ?? null,
      },
      debugResponse: debugResponse ?? {
        status: item.status,
        telegramExternalId: item.telegramExternalId,
        telegramUsername: item.telegramUsername,
        telegramType: item.telegramType,
        rating: item.rating,
        errorMessage: item.errorMessage,
        attemptCount: item.attemptCount,
        processedAt: item.processedAt,
      },
    };
  }

  private buildBatchAccessWhere(args: {
    workspaceIds: string[];
    canManageOrganization: boolean;
  }) {
    if (args.canManageOrganization) {
      return {};
    }

    if (args.workspaceIds.length > 0) {
      return { workspaceId: { in: args.workspaceIds } };
    }

    return { workspaceId: null };
  }

  private async getAuthorizedBatchForMutation(
    batchId: string,
    args: { workspaceIds: string[]; canManageOrganization: boolean },
  ) {
    return this.prisma.contactImportBatch.findFirst({
      where: {
        id: batchId,
        ...this.buildBatchAccessWhere(args),
      },
      include: {
        workspace: true,
        createdByUser: true,
      },
    });
  }

  private getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (
        parts[0][0]?.toUpperCase() + parts[parts.length - 1][0]?.toUpperCase()
      );
    }
    return name.substring(0, 2).toUpperCase();
  }
}
