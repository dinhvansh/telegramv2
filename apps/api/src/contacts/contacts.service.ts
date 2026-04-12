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
    let p = phone.replace(/\s/g, '').replace(/^0/, '');
    if (!p.startsWith('+')) {
      p = '+' + p;
    }
    return p;
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

  async findExistingResolvedUserByPhone(phoneNumber: string) {
    return this.prisma.telegramUser.findFirst({
      where: { phoneNumber },
    });
  }

  async upsertTelegramUser(data: {
    phoneNumber?: string;
    externalId?: string;
    username?: string;
    displayName?: string;
  }): Promise<void> {
    const identity =
      data.externalId ||
      (data.phoneNumber ? `temp_${data.phoneNumber}` : undefined);

    if (!identity) {
      this.logger.warn('Skip upsertTelegramUser because identity is missing');
      return;
    }

    const initials = this.getInitials(
      data.displayName || data.username || data.phoneNumber || identity,
    );

    await this.prisma.telegramUser.upsert({
      where: { externalId: identity },
      update: {
        ...(data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
        ...(data.username ? { username: data.username } : {}),
        ...(data.displayName ? { displayName: data.displayName } : {}),
        lastSeenAt: new Date(),
      },
      create: {
        externalId: identity,
        phoneNumber: data.phoneNumber || null,
        username: data.username || null,
        displayName:
          data.displayName || data.username || data.phoneNumber || identity,
        avatarInitials: initials,
      },
    });
  }

  async createImportBatch(input: CreateBatchInput) {
    const contactItems = input.contacts.map((contact) => ({
      kind: 'CONTACT' as ContactImportItemKindValue,
      status: 'PENDING' as ContactImportItemStatusValue,
      phoneNumber: contact.phone_number || null,
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
      items: items.map((item) => ({
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
      })),
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
      items: batch.items.map((item) => ({
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
      })),
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
    telegramExternalId?: string | null;
    telegramUsername?: string | null;
    displayName?: string | null;
    errorMessage?: string | null;
  }) {
    const countField =
      args.status === 'RESOLVED'
        ? 'resolvedCount'
        : args.status === 'SKIPPED'
          ? 'skippedCount'
          : 'failedCount';

    await this.prisma.$transaction([
      this.prisma.contactImportItem.update({
        where: { id: args.itemId },
        data: {
          status: args.status,
          telegramExternalId: args.telegramExternalId ?? undefined,
          telegramUsername: args.telegramUsername ?? undefined,
          displayName: args.displayName ?? undefined,
          errorMessage: args.errorMessage ?? undefined,
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
