import { Injectable } from '@nestjs/common';
import { fallbackSnapshot } from '../platform/fallback-snapshot';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSecretValue,
  encryptSecretValue,
  getSecretPlaceholder,
  isMaskedSecretValue,
  maskSecretValue,
} from './settings-security';

type LoadAiModelsInput = {
  baseUrl?: string;
  apiToken?: string;
};

type AiModelRecord = {
  id?: string;
  name?: string;
};

const fallbackAiModels = [
  { id: 'gpt-5-mini', label: 'gpt-5-mini' },
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
  { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
];

const sensitiveSettingKeys = new Set(['ai.api_token']);

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const settings = await this.getResolvedSettingsMap();

    return [...settings.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => ({
        key,
        value: sensitiveSettingKeys.has(key) ? maskSecretValue(value) : value,
      }));
  }

  async upsertMany(entries: Array<{ key: string; value: string }>) {
    const normalizedEntries = entries
      .map((entry) => ({
        key: entry.key?.trim(),
        value: entry.value ?? '',
      }))
      .filter((entry): entry is { key: string; value: string } =>
        Boolean(entry.key),
      );

    if (!normalizedEntries.length) {
      return this.findAll();
    }

    const currentSettings = await this.getResolvedSettingsMap();
    const nextSettings = new Map(currentSettings);

    for (const entry of normalizedEntries) {
      if (sensitiveSettingKeys.has(entry.key)) {
        if (!entry.value.trim() || isMaskedSecretValue(entry.value)) {
          continue;
        }
      }

      nextSettings.set(entry.key, entry.value);
    }

    if (!process.env.DATABASE_URL) {
      return [...nextSettings.entries()]
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, value]) => ({
          key,
          value: sensitiveSettingKeys.has(key) ? maskSecretValue(value) : value,
        }));
    }

    await Promise.all(
      normalizedEntries.map(async (entry) => {
        if (sensitiveSettingKeys.has(entry.key)) {
          if (!entry.value.trim() || isMaskedSecretValue(entry.value)) {
            return;
          }
        }

        const storedValue = sensitiveSettingKeys.has(entry.key)
          ? encryptSecretValue(entry.value)
          : entry.value;

        await this.prisma.systemSetting.upsert({
          where: { key: entry.key },
          update: { value: storedValue },
          create: {
            key: entry.key,
            value: storedValue,
          },
        });
      }),
    );

    return this.findAll();
  }

  async loadAiModels(input: LoadAiModelsInput) {
    const settings = await this.getResolvedSettingsMap();
    const baseUrl = (input.baseUrl || settings.get('ai.base_url') || '').trim();
    const apiToken = (
      input.apiToken ||
      settings.get('ai.api_token') ||
      ''
    ).trim();

    if (!baseUrl || /^mock:\/\//i.test(baseUrl)) {
      return {
        source: 'mock',
        baseUrl: baseUrl || 'mock://catalog',
        models: fallbackAiModels,
      };
    }

    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    const candidates = [
      /\/v1$/i.test(normalizedBaseUrl)
        ? `${normalizedBaseUrl}/models`
        : `${normalizedBaseUrl}/v1/models`,
      `${normalizedBaseUrl}/models`,
    ];

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (apiToken) {
      headers.Authorization = `Bearer ${apiToken}`;
      headers['x-api-key'] = apiToken;
      headers['api-key'] = apiToken;
    }

    let lastError = 'Khong lay duoc model tu AI URL da cau hinh.';

    for (const endpoint of candidates) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          lastError = `AI endpoint tra ve ${response.status}`;
          continue;
        }

        const body = (await response.json()) as unknown;
        const payload = body as {
          data?: AiModelRecord[];
          models?: AiModelRecord[];
        };

        const list: AiModelRecord[] = Array.isArray(body)
          ? (body as AiModelRecord[])
          : Array.isArray(payload.data)
            ? payload.data
            : Array.isArray(payload.models)
              ? payload.models
              : [];

        const models = list
          .map((item: AiModelRecord) => ({
            id: String(item.id || item.name || '').trim(),
            label: String(item.name || item.id || '').trim(),
          }))
          .filter((item: { id: string; label: string }) => item.id);

        if (models.length) {
          return {
            source: endpoint,
            baseUrl,
            models,
          };
        }

        lastError = 'AI endpoint khong tra ve danh sach model hop le.';
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : 'Loi ket noi AI endpoint.';
      }
    }

    return {
      source: 'fallback',
      baseUrl,
      error: lastError,
      models: fallbackAiModels,
    };
  }

  async getResolvedAiConfig() {
    const settings = await this.getResolvedSettingsMap();

    return {
      baseUrl: settings.get('ai.base_url') || '',
      apiToken: settings.get('ai.api_token') || '',
      model: settings.get('ai.model') || 'nexus-guard-mini',
      prompt:
        settings.get('ai.prompt') ||
        'Ban la AI moderation assistant. Tra ve JSON ngan gon voi risk_score va action_goi_y.',
    };
  }

  private async getResolvedSettingsMap() {
    const settings = new Map<string, string>([
      ...Object.entries(fallbackSnapshot.settings),
      ...Object.entries(this.getEnvDefaults()),
    ]);

    if (!process.env.DATABASE_URL) {
      return settings;
    }

    const dbSettings = await this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });

    for (const setting of dbSettings) {
      const value = sensitiveSettingKeys.has(setting.key)
        ? decryptSecretValue(setting.value)
        : setting.value;
      settings.set(setting.key, value);
    }

    return settings;
  }

  private getEnvDefaults() {
    return {
      'ai.base_url': (
        process.env.AI_DEFAULT_BASE_URL ||
        process.env.OPENAI_BASE_URL ||
        'https://api.openai.com/v1'
      ).trim(),
      'ai.model': (
        process.env.AI_DEFAULT_MODEL ||
        process.env.OPENAI_MODEL ||
        'gpt-5-mini'
      ).trim(),
      'ai.api_token': (
        process.env.AI_DEFAULT_API_TOKEN ||
        process.env.OPENAI_API_KEY ||
        ''
      ).trim(),
      'ai.prompt': (
        process.env.AI_DEFAULT_PROMPT ||
        'Bạn là AI moderation assistant cho Telegram CRM. Hãy phân loại tin nhắn/join request thành safe, suspicious, spam, sexual_bait, phishing, impersonation hoặc raid_signal. Trả về JSON ngắn gọn và bảo thủ.'
      ).trim(),
      'system.name': (
        process.env.SYSTEM_DEFAULT_NAME ||
        fallbackSnapshot.settings['system.name']
      ).trim(),
      'security.2fa': (
        process.env.SECURITY_2FA_DEFAULT ||
        fallbackSnapshot.settings['security.2fa']
      ).trim(),
      'websocket.strategy': (
        process.env.WEBSOCKET_STRATEGY_DEFAULT ||
        fallbackSnapshot.settings['websocket.strategy']
      ).trim(),
    };
  }

  getSecretPlaceholder() {
    return getSecretPlaceholder();
  }
}
