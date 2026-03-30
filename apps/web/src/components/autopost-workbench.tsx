"use client";

import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type AutopostTarget = {
  id: string;
  platform: "TELEGRAM" | "DISCORD" | "TWITTER";
  externalId: string;
  displayName: string;
  status: string;
};

type AutopostSchedule = {
  id: string;
  title: string;
  message: string;
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
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingTarget, setIsCreatingTarget] = useState(false);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [isDispatchingAll, setIsDispatchingAll] = useState(false);
  const [dispatchingScheduleId, setDispatchingScheduleId] = useState<string | null>(null);
  const [targetForm, setTargetForm] = useState({
    platform: "TELEGRAM" as "TELEGRAM" | "DISCORD" | "TWITTER",
    externalId: "-100221001",
    displayName: "Nexus Global",
  });
  const [scheduleForm, setScheduleForm] = useState({
    title: "Bản tin tự động",
    message: "Nội dung autopost được tạo từ CRM.",
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
        setSelectedTargetIds((current) =>
          current.length ? current : data.targets.slice(0, 1).map((target) => target.id),
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

  async function refreshSnapshot() {
    if (!token) {
      return;
    }

    const data = await fetchJson<AutopostSnapshot>(`${apiBaseUrl}/autopost`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSnapshot(data);
  }

  async function handleCreateTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setIsCreatingTarget(true);
    setError(null);
    setNotice(null);

    try {
      const next = await fetchJson<AutopostSnapshot>(`${apiBaseUrl}/autopost/targets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(targetForm),
      });
      setSnapshot(next);
      setSelectedTargetIds((current) =>
        current.length ? current : next.targets.slice(-1).map((target) => target.id),
      );
      setNotice(`Đã đăng ký target ${targetForm.displayName}.`);
    } catch (targetError) {
      setError(
        targetError instanceof Error ? targetError.message : "Không thể tạo target mới.",
      );
    } finally {
      setIsCreatingTarget(false);
    }
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
          targetIds: selectedTargetIds,
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
            Target autopost
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            Khai báo channel/group để worker có nơi gửi bài
          </h3>

          <form onSubmit={handleCreateTarget} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <select
                value={targetForm.platform}
                onChange={(event) =>
                  setTargetForm((current) => ({
                    ...current,
                    platform: event.target.value as typeof current.platform,
                  }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                <option value="TELEGRAM">Telegram</option>
                <option value="DISCORD">Discord</option>
                <option value="TWITTER">Twitter</option>
              </select>
              <input
                value={targetForm.externalId}
                onChange={(event) =>
                  setTargetForm((current) => ({ ...current, externalId: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Chat ID / Channel ID"
              />
              <input
                value={targetForm.displayName}
                onChange={(event) =>
                  setTargetForm((current) => ({ ...current, displayName: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Tên hiển thị"
              />
            </div>

            <button
              type="submit"
              disabled={isCreatingTarget}
              className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {isCreatingTarget ? "Đang lưu target..." : "Thêm target"}
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {snapshot?.targets.map((target) => (
              <label
                key={target.id}
                className="flex items-start gap-3 rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4"
              >
                <input
                  type="checkbox"
                  checked={selectedTargetIds.includes(target.id)}
                  onChange={(event) =>
                    setSelectedTargetIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, target.id])]
                        : current.filter((item) => item !== target.id),
                    )
                  }
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    {target.displayName} · {target.platform}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                    {target.externalId} · {target.status}
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
                Tạo draft, lên lịch và dispatch ngay từ CRM
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
                disabled={isCreatingSchedule || selectedTargetIds.length === 0}
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
                      {schedule.target.displayName} · {schedule.frequency} · {formatDateTime(schedule.scheduledFor)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface)]">
                      {schedule.message}
                    </p>
                    {schedule.latestLog ? (
                      <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                        Log mới nhất: {schedule.latestLog.status} · {schedule.latestLog.detail ?? "Không có chi tiết"}
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

        <div className="mt-6 overflow-hidden rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Lịch</th>
                <th className="px-5 py-4 font-semibold">Target</th>
                <th className="px-5 py-4 font-semibold">Kết quả</th>
                <th className="px-5 py-4 font-semibold">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.logs.map((log, index) => (
                <tr key={log.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-bold">{log.schedule.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                      {log.schedule.platform}
                    </p>
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                    <p>{log.schedule.targetName}</p>
                    <p className="mt-1">{log.externalPostId ?? "Chưa có post id"}</p>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getScheduleTone(log.status)}`}>
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
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
