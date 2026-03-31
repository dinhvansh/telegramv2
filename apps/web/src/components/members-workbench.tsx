"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

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

type MembersResponse = {
  members: MemberItem[];
  summary: {
    total: number;
    active: number;
    left: number;
  };
};

type MemberDetailResponse = {
  found: boolean;
  member: MemberItem | null;
};

type UserItem = {
  id: string;
  name: string;
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

function toCsvValue(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
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

export function MembersWorkbench({ embedded = false }: { embedded?: boolean }) {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");
  const pageSize = 20;
  const [token, setToken] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [ownerName, setOwnerName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingWarning, setIsResettingWarning] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [membersResponse, usersResponse] = await Promise.all([
          fetchJson<MembersResponse>(
            `${apiBaseUrl}/moderation/members${campaignId ? `?campaignId=${campaignId}` : ""}`,
            {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            },
          ),
          fetchJson<UserItem[]>(`${apiBaseUrl}/users`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }),
        ]);

        if (!active) {
          return;
        }

        setMembers(membersResponse.members);
        setUsers(usersResponse);
        const firstMember = membersResponse.members[0] ?? null;
        setSelectedMember(firstMember);
        setOwnerName(firstMember?.ownerName ?? "");
        setNote(firstMember?.note ?? "");
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải danh sách thành viên.",
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

    void load();

    return () => {
      active = false;
    };
  }, [campaignId, token]);

  const groupOptions = useMemo(
    () => Array.from(new Set(members.map((member) => member.groupTitle))).sort(),
    [members],
  );

  const filteredMembers = useMemo(
    () =>
      members.filter((member) =>
        groupFilter === "all" ? true : member.groupTitle === groupFilter,
      ),
    [groupFilter, members],
  );

  const filteredSummary = useMemo(
    () => ({
      total: filteredMembers.length,
      active: filteredMembers.filter((member) => member.membershipStatus === "active")
        .length,
      left: filteredMembers.filter((member) => member.membershipStatus === "left")
        .length,
      warnings: filteredMembers.reduce((total, member) => total + member.warningCount, 0),
    }),
    [filteredMembers],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMembers.length / pageSize)),
    [filteredMembers.length, pageSize],
  );

  const paginatedMembers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredMembers.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredMembers]);

  const pageRange = useMemo(() => {
    if (!filteredMembers.length) {
      return { start: 0, end: 0 };
    }

    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, filteredMembers.length);
    return { start, end };
  }, [currentPage, filteredMembers.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [campaignId, groupFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!selectedMember) {
      return;
    }

    const selectedStillVisible = filteredMembers.some(
      (member) => member.id === selectedMember.id,
    );

    if (!selectedStillVisible) {
      const nextMember = paginatedMembers[0] ?? filteredMembers[0] ?? null;
      setSelectedMember(nextMember);
      setOwnerName(nextMember?.ownerName ?? "");
      setNote(nextMember?.note ?? "");
    }
  }, [filteredMembers, paginatedMembers, selectedMember]);

  async function selectMember(memberId: string) {
    if (!token) {
      return;
    }

    try {
      const response = await fetchJson<MemberDetailResponse>(
        `${apiBaseUrl}/moderation/members/${memberId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.found || !response.member) {
        return;
      }

      setSelectedMember(response.member);
      setOwnerName(response.member.ownerName ?? "");
      setNote(response.member.note ?? "");
      setNotice(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải chi tiết thành viên.",
      );
    }
  }

  async function handleSave() {
    if (!token || !selectedMember) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetchJson<MemberDetailResponse>(
        `${apiBaseUrl}/moderation/members/${selectedMember.id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ownerName,
            note,
          }),
        },
      );

      if (!response.member) {
        throw new Error("Không lưu được thành viên.");
      }

      setSelectedMember(response.member);
      setMembers((current) =>
        current.map((member) =>
          member.id === response.member?.id ? response.member : member,
        ),
      );
      setNotice("Đã lưu owner và ghi chú.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Không thể lưu owner và ghi chú.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetWarning() {
    if (!token || !selectedMember) {
      return;
    }

    setIsResettingWarning(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetchJson<MemberDetailResponse>(
        `${apiBaseUrl}/moderation/members/${selectedMember.id}/reset-warning`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.member) {
        throw new Error("Không reset được cảnh báo.");
      }

      setSelectedMember(response.member);
      setMembers((current) =>
        current.map((member) =>
          member.id === response.member?.id ? response.member : member,
        ),
      );
      setNotice("Đã reset cảnh báo cho thành viên.");
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "Không thể reset cảnh báo.",
      );
    } finally {
      setIsResettingWarning(false);
    }
  }

  function handleExportCurrentFilter() {
    const rows = [
      [
        "Tên hiển thị",
        "Username",
        "Campaign",
        "Group",
        "Trạng thái",
        "Owner",
        "Cảnh báo",
        "Tham gia lúc",
        "Rời lúc",
        "Ghi chú",
      ],
      ...filteredMembers.map((member) => [
        member.displayName,
        member.username ? `@${member.username}` : member.externalId,
        member.campaignLabel,
        member.groupTitle,
        member.statusLabel,
        member.ownerName ?? "",
        member.warningCount,
        member.joinedAt,
        member.leftAt ?? "",
        member.note ?? "",
      ]),
    ];

    const csv = "\uFEFF" + rows.map((row) => row.map(toCsvValue).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const suffix =
      groupFilter === "all" ? "tat-ca-group" : groupFilter.replace(/[^\w-]+/g, "_");
    anchor.href = url;
    anchor.download = `members-${suffix}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("Đã xuất danh sách thành viên theo filter hiện tại.");
  }

  return (
    <section className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6 px-5 py-8"}>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Tổng thành viên", filteredSummary.total],
          ["Đang ở trong nhóm", filteredSummary.active],
          ["Đã rời nhóm", filteredSummary.left],
          ["Tổng cảnh báo", filteredSummary.warnings],
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Thành viên campaign
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">
                Danh sách user đã vào nhóm từ các campaign
              </h3>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
              >
                <option value="all">Tất cả nhóm</option>
                {groupOptions.map((groupTitle) => (
                  <option key={groupTitle} value={groupTitle}>
                    {groupTitle}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleExportCurrentFilter}
                className="rounded-[18px] bg-[color:var(--primary)] px-4 py-3 text-sm font-semibold text-white"
              >
                Xuất Excel
              </button>
            </div>
          </div>

          {campaignId ? (
            <div className="mt-4 inline-flex rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
              Đang lọc theo campaign
            </div>
          ) : null}

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

          <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
            <table className="min-w-[1080px] w-full border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  <th className="px-5 py-4 font-semibold">User</th>
                  <th className="px-5 py-4 font-semibold">Campaign</th>
                  <th className="px-5 py-4 font-semibold">Group</th>
                  <th className="px-5 py-4 font-semibold">Ngày vào</th>
                  <th className="px-5 py-4 font-semibold">Ngày rời</th>
                  <th className="px-5 py-4 font-semibold">Trạng thái</th>
                  <th className="px-5 py-4 font-semibold">Cảnh báo</th>
                  <th className="px-5 py-4 font-semibold">Owner</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMembers.map((member, index) => (
                  <tr
                    key={member.id}
                    onClick={() => void selectMember(member.id)}
                    className={`cursor-pointer ${index % 2 === 1 ? "bg-white/70" : ""} ${
                      selectedMember?.id === member.id ? "bg-[color:var(--primary-soft)]/60" : ""
                    }`}
                  >
                    <td className="px-5 py-4 align-top">
                      <p className="text-sm font-bold">{member.displayName}</p>
                      <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                        @{member.username ?? member.externalId}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top text-sm">{member.campaignLabel}</td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {member.groupTitle}
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {formatDateTime(member.joinedAt)}
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      {formatDateTime(member.leftAt)}
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          member.membershipStatus === "active"
                            ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                            : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                        }`}
                      >
                        {member.statusLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      <span className="inline-flex rounded-full bg-[color:var(--warning-soft)] px-3 py-1 text-xs font-bold text-[color:var(--warning)]">
                        {member.warningCount} lần
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-sm">
                      {member.ownerName ?? "Chưa gán"}
                    </td>
                  </tr>
                ))}
                {!isLoading && !filteredMembers.length ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-10 text-center text-sm text-[color:var(--on-surface-variant)]"
                    >
                      Không có thành viên nào theo filter hiện tại.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[color:var(--on-surface-variant)]">
              Hiển thị {pageRange.start}-{pageRange.end} / {filteredMembers.length} thành viên
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-[16px] bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Trước
              </button>
              <span className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
                Trang {currentPage}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="rounded-[16px] bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        </section>

        <aside className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Chi tiết thành viên
          </p>
          {selectedMember ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
                <p className="text-lg font-black">{selectedMember.displayName}</p>
                <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                  @{selectedMember.username ?? selectedMember.externalId}
                </p>
                <p className="mt-3 text-sm">
                  <span className="font-semibold">Campaign:</span> {selectedMember.campaignLabel}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Group:</span> {selectedMember.groupTitle}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Ngày vào:</span> {formatDateTime(selectedMember.joinedAt)}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Ngày rời:</span> {formatDateTime(selectedMember.leftAt)}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Cảnh báo:</span> {selectedMember.warningCount} lần
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Cảnh báo gần nhất:</span>{" "}
                  {selectedMember.lastWarnedAt ? formatDateTime(selectedMember.lastWarnedAt) : "Chưa có"}
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Owner phụ trách
                </span>
                <select
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                >
                  <option value="">Chưa gán owner</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.name}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Ghi chú
                </span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-[180px] w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  placeholder="Ghi chú owner, lịch sử chăm sóc hoặc lý do cần follow."
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="rounded-[18px] bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isSaving ? "Đang lưu..." : "Lưu owner và ghi chú"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetWarning()}
                  disabled={isResettingWarning}
                  className="rounded-[18px] bg-[color:var(--warning-soft)] px-5 py-3 text-sm font-semibold text-[color:var(--warning)] disabled:opacity-60"
                >
                  {isResettingWarning ? "Đang reset..." : "Reset cảnh báo"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm leading-6 text-[color:var(--on-surface-variant)]">
              Chọn một thành viên từ bảng bên trái để xem chi tiết, gán owner và ghi chú chăm sóc.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
