"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/toast-context";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type CampaignItem = {
  id: string;
  name: string;
  channel: string;
  inviteCode: string;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  status: "Active" | "Paused" | "Review";
  joinedCount: number;
  leftCount: number;
  activeCount: number;
};

type EditCampaignForm = {
  id: string;
  name: string;
  assigneeUserId: string;
  status: CampaignItem["status"];
};

type CampaignAssigneeOption = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  department: string | null;
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

function getStatusLabel(status: CampaignItem["status"]) {
  switch (status) {
    case "Active":
      return "Đang chạy";
    case "Paused":
      return "Tạm dừng";
    case "Review":
      return "Đang rà soát";
    default:
      return status;
  }
}

function getNextStatus(status: CampaignItem["status"]): CampaignItem["status"] {
  return status === "Active" ? "Paused" : "Active";
}

function formatRate(value: number) {
  return `${Math.round(value)}%`;
}

function getRetentionRate(campaign: CampaignItem) {
  if (!campaign.joinedCount) {
    return 0;
  }

  return (campaign.activeCount / campaign.joinedCount) * 100;
}

function getLeaveRate(campaign: CampaignItem) {
  if (!campaign.joinedCount) {
    return 0;
  }

  return (campaign.leftCount / campaign.joinedCount) * 100;
}

export function CampaignsWorkbench({
  isAssignedCampaignView = false,
  canManageCampaigns = true,
  workspaceId = null,
  telegramBotId = null,
  onCreateCampaign,
  isCreatingCampaign = false,
}: {
  isAssignedCampaignView?: boolean;
  canManageCampaigns?: boolean;
  workspaceId?: string | null;
  telegramBotId?: string | null;
  onCreateCampaign?: () => void;
  isCreatingCampaign?: boolean;
}) {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [assignees, setAssignees] = useState<CampaignAssigneeOption[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingCampaignId, setTogglingCampaignId] = useState<string | null>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [copyingCampaignId, setCopyingCampaignId] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<EditCampaignForm | null>(null);
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

  useEffect(() => {
    let active = true;

    async function loadAssignees(currentToken: string) {
      try {
        const data = await fetchJson<CampaignAssigneeOption[]>(
          `${apiBaseUrl}/campaigns/assignees`,
          {
            headers: scopedHeaders ?? { Authorization: `Bearer ${currentToken}` },
          },
        );

        if (active) {
          setAssignees(data);
        }
      } catch {
        if (active) {
          setAssignees([]);
        }
      }
    }

    if (!token) {
      setAssignees([]);
      return;
    }

    void loadAssignees(token);

    return () => {
      active = false;
    };
  }, [scopedHeaders, toast, token]);

  const reloadCampaigns = useCallback(async () => {
    if (!scopedHeaders) {
      return;
    }
    const data = await fetchJson<CampaignItem[]>(`${apiBaseUrl}/campaigns`, {
      headers: scopedHeaders,
    });
    setCampaigns(data);
  }, [scopedHeaders]);

  async function handleUpdateCampaign() {
    if (!editingCampaign || !token) {
      return;
    }

    setIsSaving(true);

    try {
      await fetchJson(`${apiBaseUrl}/campaigns/${editingCampaign.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
        body: JSON.stringify({
          name: editingCampaign.name.trim(),
          assigneeUserId: editingCampaign.assigneeUserId || null,
          status: editingCampaign.status,
        }),
      });

      await reloadCampaigns();
      toast({ message: "Đã cập nhật campaign.", type: "success" });
      setEditingCampaign(null);
    } catch (updateError) {
      toast({
        message: updateError instanceof Error
          ? updateError.message
          : "Không thể cập nhật campaign.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleCampaign(campaign: CampaignItem) {
    if (!token) {
      toast({ message: "Bạn cần đăng nhập lại để cập nhật trạng thái campaign.", type: "error" });
      return;
    }

    setTogglingCampaignId(campaign.id);

    try {
      const nextStatus = getNextStatus(campaign.status);
      await fetchJson(`${apiBaseUrl}/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
        body: JSON.stringify({
          name: campaign.name,
          status: nextStatus,
        }),
      });
      await reloadCampaigns();
      toast({ message: nextStatus === "Active" ? "Đã bật lại campaign." : "Đã tạm dừng campaign.", type: "success" });
    } catch (toggleError) {
      toast({
        message: toggleError instanceof Error
          ? toggleError.message
          : "Không thể cập nhật trạng thái campaign.",
        type: "error",
      });
    } finally {
      setTogglingCampaignId(null);
    }
  }

  async function handleCopyInviteLink(campaign: CampaignItem) {
    if (!token) {
      toast({ message: "Bạn cần đăng nhập lại để copy link mời.", type: "error" });
      return;
    }
    try {
      await navigator.clipboard.writeText(campaign.inviteCode);
      toast({ message: `Đã copy link mời của campaign ${campaign.name}.`, type: "success" });
      setCopyingCampaignId(campaign.id);
      window.setTimeout(() => {
        setCopyingCampaignId((current) => (current === campaign.id ? null : current));
      }, 1600);
    } catch {
      toast({ message: "Không thể copy link mời trên trình duyệt này.", type: "error" });
    }
  }

  async function handleDeleteCampaign(campaignId: string) {
    if (!token) {
      toast({ message: "Bạn cần đăng nhập lại để xóa campaign.", type: "error" });
      return;
    }

    const confirmed = window.confirm(
      "Xóa campaign này? Link mời sẽ bị xóa, còn thành viên sẽ được giữ lại nhưng bỏ liên kết campaign.",
    );

    if (!confirmed) {
      return;
    }

    setDeletingCampaignId(campaignId);

    try {
      await fetchJson(`${apiBaseUrl}/campaigns/${campaignId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
      });
      await reloadCampaigns();
      toast({ message: "Đã xóa campaign.", type: "success" });
      setEditingCampaign((current) => (current?.id === campaignId ? null : current));
    } catch (deleteError) {
      toast({
        message: deleteError instanceof Error ? deleteError.message : "Không thể xóa campaign.",
        type: "error",
      });
    } finally {
      setDeletingCampaignId(null);
    }
  }

  useEffect(() => {
    let active = true;

    if (!token || !scopedHeaders) {
      setCampaigns([]);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    async function load() {
      try {
        const data = await fetchJson<CampaignItem[]>(`${apiBaseUrl}/campaigns`, {
          headers: scopedHeaders,
        });
        if (!active) {
          return;
        }

        setCampaigns(data);
      } catch (loadError) {
        toast({
          message: loadError instanceof Error
            ? loadError.message
            : "Không thể tải danh sách campaign.",
          type: "error",
        });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [scopedHeaders, toast, token]);

  useEffect(() => {
    function handleRefresh() {
      void reloadCampaigns();
    }

    window.addEventListener("campaigns:refresh", handleRefresh);

    return () => {
      window.removeEventListener("campaigns:refresh", handleRefresh);
    };
  }, [reloadCampaigns]);

  const summary = campaigns.reduce(
    (accumulator, campaign) => ({
      total: accumulator.total + 1,
      joined: accumulator.joined + campaign.joinedCount,
      active: accumulator.active + campaign.activeCount,
      left: accumulator.left + campaign.leftCount,
    }),
    { total: 0, joined: 0, active: 0, left: 0 },
  );

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Tổng campaign", summary.total],
          ["Đã tham gia", summary.joined],
          ["Đang ở lại", summary.active],
          ["Đã rời đi", summary.left],
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

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Campaign đang chạy
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">
              Theo dõi số vào nhóm, còn ở lại và đã rời trên từng chiến dịch
            </h3>
            {isAssignedCampaignView ? (
              <div className="mt-3 inline-flex rounded-full bg-[color:var(--primary-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
                Campaign của tôi
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
              {campaigns.length} campaign
            </div>
            {canManageCampaigns && onCreateCampaign ? (
              <button
                type="button"
                onClick={onCreateCampaign}
                disabled={isCreatingCampaign}
                className="rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingCampaign ? "Đang xử lý..." : "Tạo campaign"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="min-w-[1180px] w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Campaign</th>
                <th className="px-5 py-4 font-semibold">Kênh</th>
                <th className="px-5 py-4 font-semibold">Phụ trách</th>
                <th className="px-5 py-4 font-semibold">Đã tham gia</th>
                <th className="px-5 py-4 font-semibold">Đang ở lại</th>
                <th className="px-5 py-4 font-semibold">Đã rời</th>
                <th className="px-5 py-4 font-semibold">Link mời</th>
                <th className="px-5 py-4 font-semibold">Trạng thái</th>
                <th className="px-5 py-4 font-semibold">Quản lý</th>
                <th className="px-5 py-4 font-semibold">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign, index) => (
                <tr key={campaign.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-bold">{campaign.name}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      Ở lại {formatRate(getRetentionRate(campaign))} · Rời {formatRate(getLeaveRate(campaign))}
                    </p>
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                    {campaign.channel}
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    <span className="inline-flex rounded-full bg-white px-3 py-1 font-semibold text-[color:var(--on-surface)]">
                      {campaign.assigneeName ?? "Chưa gán"}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold">
                    {campaign.joinedCount}
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold text-[color:var(--success)]">
                    {campaign.activeCount}
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold text-[color:var(--danger)]">
                    {campaign.leftCount}
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    <div className="flex items-start gap-2">
                      <span className="break-all font-mono text-[color:var(--primary)]">
                        {campaign.inviteCode}
                      </span>
                      <button
                        type="button"
                        title="Copy link mời"
                        aria-label={`Copy link mời của ${campaign.name}`}
                        onClick={() => void handleCopyInviteLink(campaign)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                      >
                        {copyingCampaignId === campaign.id ? "✓" : "⧉"}
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                        campaign.status === "Active"
                          ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                          : campaign.status === "Review"
                            ? "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                            : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                      }`}
                    >
                      {getStatusLabel(campaign.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    {canManageCampaigns ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingCampaign({
                            id: campaign.id,
                            name: campaign.name,
                            assigneeUserId: campaign.assigneeUserId ?? "",
                            status: campaign.status,
                          })
                        }
                        className="inline-flex rounded-full bg-white px-4 py-2 font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleCampaign(campaign)}
                        disabled={togglingCampaignId === campaign.id}
                        className="inline-flex rounded-full bg-[color:var(--surface-card)] px-4 py-2 font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {togglingCampaignId === campaign.id
                          ? "Đang cập nhật..."
                          : campaign.status === "Active"
                            ? "Tắt"
                            : "Bật"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCampaign(campaign.id)}
                        disabled={deletingCampaignId === campaign.id}
                        className="inline-flex rounded-full bg-[color:var(--danger-soft)] px-4 py-2 font-semibold text-[color:var(--danger)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingCampaignId === campaign.id ? "Đang xóa..." : "Xóa"}
                      </button>
                    </div>
                    ) : (
                      <span className="inline-flex rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface-variant)]">
                        Chỉ xem
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="inline-flex rounded-full bg-[color:var(--surface-card)] px-4 py-2 font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                    >
                      Xem campaign
                    </Link>
                  </td>
                </tr>
              ))}

              {!isLoading && !campaigns.length ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-10 text-center text-sm text-[color:var(--on-surface-variant)]"
                  >
                    Chưa có campaign nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {editingCampaign ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-xl rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                  Campaign editor
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">Sửa campaign</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingCampaign(null)}
                className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
              >
                Đóng
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Tên campaign
                </span>
                <input
                  value={editingCampaign.name}
                  onChange={(event) =>
                    setEditingCampaign((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  className="w-full rounded-[18px] border border-transparent bg-[color:var(--surface-low)] px-4 py-3 outline-none transition focus:border-[color:var(--primary)]"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Người phụ trách
                </span>
                <select
                  value={editingCampaign.assigneeUserId}
                  onChange={(event) =>
                    setEditingCampaign((current) =>
                      current
                        ? {
                            ...current,
                            assigneeUserId: event.target.value,
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-[18px] border border-transparent bg-[color:var(--surface-low)] px-4 py-3 outline-none transition focus:border-[color:var(--primary)]"
                >
                  <option value="">Chưa gán</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                      {assignee.department ? ` · ${assignee.department}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Trạng thái
                </span>
                <select
                  value={editingCampaign.status}
                  onChange={(event) =>
                    setEditingCampaign((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as CampaignItem["status"],
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-[18px] border border-transparent bg-[color:var(--surface-low)] px-4 py-3 outline-none transition focus:border-[color:var(--primary)]"
                >
                  <option value="Active">Đang chạy</option>
                  <option value="Paused">Tạm dừng</option>
                  <option value="Review">Rà soát</option>
                </select>
              </label>

              <p className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                Group Telegram và link mời hiện tại được giữ nguyên để tránh lệch tracking thành viên theo invite link.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="rounded-full bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleUpdateCampaign()}
                  disabled={isSaving}
                  className="rounded-full bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Đang lưu..." : "Lưu campaign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
