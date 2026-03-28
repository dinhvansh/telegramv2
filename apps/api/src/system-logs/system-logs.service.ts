/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type LogInput = {
  level?: 'INFO' | 'WARN' | 'ERROR';
  scope: string;
  action: string;
  message: string;
  detail?: string | null;
  payload?: unknown;
};

@Injectable()
export class SystemLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogInput) {
    if (!process.env.DATABASE_URL) {
      return {
        persisted: false,
        createdAt: new Date().toISOString(),
      };
    }

    const created = await (this.prisma as any).systemLog.create({
      data: {
        level: input.level || 'INFO',
        scope: input.scope,
        action: input.action,
        message: input.message,
        detail: input.detail || null,
        payload:
          input.payload === undefined
            ? undefined
            : (input.payload as object | string | number | boolean | null),
      },
    });

    return {
      persisted: true,
      id: created.id,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async findRecent(input?: {
    limit?: number;
    scope?: string;
    level?: 'INFO' | 'WARN' | 'ERROR';
  }) {
    if (!process.env.DATABASE_URL) {
      return [];
    }

    const limit = Math.max(1, Math.min(500, Number(input?.limit || 100)));
    const items = await (this.prisma as any).systemLog.findMany({
      where: {
        ...(input?.scope ? { scope: input.scope } : {}),
        ...(input?.level ? { level: input.level } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return items.map((item: any) => ({
      id: item.id,
      level: item.level,
      scope: item.scope,
      action: item.action,
      message: item.message,
      detail: item.detail,
      payload: item.payload,
      createdAt: item.createdAt.toISOString(),
    }));
  }
}
