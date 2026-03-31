"use client";

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

export function AutopostWorkbench() {
  const [token, setToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AutopostSnapshot | null>(null);
  const [selectedTelegramGroupIds, setSelectedTelegramGroupIds] = useState<string[]>([]);
  const [selectAllTelegramGroups, setSelectAllTelegramGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [isDispatchingAll, setIsDispatchingAll] = useState(false);
  const [dispatchingScheduleId, setDispatchingScheduleId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    title: "Bản tin tự động",
    message: "Nội dung autopost được tạo từ CRM.",
    mediaUrl: "",
    frequency: "IMMEDIATE",
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
          scheduledFor: scheduleForm.scheduledFor || null,
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

  async function handleDispatchAll() {
    if (!token) {
      return;
    }

    setIsDispatchingAll(true);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{
        dispatched: number;
        snapshot: AutopostSnapshot;
      }>(`${apiBaseUrl}/autopost/dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSnapshot(result.snapshot);
      setNotice(`Đã chạy dispatch cho ${result.dispatched} lịch.`);
    } catch (dispatchError) {
      setError(
        dispatchError instanceof Error ? dispatchError.message : "Không thể chạy dispatch.",
      );
    } finally {
      setIsDispatchingAll(false);
    }
  }

  async function handleDispatchOne(scheduleId: string) {
    if (!token) {
      return;
    }

    setDispatchingScheduleId(scheduleId);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{
        dispatched: number;
        snapshot: AutopostSnapshot;
      }>(`${apiBaseUrl}/autopost/schedules/${scheduleId}/dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSnapshot(result.snapshot);
      setNotice(`Đã dispatch lịch ${scheduleId}.`);
    } catch (dispatchError) {
      setError(
        dispatchError instanceof Error ? dispatchError.message : "Không thể dispatch lịch này.",
      );
    } finally {
      setDispatchingScheduleId(null);
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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Group Telegram
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            Lấy trực tiếp từ danh sách group đã sync
          </h3>
          <p className="mt-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            Không cần khai báo channel thủ công nữa. Worker sẽ tự tạo target Telegram từ group
            anh chọn khi lên lịch.
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
            <span className="inline-flex items-center rounded-full bg-[color:var(--primary-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
              Đã chọn {selectedGroupCount} group
            </span>
          </div>

          <div className="mt-5 space-y-3">
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
                  onChange={(event) => toggleTelegramGroup(group.id, event.target.checked)}
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
        </section>

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

          <form onSubmit={handleCreateSchedule} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={scheduleForm.title}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, title: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Tiêu đề bài"
              />
              <input
                value={scheduleForm.frequency}
                onChange={(event) =>
                  setScheduleForm((current) => ({ ...current, frequency: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="IMMEDIATE / DAILY / WEEKLY"
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
              value={scheduleForm.mediaUrl}
              onChange={(event) =>
                setScheduleForm((current) => ({ ...current, mediaUrl: event.target.value }))
              }
              className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              placeholder="URL hình ảnh (tùy chọn)"
            />
            <p className="text-sm text-[color:var(--on-surface-variant)]">
              Nếu có URL hình, Telegram sẽ gửi ảnh bằng `sendPhoto`. Tiêu đề và nội dung sẽ đi
              vào caption.
            </p>

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
                Lưu draft
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={
                  isCreatingSchedule ||
                  (!selectAllTelegramGroups && selectedTelegramGroupIds.length === 0)
                }
                className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {isCreatingSchedule ? "Đang tạo lịch..." : "Tạo lịch"}
              </button>
              <button
                type="button"
                onClick={() => void handleDispatchAll()}
                disabled={isDispatchingAll}
                className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-bold"
              >
                {isDispatchingAll ? "Đang dispatch..." : "Dispatch lịch đến hạn"}
              </button>
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
                      {schedule.target.displayName} · {schedule.frequency} ·{" "}
                      {formatDateTime(schedule.scheduledFor)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface)]">
                      {schedule.message}
                    </p>
                    {schedule.mediaUrl ? (
                      <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                        Ảnh: {schedule.mediaUrl}
                      </p>
                    ) : null}
                    {schedule.latestLog ? (
                      <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                        Log mới nhất: {schedule.latestLog.status} ·{" "}
                        {schedule.latestLog.detail ?? "Không có chi tiết"}
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
                    <button
                      onClick={() => void handleDispatchOne(schedule.id)}
                      disabled={dispatchingScheduleId === schedule.id}
                      className="rounded-[16px] bg-white/80 px-4 py-2 text-sm font-semibold"
                    >
                      {dispatchingScheduleId === schedule.id ? "Đang gửi..." : "Gửi ngay"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
          Nhật ký dispatch
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
