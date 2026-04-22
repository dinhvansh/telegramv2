"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ContactsWorkbench } from "@/components/contacts-workbench";
import { AutopostWorkbench } from "@/components/autopost-workbench";
import { CampaignsWorkbench } from "@/components/campaigns-workbench";
import { Member360Workbench } from "@/components/member360-workbench";
import { MembersWorkbench } from "@/components/members-workbench";
import { ModerationWorkbench } from "@/components/moderation-workbench";
import { RolesWorkbench } from "@/components/roles-workbench";
import { SettingsWorkbench } from "@/components/settings-workbench";
import { TelegramControlCenter } from "@/components/telegram-control-center";
import { WorkspacesWorkbench } from "@/components/workspaces-workbench";
import { canAccessPage, type DashboardPage } from "@/lib/page-access";
import type { PlatformSnapshot } from "@/lib/platform-data";

function decodeLegacyString(value: string) {
  const exactMap = new Map<string, string>([
    ["Qu?n tr? workspace", "Quản trị workspace"],
    ["Qu?n tr? h? th?ng", "Quản trị hệ thống"],
    ["Ki?m duy?t vi?n", "Kiểm duyệt viên"],
    ["V?n h?nh", "Vận hành"],
    ["C?ng t?c vi?n", "Cộng tác viên"],
    ["ChÆ°a gÃ¡n", "Chưa gán"],
  ]);
  const exactHit = exactMap.get(value);
  if (exactHit) {
    return exactHit;
  }
  try {
    const bytes = Uint8Array.from(
      Array.from(value).map((character) => character.charCodeAt(0)),
    );
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded.includes("�") ? value : decoded;
  } catch {
    return value;
  }
}

function text(value?: string | null) {
  return decodeLegacyString(String(value ?? ""));
}

function MenuIcon({
  path,
  active = false,
}: {
  path: ReactNode;
  active?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-[18px] ${active ? "text-white" : "text-[color:var(--primary)]"}`}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const toneClassMap = {
  primary: "bg-[color:var(--primary-soft)] text-[color:var(--primary)]",
  success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  warning: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]",
  danger: "bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
};

const toneStrokeMap = {
  primary: "rgb(0, 83, 219)",
  success: "rgb(0, 107, 98)",
  warning: "rgb(184, 124, 0)",
  danger: "rgb(198, 62, 29)",
};

type DashboardShellProps = {
  snapshot: PlatformSnapshot;
  status?: "connected" | "fallback";
  page?: DashboardPage;
  user?: { name: string; email: string; roles: string[]; permissions?: string[] };
  availableWorkspaces?: Array<{
    id: string;
    name: string;
    slug: string;
    organizationId: string;
    organizationName: string;
    roles: string[];
  }>;
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
  selectedBotId?: string | null;
  availableBots?: Array<{
    id: string;
    name: string;
    username: string | null;
    isPrimary: boolean;
    isActive: boolean;
  }>;
  onBotChange?: (botId: string | null) => void;
  onLogout?: () => void;
  canCreateCampaign?: boolean;
  canViewCampaignData?: boolean;
  onCreateCampaign?: () => void;
  isCreatingCampaign?: boolean;
};

function buildLine(values: number[]) {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;

  return safeValues
    .map((value, index) => {
      const x = safeValues.length > 1 ? (index * 320) / (safeValues.length - 1) : 160;
      const y = 96 - ((value - min) / range) * 82 - 7;
      return `${x},${y}`;
    })
    .join(" ");
}

function MiniChart({
  values,
  tone,
}: {
  values: number[];
  tone: keyof typeof toneStrokeMap;
}) {
  return (
    <svg viewBox="0 0 320 96" className="h-24 w-full">
      <polyline
        points={buildLine(values)}
        fill="none"
        stroke={toneStrokeMap[tone]}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDelta(value: number) {
  if (value > 0) {
    return `+${value.toFixed(1)}%`;
  }
  if (value < 0) {
    return `${value.toFixed(1)}%`;
  }
  return "0%";
}

export function DashboardShell({
  snapshot,
  status = "fallback",
  page = "dashboard",
  user,
  availableWorkspaces = [],
  selectedWorkspaceId = null,
  onWorkspaceChange,
  selectedBotId = null,
  availableBots = [],
  onBotChange,
  onLogout,
  canViewCampaignData = false,
  onCreateCampaign,
  isCreatingCampaign = false,
}: DashboardShellProps) {
  const hasMultipleBots = availableBots.length > 1;
  const showBotSelector = selectedWorkspaceId && (hasMultipleBots || availableBots.length === 1);
  const currentWorkspaceName =
    availableWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.name ??
    availableWorkspaces[0]?.name ??
    null;
  const userPermissions = user?.permissions ?? [];
  const canSwitchWorkspace = userPermissions.includes("organization.manage");
  const canManageCampaigns =
    userPermissions.includes("campaign.manage") ||
    userPermissions.includes("moderation.review") ||
    userPermissions.includes("settings.manage");
  const canEditMembers =
    userPermissions.includes("campaign.manage") ||
    userPermissions.includes("moderation.review");
  const isAssignedCampaignView =
    canViewCampaignData &&
    !userPermissions.includes("moderation.review") &&
    !userPermissions.includes("settings.manage");

  const navigation = [
    {
      key: "dashboard",
      href: "/dashboard",
      label: "Tổng quan",
      description: "Số liệu nhanh và trạng thái hệ thống.",
      icon: (
        <>
          <path d="M4 13h6V5H4z" />
          <path d="M14 19h6v-8h-6z" />
          <path d="M14 10h6V5h-6z" />
          <path d="M4 19h6v-3H4z" />
        </>
      ),
    },
    {
      key: "campaigns",
      href: "/campaigns",
      label: "Campaign",
      description: "Chiến dịch đang chạy, vào nhóm và rời nhóm.",
      icon: (
        <>
          <path d="m4 16 8-8 8 8" />
          <path d="M12 8V4" />
          <path d="M7 21h10" />
          <path d="M9 16h6" />
        </>
      ),
    },
    {
      key: "members",
      href: "/members",
      label: "Thành viên",
      description: "Danh sách user, owner và ghi chú chăm sóc.",
      icon: (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </>
      ),
    },
    {
      key: "member360",
      href: "/member360",
      label: "Member 360",
      description: "Hồ sơ user, group hiện tại và lịch sử ra/vào.",
      icon: (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M4 20a5 5 0 0 1 10 0" />
          <circle cx="18" cy="10" r="2" />
          <path d="M15.5 19a3.5 3.5 0 0 1 5 0" />
        </>
      ),
    },
    {
      key: "moderation",
      href: "/moderation",
      label: "Bot & Moderation",
      description: "Bot đang dùng, group đang sync và moderation.",
      icon: (
        <>
          <path d="M12 3 4 7v5c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V7z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </>
      ),
    },
    {
      key: "autopost",
      href: "/autopost",
      label: "Autopost",
      description: "Lịch gửi bài và log điều phối.",
      icon: (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
          <path d="m15 15 2 2 3-4" />
        </>
      ),
    },
    {
      key: "roles",
      href: "/roles",
      label: "Phân quyền",
      description: "Vai trò và quyền truy cập.",
      icon: (
        <>
          <path d="M12 3 4 7v5c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V7z" />
          <path d="m9.5 12 1.5 1.5 3.5-3.5" />
        </>
      ),
    },
    {
      key: "contacts",
      href: "/contacts",
      label: "Danh bạ",
      description: "Nhập danh bạ và resolve Telegram IDs.",
      icon: (
        <>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </>
      ),
    },
    {
      key: "workspaces",
      href: "/workspaces",
      label: "Workspaces",
      description: "Quản lý org, workspace, bot và memberships.",
      icon: (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      ),
    },
    {
      key: "settings",
      href: "/settings",
      label: "Cài đặt",
      description: "Cấu hình hệ thống và tích hợp AI.",
      icon: (
        <>
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="m4.9 4.9 2.1 2.1" />
          <path d="m17 17 2.1 2.1" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="m4.9 19.1 2.1-2.1" />
          <path d="m17 7 2.1-2.1" />
          <circle cx="12" cy="12" r="3.5" />
        </>
      ),
    },
  ] as const;

  const visibleNavigation = navigation.filter(
    (item) => item.key !== "moderation" && canAccessPage(userPermissions, item.key),
  );

  const groupMemberValues = snapshot.groupInsights.slice(0, 6).map((group) => group.memberCount);
  const activeGrowthGroups = snapshot.groupInsights.filter(
    (group) =>
      group.memberCount > 0 ||
      group.monthlyJoins > 0 ||
      group.previousMonthlyJoins > 0,
  );

  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,_rgba(0,83,219,0.18),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(0,107,98,0.12),_transparent_28%)]" />

      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col overflow-y-auto bg-[color:var(--surface-low)] px-5 py-6 2xl:flex">
        <div className="rounded-[28px] bg-white/70 px-5 py-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] text-lg font-bold text-white">
              TG
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--on-surface-variant)]">
                Digital Command
              </p>
              <h1 className="text-xl font-black tracking-tight">Telegram Ops</h1>
            </div>
          </div>
        </div>

        <nav className="mt-8 space-y-2 pb-6">
          {visibleNavigation.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`group flex rounded-[22px] px-4 py-4 transition-all ${
                page === item.key
                  ? "bg-[color:var(--surface-card)] shadow-[0_8px_32px_rgba(42,52,57,0.04)]"
                  : "hover:bg-white/60"
              }`}
            >
              <div className="mr-4 mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-card)]">
                <MenuIcon path={item.icon} />
              </div>
              <div>
                <p className="text-sm font-bold">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--on-surface-variant)]">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="2xl:ml-72">
        <header className="sticky top-0 z-30 bg-white/80 px-5 py-3 backdrop-blur-xl 2xl:px-10">
          <div className="rounded-[28px] bg-[color:var(--surface-card)] px-5 py-4 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 sm:flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                  Workspace
                </p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="truncate text-lg font-black tracking-tight text-[color:var(--on-surface)]">
                    {currentWorkspaceName ? text(currentWorkspaceName) : "Workspace"}
                  </h2>
                  {user ? (
                    <span className="inline-flex max-w-[260px] items-center gap-1 rounded-full bg-[color:var(--surface-low)] px-3 py-1.5 text-xs font-bold text-[color:var(--on-surface)]">
                      <span className="text-[color:var(--on-surface-variant)]">User</span>
                      <span className="truncate">{text(user.name)}</span>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0 xl:hidden 2xl:flex">
                <div
                  className={`rounded-full px-3 py-2 text-xs font-semibold ${
                    status === "connected"
                      ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                      : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                  }`}
                >
                  {status === "connected" ? "API OK" : "Fallback"}
                </div>
                {canSwitchWorkspace && availableWorkspaces.length > 1 && onWorkspaceChange ? (
                  <select
                    value={selectedWorkspaceId ?? ""}
                    onChange={(event) => onWorkspaceChange(event.target.value)}
                    className="max-w-[220px] rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface)] outline-none"
                  >
                    {availableWorkspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {text(workspace.name)}
                      </option>
                    ))}
                  </select>
                ) : null}
                {showBotSelector && onBotChange ? (
                  <select
                    value={selectedBotId ?? ""}
                    onChange={(event) => onBotChange(event.target.value || null)}
                    className="max-w-[180px] rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface)] outline-none"
                  >
                    {availableBots.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        [{text(bot.name)}]
                        {bot.isPrimary ? " ★" : ""}
                        {!bot.isActive ? " (Đã tắt)" : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                {user ? (
                  <div className="max-w-[260px] truncate rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface-variant)]">
                    {text(user.name)}
                    {currentWorkspaceName ? ` · ${text(currentWorkspaceName)}` : ""}
                  </div>
                ) : null}
                {onLogout ? (
                  <button
                    onClick={onLogout}
                    className="rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-4 py-2 text-xs font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)]"
                  >
                    Thoát
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 hidden min-w-0 items-center justify-between gap-4 border-t border-black/5 pt-3 2xl:hidden xl:flex">
              <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleNavigation.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`shrink-0 rounded-[18px] px-3 py-2 text-[11px] font-semibold transition-all ${
                      page === item.key
                        ? "bg-[color:var(--primary)] text-white shadow-[0_12px_28px_rgba(0,83,219,0.24)]"
                        : "bg-[color:var(--surface-low)] text-[color:var(--on-surface)]"
                    }`}
                  >
                    <span className="flex flex-col items-center gap-1 leading-none">
                      <span>
                        <MenuIcon path={item.icon} active={page === item.key} />
                      </span>
                      <span className={`whitespace-nowrap ${page === item.key ? "text-white" : ""}`}>
                        {item.label}
                      </span>
                    </span>
                  </Link>
                ))}
              </nav>
              <div className="flex shrink-0 items-center gap-2">
                <div
                  className={`rounded-full px-3 py-2 text-xs font-semibold ${
                    status === "connected"
                      ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                      : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                  }`}
                >
                  {status === "connected" ? "API OK" : "Fallback"}
                </div>
                {canSwitchWorkspace && availableWorkspaces.length > 1 && onWorkspaceChange ? (
                  <select
                    value={selectedWorkspaceId ?? ""}
                    onChange={(event) => onWorkspaceChange(event.target.value)}
                    className="max-w-[180px] rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface)] outline-none"
                  >
                    {availableWorkspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {text(workspace.name)}
                      </option>
                    ))}
                  </select>
                ) : null}
                {showBotSelector && onBotChange ? (
                  <select
                    value={selectedBotId ?? ""}
                    onChange={(event) => onBotChange(event.target.value || null)}
                    className="max-w-[160px] rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface)] outline-none"
                  >
                    {availableBots.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        [{text(bot.name)}]
                        {bot.isPrimary ? " ★" : ""}
                        {!bot.isActive ? " (Đã tắt)" : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                {user ? (
                  <div className="max-w-[240px] truncate rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface-variant)]">
                    {text(user.name)}
                    {currentWorkspaceName ? ` · ${text(currentWorkspaceName)}` : ""}
                  </div>
                ) : null}
                {onLogout ? (
                  <button
                    onClick={onLogout}
                    className="rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-4 py-2 text-xs font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)]"
                  >
                    Thoát
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 border-t border-black/5 pt-3 xl:hidden">
              <nav className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleNavigation.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`shrink-0 rounded-[18px] px-3 py-2 text-[11px] font-semibold transition-all ${
                      page === item.key
                        ? "bg-[color:var(--primary)] text-white shadow-[0_12px_28px_rgba(0,83,219,0.24)]"
                        : "bg-[color:var(--surface-low)] text-[color:var(--on-surface)]"
                    }`}
                  >
                    <span className="flex flex-col items-center gap-1 leading-none">
                      <span>
                        <MenuIcon path={item.icon} active={page === item.key} />
                      </span>
                      <span className={`whitespace-nowrap ${page === item.key ? "text-white" : ""}`}>
                        {item.label}
                      </span>
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <div className="space-y-10 px-5 py-8 lg:px-10 lg:py-10">
          {page === "dashboard" ? (
            <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                    Tổng quan
                  </p>
                  <h3 className="mt-2 text-3xl font-black leading-tight tracking-tight">
                    Theo dõi nhanh bot đang chạy, tăng trưởng group và mức độ hoạt động của user.
                  </h3>
                  {isAssignedCampaignView ? (
                    <div className="mt-4 inline-flex rounded-full bg-[color:var(--primary-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--primary)]">
                      Chế độ cộng tác viên: chỉ hiện campaign được giao
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(0,83,219,0.1),rgba(0,107,98,0.08))] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                    Group đồng bộ
                  </p>
                  <p className="mt-2 text-3xl font-black tracking-tight">
                    {snapshot.botSummary.activeGroupCount}/{snapshot.botSummary.totalGroupCount}
                  </p>
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {snapshot.metrics.map((metric) => (
                  <article key={metric.label} className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClassMap[metric.tone]}`}>
                        {metric.trend}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                        LIVE
                      </span>
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-3xl font-black tracking-tight">{metric.value}</p>
                  </article>
                ))}
              </div>

              <div className="mt-8 grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
                <article className="rounded-[28px] bg-[linear-gradient(180deg,rgba(0,83,219,0.08),rgba(255,255,255,0.96))] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                    Bot đang chạy
                  </p>
                  <h4 className="mt-1 text-lg font-black tracking-tight">{snapshot.botSummary.botName}</h4>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] bg-white/75 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                        Bot ID
                      </p>
                      <p className="mt-2 text-lg font-black tracking-tight">
                        {snapshot.botSummary.botExternalId ?? "Chưa xác định"}
                      </p>
                    </div>
                    <div className="rounded-[20px] bg-white/75 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                        Webhook
                      </p>
                      <p className="mt-2 text-lg font-black tracking-tight">
                        {snapshot.botSummary.webhookRegistered ? "Đã đăng ký" : "Chưa đăng ký"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[20px] bg-white/75 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                          Group đang quản lý
                        </p>
                        <p className="mt-2 text-lg font-black tracking-tight">
                          {snapshot.botSummary.activeGroupCount}/{snapshot.botSummary.totalGroupCount} group
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <MiniChart values={groupMemberValues} tone="primary" />
                      </div>
                    </div>
                  </div>
                </article>

                <article className="rounded-[28px] bg-[color:var(--surface-low)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                        Group đồng bộ
                      </p>
                      <h4 className="mt-1 text-lg font-black tracking-tight">
                        Thành viên, tăng trưởng tháng và mức độ hoạt động
                      </h4>
                    </div>
                    <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-[color:var(--on-surface-variant)]">
                      {activeGrowthGroups.length} group
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {activeGrowthGroups.map((group) => {
                      const growthTone =
                        group.growthRate > 0
                          ? "success"
                          : group.growthRate < 0
                            ? "danger"
                            : "warning";

                      return (
                        <article key={group.title} className="rounded-[20px] bg-white/75 px-4 py-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-base font-black tracking-tight">{group.title}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full bg-[color:var(--surface-low)] px-3 py-1 text-xs font-bold text-[color:var(--on-surface)]">
                                  {group.memberCount} thành viên
                                </span>
                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClassMap[growthTone]}`}>
                                  {formatDelta(group.growthRate)} so với tháng trước
                                </span>
                                <span className="rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-bold text-[color:var(--primary)]">
                                  {group.activeUsers} user hoạt động
                                </span>
                              </div>
                            </div>

                            <div className="grid min-w-[220px] gap-2 text-sm text-[color:var(--on-surface-variant)] sm:grid-cols-2">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                                  Join tháng này
                                </p>
                                <p className="mt-1 text-base font-black text-[color:var(--on-surface)]">
                                  {group.monthlyJoins}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                                  Join tháng trước
                                </p>
                                <p className="mt-1 text-base font-black text-[color:var(--on-surface)]">
                                  {group.previousMonthlyJoins}
                                </p>
                              </div>
                              <div className="sm:col-span-2">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                                    Tỷ lệ hoạt động user
                                  </p>
                                  <span className="text-xs font-bold text-[color:var(--on-surface)]">
                                    {group.activityRate.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="mt-2 h-2.5 rounded-full bg-[color:var(--surface-low)]">
                                  <div
                                    className="h-full rounded-full bg-[color:var(--primary)]"
                                    style={{
                                      width: `${Math.max(Math.min(group.activityRate, 100), group.activityRate ? 8 : 0)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </article>
              </div>
            </section>
          ) : null}

          {page === "campaigns" ? (
            <CampaignsWorkbench
              isAssignedCampaignView={isAssignedCampaignView}
              canManageCampaigns={canManageCampaigns}
              workspaceId={selectedWorkspaceId}
              telegramBotId={selectedBotId}
              onCreateCampaign={onCreateCampaign}
              isCreatingCampaign={isCreatingCampaign}
            />
          ) : null}

          {page === "members" ? (
            <MembersWorkbench
              embedded
              isAssignedCampaignView={isAssignedCampaignView}
              canEditMembers={canEditMembers}
              workspaceId={selectedWorkspaceId}
              telegramBotId={selectedBotId}
            />
          ) : null}

          {page === "member360" ? (
            <Member360Workbench
              isAssignedCampaignView={isAssignedCampaignView}
              canEditMembers={canEditMembers}
              workspaceId={selectedWorkspaceId}
              telegramBotId={selectedBotId}
            />
          ) : null}

          {page === "moderation" ? (
            <ModerationWorkbench
              workspaceId={selectedWorkspaceId}
              telegramBotId={selectedBotId}
            />
          ) : null}
          {page === "autopost" ? (
            <AutopostWorkbench
              workspaceId={selectedWorkspaceId}
              telegramBotId={selectedBotId}
            />
          ) : null}
          {page === "roles" ? <RolesWorkbench currentUser={user} /> : null}
          {page === "telegram" ? (
            <TelegramControlCenter
              embedded
              workspaceId={selectedWorkspaceId}
              telegramBotId={selectedBotId}
            />
          ) : null}
          {page === "settings" ? (
            <SettingsWorkbench telegramBotId={selectedBotId} />
          ) : null}
          {page === "workspaces" ? <WorkspacesWorkbench /> : null}
          {page === "contacts" ? (
            <ContactsWorkbench workspaceId={selectedWorkspaceId} />
          ) : null}
        </div>
      </main>
    </div>
  );
}
