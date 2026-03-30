"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl = "/api";

const authStorageKey = "telegram-ops-access-token";

type GroupModerationSettings = {
  found: boolean;
  groupId: string;
  moderationEnabled: boolean;
  lockUrl: boolean;
  lockInvitelink: boolean;
  lockForward: boolean;
  lockEmail: boolean;
  lockPhone: boolean;
  lockBot: boolean;
  lockPhoto: boolean;
  lockVideo: boolean;
  lockDocument: boolean;
  lockSticker: boolean;
  trustedUsernames: string;
  trustedExternalIds: string;
  exemptAdmins: boolean;
  exemptOwners: boolean;
  lockWarns: boolean;
  warnLimit: number;
  warnAction: "mute" | "tmute" | "kick" | "ban" | "tban";
  warnActionDurationSeconds: number | null;
  antifloodEnabled: boolean;
  antifloodLimit: number;
  antifloodWindowSeconds: number;
  antifloodAction: "mute" | "tmute" | "kick" | "ban" | "tban";
  antifloodActionDurationSeconds: number | null;
  antifloodDeleteAll: boolean;
  aiModerationEnabled: boolean;
  aiMode: "off" | "fallback_only" | "suspicious_only";
  aiConfidenceThreshold: number;
  aiOverrideAction: boolean;
  silentActions: boolean;
  rawLoggingEnabled: boolean;
  detailedLoggingEnabled: boolean;
};

type GroupItem = {
  id: string;
  title: string;
  externalId: string;
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

export function TelegramGroupModerationSettings({
  groupId,
}: {
  groupId: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupItem | null>(null);
  const [form, setForm] = useState<GroupModerationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(authStorageKey);
    setToken(savedToken);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load(currentToken: string) {
      try {
        const [groupsResponse, settings] = await Promise.all([
          fetchJson<{ items: GroupItem[] }>(`${apiBaseUrl}/telegram/groups`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
          fetchJson<GroupModerationSettings>(
            `${apiBaseUrl}/telegram/groups/${groupId}/moderation`,
            {
              headers: { Authorization: `Bearer ${currentToken}` },
            },
          ),
        ]);

        if (!isMounted) {
          return;
        }

        setGroup(groupsResponse.items.find((item) => item.id === groupId) ?? null);
        setForm(settings);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load moderation settings.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void load(token);

    return () => {
      isMounted = false;
    };
  }, [groupId, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !form) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const next = await fetchJson<GroupModerationSettings>(
        `${apiBaseUrl}/telegram/groups/${groupId}/moderation`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        },
      );

      setForm(next);
      setNotice("Moderation settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save moderation settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)]">
        <div className="rounded-[24px] bg-[color:var(--surface-card)] px-8 py-6 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-sm font-bold">Loading moderation settings...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] px-6 text-center">
        <div className="rounded-[24px] bg-[color:var(--surface-card)] px-8 py-6 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-sm font-bold">You need to sign in first.</p>
          <Link href="/telegram" className="mt-4 inline-flex text-sm font-semibold text-[color:var(--primary)]">
            Back to Telegram CRM
          </Link>
        </div>
      </div>
    );
  }

  if (!form?.found) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] px-6 text-center">
        <div className="rounded-[24px] bg-[color:var(--surface-card)] px-8 py-6 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-sm font-bold">Group not found.</p>
          <Link href="/telegram" className="mt-4 inline-flex text-sm font-semibold text-[color:var(--primary)]">
            Back to Telegram CRM
          </Link>
        </div>
      </div>
    );
  }

  const toggleFieldKeys = [
    ["moderationEnabled", "Moderation enabled"],
    ["lockUrl", "Lock URL"],
    ["lockInvitelink", "Lock Telegram invite link"],
    ["lockForward", "Lock forwarded message"],
    ["lockEmail", "Lock email"],
    ["lockPhone", "Lock phone number"],
    ["lockBot", "Lock bot sender"],
    ["lockPhoto", "Lock photo"],
    ["lockVideo", "Lock video"],
    ["lockDocument", "Lock document"],
    ["lockSticker", "Lock sticker"],
    ["exemptAdmins", "Exempt Telegram admins"],
    ["exemptOwners", "Exempt CRM owners"],
    ["lockWarns", "Warn on lock violation"],
    ["antifloodEnabled", "Enable antiflood"],
    ["antifloodDeleteAll", "Delete all flooded messages"],
    ["aiModerationEnabled", "Enable AI moderation"],
    ["aiOverrideAction", "Allow AI override action"],
    ["silentActions", "Silent actions"],
    ["rawLoggingEnabled", "Raw logging"],
    ["detailedLoggingEnabled", "Detailed logging"],
  ] as const;

  return (
    <div className="min-h-screen bg-[color:var(--surface)] px-5 py-8 text-[color:var(--on-surface)] lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Group Moderation Settings
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                {group?.title ?? "Telegram Group"}
              </h1>
              <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                Chat ID: {group?.externalId ?? "n/a"}
              </p>
            </div>
            <Link
              href="/telegram"
              className="inline-flex rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold"
            >
              Back to groups
            </Link>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]"
        >
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Lock Matrix
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {toggleFieldKeys.map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4"
                  >
                    <span className="text-sm font-semibold">{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(form[key])}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                [key]: event.target.checked,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-5">
              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">Trusted / Exemption</p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Trusted usernames
                    </span>
                    <input
                      type="text"
                      value={form.trustedUsernames}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                trustedUsernames: event.target.value,
                              }
                            : current,
                        )
                      }
                      placeholder="@owner_a, trusted_mod"
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Trusted external ids
                    </span>
                    <input
                      type="text"
                      value={form.trustedExternalIds}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                trustedExternalIds: event.target.value,
                              }
                            : current,
                        )
                      }
                      placeholder="123456789, 99887766"
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">Warning rules</p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Warn limit
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={form.warnLimit}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                warnLimit: Number(event.target.value || 1),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Warn action
                    </span>
                    <select
                      value={form.warnAction}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                warnAction: event.target.value as GroupModerationSettings["warnAction"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="mute">mute</option>
                      <option value="tmute">tmute</option>
                      <option value="kick">kick</option>
                      <option value="ban">ban</option>
                      <option value="tban">tban</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Warn action duration seconds
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={form.warnActionDurationSeconds ?? ""}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                warnActionDurationSeconds: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">Antiflood</p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Limit
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={form.antifloodLimit}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodLimit: Number(event.target.value || 1),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Window seconds
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={form.antifloodWindowSeconds}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodWindowSeconds: Number(event.target.value || 1),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Flood action
                    </span>
                    <select
                      value={form.antifloodAction}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodAction:
                                  event.target.value as GroupModerationSettings["antifloodAction"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="mute">mute</option>
                      <option value="tmute">tmute</option>
                      <option value="kick">kick</option>
                      <option value="ban">ban</option>
                      <option value="tban">tban</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Flood action duration seconds
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={form.antifloodActionDurationSeconds ?? ""}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodActionDurationSeconds: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">AI moderation</p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      AI mode
                    </span>
                    <select
                      value={form.aiMode}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                aiMode: event.target.value as GroupModerationSettings["aiMode"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="off">off</option>
                      <option value="fallback_only">fallback_only</option>
                      <option value="suspicious_only">suspicious_only</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Confidence threshold
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step="0.01"
                      value={form.aiConfidenceThreshold}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                aiConfidenceThreshold: Number(event.target.value || 0),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>
            </section>
          </div>

          {error ? (
            <div className="mt-6 rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-6 rounded-[18px] bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">
              {notice}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              disabled={isSaving}
              className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Moderation Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
