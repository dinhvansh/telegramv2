"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TelegramControlCenter } from "@/components/telegram-control-center";
import { useToast } from "@/context/toast-context";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type SettingItem = { key: string; value: string };
type AiModelItem = { id: string; label: string };
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
    let detail = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      detail = Array.isArray(payload?.message)
        ? payload.message.join(", ")
        : (payload?.message ?? detail);
    } catch {
      detail = (await response.text()) || detail;
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

function mapSettings(items: SettingItem[]) {
  const mapped = new Map<string, string>();
  for (const item of items) {
    mapped.set(item.key, item.value);
  }
  return mapped;
}

export function SettingsWorkbench({
  telegramBotId = null,
}: {
  telegramBotId?: string | null;
}) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<AiModelItem[]>([]);
  const [form, setForm] = useState({
    systemName: "",
    twoFaRequired: true,
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
      return;
    }

    try {
      const items = await fetchJson<SettingItem[]>(`${apiBaseUrl}/settings`, {
        headers,
      });
      const mapped = mapSettings(items);
      setForm({
        systemName: mapped.get("system.name") || "Telegram Ops",
        twoFaRequired: String(mapped.get("security.2fa") || "").includes("required"),
        aiBaseUrl: mapped.get("ai.base_url") || "",
        aiApiToken: mapped.get("ai.api_token") || "",
        aiModel: mapped.get("ai.model") || "gpt-5-mini",
        aiPrompt: mapped.get("ai.prompt") || "",
      });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "Không thể tải cài đặt.",
        type: "error",
      });
    }
  }, [headers, toast]);

  useEffect(() => {
    if (!headers) {
      return;
    }
    void loadSettings();
  }, [headers, loadSettings]);

  async function handleSave() {
    if (!headers) {
      return;
    }

    setIsSaving(true);
    try {
      await fetchJson(`${apiBaseUrl}/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          entries: [
            { key: "system.name", value: form.systemName.trim() || "Telegram Ops" },
            {
              key: "security.2fa",
              value: form.twoFaRequired ? "required-for-admins" : "optional",
            },
            { key: "ai.base_url", value: form.aiBaseUrl.trim() },
            { key: "ai.api_token", value: form.aiApiToken.trim() },
            { key: "ai.model", value: form.aiModel.trim() || "gpt-5-mini" },
            { key: "ai.prompt", value: form.aiPrompt.trim() },
          ],
        }),
      });
      toast({ message: "Đã lưu cài đặt.", type: "success" });
      await loadSettings();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "Không thể lưu cài đặt.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLoadModels() {
    if (!headers) {
      return;
    }

    setIsLoadingModels(true);
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
      toast({
        message: payload.error
          ? `Đang dùng danh sách model dự phòng. ${payload.error}`
          : `Đã tải ${payload.models.length} model từ ${payload.source}.`,
        type: payload.error ? "warning" : "success",
      });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "Không thể tải model.",
        type: "error",
      });
    } finally {
      setIsLoadingModels(false);
    }
  }

  if (!token) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm font-semibold text-[color:var(--warning)]">
          Cần đăng nhập.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <a
        href="/dashboard"
        className="mb-2 inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-card)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] shadow-[0_4px_16px_rgba(42,52,57,0.04)] transition-all hover:bg-white/80"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Quay lại Dashboard
      </a>

      <TelegramControlCenter embedded telegramBotId={telegramBotId} />

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              AI Moderation
            </p>
            <h3 className="mt-1 text-xl font-black tracking-tight">
              Cấu hình AI provider
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSaving ? "Đang lưu..." : "Lưu cài đặt"}
          </button>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                Base URL
              </label>
              <input
                value={form.aiBaseUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, aiBaseUrl: event.target.value }))
                }
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                API Token
              </label>
              <input
                type="password"
                value={form.aiApiToken}
                onChange={(event) =>
                  setForm((current) => ({ ...current, aiApiToken: event.target.value }))
                }
                placeholder="sk-..."
                className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Model
                </label>
                <div className="flex gap-2">
                  <input
                    value={form.aiModel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, aiModel: event.target.value }))
                    }
                    placeholder="gpt-5-mini"
                    className="min-w-0 flex-1 rounded-[14px] bg-white px-4 py-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleLoadModels()}
                    disabled={isLoadingModels || !form.aiBaseUrl.trim()}
                    className="shrink-0 rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold disabled:opacity-40"
                  >
                    {isLoadingModels ? "..." : "Load"}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Tên hệ thống
                </label>
                <input
                  value={form.systemName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, systemName: event.target.value }))
                  }
                  className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none"
                />
              </div>
            </div>

            {modelOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {modelOptions.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({ ...current, aiModel: model.id }))
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      form.aiModel === model.id
                        ? "bg-[color:var(--primary)] text-white"
                        : "bg-white text-[color:var(--on-surface-variant)]"
                    }`}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                AI Prompt
              </label>
              <textarea
                value={form.aiPrompt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, aiPrompt: event.target.value }))
                }
                rows={6}
                placeholder="Bạn là AI moderation assistant..."
                className="w-full resize-none rounded-[14px] bg-white px-4 py-3 text-sm leading-6 outline-none"
              />
            </div>
            <div className="flex items-center justify-between rounded-[14px] bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Yêu cầu 2FA</p>
                <p className="mt-0.5 text-xs text-[color:var(--on-surface-variant)]">
                  Bật xác thực hai bước cho admin
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    twoFaRequired: !current.twoFaRequired,
                  }))
                }
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  form.twoFaRequired
                    ? "bg-[color:var(--primary)]"
                    : "bg-[color:var(--surface-low)]"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    form.twoFaRequired ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
