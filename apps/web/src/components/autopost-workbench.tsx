"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type GroupedAutopostSchedule = {
  id: string;
  title: string;
  message: string;
  mediaUrl: string | null;
  frequency: string;
  target: {
    displayName: string;
    externalId: string;
  };
  schedules: AutopostSchedule[];
  latestScheduledFor: string | null;
  latestLog: AutopostSchedule["latestLog"];
  statusSummary: string;
};

const autopostFrequencyOptions = [
  { value: "ONCE", label: "Một lần" },
  { value: "DAILY", label: "Hàng ngày" },
  { value: "WEEKLY", label: "Hàng tuần" },
  { value: "MONTHLY", label: "Hàng tháng" },
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
    return "Chưa hẹn giờ";
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

function toLocalTimeInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toLocalDateInputValue(value: string | null) {
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
  return `${year}-${month}-${day}`;
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

function summarizeGroupStatus(schedules: AutopostSchedule[]) {
  const statuses = new Set(schedules.map((item) => item.status));
  if (statuses.size === 1) {
    return schedules[0]?.status || "SCHEDULED";
  }
  if (statuses.has("RUNNING")) {
    return "RUNNING";
  }
  if (statuses.has("FAILED")) {
    return "MIXED";
  }
  if (statuses.has("SCHEDULED")) {
    return "SCHEDULED";
  }
  return "MIXED";
}


export function AutopostWorkbench({
  workspaceId = null,
  telegramBotId = null,
}: {
  workspaceId?: string | null;
  telegramBotId?: string | null;
}) {
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
  const [expandedScheduleGroupIds, setExpandedScheduleGroupIds] = useState<string[]>([]);
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    title: "Bản tin tự động",
    message: "Nội dung autopost được tạo từ CRM.",
    mediaUrl: "",
    frequency: "ONCE",
    scheduledFor: "",
    baseDate: "",
    scheduledTime: "",
    timeSlots: [] as string[],
    saveAsDraft: false,
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  const buildHeaders = useCallback((currentToken: string) => ({
    Authorization: `Bearer ${currentToken}`,
    ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    ...(telegramBotId ? { "X-Telegram-Bot-Id": telegramBotId } : {}),
  }), [telegramBotId, workspaceId]);

  useEffect(() => {
    let active = true;

    async function load(currentToken: string) {
      try {
        const data = await fetchJson<AutopostSnapshot>(`${apiBaseUrl}/autopost`, {
          headers: buildHeaders(currentToken),
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
          loadError instanceof Error ? loadError.message : "Không thể tải dữ liệu autopost.",
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
  }, [buildHeaders, token]);

  const selectedGroupCount = useMemo(() => {
    if (!snapshot) {
      return 0;
    }

    return selectAllTelegramGroups
      ? snapshot.telegramGroups.length
      : selectedTelegramGroupIds.length;
  }, [selectAllTelegramGroups, selectedTelegramGroupIds.length, snapshot]);

  const groupedSchedules = useMemo(() => {
    if (!snapshot?.schedules.length) {
      return [] as GroupedAutopostSchedule[];
    }

    const groups = new Map<string, GroupedAutopostSchedule>();
    for (const schedule of snapshot.schedules) {
      const key = [
        schedule.title,
        schedule.message,
        schedule.mediaUrl || "",
        schedule.frequency,
        schedule.target.externalId,
      ].join("::");

      const existing = groups.get(key);
      if (existing) {
        existing.schedules.push(schedule);
        if (
          schedule.scheduledFor &&
          (!existing.latestScheduledFor ||
            new Date(schedule.scheduledFor).getTime() >
              new Date(existing.latestScheduledFor).getTime())
        ) {
          existing.latestScheduledFor = schedule.scheduledFor;
        }
        if (
          schedule.latestLog &&
          (!existing.latestLog ||
            new Date(schedule.latestLog.createdAt).getTime() >
              new Date(existing.latestLog.createdAt).getTime())
        ) {
          existing.latestLog = schedule.latestLog;
        }
        continue;
      }

      groups.set(key, {
        id: key,
        title: schedule.title,
        message: schedule.message,
        mediaUrl: schedule.mediaUrl,
        frequency: schedule.frequency,
        target: {
          displayName: schedule.target.displayName,
          externalId: schedule.target.externalId,
        },
        schedules: [schedule],
        latestScheduledFor: schedule.scheduledFor,
        latestLog: schedule.latestLog,
        statusSummary: schedule.status,
      });
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        schedules: [...group.schedules].sort((a, b) => {
          const timeA = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0;
          const timeB = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0;
          return timeA - timeB;
        }),
        statusSummary: summarizeGroupStatus(group.schedules),
      }))
      .sort((a, b) => {
        const timeA = a.latestScheduledFor ? new Date(a.latestScheduledFor).getTime() : 0;
        const timeB = b.latestScheduledFor ? new Date(b.latestScheduledFor).getTime() : 0;
        return timeB - timeA;
      });
  }, [snapshot?.schedules]);

  async function refreshSnapshot() {
    if (!token) {
      return;
    }

    const data = await fetchJson<AutopostSnapshot>(`${apiBaseUrl}/autopost`, {
      headers: buildHeaders(token),
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

  const selectedGroups = useMemo(
    () =>
      snapshot?.telegramGroups.filter((group) => selectedTelegramGroupIds.includes(group.id)) ?? [],
    [selectedTelegramGroupIds, snapshot?.telegramGroups],
  );

  async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Không thể đọc file hình."));
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

    const timeSlots =
      scheduleForm.frequency === "ONCE"
        ? []
        : scheduleForm.timeSlots.length
          ? scheduleForm.timeSlots
          : scheduleForm.scheduledTime
            ? [scheduleForm.scheduledTime]
            : [];

    try {
      const result = await fetchJson<{
        created: number;
        snapshot: AutopostSnapshot;
      }>(`${apiBaseUrl}/autopost/schedules`, {
        method: "POST",
        headers: buildHeaders(token),
        body: JSON.stringify({
          ...scheduleForm,
          scheduledFor:
            scheduleForm.frequency === "ONCE"
              ? toIsoFromLocalDateTime(scheduleForm.scheduledFor)
              : null,
          baseDate: scheduleForm.baseDate || null,
          timeSlots,
          mediaUrl: scheduleForm.mediaUrl || null,
          telegramGroupIds: selectAllTelegramGroups ? [] : selectedTelegramGroupIds,
          selectAllTelegramGroups,
        }),
      });
      setSnapshot(result.snapshot);
      setNotice(`Đã tạo ${result.created} lịch autopost.`);
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error ? scheduleError.message : "Không thể tạo lịch autopost.",
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
      baseDate: toLocalDateInputValue(schedule.scheduledFor),
      scheduledTime: toLocalTimeInputValue(schedule.scheduledFor),
      timeSlots: toLocalTimeInputValue(schedule.scheduledFor)
        ? [toLocalTimeInputValue(schedule.scheduledFor)]
        : [],
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
      title: "Bản tin tự động",
      message: "Nội dung autopost được tạo từ CRM.",
      mediaUrl: "",
      frequency: "ONCE",
      scheduledFor: "",
      baseDate: "",
      scheduledTime: "",
      timeSlots: [],
      saveAsDraft: false,
    });
  }

  function toggleScheduleGroup(groupId: string) {
    setExpandedScheduleGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((item) => item !== groupId)
        : [...current, groupId],
    );
  }

  function addTimeSlot() {
    if (!scheduleForm.scheduledTime) {
      return;
    }

    setScheduleForm((current) => ({
      ...current,
      timeSlots: [...new Set([...current.timeSlots, current.scheduledTime])].sort(),
      scheduledTime: "",
    }));
  }

  function removeTimeSlot(timeSlot: string) {
    setScheduleForm((current) => ({
      ...current,
      timeSlots: current.timeSlots.filter((item) => item !== timeSlot),
    }));
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
          headers: buildHeaders(token),
          body: JSON.stringify({
            ...scheduleForm,
            scheduledFor:
              scheduleForm.frequency === "ONCE"
                ? toIsoFromLocalDateTime(scheduleForm.scheduledFor)
                : null,
            baseDate: scheduleForm.baseDate || null,
            timeSlots:
              scheduleForm.frequency === "ONCE"
                ? []
                : scheduleForm.timeSlots.length
                  ? scheduleForm.timeSlots
                  : scheduleForm.scheduledTime
                    ? [scheduleForm.scheduledTime]
                    : [],
            mediaUrl: scheduleForm.mediaUrl || null,
            telegramGroupIds: selectAllTelegramGroups ? [] : selectedTelegramGroupIds,
            selectAllTelegramGroups,
          }),
        },
      );
      setSnapshot(result.snapshot);
      setNotice("Đã cập nhật lịch autopost.");
      resetScheduleForm();
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Không thể cập nhật lịch autopost.",
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
        headers: buildHeaders(token),
        body: JSON.stringify({
          ...scheduleForm,
          scheduledFor: null,
          mediaUrl: scheduleForm.mediaUrl || null,
          telegramGroupIds: selectAllTelegramGroups ? [] : selectedTelegramGroupIds,
          selectAllTelegramGroups,
        }),
      });
      setSnapshot(result.snapshot);
      setNotice(`Đã gửi ngay tới ${result.dispatched} group.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Không thể gửi ngay.");
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
        headers: buildHeaders(token),
      });
      setSnapshot(result.snapshot);
      setNotice(`Đã đổi trạng thái lịch sang ${result.status}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Không thể bật/tắt lịch.");
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
          headers: buildHeaders(token),
        },
      );
      setSnapshot(result.snapshot);
      setNotice("Đã xóa lịch autopost.");
      if (editingScheduleId === scheduleId) {
        resetScheduleForm();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa lịch.");
    } finally {
      setDeletingScheduleId(null);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
          Đang tải dữ liệu autopost...
        </p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--warning)]">
          Cần đăng nhập bằng tài khoản có quyền autopost để thao tác.
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
          ["Đã gửi", snapshot?.stats.sentCount ?? 0],
          ["Đang chờ", snapshot?.stats.scheduledCount ?? 0],
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

      <div className="space-y-6">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Lịch autopost
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">
                Lên lịch post text hoặc ảnh cho nhiều group cùng lúc
              </h3>
            </div>
            <button
              onClick={() => void refreshSnapshot()}
              className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
            >
              Tải lại
            </button>
          </div>

          <form
            onSubmit={(event) =>
              editingScheduleId ? void handleUpdateSchedule(event) : void handleCreateSchedule(event)
            }
            className="mt-6 space-y-4"
          >
            <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">Nhóm Telegram nhận bài</p>
                  <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                    Chọn nhiều group trong một menu gọn rồi lên lịch trong cùng một form.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
                  Đã chọn {selectedGroupCount} group
                </span>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsGroupPickerOpen((current) => !current)}
                    className="flex w-full items-center justify-between rounded-[18px] bg-white px-4 py-4 text-left text-sm font-semibold"
                  >
                    <span className="truncate">
                      {selectAllTelegramGroups
                        ? "Tất cả group Telegram"
                        : selectedTelegramGroupIds.length
                          ? selectedGroups.map((group) => group.title).join(", ")
                          : "Chọn group Telegram"}
                    </span>
                    <span className="ml-3 text-xs text-[color:var(--on-surface-variant)]">
                      {isGroupPickerOpen ? "Thu gọn" : "Mở"}
                    </span>
                  </button>

                  {isGroupPickerOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-20 rounded-[20px] border border-[color:var(--outline)] bg-white p-4 shadow-[0_16px_40px_rgba(42,52,57,0.14)]">
                      <div className="flex flex-wrap gap-3">
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
                          Chọn tất cả
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectAllTelegramGroups(false);
                            setSelectedTelegramGroupIds([]);
                          }}
                          className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
                        >
                          Bỏ chọn
                        </button>
                      </div>

                      <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                        {snapshot?.telegramGroups.length ? null : (
                          <div className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm text-[color:var(--on-surface-variant)]">
                            Chưa có group nào được sync. Hãy vào màn Telegram để verify bot và đồng bộ
                            group trước.
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
                              onChange={(event) =>
                                toggleTelegramGroup(group.id, event.target.checked)
                              }
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-bold">{group.title}</p>
                              <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                                {group.externalId}
                                {group.username ? ` · ${group.username}` : ""}
                                {group.type ? ` · ${group.type}` : ""}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectAllTelegramGroups(true);
                    setSelectedTelegramGroupIds([]);
                  }}
                  className={`rounded-[18px] px-4 py-4 text-sm font-semibold ${
                    selectAllTelegramGroups
                      ? "bg-[color:var(--primary)] text-white"
                      : "bg-white"
                  }`}
                >
                  Tất cả
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectAllTelegramGroups(false);
                    setSelectedTelegramGroupIds([]);
                  }}
                  className="rounded-[18px] bg-white px-4 py-4 text-sm font-semibold"
                >
                  Xóa chọn
                </button>
              </div>

              {!selectAllTelegramGroups && selectedTelegramGroupIds.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedGroups.map((group) => (
                      <span
                        key={group.id}
                        className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--primary)]"
                      >
                        {group.title}
                        <button
                          type="button"
                          onClick={() => toggleTelegramGroup(group.id, false)}
                        >
                          ×
                        </button>
                      </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4">
              <input
                value={scheduleForm.title}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, title: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Tiêu đề bài"
              />
            </div>

            <textarea
              value={scheduleForm.message}
              onChange={(event) =>
                setScheduleForm((current) => ({ ...current, message: event.target.value }))
              }
              rows={5}
              className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              placeholder="Nội dung gửi đi"
            />

            <input
              value={
                scheduleForm.mediaUrl.startsWith("data:")
                  ? "Đã chọn ảnh từ máy"
                  : scheduleForm.mediaUrl
              }
              onChange={(event) =>
                setScheduleForm((current) => ({ ...current, mediaUrl: event.target.value }))
              }
              className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              placeholder="URL hình ảnh (tùy chọn)"
            />
            <label className="flex cursor-pointer items-center justify-center rounded-[18px] border border-dashed border-[color:var(--outline)] bg-[color:var(--surface-low)] px-4 py-4 text-sm font-semibold text-[color:var(--on-surface)]">
              Upload ảnh từ máy
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
              Có thể dán URL ảnh hoặc upload ảnh trực tiếp. Telegram sẽ gửi ảnh bằng `sendPhoto`.
              Tiêu đề và nội dung sẽ đi vào caption.
            </p>
            {scheduleForm.mediaUrl ? (
              <div className="rounded-[18px] bg-[color:var(--surface-low)] p-3">
                <Image
                  src={scheduleForm.mediaUrl}
                  alt="Ảnh autopost"
                  width={720}
                  height={420}
                  unoptimized
                  className="max-h-56 w-auto rounded-[14px] object-cover"
                />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <select
                value={scheduleForm.frequency}
                onChange={(event) =>
                  setScheduleForm((current) => ({
                    ...current,
                    frequency: event.target.value,
                    baseDate:
                      event.target.value === "ONCE"
                        ? current.baseDate
                        : current.baseDate || toLocalDateInputValue(current.scheduledFor),
                    scheduledTime:
                      event.target.value === "ONCE"
                        ? current.scheduledTime
                        : current.scheduledTime || toLocalTimeInputValue(current.scheduledFor),
                    timeSlots:
                      event.target.value === "ONCE" ? [] : current.timeSlots,
                  }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                {autopostFrequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {scheduleForm.frequency === "ONCE" ? (
                <input
                  type="datetime-local"
                  value={scheduleForm.scheduledFor}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      scheduledFor: event.target.value,
                      baseDate: toLocalDateInputValue(event.target.value),
                      scheduledTime: toLocalTimeInputValue(event.target.value),
                      timeSlots: toLocalTimeInputValue(event.target.value)
                        ? [toLocalTimeInputValue(event.target.value)]
                        : [],
                    }))
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:col-span-2">
                  {scheduleForm.frequency === "DAILY" ? null : (
                    <input
                      type="date"
                      value={scheduleForm.baseDate}
                      onChange={(event) =>
                        setScheduleForm((current) => ({
                          ...current,
                          baseDate: event.target.value,
                        }))
                      }
                      className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                    />
                  )}
                  <input
                    type="time"
                    value={scheduleForm.scheduledTime}
                    onChange={(event) =>
                      setScheduleForm((current) => ({
                        ...current,
                        scheduledTime: event.target.value,
                      }))
                    }
                    className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => addTimeSlot()}
                    disabled={!scheduleForm.scheduledTime || Boolean(editingScheduleId)}
                    className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm font-semibold disabled:opacity-50"
                  >
                    Thêm giờ
                  </button>
                </div>
              )}
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
                Lưu draft
              </label>
            </div>
            {scheduleForm.frequency === "ONCE" ? null : (
              <div className="flex flex-wrap gap-2">
                {(scheduleForm.timeSlots.length
                  ? scheduleForm.timeSlots
                  : scheduleForm.scheduledTime
                    ? [scheduleForm.scheduledTime]
                    : []
                ).map((timeSlot) => (
                  <span
                    key={timeSlot}
                    className="inline-flex items-center gap-2 rounded-full bg-[color:var(--primary-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--primary)]"
                  >
                    {timeSlot}
                    {editingScheduleId ? null : (
                      <button type="button" onClick={() => removeTimeSlot(timeSlot)}>
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm text-[color:var(--on-surface-variant)]">
              {scheduleForm.frequency === "ONCE"
                ? "Lịch một lần cần chọn ngày và giờ cụ thể."
                : scheduleForm.frequency === "DAILY"
                  ? "Lịch hàng ngày có thể chọn nhiều khung giờ. Mỗi khung giờ sẽ tạo một lịch chạy riêng."
                  : "Lịch lặp có thể chọn nhiều khung giờ. Ngày mốc sẽ quyết định thứ trong tuần hoặc ngày trong tháng."}
            </p>
            {editingScheduleId && scheduleForm.frequency !== "ONCE" ? (
              <p className="text-sm text-[color:var(--warning)]">
                Chế độ sửa hiện chỉnh từng lịch một. Muốn thêm nhiều khung giờ, hãy tạo lịch mới.
              </p>
            ) : null}

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
                    ? "Đang cập nhật..."
                    : "Lưu chỉnh sửa"
                  : isCreatingSchedule
                    ? "Đang tạo lịch..."
                    : "Tạo lịch"}
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
                {isSendingNow ? "Đang gửi..." : "Gửi ngay"}
              </button>
              {editingScheduleId ? (
                <button
                  type="button"
                  onClick={() => resetScheduleForm()}
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-bold"
                >
                  Hủy sửa
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 space-y-4">
            {groupedSchedules.map((group) => (
              <article
                key={group.id}
                className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{group.title}</p>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getScheduleTone(
                          group.statusSummary,
                        )}`}
                      >
                        {group.statusSummary}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-[color:var(--primary-soft)] px-3 py-1.5 text-sm font-bold text-[color:var(--primary)]">
                        {group.target.displayName}
                      </span>
                      <span className="text-sm text-[color:var(--on-surface-variant)]">
                        {getFrequencyLabel(group.frequency)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.schedules.map((schedule) => (
                        <span
                          key={schedule.id}
                          className={`inline-flex rounded-full px-3 py-2 text-sm font-semibold ${getScheduleTone(
                            schedule.status,
                          )}`}
                        >
                          {toLocalTimeInputValue(schedule.scheduledFor) ||
                            formatDateTime(schedule.scheduledFor)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface)]">
                      {group.message}
                    </p>
                    {group.mediaUrl ? (
                      <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                        Ảnh: {group.mediaUrl}
                      </p>
                    ) : null}
                    {group.latestLog ? (
                      <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                        Log mới nhất: {group.latestLog.status} ·{" "}
                        {group.latestLog.detail ?? "Không có chi tiết"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleScheduleGroup(group.id)}
                      className="rounded-[16px] bg-white/80 px-4 py-2 text-sm font-semibold"
                    >
                      {expandedScheduleGroupIds.includes(group.id) ? "Thu gọn" : "Xem khung giờ"}
                    </button>
                  </div>
                </div>
                {expandedScheduleGroupIds.includes(group.id) ? (
                  <div className="mt-4 space-y-3 border-t border-white/70 pt-4">
                    {group.schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="flex flex-col gap-3 rounded-[18px] bg-white/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {formatDateTime(schedule.scheduledFor)}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                            Trạng thái: {schedule.status}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditSchedule(schedule)}
                            className="rounded-[16px] bg-white px-4 py-2 text-sm font-semibold"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleSchedule(schedule.id)}
                            disabled={togglingScheduleId === schedule.id}
                            className="rounded-[16px] bg-white px-4 py-2 text-sm font-semibold"
                          >
                            {togglingScheduleId === schedule.id
                              ? "Đang đổi..."
                              : schedule.status === "DRAFT"
                                ? "Bật"
                                : "Tắt"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSchedule(schedule.id)}
                            disabled={deletingScheduleId === schedule.id}
                            className="rounded-[16px] bg-[color:var(--danger-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--danger)]"
                          >
                            {deletingScheduleId === schedule.id ? "Đang xóa..." : "Xóa"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
          Nhật ký gửi bài
        </p>
        <h3 className="mt-2 text-2xl font-black tracking-tight">
          Theo dõi từng lần gửi bài, trạng thái và external post id
        </h3>

        <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="min-w-[860px] w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Lịch</th>
                <th className="px-5 py-4 font-semibold">Loại bài</th>
                <th className="px-5 py-4 font-semibold">Target</th>
                <th className="px-5 py-4 font-semibold">Kết quả</th>
                <th className="px-5 py-4 font-semibold">Thời gian</th>
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
                      {schedule?.mediaUrl ? "Ảnh + caption" : "Text"}
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      <p>{log.schedule.targetName}</p>
                      <p className="mt-1">{log.externalPostId ?? "Chưa có post id"}</p>
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
                        {log.detail ?? "Không có chi tiết"}
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

