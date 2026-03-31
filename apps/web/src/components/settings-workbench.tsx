"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type SettingItem = {
  key: string;
  value: string;
};

type AiModelItem = {
  id: string;
  label: string;
};

type LoadAiModelsResponse = {
  source: string;
  baseUrl: string;
  error?: string;
  models: AiModelItem[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function mapSettings(items: SettingItem[]) {
  const map = new Map<string, string>();
  for (const item of items) {
    map.set(item.key, item.value);
  }
  return map;
}

export function SettingsWorkbench() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modelsNotice, setModelsNotice] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<AiModelItem[]>([]);
  const [form, setForm] = useState({
    systemName: "",
    twoFaRequired: true,
    websocketStrategy: "",
    aiBaseUrl: "",
    aiApiToken: "",
    aiModel: "",
    aiPrompt: "",
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token],
  );

  const loadSettings = useCallback(async () => {
    if (!headers) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const items = await fetchJson<SettingItem[]>(`${apiBaseUrl}/settings`, {
        headers,
      });
      const map = mapSettings(items);
      setForm({
        systemName: map.get("system.name") || "Skynet Telegram CRM",
        twoFaRequired: String(map.get("security.2fa") || "").includes("required"),
        websocketStrategy: map.get("websocket.strategy") || "polling",
        aiBaseUrl: map.get("ai.base_url") || "",
        aiApiToken: map.get("ai.api_token") || "",
        aiModel: map.get("ai.model") || "gpt-5-mini",
        aiPrompt: map.get("ai.prompt") || "",
      });
      setNotice(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải cài đặt.");
    } finally {
      setIsLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleLoadModels() {
    if (!headers) {
      return;
    }

    setIsLoadingModels(true);
    setError(null);
    setModelsNotice(null);

    try {
      const payload = await fetchJson<LoadAiModelsResponse>(
        `${apiBaseUrl}/settings/ai/models`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            baseUrl: form.aiBaseUrl.trim(),
            apiToken: form.aiApiToken.trim(),
          }),
        },
      );

      setModelOptions(payload.models || []);
      if (!form.aiModel && payload.models[0]?.id) {
        setForm((current) => ({ ...current, aiModel: payload.models[0].id }));
      }

      setModelsNotice(
        payload.error
          ? `Đã tải danh sách model dự phòng. ${payload.error}`
          : `Đã tải ${payload.models.length} model từ ${payload.source}.`,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Không thể tải model AI.",
      );
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function handleSave() {
    if (!headers) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson<SettingItem[]>(`${apiBaseUrl}/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          entries: [
            { key: "system.name", value: form.systemName.trim() || "Skynet Telegram CRM" },
            {
              key: "security.2fa",
              value: form.twoFaRequired ? "required-for-admins" : "optional",
            },
            { key: "websocket.strategy", value: form.websocketStrategy.trim() || "polling" },
            { key: "ai.base_url", value: form.aiBaseUrl.trim() },
            { key: "ai.api_token", value: form.aiApiToken.trim() },
            { key: "ai.model", value: form.aiModel.trim() || "gpt-5-mini" },
            { key: "ai.prompt", value: form.aiPrompt.trim() },
          ],
        }),
      });

      setNotice("Đã lưu cấu hình hệ thống và AI.");
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu cài đặt.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
          Đang tải cài đặt hệ thống...
        </p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--warning)]">
          Cần đăng nhập để cấu hình hệ thống.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-[18px] bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">
          {notice}
        </div>
      ) : null}

      {modelsNotice ? (
        <div className="rounded-[18px] bg-[color:var(--primary-soft)] px-4 py-3 text-sm text-[color:var(--primary)]">
          {modelsNotice}
        </div>
      ) : null}

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Cài đặt hệ thống
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">
              Quản lý AI provider, model và tham số vận hành
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {isSaving ? "Đang lưu..." : "Lưu cài đặt"}
          </button>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-5">
            <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
              <p className="text-sm font-bold">Hệ thống</p>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    Tên hệ thống
                  </span>
                  <input
                    value={form.systemName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, systemName: event.target.value }))
                    }
                    className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    Websocket strategy
                  </span>
                  <input
                    value={form.websocketStrategy}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, websocketStrategy: event.target.value }))
                    }
                    className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    placeholder="polling / realtime"
                  />
                </label>

                <label className="flex items-center justify-between rounded-[16px] bg-white px-4 py-3 text-sm">
                  <span className="font-semibold">Yêu cầu 2FA cho admin</span>
                  <input
                    type="checkbox"
                    checked={form.twoFaRequired}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, twoFaRequired: event.target.checked }))
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-bold">AI moderation provider</p>
                  <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                    Có thể cấu hình trực tiếp tại đây thay vì phải set env trên server.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLoadModels()}
                  disabled={isLoadingModels}
                  className="rounded-[16px] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--primary)] disabled:opacity-60"
                >
                  {isLoadingModels ? "Đang tải model..." : "Tải danh sách model"}
                </button>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    AI base URL
                  </span>
                  <input
                    value={form.aiBaseUrl}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, aiBaseUrl: event.target.value }))
                    }
                    className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    placeholder="https://api.openai.com/v1"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    AI API token
                  </span>
                  <input
                    type="password"
                    value={form.aiApiToken}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, aiApiToken: event.target.value }))
                    }
                    className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    placeholder="sk-..."
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    AI model
                  </span>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <input
                      value={form.aiModel}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, aiModel: event.target.value }))
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                      placeholder="gpt-5-mini"
                    />
                    <select
                      value={form.aiModel}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, aiModel: event.target.value }))
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="">Chọn model đã tải</option>
                      {modelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    AI prompt
                  </span>
                  <textarea
                    value={form.aiPrompt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, aiPrompt: event.target.value }))
                    }
                    rows={8}
                    className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    placeholder="Bạn là AI moderation assistant..."
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
