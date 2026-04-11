import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ContactInput {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  date?: string;
}

export interface ResolvedContact {
  phone_number: string;
  externalId?: string;
  username?: string;
  displayName?: string;
  status: 'resolved' | 'skipped' | 'failed' | 'pending';
  error?: string;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importContacts(contacts: ContactInput[]): Promise<{
    total: number;
    resolved: number;
    skipped: number;
    failed: number;
    results: ResolvedContact[];
  }> {
    const results: ResolvedContact[] = [];
    const resolved = 0;
    let skipped = 0;
    let failed = 0;

    for (const contact of contacts) {
      const phone = this.normalizePhone(contact.phone_number);
      if (!phone) {
        results.push({
          phone_number: contact.phone_number,
          status: 'failed',
          error: 'Invalid phone number',
        });
        failed++;
        continue;
      }

      const existing = await this.prisma.telegramUser.findFirst({
        where: { phoneNumber: phone },
      });

      if (existing?.externalId && !existing.externalId.startsWith('-')) {
        results.push({
          phone_number: phone,
          externalId: existing.externalId,
          username: existing.username || undefined,
          displayName: existing.displayName,
          status: 'skipped',
        });
        skipped++;
        continue;
      }

      results.push({ phone_number: phone, status: 'pending' });
    }

    return {
      total: contacts.length,
      resolved,
      skipped,
      failed,
      results,
    };
  }

  async upsertTelegramUser(data: {
    phoneNumber: string;
    externalId?: string;
    username?: string;
    displayName?: string;
  }): Promise<void> {
    const initials = this.getInitials(
      data.displayName || data.username || data.phoneNumber,
    );

    await this.prisma.telegramUser.upsert({
      where: { externalId: data.externalId || `temp_${data.phoneNumber}` },
      update: {
        phoneNumber: data.phoneNumber,
        ...(data.username && { username: data.username }),
        ...(data.displayName && { displayName: data.displayName }),
        lastSeenAt: new Date(),
      },
      create: {
        externalId: data.externalId || `temp_${data.phoneNumber}`,
        phoneNumber: data.phoneNumber,
        username: data.username || null,
        displayName: data.displayName || data.username || data.phoneNumber,
        avatarInitials: initials,
      },
    });
  }

  private normalizePhone(phone: string): string {
    let p = phone.replace(/\s/g, '').replace(/^0/, '');
    if (!p.startsWith('+')) {
      p = '+' + p;
    }
    return p;
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
