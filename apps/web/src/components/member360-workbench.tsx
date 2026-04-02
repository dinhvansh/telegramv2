"use client";

import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type Member360SummaryItem = {
  externalId: string;
  displayName: string;
  avatarInitials: string;
  username: string | null;
  ownerName: string | null;
  note: string | null;
  groupsActiveCount: number;
  groupsTotalCount: number;
  joinCount: number;
  leftCount: number;
  warningTotal: number;
  lastActivityAt: string | null;
  currentGroups: Array<{
    groupTitle: string;
    campaignLabel: string;
    joinedAt: string;
    warningCount: number;
  }>;
};

type MemberItem = {
  id: string;
  displayName: string;
  avatarInitials: string;
  externalId: string;
  username: string | null;
  campaignLabel: string;
  campaignId: string | null;
  groupTitle: string;
  ownerName: string | null;
  note: string | null;
  warningCount: number;
  lastWarnedAt: string | null;
  joinedAt: string;
  joinedRelative: string;
  membershipStatus: "active" | "left";
  statusLabel: string;
  statusDetail: string;
  leftAt: string | null;
};

type Member360ProfileResponse = {
  found: boolean;
  profile: null | {
    externalId: string;
    displayName: string;
    avatarInitials: string;
    username: string | null;
    ownerName: string | null;
    note: string | null;
    groupsActiveCount: number;
    groupsTotalCount: number;
    joinCount: number;
    leftCount: number;
    warningTotal: number;
    lastActivityAt: string | null;
    currentGroups: MemberItem[];
    memberships: MemberItem[];
    timeline: Array<{
      id: string;
      type: "join" | "left" | "warn";
      timestamp: string;
      detail: string;
      groupTitle: string;
      campaignLabel: string | null;
    }>;
    moderationTimeline: Array<{
      id: string;
      type: "join" | "left" | "warn";
      timestamp: string;
      detail: string;
      groupTitle: string;
      campaignLabel: string | null;
    }>;
    inviteTimeline: Array<{
      id: string;
      type: "join" | "left" | "warn";
      timestamp: string;
      detail: string;
      groupTitle: string;
      campaignLabel: string | null;
    }>;
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
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function timelineTone(type: string) {
  switch (type) {
    case "join":
      return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
    case "warn":
      return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
    default:
      return "bg-[color:var(--surface-low)] text-[color:var(--on-surface-variant)]";
  }
}

export function Member360Workbench() {
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<Member360SummaryItem[]>([]);
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<Member360ProfileResponse["profile"]>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [tab, setTab] = useState<"overview" | "groups" | "timeline" | "moderation">("overview");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  useEffect(() => {
    let active = true;

    async function load(currentToken: string) {
      try {
        const response = await fetchJson<{ items: Member360SummaryItem[] }>(
          `${apiBaseUrl}/moderation/member360`,
          {
            headers: { Authorization: `Bearer ${currentToken}` },
          },
        );

        if (!active) {
          return;
        }

        setItems(response.items);
        setSelectedExternalId((current) => current || response.items[0]?.externalId || null);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Không thể tải dữ liệu Member 360.",
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

    void load(token);

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;

    async function loadProfile(currentToken: string, externalId: string) {
      try {
        setIsProfileLoading(true);
        const response = await fetchJson<Member360ProfileResponse>(
          `${apiBaseUrl}/moderation/member360/${encodeURIComponent(externalId)}`,
          {
            headers: { Authorization: `Bearer ${currentToken}` },
          },
        );

        if (!active) {
          return;
        }

        setSelectedProfile(response.profile);
      } catch {
        if (!active) {
          return;
        }

        setSelectedProfile(null);
      } finally {
        if (active) {
          setIsProfileLoading(false);
        }
      }
    }

    if (!token || !selectedExternalId) {
      setSelectedProfile(null);
      return;
    }

    void loadProfile(token, selectedExternalId);

    return () => {
      active = false;
    };
  }, [selectedExternalId, token]);

  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set(items.flatMap((item) => item.currentGroups.map((group) => group.groupTitle))),
      ).sort(),
    [items],
  );

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const query = search.trim().toLowerCase();
        const matchesSearch = !query
          ? true
          : [
              item.displayName,
              item.username || "",
              item.externalId,
              ...item.currentGroups.map((group) => group.groupTitle),
            ]
              .join(" ")
              .toLowerCase()
              .includes(query);
        const matchesGroup =
          groupFilter === "all"
            ? true
            : item.currentGroups.some((group) => group.groupTitle === groupFilter);
        return matchesSearch && matchesGroup;
      }),
    [groupFilter, items, search],
  );

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedExternalId(null);
      return;
    }

    const exists = filteredItems.some((item) => item.externalId === selectedExternalId);
    if (!exists) {
      setSelectedExternalId(filteredItems[0].externalId);
    }
  }, [filteredItems, selectedExternalId]);

  if (isLoading) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
          Đang tải dữ liệu Member 360...
        </p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--warning)]">
          Cần đăng nhập để xem hồ sơ Member 360.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
          Member 360
        </p>
        <h3 className="mt-2 text-2xl font-black tracking-tight">
          Hồ sơ theo người để nhìn nhanh group hiện tại, cảnh báo và lịch sử ra/vào
        </h3>
      </div>

      {error ? (
        <div className="rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.28fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-6 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              placeholder="Tìm theo tên, @username, ID số hoặc group"
            />
            <select
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
            >
              <option value="all">Tất cả group</option>
              {groupOptions.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 space-y-3">
            {filteredItems.map((item) => (
              <button
                key={item.externalId}
                type="button"
                onClick={() => setSelectedExternalId(item.externalId)}
                className={`w-full rounded-[24px] px-5 py-4 text-left transition-all ${
                  selectedExternalId === item.externalId
                    ? "bg-[color:var(--primary-soft)]"
                    : "bg-[color:var(--surface-low)]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black tracking-tight">{item.displayName}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      {item.username ? `@${item.username}` : "Chưa có username"} · ID {item.externalId}
                    </p>
                  </div>
                  <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-[color:var(--primary)]">
                    {item.groupsActiveCount} group
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold">
                    {item.joinCount} lần vào
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold">
                    {item.leftCount} lần rời
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold">
                    {item.warningTotal} cảnh báo
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-6 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          {isProfileLoading ? (
            <div className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5 text-sm text-[color:var(--on-surface-variant)]">
              Đang tải hồ sơ user...
            </div>
          ) : selectedProfile ? (
            <>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-2xl font-black tracking-tight">{selectedProfile.displayName}</p>
                  <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                    {selectedProfile.username
                      ? `@${selectedProfile.username}`
                      : "Chưa có username"}{" "}
                    · ID {selectedProfile.externalId}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[color:var(--success-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--success)]">
                      Đang ở {selectedProfile.groupsActiveCount} group
                    </span>
                    <span className="rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-sm font-semibold">
                      Tổng {selectedProfile.joinCount} lần vào
                    </span>
                    <span className="rounded-full bg-[color:var(--warning-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--warning)]">
                      {selectedProfile.warningTotal} cảnh báo
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                      Owner
                    </p>
                    <p className="mt-2 text-sm font-bold">
                      {selectedProfile.ownerName || "Chưa gán owner"}
                    </p>
                  </div>
                  <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                      Hoạt động gần nhất
                    </p>
                    <p className="mt-2 text-sm font-bold">
                      {formatDateTime(selectedProfile.lastActivityAt)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  ["overview", "Tổng quan"],
                  ["groups", "Nhóm hiện tại"],
                  ["timeline", "Lịch sử ra/vào"],
                  ["moderation", "Moderation"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setTab(value as "overview" | "groups" | "timeline" | "moderation")
                    }
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      tab === value
                        ? "bg-[color:var(--primary)] text-white"
                        : "bg-[color:var(--surface-low)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "overview" ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <article className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                      Group hiện tại
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedProfile.currentGroups.length ? (
                        selectedProfile.currentGroups.map((member) => (
                          <span
                            key={member.id}
                            className="rounded-full bg-white px-3 py-2 text-sm font-semibold"
                          >
                            {member.groupTitle}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-[color:var(--on-surface-variant)]">
                          Hiện không active ở group nào.
                        </span>
                      )}
                    </div>
                  </article>

                  <article className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                      Dấu vết campaign
                    </p>
                    <div className="mt-4 space-y-2">
                      {selectedProfile.memberships.slice(0, 3).map((member) => (
                        <div
                          key={`${member.id}-campaign`}
                          className="rounded-[18px] bg-white px-4 py-3 text-sm"
                        >
                          <p className="font-semibold">
                            {member.campaignLabel || "Chưa gắn campaign"}
                          </p>
                          <p className="mt-1 text-[color:var(--on-surface-variant)]">
                            {member.groupTitle} · vào {formatDateTime(member.joinedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              ) : null}

              {tab === "groups" ? (
                <div className="mt-6 grid gap-4">
                  {selectedProfile.currentGroups.length ? (
                    selectedProfile.currentGroups.map((member) => (
                      <article
                        key={member.id}
                        className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-lg font-black tracking-tight">{member.groupTitle}</p>
                            <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                              {member.campaignLabel || "Chưa gắn campaign"}
                            </p>
                          </div>
                          <div className="rounded-full bg-[color:var(--success-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--success)]">
                            {member.statusLabel}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[18px] bg-white px-4 py-3 text-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                              Ngày vào
                            </p>
                            <p className="mt-2 font-semibold">{formatDateTime(member.joinedAt)}</p>
                          </div>
                          <div className="rounded-[18px] bg-white px-4 py-3 text-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                              Owner
                            </p>
                            <p className="mt-2 font-semibold">{member.ownerName || "-"}</p>
                          </div>
                          <div className="rounded-[18px] bg-white px-4 py-3 text-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                              Cảnh báo
                            </p>
                            <p className="mt-2 font-semibold">{member.warningCount}</p>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5 text-sm text-[color:var(--on-surface-variant)]">
                      User này hiện không active ở group nào.
                    </div>
                  )}
                </div>
              ) : null}

              {tab === "timeline" ? (
                <div className="mt-6 space-y-3">
                  {[...selectedProfile.timeline, ...selectedProfile.inviteTimeline]
                    .sort(
                      (left, right) =>
                        new Date(right.timestamp).getTime() -
                        new Date(left.timestamp).getTime(),
                    )
                    .map((event) => (
                    <article
                      key={event.id}
                      className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold">{event.detail}</p>
                          <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                            {formatDateTime(event.timestamp)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${timelineTone(event.type)}`}
                        >
                          {event.type === "join"
                            ? "Vào nhóm"
                            : event.type === "warn"
                              ? "Cảnh báo"
                              : "Rời nhóm"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {tab === "moderation" ? (
                <div className="mt-6 space-y-3">
                  {selectedProfile.moderationTimeline.length ? (
                    selectedProfile.moderationTimeline.map((event) => (
                      <article
                        key={event.id}
                        className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold">{event.detail}</p>
                            <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                              {event.groupTitle}
                              {event.campaignLabel ? ` · ${event.campaignLabel}` : ""}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                              {formatDateTime(event.timestamp)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${timelineTone(
                              event.type,
                            )}`}
                          >
                            Xử lý
                          </span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5 text-sm text-[color:var(--on-surface-variant)]">
                      Chưa có moderation timeline cho user này.
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5 text-sm text-[color:var(--on-surface-variant)]">
              Chưa có user nào phù hợp với bộ lọc hiện tại.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
