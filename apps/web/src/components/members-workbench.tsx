"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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

export function MembersWorkbench({ embedded = false }: { embedded?: boolean }) {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");
  const [token, setToken] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, left: 0 });
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
        setSummary(membersResponse.summary);
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
        saveError instanceof Error
          ? saveError.message
          : "Không thể lưu owner và ghi chú.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6 px-5 py-8"}>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Tổng thành viên", summary.total],
          ["Đang ở trong nhóm", summary.active],
          ["Đã rời nhóm", summary.left],
          ["Tổng cảnh báo", members.reduce((total, member) => total + member.warningCount, 0)],
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
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Thành viên campaign
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">
                Danh sách user đã vào nhóm từ các campaign
              </h3>
            </div>
            {campaignId ? (
              <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
                Đang lọc theo campaign
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-6 rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
              {error}
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
            <table className="min-w-[860px] w-full border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  <th className="px-5 py-4 font-semibold">User</th>
                  <th className="px-5 py-4 font-semibold">Campaign</th>
                  <th className="px-5 py-4 font-semibold">Group</th>
                  <th className="px-5 py-4 font-semibold">Trạng thái</th>
                  <th className="px-5 py-4 font-semibold">Cảnh báo</th>
                  <th className="px-5 py-4 font-semibold">Owner</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member, index) => (
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
                {!isLoading && !members.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-sm text-[color:var(--on-surface-variant)]"
                    >
                      Không có thành viên nào.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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
                  <span className="font-semibold">Tham gia:</span> {selectedMember.joinedRelative}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Cảnh báo:</span> {selectedMember.warningCount} lần
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Cảnh báo gần nhất:</span>{" "}
                  {selectedMember.lastWarnedAt
                    ? new Intl.DateTimeFormat("vi-VN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(selectedMember.lastWarnedAt))
                    : "Chưa có"}
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
                  rows={5}
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  placeholder="Ghi chú chăm sóc, đánh giá chất lượng hoặc hướng xử lý tiếp theo..."
                />
              </label>

              {notice ? (
                <div className="rounded-[18px] bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">
                  {notice}
                </div>
              ) : null}

              <button
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="w-full rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {isSaving ? "Đang lưu..." : "Lưu owner và ghi chú"}
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm text-[color:var(--on-surface-variant)]">
              Chọn một thành viên ở bảng bên trái để xem chi tiết.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
