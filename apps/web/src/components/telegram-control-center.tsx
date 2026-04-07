"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

type TelegramStatus = {
  mode: string;
  botConfigured: boolean;
  botId: string | null;
  botVerified: boolean;
  botDisplayName: string | null;
  botUsername: string | null;
  publicBaseUrlConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookRegistered: boolean;
  webhookUrl: string | null;
  tokenPreview: string | null;
  lastVerifiedAt: string | null;
  lastDiscoveredAt: string | null;
};

type TelegramGroupItem = {
  id: string;
  title: string;
  slug: string;
  externalId: string;
  username: string | null;
  type: string;
  isActive: boolean;
  discoveredFrom: string | null;
  lastSyncedAt: string | null;
  botMemberState: string | null;
  botRights: {
    canDeleteMessages: boolean;
    canRestrictMembers: boolean;
    canInviteUsers: boolean;
    canManageTopics: boolean;
  };
  moderationEnabled: boolean;
};

type GroupsResponse = {
  items: TelegramGroupItem[];
};

type ActionNotice = {
  tone: "success" | "danger" | "neutral";
  message: string;
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "Chưa có";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function rightsSummary(group: TelegramGroupItem) {
  const rights = [
    group.botRights.canDeleteMessages ? "xóa tin" : null,
    group.botRights.canRestrictMembers ? "khóa chat" : null,
    group.botRights.canInviteUsers ? "tạo link" : null,
    group.botRights.canManageTopics ? "quản lý topic" : null,
  ].filter(Boolean);

  return rights.length ? rights.join(", ") : "Chưa có quyền";
}

function generateWebhookSecret() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function TelegramControlCenter({
  embedded = false,
  workspaceId = null,
  telegramBotId = null,
}: {
  embedded?: boolean;
  workspaceId?: string | null;
  telegramBotId?: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [groups, setGroups] = useState<TelegramGroupItem[]>([]);
  const [email, setEmail] = useState("admin@nexus.local");
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState<string | null>(null);
  const [form, setForm] = useState({
    botToken: "",
    botUsername: "",
    webhookSecret: "",
    publicBaseUrl: "",
  });

  useEffect(() => {
    const savedToken = window.localStorage.getItem(authStorageKey);
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    setToken(savedToken);
  }, []);

  const buildHeaders = useCallback((currentToken: string) => ({
    Authorization: `Bearer ${currentToken}`,
    ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    ...(telegramBotId ? { "X-Telegram-Bot-Id": telegramBotId } : {}),
  }), [telegramBotId, workspaceId]);

  const refreshData = useCallback(async (currentToken: string) => {
    const [telegramStatus, telegramGroups] = await Promise.all([
      fetchJson<TelegramStatus>(`${apiBaseUrl}/telegram/status`, {
        headers: buildHeaders(currentToken),
      }),
      fetchJson<GroupsResponse>(`${apiBaseUrl}/telegram/groups`, {
        headers: buildHeaders(currentToken),
      }),
    ]);

    setStatus(telegramStatus);
    setGroups(telegramGroups.items);
    setForm((current) => ({
      ...current,
      botUsername: telegramStatus.botUsername ?? current.botUsername,
      publicBaseUrl: telegramStatus.webhookUrl
        ? telegramStatus.webhookUrl.replace(/\/api\/telegram\/webhook$/, "")
        : current.publicBaseUrl,
    }));
  }, [buildHeaders]);

  useEffect(() => {
    let isMounted = true;

    async function load(currentToken: string) {
      try {
        const profile = await fetchJson<SessionUser>(`${apiBaseUrl}/auth/me`, {
          headers: buildHeaders(currentToken),
        });

        if (!isMounted) {
          return;
        }

        setUser(profile);
        await refreshData(currentToken);
        if (isMounted) {
          setAuthError(null);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        window.localStorage.removeItem(authStorageKey);
        setToken(null);
        setUser(null);
        setStatus(null);
        setGroups([]);
        setAuthError("Phiên đăng nhập không hợp lệ hoặc API chưa sẵn sàng.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (!token) {
      return;
    }

    setIsLoading(true);
    void load(token);

    return () => {
      isMounted = false;
    };
  }, [buildHeaders, refreshData, token]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const response = await fetchJson<{ accessToken: string }>(
        `${apiBaseUrl}/auth/login`,
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );

      window.localStorage.setItem(authStorageKey, response.accessToken);
      setToken(response.accessToken);
    } catch {
      setAuthError("Đăng nhập thất bại. Kiểm tra email hoặc mật khẩu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(authStorageKey);
    setToken(null);
    setUser(null);
    setStatus(null);
    setGroups([]);
    setNotice(null);
    setIsLoading(false);
  }

  async function runAction(
    actionKey: string,
    callback: () => Promise<{ ok?: boolean; description?: string | null } | void>,
    successMessage: string,
  ) {
    if (!token) {
      return;
    }

    setIsActionRunning(actionKey);
    setNotice(null);

    try {
      const result = await callback();
      await refreshData(token);
      setNotice({
        tone: result && result.ok === false ? "danger" : "success",
        message:
          result && result.ok === false
            ? result.description || "Thao tác thất bại."
            : successMessage,
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Thao tác thất bại.",
      });
    } finally {
      setIsActionRunning(null);
    }
  }

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextWebhookSecret = form.webhookSecret.trim() || generateWebhookSecret();
    const payload = {
      ...form,
      webhookSecret: nextWebhookSecret,
    };

    if (nextWebhookSecret !== form.webhookSecret) {
      setForm((current) => ({
        ...current,
        webhookSecret: nextWebhookSecret,
      }));
    }

    await runAction(
      "save",
      async () => {
        await fetchJson(`${apiBaseUrl}/telegram/config`, {
          method: "POST",
          headers: buildHeaders(token!),
          body: JSON.stringify(payload),
        });
        await fetchJson(`${apiBaseUrl}/telegram/verify-bot`, {
          method: "POST",
          headers: buildHeaders(token!),
        });
        await fetchJson(`${apiBaseUrl}/telegram/register-webhook`, {
          method: "POST",
          headers: buildHeaders(token!),
        });
        return { ok: true };
      },
      "Đã lưu cấu hình, verify bot và đăng ký webhook.",
    );
  }

  async function handleDeleteGroup(group: TelegramGroupItem) {
    if (!token) {
      return;
    }

    const confirmed = window.confirm(
      `Xóa group "${group.title}" khỏi CRM? Chỉ nên xóa bản ghi inactive cũ.`,
    );

    if (!confirmed) {
      return;
    }

    await runAction(
      `delete-group-${group.id}`,
      () =>
        fetchJson<{ deleted: boolean; reason?: string }>(
          `${apiBaseUrl}/telegram/groups/${group.id}`,
          {
            method: "DELETE",
            headers: buildHeaders(token!),
          },
        ).then((result) => ({
          ok: result.deleted,
          description: result.reason ?? null,
        })),
      "Đã xóa group inactive khỏi CRM.",
    );
  }

  async function handleToggleModeration(group: TelegramGroupItem) {
    if (!token) {
      return;
    }

    const nextValue = !group.moderationEnabled;

    await runAction(
      `toggle-moderation-${group.id}`,
      () =>
        fetchJson(`${apiBaseUrl}/telegram/groups/${group.id}/moderation`, {
          method: "PUT",
          headers: buildHeaders(token!),
          body: JSON.stringify({ moderationEnabled: nextValue }),
        }).then(() => ({ ok: true })),
      nextValue
        ? `Đã bật kiểm duyệt tự động cho ${group.title}.`
        : `Đã tắt kiểm duyệt tự động cho ${group.title}.`,
    );
  }

  async function handleRefreshRights(group?: TelegramGroupItem) {
    if (!token) {
      return;
    }

    const actionKey = group ? `refresh-rights-${group.id}` : "refresh-rights-all";
    const url = group
      ? `${apiBaseUrl}/telegram/groups/${group.id}/refresh-rights`
      : `${apiBaseUrl}/telegram/refresh-rights`;

    await runAction(
      actionKey,
      () =>
        fetchJson<{ ok?: boolean; failed?: number }>(url, {
          method: "POST",
          headers: buildHeaders(token!),
        }).then((result) => ({
          ok: result.ok ?? (result.failed === 0),
          description:
            result.failed && result.failed > 0
              ? `Có ${result.failed} group không làm mới được quyền bot.`
              : null,
        })),
      group ? "Đã làm mới quyền bot cho group." : "Đã làm mới quyền bot cho toàn bộ group.",
    );
  }

  const activeGroupsCount = useMemo(
    () => groups.filter((group) => group.isActive).length,
    [groups],
  );

  if (isLoading) {
    return (
      <div
        className={
          embedded
            ? "text-[color:var(--on-surface)]"
            : "flex min-h-screen items-center justify-center bg-[color:var(--surface)] text-[color:var(--on-surface)]"
        }
      >
        <div className="rounded-[28px] bg-[color:var(--surface-card)] px-8 py-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
            Telegram CRM
          </p>
          <p className="mt-3 text-lg font-black">Đang tải control center...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    if (embedded) {
      return (
        <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Bot & Moderation
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            Phiên đăng nhập chưa sẵn sàng
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--on-surface-variant)]">
            Đăng nhập bằng flow chính, sau đó quay lại màn Bot & Moderation.
          </p>
        </div>
      );
    }

    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[color:var(--surface)] px-5 py-10 text-[color:var(--on-surface)]">
        <div className="absolute inset-x-0 top-0 -z-10 h-[26rem] bg-[radial-gradient(circle_at_top_left,_rgba(0,83,219,0.18),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(0,107,98,0.12),_transparent_32%)]" />
        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[32px] bg-[color:var(--surface-card)] p-8 shadow-[0_8px_32px_rgba(42,52,57,0.08)] lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Bot & Moderation
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight">
              Quản lý bot, webhook và group sync trong một màn hình.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--on-surface-variant)]">
              Đây là control center để lưu bot token, verify bot, đăng ký webhook
              và xem những group mà CRM đã đồng bộ được.
            </p>
          </section>

          <section className="rounded-[32px] bg-[color:var(--surface-card)] p-8 shadow-[0_8px_32px_rgba(42,52,57,0.08)] lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Đăng nhập
            </p>
            <form onSubmit={handleLogin} className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Email
                </span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  type="email"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Mật khẩu
                </span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  type="password"
                />
              </label>

              {authError ? (
                <div className="rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
                  {authError}
                </div>
              ) : null}

              <button
                disabled={isSubmitting}
                className="w-full rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-4 text-sm font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)] disabled:opacity-60"
              >
                {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "space-y-6 text-[color:var(--on-surface)]"
          : "min-h-screen bg-[color:var(--surface)] px-5 py-8 text-[color:var(--on-surface)] lg:px-10 lg:py-10"
      }
    >
      <div className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6"}>
        <header
          className={`rounded-[32px] bg-[color:var(--surface-card)] shadow-[0_8px_32px_rgba(42,52,57,0.08)] ${
            embedded ? "p-5 sm:p-6" : "p-7"
          }`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Bot & Moderation
              </p>
              <h1
                className={`mt-2 font-black tracking-tight ${
                  embedded ? "text-2xl sm:text-3xl" : "text-3xl"
                }`}
              >
                Quản lý bot và đồng bộ group
              </h1>
              <p
                className={`mt-3 max-w-3xl text-sm leading-7 text-[color:var(--on-surface-variant)] ${
                  embedded ? "hidden sm:block" : ""
                }`}
              >
                Cấu hình bot từ CRM, lưu lại để verify bot và đăng ký webhook, rồi
                đồng bộ những group mà bot đang hoạt động.
              </p>
            </div>

            <div className={`flex flex-wrap items-center gap-3 ${embedded ? "hidden sm:flex" : ""}`}>
              <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)]">
                {user.name}
              </div>
              {!embedded ? (
                <button
                  onClick={handleLogout}
                  className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold"
                >
                  Thoát
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {notice ? (
          <div
            className={`rounded-[24px] px-5 py-4 text-sm font-semibold shadow-[0_8px_24px_rgba(42,52,57,0.06)] ${
              notice.tone === "success"
                ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                : notice.tone === "danger"
                  ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                  : "bg-[color:var(--surface-card)] text-[color:var(--on-surface)]"
            }`}
          >
            {notice.message}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <form
            onSubmit={handleSaveConfig}
            className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Cấu hình bot
            </p>
            <div className="mt-6 grid gap-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Bot token
                </span>
                <input
                  value={form.botToken}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      botToken: event.target.value,
                    }))
                  }
                  placeholder={status?.tokenPreview ?? "123456:ABCDEF"}
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    Bot username
                  </span>
                  <input
                    value={form.botUsername}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        botUsername: event.target.value,
                      }))
                    }
                    className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Secret webhook
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          webhookSecret: generateWebhookSecret(),
                        }))
                      }
                      className="shrink-0 rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs font-semibold text-[color:var(--primary)]"
                    >
                      Tạo secret
                    </button>
                  </div>
                  <input
                    value={form.webhookSecret}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        webhookSecret: event.target.value,
                      }))
                    }
                    placeholder="Có thể để trống, hệ thống sẽ tự sinh khi lưu"
                    className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  />
                  <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                    Không bắt buộc nhập tay. Bấm lưu là hệ thống tự tạo nếu đang để trống.
                  </p>
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Public base URL
                </span>
                <input
                  value={form.publicBaseUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      publicBaseUrl: event.target.value,
                    }))
                  }
                  placeholder="https://tele.blogthethao.org"
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={isActionRunning !== null}
                className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {isActionRunning === "save" ? "Đang kích hoạt..." : "Lưu và kích hoạt"}
              </button>

              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "discover",
                    () =>
                      fetchJson(`${apiBaseUrl}/telegram/discover-groups`, {
                        method: "POST",
                        headers: buildHeaders(token!),
                      }),
                    "Đã đồng bộ group.",
                  )
                }
                disabled={isActionRunning !== null}
                className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold disabled:opacity-60"
              >
                {isActionRunning === "discover" ? "Đang đồng bộ..." : "Đồng bộ group"}
              </button>
            </div>
          </form>

          <aside className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                  Tóm tắt bot
                </p>
                <h3 className="mt-2 text-xl font-black tracking-tight">
                  {status?.botDisplayName ?? status?.botUsername ?? "Chưa kết nối bot"}
                </h3>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                  status?.webhookRegistered
                    ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                    : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                }`}
              >
                {status?.webhookRegistered ? "Webhook OK" : "Chưa đăng ký"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Bot ID", status?.botId ?? "-"],
                ["Username", status?.botUsername ? `@${status.botUsername}` : "Chưa verify"],
                ["Group đang dùng", `${activeGroupsCount}/${groups.length} group`],
                ["Trạng thái", status?.botConfigured ? "Đã kết nối" : "Chưa cấu hình"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    {label}
                  </p>
                  <p className="mt-2 break-all text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[20px] bg-[color:var(--surface-low)] px-4 py-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    URL webhook
                  </p>
                  <p className="mt-2 break-all font-medium">
                    {status?.webhookUrl ?? "Chưa có"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    Cập nhật gần nhất
                  </p>
                  <p className="mt-2 font-medium">
                    Verify: {formatDateTime(status?.lastVerifiedAt ?? null)}
                  </p>
                  <p className="mt-1 font-medium">
                    Sync group: {formatDateTime(status?.lastDiscoveredAt ?? null)}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Group Telegram
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                Danh sách group CRM đang quản lý
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleRefreshRights()}
                disabled={isActionRunning === "refresh-rights-all"}
                className="inline-flex rounded-full bg-[color:var(--surface-card)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)] disabled:opacity-60"
              >
                {isActionRunning === "refresh-rights-all"
                  ? "Đang làm mới..."
                  : "Làm mới quyền bot"}
              </button>
              <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
                {groups.length} group
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
            <table className="min-w-[980px] w-full border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  <th className="px-5 py-4 font-semibold">Group</th>
                  <th className="px-5 py-4 font-semibold">Chat ID</th>
                  <th className="px-5 py-4 font-semibold">Trạng thái</th>
                  <th className="px-5 py-4 font-semibold">Quyền bot</th>
                  <th className="px-5 py-4 font-semibold">Kiểm duyệt</th>
                  <th className="px-5 py-4 font-semibold">Lần sync cuối</th>
                  <th className="px-5 py-4 font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group, index) => (
                  <tr key={group.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                    <td className="px-5 py-4 align-top">
                      <p className="text-sm font-bold">{group.title}</p>
                      <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                        {group.username ?? group.type}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-sm font-mono text-[color:var(--primary)]">
                      {group.externalId}
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          group.isActive
                            ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                            : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                        }`}
                      >
                        {group.isActive ? "Đang dùng" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {rightsSummary(group)}
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleModeration(group)}
                          disabled={isActionRunning === `toggle-moderation-${group.id}`}
                          className={`inline-flex w-fit items-center rounded-full px-4 py-2 text-sm font-semibold shadow-[0_4px_14px_rgba(42,52,57,0.08)] disabled:opacity-60 ${
                            group.moderationEnabled
                              ? "bg-[color:var(--success)] text-white"
                              : "bg-[color:var(--surface-card)] text-[color:var(--primary)]"
                          }`}
                        >
                          {isActionRunning === `toggle-moderation-${group.id}`
                            ? "Đang cập nhật..."
                            : group.moderationEnabled
                              ? "Tắt kiểm duyệt"
                              : "Bật kiểm duyệt"}
                        </button>
                        <p className="text-xs text-[color:var(--on-surface-variant)]">
                          {group.moderationEnabled
                            ? "Đang bật tự động chặn spam cho group này."
                            : "Đang tắt, bot chỉ theo dõi và chưa tự xử lý spam."}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {formatDateTime(group.lastSyncedAt)}
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRefreshRights(group)}
                          disabled={isActionRunning === `refresh-rights-${group.id}`}
                          className="inline-flex rounded-full bg-[color:var(--surface-card)] px-4 py-2 font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)] disabled:opacity-60"
                        >
                          {isActionRunning === `refresh-rights-${group.id}`
                            ? "Đang làm mới..."
                            : "Làm mới quyền"}
                        </button>
                        <Link
                          href={`/telegram/groups/${group.id}/moderation`}
                          className="inline-flex rounded-full bg-[color:var(--surface-card)] px-4 py-2 font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                        >
                          Cấu hình chống spam
                        </Link>
                        {!group.isActive ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteGroup(group)}
                            disabled={isActionRunning === `delete-group-${group.id}`}
                            className="inline-flex rounded-full bg-[color:var(--danger-soft)] px-4 py-2 font-semibold text-[color:var(--danger)] disabled:opacity-60"
                          >
                            {isActionRunning === `delete-group-${group.id}`
                              ? "Đang xóa..."
                              : "Xóa"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!groups.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-sm text-[color:var(--on-surface-variant)]"
                    >
                      Chưa có group nào được đồng bộ. Hãy lưu và kích hoạt bot rồi bấm Đồng bộ group khi cần.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
