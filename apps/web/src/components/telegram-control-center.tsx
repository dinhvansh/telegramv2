"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

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
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function rightsSummary(group: TelegramGroupItem) {
  const rights = [
    group.botRights.canDeleteMessages ? "delete" : null,
    group.botRights.canRestrictMembers ? "restrict" : null,
    group.botRights.canInviteUsers ? "invite" : null,
    group.botRights.canManageTopics ? "topics" : null,
  ].filter(Boolean);

  return rights.length ? rights.join(", ") : "none";
}

function generateWebhookSecret() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function TelegramControlCenter({
  embedded = false,
}: {
  embedded?: boolean;
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

  useEffect(() => {
    let isMounted = true;

    async function load(currentToken: string) {
      try {
        const [profile, telegramStatus, telegramGroups] = await Promise.all([
          fetchJson<SessionUser>(`${apiBaseUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
          fetchJson<TelegramStatus>(`${apiBaseUrl}/telegram/status`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
          fetchJson<GroupsResponse>(`${apiBaseUrl}/telegram/groups`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
        ]);

        if (!isMounted) {
          return;
        }

        setUser(profile);
        setStatus(telegramStatus);
        setGroups(telegramGroups.items);
        setForm((current) => ({
          ...current,
          botUsername: telegramStatus.botUsername ?? current.botUsername,
          publicBaseUrl: telegramStatus.webhookUrl
            ? telegramStatus.webhookUrl.replace(/\/api\/telegram\/webhook$/, "")
            : current.publicBaseUrl,
        }));
        setAuthError(null);
      } catch {
        if (!isMounted) {
          return;
        }

        window.localStorage.removeItem(authStorageKey);
        setToken(null);
        setUser(null);
        setStatus(null);
        setGroups([]);
        setAuthError("Session is invalid or API is unavailable.");
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
  }, [token]);

  async function refreshData(currentToken: string) {
    const [telegramStatus, telegramGroups] = await Promise.all([
      fetchJson<TelegramStatus>(`${apiBaseUrl}/telegram/status`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      }),
      fetchJson<GroupsResponse>(`${apiBaseUrl}/telegram/groups`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      }),
    ]);

    setStatus(telegramStatus);
    setGroups(telegramGroups.items);
  }

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
      setAuthError("Login failed. Check email or password.");
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
            ? result.description || "Action failed."
            : successMessage,
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Action failed.",
      });
    } finally {
      setIsActionRunning(null);
    }
  }

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction(
      "save",
      () =>
        fetchJson(`${apiBaseUrl}/telegram/config`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        }),
      "Telegram configuration saved.",
    );
  }

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
          <p className="mt-3 text-lg font-black">Loading control center...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    if (embedded) {
      return (
        <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Telegram CRM
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            Session chua san sang
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--on-surface-variant)]">
            Dang nhap bang flow chinh, sau do mo menu Telegram ben trai.
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
              Telegram CRM
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight">
              Bot configuration, webhook lifecycle, and group sync in one control
              plane.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--on-surface-variant)]">
              This screen is the first real CRM phase for Telegram: save bot
              config, verify the bot, register webhook, discover groups, and
              inspect the groups the bot currently belongs to.
            </p>
          </section>

          <section className="rounded-[32px] bg-[color:var(--surface-card)] p-8 shadow-[0_8px_32px_rgba(42,52,57,0.08)] lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Sign in
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
                  Password
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
                {isSubmitting ? "Signing in..." : "Sign in"}
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
        <header className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Telegram Control Center
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                CRM-first bot onboarding and group sync
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--on-surface-variant)]">
                Configure the bot from CRM, verify it against Telegram, register
                webhook, then discover the groups where the bot is currently
                active.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)]">
                {user.name} · {user.roles.join(", ")}
              </div>
              {!embedded ? (
                <button
                  onClick={handleLogout}
                  className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold"
                >
                  Logout
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
              Bot Configuration
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
                      Webhook secret
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
                    className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  />
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
                  placeholder="https://demo-telegram.ngrok.app"
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={isActionRunning !== null}
                className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {isActionRunning === "save" ? "Saving..." : "Save Config"}
              </button>

              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "verify",
                    () =>
                      fetchJson(`${apiBaseUrl}/telegram/verify-bot`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      }),
                    "Bot verification finished.",
                  )
                }
                disabled={isActionRunning !== null}
                className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold disabled:opacity-60"
              >
                {isActionRunning === "verify" ? "Verifying..." : "Verify Bot"}
              </button>

              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "webhook",
                    () =>
                      fetchJson(`${apiBaseUrl}/telegram/register-webhook`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      }),
                    "Webhook registration finished.",
                  )
                }
                disabled={isActionRunning !== null}
                className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold disabled:opacity-60"
              >
                {isActionRunning === "webhook"
                  ? "Registering..."
                  : "Register Webhook"}
              </button>

              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "discover",
                    () =>
                      fetchJson(`${apiBaseUrl}/telegram/discover-groups`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      }),
                    "Group discovery finished.",
                  )
                }
                disabled={isActionRunning !== null}
                className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold disabled:opacity-60"
              >
                {isActionRunning === "discover"
                  ? "Discovering..."
                  : "Discover Groups"}
              </button>
            </div>
          </form>

          <aside className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Runtime Status
            </p>
            <div className="mt-5 grid gap-3">
              {[
                ["Mode", status?.mode ?? "unknown"],
                ["Configured", status?.botConfigured ? "yes" : "no"],
                ["Verified", status?.botVerified ? "yes" : "no"],
                ["Webhook", status?.webhookRegistered ? "registered" : "not registered"],
                ["Bot ID", status?.botId ?? "n/a"],
                ["Bot", status?.botUsername ?? status?.botDisplayName ?? "n/a"],
                ["Webhook URL", status?.webhookUrl ?? "n/a"],
                ["Last verified", formatDateTime(status?.lastVerifiedAt ?? null)],
                ["Last discovery", formatDateTime(status?.lastDiscoveredAt ?? null)],
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
          </aside>
        </section>

        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Telegram Groups
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                Groups discovered from CRM-controlled bot lifecycle
              </h2>
            </div>
            <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
              {groups.length} group(s)
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
            <table className="min-w-[980px] w-full border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  <th className="px-5 py-4 font-semibold">Group</th>
                  <th className="px-5 py-4 font-semibold">Chat ID</th>
                  <th className="px-5 py-4 font-semibold">State</th>
                  <th className="px-5 py-4 font-semibold">Rights</th>
                  <th className="px-5 py-4 font-semibold">Moderation</th>
                  <th className="px-5 py-4 font-semibold">Last Sync</th>
                  <th className="px-5 py-4 font-semibold">Actions</th>
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
                        {group.botMemberState ?? (group.isActive ? "active" : "inactive")}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {rightsSummary(group)}
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          group.moderationEnabled
                            ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                            : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                        }`}
                      >
                        {group.moderationEnabled ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {formatDateTime(group.lastSyncedAt)}
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      <Link
                        href={`/telegram/groups/${group.id}/moderation`}
                        className="inline-flex rounded-full bg-[color:var(--surface-card)] px-4 py-2 font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                      >
                        Open settings
                      </Link>
                    </td>
                  </tr>
                ))}
                {!groups.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-sm text-[color:var(--on-surface-variant)]"
                    >
                      No groups discovered yet. Verify the bot and run group
                      discovery first.
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
