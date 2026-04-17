"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/toast-context";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";
const pageSize = 20;

type SummaryItem = {
  externalId: string;
  displayName: string;
  avatarInitials: string;
  username: string | null;
  phoneNumber: string | null;
  customerSource: string | null;
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

type TimelineEvent = {
  id: string;
  type: "join" | "left" | "warn";
  timestamp: string;
  detail: string;
  groupTitle: string;
  campaignLabel: string | null;
};

type ProfileResponse = {
  found: boolean;
  profile: null | {
    externalId: string;
    displayName: string;
    avatarInitials: string;
    username: string | null;
    phoneNumber: string | null;
    customerSource: string | null;
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
    timeline: TimelineEvent[];
    moderationTimeline: TimelineEvent[];
    inviteTimeline: TimelineEvent[];
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
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function tone(type: "success" | "warning" | "neutral" | "primary") {
  if (type === "success") return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (type === "warning") return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  if (type === "primary") return "bg-[color:var(--primary-soft)] text-[color:var(--primary)]";
  return "bg-[color:var(--surface-low)] text-[color:var(--on-surface-variant)]";
}

function getPrimaryMember(profile: ProfileResponse["profile"]) {
  if (!profile) return null;
  return profile.currentGroups[0] || profile.memberships[0] || null;
}

function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      {children}
    </svg>
  );
}

function renderGroupSummary(item: SummaryItem) {
  const visibleGroups = item.currentGroups.slice(0, 2);
  const hiddenCount = Math.max(0, item.currentGroups.length - visibleGroups.length);

  if (!item.currentGroups.length) {
    return <span className="text-[color:var(--on-surface-variant)]">Không còn active</span>;
  }

  return (
    <div className="flex max-w-[260px] flex-wrap gap-2">
      {visibleGroups.map((group) => (
        <span
          key={`${item.externalId}-${group.groupTitle}`}
          className="rounded-full bg-[color:var(--surface-low)] px-3 py-1 text-xs font-semibold text-[color:var(--on-surface)]"
        >
          {group.groupTitle}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">
          +{hiddenCount} group
        </span>
      ) : null}
    </div>
  );
}

function getProfileBadge(item: Pick<SummaryItem, "groupsTotalCount" | "groupsActiveCount">) {
  if (item.groupsTotalCount === 0) {
    return {
      label: "Contacts import",
      className: tone("primary"),
    };
  }

  if (item.groupsActiveCount > 0) {
    return {
      label: "Member",
      className: tone("success"),
    };
  }

  return {
    label: "Đã rời nhóm",
    className: tone("neutral"),
  };
}

export function Member360Workbench({
  isAssignedCampaignView = false,
  canEditMembers = true,
  workspaceId = null,
  telegramBotId = null,
}: {
  isAssignedCampaignView?: boolean;
  canEditMembers?: boolean;
  workspaceId?: string | null;
  telegramBotId?: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileResponse["profile"]>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"overview" | "groups" | "timeline" | "moderation">("overview");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [ownerDraft, setOwnerDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [customerSourceDraft, setCustomerSourceDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  const scopedHeaders = useMemo(
    () =>
      token
        ? {
            Authorization: `Bearer ${token}`,
            ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
            ...(telegramBotId ? { "X-Telegram-Bot-Id": telegramBotId } : {}),
          }
        : undefined,
    [telegramBotId, token, workspaceId],
  );

  const loadSummary = useCallback(async (currentToken: string) => {
    const response = await fetchJson<{ items: SummaryItem[] }>(`${apiBaseUrl}/moderation/member360`, {
      headers: scopedHeaders ?? { Authorization: `Bearer ${currentToken}` },
    });
    setItems(response.items);
    setSelectedExternalId((current) => current || response.items[0]?.externalId || null);
  }, [scopedHeaders]);

  const loadProfile = useCallback(async (currentToken: string, externalId: string) => {
    const response = await fetchJson<ProfileResponse>(
      `${apiBaseUrl}/moderation/member360/${encodeURIComponent(externalId)}`,
      { headers: scopedHeaders ?? { Authorization: `Bearer ${currentToken}` } },
    );
    setSelectedProfile(response.profile);
  }, [scopedHeaders]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setIsLoading(false);
      return;
    }

    void (async () => {
      try {
        await loadSummary(token);
      } catch (loadError) {
        if (active) toast({ message: loadError instanceof Error ? loadError.message : "Không thể tải dữ liệu Member 360.", type: "error" });
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadSummary, toast, token]);

  useEffect(() => {
    let active = true;
    if (!token || !selectedExternalId) {
      setSelectedProfile(null);
      return;
    }

    void (async () => {
      try {
        setIsProfileLoading(true);
        await loadProfile(token, selectedExternalId);
      } catch {
        if (active) {
          setSelectedProfile(null);
          toast({ message: "Không thể tải hồ sơ thành viên.", type: "error" });
        }
      } finally {
        if (active) setIsProfileLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadProfile, selectedExternalId, toast, token]);

  useEffect(() => {
    const primary = getPrimaryMember(selectedProfile);
    setOwnerDraft(primary?.ownerName ?? "");
    setNoteDraft(primary?.note ?? "");
    setPhoneDraft(selectedProfile?.phoneNumber ?? "");
    setCustomerSourceDraft(selectedProfile?.customerSource ?? "");
  }, [selectedProfile]);

  const groupOptions = useMemo(
    () => Array.from(new Set(items.flatMap((item) => item.currentGroups.map((group) => group.groupTitle)))).sort(),
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !query
        ? true
        : [
            item.displayName,
            item.username || "",
            item.externalId,
            item.ownerName || "",
            item.note || "",
            ...item.currentGroups.map((group) => group.groupTitle),
            ...item.currentGroups.map((group) => group.campaignLabel),
            item.phoneNumber || "",
            item.customerSource || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);
      const matchesGroup = groupFilter === "all" ? true : item.currentGroups.some((group) => group.groupTitle === groupFilter);
      const matchesSource = sourceFilter === "all"
        ? true
        : sourceFilter === "contacts-import"
          ? item.groupsTotalCount === 0 || (item.customerSource || "").toLowerCase().includes("contacts import")
          : item.groupsTotalCount > 0;
      return matchesSearch && matchesGroup && matchesSource;
    });
  }, [groupFilter, items, search, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    return filteredItems.slice(startIndex, startIndex + pageSize);
  }, [filteredItems, page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, groupFilter, sourceFilter]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const primaryMember = getPrimaryMember(selectedProfile);
  const selectedProfileBadge = selectedProfile ? getProfileBadge(selectedProfile) : null;
  const mergedTimeline = useMemo(() => {
    if (!selectedProfile) return [];
    return [...selectedProfile.timeline, ...selectedProfile.inviteTimeline].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [selectedProfile]);

  async function openProfile(externalId: string, tab: "overview" | "groups" | "timeline" | "moderation" = "overview") {
    if (!token) return;
    setDrawerTab(tab);
    setDrawerOpen(true);
    setSelectedExternalId(externalId);
    try {
      setIsProfileLoading(true);
      await loadProfile(token, externalId);
    } catch (loadError) {
      toast({ message: loadError instanceof Error ? loadError.message : "Không thể tải hồ sơ thành viên.", type: "error" });
    } finally {
      setIsProfileLoading(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    if (!token) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsImporting(true);
      const response = await fetch(`${apiBaseUrl}/moderation/member360/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Import thất bại với mã ${response.status}`);
      }

      const result = (await response.json()) as { message?: string };
      await loadSummary(token);
      if (selectedExternalId) {
        await loadProfile(token, selectedExternalId);
      }
      toast({ message: result.message || "Đã import Excel khách hàng theo ID số.", type: "success" });
    } catch (importError) {
      toast({ message: importError instanceof Error ? importError.message : "Không thể import Excel.", type: "error" });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function handleSave() {
    if (!token || !selectedProfile) return;
    try {
      setIsSaving(true);
      const targetUrl = primaryMember
        ? `${apiBaseUrl}/moderation/members/${primaryMember.id}`
        : `${apiBaseUrl}/moderation/member360/${encodeURIComponent(selectedProfile.externalId)}`;
      await fetchJson(targetUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}) },
        body: JSON.stringify({
          ownerName: ownerDraft.trim() || null,
          note: noteDraft.trim() || null,
          phoneNumber: phoneDraft.trim() || null,
          customerSource: customerSourceDraft.trim() || null,
        }),
      });
      await Promise.all([loadSummary(token), loadProfile(token, selectedExternalId || selectedProfile.externalId)]);
      toast({ message: "Đã lưu owner và ghi chú.", type: "success" });
    } catch (saveError) {
      toast({ message: saveError instanceof Error ? saveError.message : "Không thể lưu thông tin thành viên.", type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDownloadTemplate() {
    if (!token) return;
    const link = document.createElement("a");
    link.href = `${apiBaseUrl}/moderation/member360/template`;
    link.download = "member360-import-template.xlsx";
    fetch(link.href, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Tải template thất bại với mã ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.click();
        URL.revokeObjectURL(objectUrl);
      })
      .catch((downloadError) => {
        toast({
          message: downloadError instanceof Error
            ? downloadError.message
            : "Không thể tải file mẫu import.",
          type: "error",
        });
      });
  }

  function handleDownloadCustomersExcel() {
    if (!token) return;

    const query = new URLSearchParams({ format: "xlsx" });
    if (search.trim()) query.set("search", search.trim());
    if (groupFilter !== "all") query.set("group", groupFilter);
    if (sourceFilter !== "all") query.set("source", sourceFilter);

    fetch(`${apiBaseUrl}/moderation/member360/export?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Tải Excel thất bại với mã ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = "member360-customers.xlsx";
        link.click();
        URL.revokeObjectURL(objectUrl);
      })
      .catch((downloadError) => {
        toast({
          message: downloadError instanceof Error
            ? downloadError.message
            : "Không thể tải Excel khách.",
          type: "error",
        });
      });
  }

  async function handleResetWarning() {
    if (!token || !primaryMember) return;
    try {
      setIsResetting(true);
      await fetchJson(`${apiBaseUrl}/moderation/members/${primaryMember.id}/reset-warning`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}) },
      });
      await Promise.all([loadSummary(token), loadProfile(token, selectedExternalId || primaryMember.externalId)]);
      toast({ message: "Đã reset cảnh báo của thành viên.", type: "success" });
    } catch (resetError) {
      toast({ message: resetError instanceof Error ? resetError.message : "Không thể reset cảnh báo.", type: "error" });
    } finally {
      setIsResetting(false);
    }
  }

  if (!token) {
    return (
      <section className="rounded-[32px] border border-white/70 bg-white/88 p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--on-surface)]">Cần đăng nhập để xem hồ sơ thành viên.</h2>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] border border-white/70 bg-white/88 p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--on-surface)]">Đang tải hồ sơ thành viên...</h2>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <section className="rounded-[32px] border border-white/70 bg-white/88 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[color:var(--on-surface-variant)]">Member 360</p>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--on-surface)]">Bảng thành viên 360 dạng cột để quét nhanh như Excel</h2>
            <p className="mt-3 text-sm text-[color:var(--on-surface-variant)]">Hiện đủ các cột quan trọng. Nếu một user đang ở nhiều group, bảng sẽ hiển thị gọn 2 group đầu và badge +N group, còn đầy đủ xem trong drawer.</p>
            {isAssignedCampaignView ? (
              <div className="mt-3 inline-flex rounded-full bg-[color:var(--primary-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
                Chỉ hiện khách thuộc campaign được giao
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 text-sm text-[color:var(--on-surface)] sm:grid-cols-4">
            <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-3"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Tổng user</p><p className="mt-2 text-2xl font-semibold">{items.length}</p></div>
            <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-3"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Đang ở group</p><p className="mt-2 text-2xl font-semibold">{items.reduce((sum, item) => sum + item.groupsActiveCount, 0)}</p></div>
            <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-3"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Tổng cảnh báo</p><p className="mt-2 text-2xl font-semibold">{items.reduce((sum, item) => sum + item.warningTotal, 0)}</p></div>
            <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-3"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Có vào lại</p><p className="mt-2 text-2xl font-semibold">{items.filter((item) => item.joinCount > 1).length}</p></div>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[color:var(--on-surface-variant)]">Bảng thành viên</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--on-surface)]">Show hết cột rồi thao tác nhanh ở cột cuối</h3>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row xl:max-w-3xl">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, @username, ID số, owner hoặc group" className="min-w-0 flex-1 rounded-[18px] border border-transparent bg-[color:var(--surface-low)] px-5 py-3 text-sm outline-none transition focus:border-[color:var(--primary)]" />
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="rounded-[18px] border border-transparent bg-[color:var(--surface-low)] px-5 py-3 text-sm outline-none transition focus:border-[color:var(--primary)]">
              <option value="all">Tất cả nguồn</option>
              <option value="contacts-import">Contacts import</option>
              <option value="campaign-group">Campaign / Group</option>
            </select>
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} className="rounded-[18px] border border-transparent bg-[color:var(--surface-low)] px-5 py-3 text-sm outline-none transition focus:border-[color:var(--primary)]">
              <option value="all">Tất cả group</option>
              {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
            <button type="button" onClick={handleDownloadTemplate} className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold text-[color:var(--on-surface)]">
              Tải template
            </button>
            <button type="button" onClick={handleDownloadCustomersExcel} className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold text-[color:var(--on-surface)]">
              Tải Excel khách
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()} disabled={isImporting} className="rounded-[18px] bg-[color:var(--primary-soft)] px-5 py-3 text-sm font-semibold text-[color:var(--primary)] disabled:opacity-60">
              {isImporting ? "Đang import..." : "Import Excel"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-sm text-[color:var(--on-surface-variant)]">
          File mẫu import gồm 3 cột: <strong>ID số</strong>, <strong>SĐT</strong>, <strong>Nguồn khách</strong>. Hệ thống sẽ map theo ID số để cập nhật tập trung.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[1520px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">ID số</th>
                <th className="px-4 py-3">SĐT</th>
                <th className="px-4 py-3">Nguồn khách</th>
                <th className="px-4 py-3">Group hiện tại</th>
                <th className="px-4 py-3">Campaign gần nhất</th>
                <th className="px-4 py-3">Số group</th>
                <th className="px-4 py-3">Lần vào</th>
                <th className="px-4 py-3">Lần rời</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Hoạt động gần nhất</th>
                <th className="px-4 py-3">Ghi chú</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => {
                const latestCampaign = item.currentGroups.find((group) => group.campaignLabel)?.campaignLabel || "Chưa gắn campaign";

                return (
                  <tr key={item.externalId} className={`border-t border-[color:var(--surface-strong)] align-top transition hover:bg-[color:var(--surface-low)]/60 ${item.externalId === selectedExternalId ? "bg-[color:var(--primary-soft)]/40" : ""}`}>
                    <td className="px-4 py-4">
                      <button type="button" className="text-left" onClick={() => void openProfile(item.externalId)}>
                        <span>
                          <span className="block text-base font-semibold text-[color:var(--on-surface)]">{item.displayName}</span>
                          <span className="block text-[color:var(--on-surface-variant)]">{item.username ? `@${item.username}` : "Chưa có username"}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-4 font-medium text-[color:var(--on-surface)]">{item.externalId}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{item.phoneNumber || "-"}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{item.customerSource || "-"}</td>
                    <td className="px-4 py-4">{renderGroupSummary(item)}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{latestCampaign}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{item.groupsActiveCount} / {item.groupsTotalCount}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{item.joinCount}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{item.leftCount}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{item.ownerName || "-"}</td>
                    <td className="px-4 py-4 text-[color:var(--on-surface)]">{formatDateTime(item.lastActivityAt)}</td>
                    <td className="max-w-[220px] px-4 py-4 text-[color:var(--on-surface-variant)]"><span className="line-clamp-2">{item.note || "-"}</span></td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => void openProfile(item.externalId, "overview")} className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--surface-low)] text-[color:var(--on-surface)] transition hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary)]" title="Xem chi tiết"><ActionIcon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></ActionIcon></button>
                        {canEditMembers ? (
                          <button type="button" onClick={() => void openProfile(item.externalId, "overview")} className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--primary-soft)] text-[color:var(--primary)] transition hover:bg-[color:var(--primary)] hover:text-white" title="Sửa owner / ghi chú"><ActionIcon><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></ActionIcon></button>
                        ) : null}
                        <button type="button" disabled title="Chưa có API xóa user 360" className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full bg-rose-50 text-rose-300"><ActionIcon><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></ActionIcon></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[color:var(--on-surface-variant)]">
            Hiển thị {pagedItems.length ? (page - 1) * pageSize + 1 : 0}-{(page - 1) * pageSize + pagedItems.length} trên {filteredItems.length} user
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-[16px] bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <span className="rounded-[16px] bg-[color:var(--primary-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
              Trang {page}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded-[16px] bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {drawerOpen && selectedProfile ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/28 backdrop-blur-[2px]">
          <button type="button" className="flex-1 cursor-default" onClick={() => setDrawerOpen(false)} aria-label="Đóng drawer" />
          <aside className="h-full w-full max-w-[560px] overflow-y-auto border-l border-white/70 bg-white/96 p-6 shadow-[-24px_0_80px_rgba(15,23,42,0.12)]">
            {isProfileLoading ? (
              <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-[color:var(--on-surface-variant)]">Đang tải hồ sơ...</div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-[color:var(--on-surface)]">{selectedProfile.displayName}</p>
                    {selectedProfileBadge ? (
                      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selectedProfileBadge.className}`}>{selectedProfileBadge.label}</span>
                    ) : null}
                    <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">{selectedProfile.username ? `@${selectedProfile.username}` : "Chưa có username"} · ID {selectedProfile.externalId}</p>
                  </div>
                  <button type="button" className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)]" onClick={() => setDrawerOpen(false)}>Đóng</button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Đang ở</p><p className="mt-2 text-2xl font-semibold text-[color:var(--on-surface)]">{selectedProfile.groupsActiveCount} group</p></div>
                  <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Tổng group</p><p className="mt-2 text-2xl font-semibold text-[color:var(--on-surface)]">{selectedProfile.groupsTotalCount}</p></div>
                  <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Lần vào</p><p className="mt-2 text-2xl font-semibold text-[color:var(--on-surface)]">{selectedProfile.joinCount}</p></div>
                  <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Cảnh báo</p><p className="mt-2 text-2xl font-semibold text-[color:var(--on-surface)]">{selectedProfile.warningTotal}</p></div>
                  <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">SĐT</p><p className="mt-2 text-base font-semibold text-[color:var(--on-surface)]">{selectedProfile.phoneNumber || "-"}</p></div>
                  <div className="rounded-[24px] bg-[color:var(--surface-low)] px-4 py-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Nguồn khách</p><p className="mt-2 text-base font-semibold text-[color:var(--on-surface)]">{selectedProfile.customerSource || "-"}</p></div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    ["overview", "Tổng quan"],
                    ["groups", "Nhóm hiện tại"],
                    ["timeline", "Lịch sử ra/vào"],
                    ["moderation", "Moderation"],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setDrawerTab(value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${drawerTab === value ? "bg-[color:var(--primary)] text-white" : "bg-[color:var(--surface-low)] text-[color:var(--on-surface)]"}`}>{label}</button>
                  ))}
                </div>

                {drawerTab === "overview" ? (
                  <div className="space-y-4">
                    <div className="rounded-[24px] bg-[color:var(--surface-low)] p-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">SĐT</p><input value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value)} readOnly={!canEditMembers} className="mt-3 w-full rounded-[18px] border border-transparent bg-white px-4 py-3 text-sm outline-none transition focus:border-[color:var(--primary)]" /></div>
                    <div className="rounded-[24px] bg-[color:var(--surface-low)] p-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Nguồn khách</p><input value={customerSourceDraft} onChange={(event) => setCustomerSourceDraft(event.target.value)} readOnly={!canEditMembers} className="mt-3 w-full rounded-[18px] border border-transparent bg-white px-4 py-3 text-sm outline-none transition focus:border-[color:var(--primary)]" /></div>
                    <div className="rounded-[24px] bg-[color:var(--surface-low)] p-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Owner</p><input value={ownerDraft} onChange={(event) => setOwnerDraft(event.target.value)} readOnly={!canEditMembers} className="mt-3 w-full rounded-[18px] border border-transparent bg-white px-4 py-3 text-sm outline-none transition focus:border-[color:var(--primary)]" /></div>
                    <div className="rounded-[24px] bg-[color:var(--surface-low)] p-4"><p className="text-xs uppercase tracking-[0.28em] text-[color:var(--on-surface-variant)]">Ghi chú</p><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} readOnly={!canEditMembers} rows={4} className="mt-3 w-full rounded-[18px] border border-transparent bg-white px-4 py-3 text-sm outline-none transition focus:border-[color:var(--primary)]" /></div>
                    {canEditMembers ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-full bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? "Đang lưu..." : "Lưu thay đổi"}</button>
                        <button type="button" onClick={() => void handleResetWarning()} disabled={isResetting || !primaryMember} className="rounded-full bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold text-[color:var(--on-surface)] disabled:opacity-60">{isResetting ? "Đang reset..." : "Reset cảnh báo"}</button>
                      </div>
                    ) : (
                      <div className="rounded-[24px] bg-[color:var(--surface-low)] p-4 text-sm text-[color:var(--on-surface-variant)]">
                        Quyền hiện tại chỉ cho xem hồ sơ. Không thể sửa dữ liệu khách hoặc reset cảnh báo.
                      </div>
                    )}
                  </div>
                ) : null}

                {drawerTab === "groups" ? (
                  <div className="space-y-3">
                    {selectedProfile.currentGroups.map((member) => (
                      <div key={member.id} className="rounded-[24px] bg-[color:var(--surface-low)] p-4">
                        <div className="flex items-center justify-between gap-3"><p className="text-base font-semibold text-[color:var(--on-surface)]">{member.groupTitle}</p><span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone(member.membershipStatus === "active" ? "success" : "neutral")}`}>{member.statusLabel}</span></div>
                        <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">Campaign: {member.campaignLabel || "Chưa gắn campaign"}</p>
                        <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">Vào nhóm: {formatDateTime(member.joinedAt)}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {drawerTab === "timeline" ? (
                  <div className="space-y-3">
                    {mergedTimeline.length ? mergedTimeline.map((event) => (
                      <div key={event.id} className="rounded-[24px] bg-[color:var(--surface-low)] p-4">
                        <div className="flex items-center justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone(event.type === "join" ? "success" : event.type === "warn" ? "warning" : "neutral")}`}>{event.type === "join" ? "Vào nhóm" : event.type === "left" ? "Rời nhóm" : "Cảnh báo"}</span><span className="text-xs text-[color:var(--on-surface-variant)]">{formatDateTime(event.timestamp)}</span></div>
                        <p className="mt-3 text-sm font-semibold text-[color:var(--on-surface)]">{event.groupTitle}</p>
                        <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">{event.detail}</p>
                      </div>
                    )) : <div className="rounded-[24px] bg-[color:var(--surface-low)] p-4 text-sm text-[color:var(--on-surface-variant)]">Chưa có timeline để hiển thị.</div>}
                  </div>
                ) : null}

                {drawerTab === "moderation" ? (
                  <div className="space-y-3">
                    {selectedProfile.moderationTimeline.length ? selectedProfile.moderationTimeline.map((event) => (
                      <div key={event.id} className="rounded-[24px] bg-[color:var(--surface-low)] p-4">
                        <div className="flex items-center justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone("warning")}`}>Moderation</span><span className="text-xs text-[color:var(--on-surface-variant)]">{formatDateTime(event.timestamp)}</span></div>
                        <p className="mt-3 text-sm font-semibold text-[color:var(--on-surface)]">{event.groupTitle}</p>
                        <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">{event.detail}</p>
                      </div>
                    )) : <div className="rounded-[24px] bg-[color:var(--surface-low)] p-4 text-sm text-[color:var(--on-surface-variant)]">Chưa có log moderation.</div>}
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
