"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type AutopostTarget = {
  id: string;
  platform: "TELEGRAM" | "DISCORD" | "TWITTER";
  externalId: string;
  displayName: string;
  status: string;
};

type TelegramGroupOption = {
  id: string;
  title: string;
  externalId: string;
  username: string | null;
  type: string;
};

type AutopostSchedule = {
  id: string;
  title: string;
  message: string;
  mediaUrl: string | null;
  frequency: string;
  scheduledFor: string | null;
  status: string;
  target: {
    id: string;
    platform: string;
    displayName: string;
    externalId: string;
  };
  latestLog: {
    status: string;
    detail: string | null;
    createdAt: string;
  } | null;
};

type AutopostLog = {
  id: string;
  status: string;
  detail: string | null;
  externalPostId: string | null;
  createdAt: string;
  schedule: {
    id: string;
    title: string;
    targetName: string;
    platform: string;
  };
};

type AutopostSnapshot = {
  targets: AutopostTarget[];
  telegramGroups: TelegramGroupOption[];
  schedules: AutopostSchedule[];
  logs: AutopostLog[];
  stats: {
    telegramTargets: number;
    discordTargets: number;
    sentCount: number;
    scheduledCount: number;
  };
};

const autopostFrequencyOptions = [
  { value: "ONCE", label: "M?t l?n" },
  { value: "DAILY", label: "H?ng ng?y" },
  { value: "WEEKLY", label: "H?ng tu?n" },
  { value: "MONTHLY", label: "H?ng th?ng" },
];


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
    return "ChÆ°a háº¹n giá»";
  }

  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function toLocalDateTimeInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoFromLocalDateTime(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function getScheduleTone(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
    case "FAILED":
      return "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
    case "RUNNING":
      return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
    case "DRAFT":
      return "bg-[color:var(--surface-low)] text-[color:var(--on-surface)]";
    default:
      return "bg-[color:var(--primary-soft)] text-[color:var(--primary)]";
  }
}

function getFrequencyLabel(value: string) {
  return (
    autopostFrequencyOptions.find((option) => option.value === value)?.label || value
  );
}


export function AutopostWorkbench() {
  const [token, setToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AutopostSnapshot | null>(null);
  const [selectedTelegramGroupIds, setSelectedTelegramGroupIds] = useState<string[]>([]);
  const [selectAllTelegramGroups, setSelectAllTelegramGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [togglingScheduleId, setTogglingScheduleId] = useState<string | null>(null);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    title: "Báº£n tin tá»± Ä‘á»™ng",
    message: "Ná»™i dung autopost Ä‘Æ°á»£c táº¡o tá»« CRM.",
    mediaUrl: "",
    frequency: "ONCE",
    scheduledFor: "",
    saveAsDraft: false,
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  useEffect(() => {
    let active = true;

    async function load(currentToken: string) {
      try {
        const data = await fetchJson<AutopostSnapshot>(`${apiBaseUrl}/autopost`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (!active) {
          return;
        }

        setSnapshot(data);
        setSelectedTelegramGroupIds((current) =>
          current.length ? current : data.telegramGroups.slice(0, 1).map((group) => group.id),
        );
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u autopost.",
        );
      } finally {
        if (active) {
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
      active = false;
    };
  }, [token]);

  const selectedGroupCount = useMemo(() => {
    if (!snapshot) {
      return 0;
    }

    return selectAllTelegramGroups
      ? snapshot.telegramGroups.length
      : selectedTelegramGroupIds.length;
  }, [selectAllTelegramGroups, selectedTelegramGroupIds.length, snapshot]);

  async function refreshSnapshot() {
    if (!token) {
      return;
    }

    const data = await fetchJson<AutopostSnapshot>(`${apiBaseUrl}/autopost`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSnapshot(data);
  }

  function toggleTelegramGroup(groupId: string, checked: boolean) {
    setSelectedTelegramGroupIds((current) =>
      checked
        ? [...new Set([...current, groupId])]
        : current.filter((item) => item !== groupId),
    );
  }

  async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("KhÃ´ng thá»ƒ Ä‘á»c file hÃ¬nh."));
      reader.readAsDataURL(file);
    });
  }

  async function handleImageSelect(file: File | null) {
    if (!file) {
      setScheduleForm((current) => ({ ...current, mediaUrl: "" }));
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setScheduleForm((current) => ({ ...current, mediaUrl: dataUrl }));
  }

  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setIsCreatingSchedule(true);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{
        created: number;
        snapshot: AutopostSnapshot;
      }>(`${apiBaseUrl}/autopost/schedules`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...scheduleForm,
          scheduledFor: toIsoFromLocalDateTime(scheduleForm.scheduledFor),
          mediaUrl: scheduleForm.mediaUrl || null,
          telegramGroupIds: selectAllTelegramGroups ? [] : selectedTelegramGroupIds,
          selectAllTelegramGroups,
        }),
      });
      setSnapshot(result.snapshot);
      setNotice(`ÄÃ£ táº¡o ${result.created} lá»‹ch autopost.`);
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error ? scheduleError.message : "KhÃ´ng thá»ƒ táº¡o lá»‹ch autopost.",
      );
    } finally {
      setIsCreatingSchedule(false);
    }
  }

  function startEditSchedule(schedule: AutopostSchedule) {
    setEditingScheduleId(schedule.id);
    setScheduleForm({
      title: schedule.title,
      message: schedule.message,
      mediaUrl: schedule.mediaUrl || "",
      frequency: schedule.frequency,
      scheduledFor: toLocalDateTimeInputValue(schedule.scheduledFor),
      saveAsDraft: schedule.status === "DRAFT",
    });
    setSelectAllTelegramGroups(false);
    const matchingGroup =
      snapshot?.telegramGroups.find((group) => group.externalId === schedule.target.externalId) ??
      null;
    setSelectedTelegramGroupIds(matchingGroup ? [matchingGroup.id] : []);
  }

  function resetScheduleForm() {
    setEditingScheduleId(null);
    setScheduleForm({
      title: "Báº£n tin tá»± Ä‘á»™ng",
      message: "Ná»™i dung autopost Ä‘Æ°á»£c táº¡o tá»« CRM.",
      mediaUrl: "",
      frequency: "ONCE",
      scheduledFor: "",
      saveAsDraft: false,
    });
  }

  async function handleUpdateSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !editingScheduleId) {
      return;
    }

    setIsUpdatingSchedule(true);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{ updated: boolean; snapshot: AutopostSnapshot }>(
        `${apiBaseUrl}/autopost/schedules/${editingScheduleId}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...scheduleForm,
            scheduledFor: toIsoFromLocalDateTime(scheduleForm.scheduledFor),
            mediaUrl: scheduleForm.mediaUrl || null,
            telegramGroupIds: selectAllTelegramGroups ? [] : selectedTelegramGroupIds,
            selectAllTelegramGroups,
          }),
        },
      );
      setSnapshot(result.snapshot);
      setNotice("ÄÃ£ cáº­p nháº­t lá»‹ch autopost.");
      resetScheduleForm();
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "KhÃ´ng thá»ƒ cáº­p nháº­t lá»‹ch autopost.",
      );
    } finally {
      setIsUpdatingSchedule(false);
    }
  }

  async function handleSendNow() {
    if (!token) {
      return;
    }

    setIsSendingNow(true);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{
        dispatched: number;
        snapshot: AutopostSnapshot;
      }>(`${apiBaseUrl}/autopost/send-now`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...scheduleForm,
          scheduledFor: null,
          mediaUrl: scheduleForm.mediaUrl || null,
          telegramGroupIds: selectAllTelegramGroups ? [] : selectedTelegramGroupIds,
          selectAllTelegramGroups,
        }),
      });
      setSnapshot(result.snapshot);
      setNotice(`ÄÃ£ gá»­i ngay tá»›i ${result.dispatched} group.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "KhÃ´ng thá»ƒ gá»­i ngay.");
    } finally {
      setIsSendingNow(false);
    }
  }

  async function handleToggleSchedule(scheduleId: string) {
    if (!token) {
      return;
    }

    setTogglingScheduleId(scheduleId);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{
        toggled: boolean;
        status: string;
        snapshot: AutopostSnapshot;
      }>(`${apiBaseUrl}/autopost/schedules/${scheduleId}/toggle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSnapshot(result.snapshot);
      setNotice(`ÄÃ£ Ä‘á»•i tráº¡ng thÃ¡i lá»‹ch sang ${result.status}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "KhÃ´ng thá»ƒ báº­t/táº¯t lá»‹ch.");
    } finally {
      setTogglingScheduleId(null);
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!token) {
      return;
    }

    setDeletingScheduleId(scheduleId);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{ deleted: boolean; snapshot: AutopostSnapshot }>(
        `${apiBaseUrl}/autopost/schedules/${scheduleId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setSnapshot(result.snapshot);
      setNotice("ÄÃ£ xÃ³a lá»‹ch autopost.");
      if (editingScheduleId === scheduleId) {
        resetScheduleForm();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "KhÃ´ng thá»ƒ xÃ³a lá»‹ch.");
    } finally {
      setDeletingScheduleId(null);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
          Äang táº£i dá»¯ liá»‡u autopost...
        </p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--warning)]">
          Cáº§n Ä‘Äƒng nháº­p báº±ng tÃ i khoáº£n cÃ³ quyá»n autopost Ä‘á»ƒ thao tÃ¡c.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Target Telegram", snapshot?.stats.telegramTargets ?? 0],
          ["Target Discord", snapshot?.stats.discordTargets ?? 0],
          ["ÄÃ£ gá»­i", snapshot?.stats.sentCount ?? 0],
          ["Äang chá»", snapshot?.stats.scheduledCount ?? 0],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-[24px] bg-[color:var(--surface-card)] px-5 py-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
              {label}
            </p>
            <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
          </article>
        ))}
      </div>

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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Group Telegram
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            Láº¥y trá»±c tiáº¿p tá»« danh sÃ¡ch group Ä‘Ã£ sync
          </h3>
          <p className="mt-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            KhÃ´ng cáº§n khai bÃ¡o channel thá»§ cÃ´ng ná»¯a. Worker sáº½ tá»± táº¡o target Telegram tá»« group
            anh chá»n khi lÃªn lá»‹ch.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectAllTelegramGroups(true);
                setSelectedTelegramGroupIds([]);
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                selectAllTelegramGroups
                  ? "bg-[color:var(--primary)] text-white"
                  : "bg-[color:var(--surface-low)]"
              }`}
            >
              Chá»n táº¥t cáº£
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectAllTelegramGroups(false);
                setSelectedTelegramGroupIds([]);
              }}
              className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
            >
              Bá» chá»n
            </button>
            <span className="inline-flex items-center rounded-full bg-[color:var(--primary-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
              ÄÃ£ chá»n {selectedGroupCount} group
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {snapshot?.telegramGroups.length ? null : (
              <div className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm text-[color:var(--on-surface-variant)]">
                ChÆ°a cÃ³ group nÃ o Ä‘Æ°á»£c sync. HÃ£y vÃ o mÃ n Telegram Ä‘á»ƒ verify bot vÃ  Ä‘á»“ng bá»™
                group trÆ°á»›c.
              </div>
            )}

            {snapshot?.telegramGroups.map((group) => (
              <label
                key={group.id}
                className="flex items-start gap-3 rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4"
              >
                <input
                  type="checkbox"
                  disabled={selectAllTelegramGroups}
                  checked={
                    selectAllTelegramGroups || selectedTelegramGroupIds.includes(group.id)
                  }
                  onChange={(event) => toggleTelegramGroup(group.id, event.target.checked)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold">{group.title}</p>
                  <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                    {group.externalId}
                    {group.username ? ` Â· ${group.username}` : ""}
                    {group.type ? ` Â· ${group.type}` : ""}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Lá»‹ch autopost
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">
                LÃªn lá»‹ch post text hoáº·c áº£nh cho nhiá»u group cÃ¹ng lÃºc
              </h3>
            </div>
            <button
              onClick={() => void refreshSnapshot()}
              className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
            >
              Táº£i láº¡i
            </button>
          </div>

          <form
            onSubmit={(event) =>
              editingScheduleId ? void handleUpdateSchedule(event) : void handleCreateSchedule(event)
            }
            className="mt-6 space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={scheduleForm.title}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, title: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="TiÃªu Ä‘á» bÃ i"
              />
              <select
                value={scheduleForm.frequency}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, frequency: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                {autopostFrequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={scheduleForm.message}
              onChange={(event) =>
                setScheduleForm((current) => ({ ...current, message: event.target.value }))
              }
              rows={5}
              className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              placeholder="Ná»™i dung gá»­i Ä‘i"
            />

            <input
              value={
                scheduleForm.mediaUrl.startsWith("data:")
                  ? "ÄÃ£ chá»n áº£nh tá»« mÃ¡y"
                  : scheduleForm.mediaUrl
              }
              onChange={(event) =>
                setScheduleForm((current) => ({ ...current, mediaUrl: event.target.value }))
              }
              className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              placeholder="URL hÃ¬nh áº£nh (tÃ¹y chá»n)"
            />
            <label className="flex cursor-pointer items-center justify-center rounded-[18px] border border-dashed border-[color:var(--outline)] bg-[color:var(--surface-low)] px-4 py-4 text-sm font-semibold text-[color:var(--on-surface)]">
              Upload áº£nh tá»« mÃ¡y
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) =>
                  void handleImageSelect(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <p className="text-sm text-[color:var(--on-surface-variant)]">
              CÃ³ thá»ƒ dÃ¡n URL áº£nh hoáº·c upload áº£nh trá»±c tiáº¿p. Telegram sáº½ gá»­i áº£nh báº±ng `sendPhoto`.
              TiÃªu Ä‘á» vÃ  ná»™i dung sáº½ Ä‘i vÃ o caption.
            </p>
            {scheduleForm.mediaUrl ? (
              <div className="rounded-[18px] bg-[color:var(--surface-low)] p-3">
                <Image
                  src={scheduleForm.mediaUrl}
                  alt="áº¢nh autopost"
                  width={720}
                  height={420}
                  unoptimized
                  className="max-h-56 w-auto rounded-[14px] object-cover"
                />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <input
                type="datetime-local"
                value={scheduleForm.scheduledFor}
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    scheduledFor: event.target.value,
                  }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              />
              <label className="flex items-center gap-3 rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={scheduleForm.saveAsDraft}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      saveAsDraft: event.target.checked,
                    }))
                  }
                />
                LÆ°u draft
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={
                  isCreatingSchedule ||
                  isUpdatingSchedule ||
                  isSendingNow ||
                  (!selectAllTelegramGroups && selectedTelegramGroupIds.length === 0)
                }
                className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {editingScheduleId
                  ? isUpdatingSchedule
                    ? "Äang cáº­p nháº­t..."
                    : "LÆ°u chá»‰nh sá»­a"
                  : isCreatingSchedule
                    ? "Äang táº¡o lá»‹ch..."
                    : "Táº¡o lá»‹ch"}
              </button>
              <button
                type="button"
                onClick={() => void handleSendNow()}
                disabled={
                  isSendingNow ||
                  isCreatingSchedule ||
                  isUpdatingSchedule ||
                  (!selectAllTelegramGroups && selectedTelegramGroupIds.length === 0)
                }
                className="rounded-[18px] bg-[color:var(--primary-soft)] px-5 py-3 text-sm font-bold text-[color:var(--primary)] disabled:opacity-60"
              >
                {isSendingNow ? "Äang gá»­i..." : "Gá»­i ngay"}
              </button>
              {editingScheduleId ? (
                <button
                  type="button"
                  onClick={() => resetScheduleForm()}
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-bold"
                >
                  Há»§y sá»­a
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 space-y-3">
            {snapshot?.schedules.map((schedule) => (
              <article
                key={schedule.id}
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{schedule.title}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      {schedule.target.displayName} Â· {schedule.frequency} Â·{" "}
                      {formatDateTime(schedule.scheduledFor)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface)]">
                      {schedule.message}
                    </p>
                    {schedule.mediaUrl ? (
                      <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                        áº¢nh: {schedule.mediaUrl}
                      </p>
                    ) : null}
                    {schedule.latestLog ? (
                      <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                        Log má»›i nháº¥t: {schedule.latestLog.status} Â·{" "}
                        {schedule.latestLog.detail ?? "KhÃ´ng cÃ³ chi tiáº¿t"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-start gap-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getScheduleTone(
                        schedule.status,
                      )}`}
                    >
                      {schedule.status}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditSchedule(schedule)}
                        className="rounded-[16px] bg-white/80 px-4 py-2 text-sm font-semibold"
                      >
                        Sá»­a
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleSchedule(schedule.id)}
                        disabled={togglingScheduleId === schedule.id}
                        className="rounded-[16px] bg-white/80 px-4 py-2 text-sm font-semibold"
                      >
                        {togglingScheduleId === schedule.id
                          ? "Äang Ä‘á»•i..."
                          : schedule.status === "DRAFT"
                            ? "Báº­t"
                            : "Táº¯t"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSchedule(schedule.id)}
                        disabled={deletingScheduleId === schedule.id}
                        className="rounded-[16px] bg-[color:var(--danger-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--danger)]"
                      >
                        {deletingScheduleId === schedule.id ? "Äang xÃ³a..." : "XÃ³a"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
          Nháº­t kÃ½ dispatch
        </p>
        <h3 className="mt-2 text-2xl font-black tracking-tight">
          Theo dÃµi tá»«ng láº§n gá»­i bÃ i, tráº¡ng thÃ¡i vÃ  external post id
        </h3>

        <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="min-w-[860px] w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Lá»‹ch</th>
                <th className="px-5 py-4 font-semibold">Loáº¡i bÃ i</th>
                <th className="px-5 py-4 font-semibold">Target</th>
                <th className="px-5 py-4 font-semibold">Káº¿t quáº£</th>
                <th className="px-5 py-4 font-semibold">Thá»i gian</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.logs.map((log, index) => {
                const schedule = snapshot.schedules.find((item) => item.id === log.schedule.id);

                return (
                  <tr key={log.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                    <td className="px-5 py-4 align-top">
                      <p className="text-sm font-bold">{log.schedule.title}</p>
                      <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                        {log.schedule.platform}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {schedule?.mediaUrl ? "áº¢nh + caption" : "Text"}
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      <p>{log.schedule.targetName}</p>
                      <p className="mt-1">{log.externalPostId ?? "ChÆ°a cÃ³ post id"}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getScheduleTone(
                          log.status,
                        )}`}
                      >
                        {log.status}
                      </span>
                      <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                        {log.detail ?? "KhÃ´ng cÃ³ chi tiáº¿t"}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {formatDateTime(log.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

