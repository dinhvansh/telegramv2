"use client";

import Link from "next/link";
import { AutopostWorkbench } from "@/components/autopost-workbench";
import { CampaignsWorkbench } from "@/components/campaigns-workbench";
import { MembersWorkbench } from "@/components/members-workbench";
import { ModerationWorkbench } from "@/components/moderation-workbench";
import { RolesWorkbench } from "@/components/roles-workbench";
import { SettingsWorkbench } from "@/components/settings-workbench";
import { TelegramControlCenter } from "@/components/telegram-control-center";
import { PlatformSnapshot } from "@/lib/platform-data";

function MenuIcon({
  path,
  active = false,
}: {
  path: React.ReactNode;
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
  page?:
    | "dashboard"
    | "campaigns"
    | "members"
    | "moderation"
    | "autopost"
    | "roles"
    | "telegram"
    | "settings";
  user?: { name: string; email: string; roles: string[]; permissions?: string[] };
  onLogout?: () => void;
  canCreateCampaign?: boolean;
  onCreateCampaign?: () => void;
  isCreatingCampaign?: boolean;
};

function getCampaignProgress(targetCount: number, joinedCount: number) {
  if (!targetCount) {
    return 0;
  }

  return Math.min(100, (joinedCount / targetCount) * 100);
}

function buildLine(values: number[]) {
  const safe = values.length ? values : [0];
  const max = Math.max(...safe, 1);
  const min = Math.min(...safe, 0);
  const range = max - min || 1;

  return safe
    .map((value, index) => {
      const x = safe.length > 1 ? (index * 320) / (safe.length - 1) : 160;
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
  const line = buildLine(values);
  return (
    <svg viewBox="0 0 320 96" className="h-24 w-full">
      <polyline
        points={line}
        fill="none"
        stroke={toneStrokeMap[tone]}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DashboardShell({
  snapshot,
  status = "fallback",
  page = "dashboard",
  user,
  onLogout,
  canCreateCampaign = false,
  onCreateCampaign,
  isCreatingCampaign = false,
}: DashboardShellProps) {
  const navigation = [
    {
      key: "dashboard",
      href: "/dashboard",
      label: "Tổng quan",
      icon: (
        <>
          <path d="M4 13h6V5H4z" />
          <path d="M14 19h6v-8h-6z" />
          <path d="M14 10h6V5h-6z" />
          <path d="M4 19h6v-3H4z" />
        </>
      ),
      description: "Số liệu nhanh và trạng thái hệ thống.",
    },
    {
      key: "campaigns",
      href: "/campaigns",
      label: "Campaign",
      icon: (
        <>
          <path d="m4 16 8-8 8 8" />
          <path d="M12 8V4" />
          <path d="M7 21h10" />
          <path d="M9 16h6" />
        </>
      ),
      description: "Chiến dịch đang chạy, vào nhóm và rời nhóm.",
    },
    {
      key: "members",
      href: "/members",
      label: "Thành viên",
      icon: (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </>
      ),
      description: "Danh sách user, owner và ghi chú chăm sóc.",
    },
    {
      key: "moderation",
      href: "/moderation",
      label: "Chống spam",
      icon: (
        <>
          <path d="M12 3 4 7v5c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V7z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </>
      ),
      description: "Rule chống spam và hàng đợi review.",
    },
    {
      key: "autopost",
      href: "/autopost",
      label: "Autopost",
      icon: (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
          <path d="m15 15 2 2 3-4" />
        </>
      ),
      description: "Lịch gửi bài và log điều phối.",
    },
    {
      key: "roles",
      href: "/roles",
      label: "Phân quyền",
      icon: (
        <>
          <path d="M12 3 4 7v5c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V7z" />
          <path d="m9.5 12 1.5 1.5 3.5-3.5" />
        </>
      ),
      description: "Vai trò và quyền truy cập.",
    },
    {
      key: "telegram",
      href: "/telegram",
      label: "Telegram",
      icon: (
        <>
          <path d="M21 4 3 11l7 2 2 7 9-16Z" />
          <path d="m10 13 5-5" />
        </>
      ),
      description: "Bot config, webhook và vòng đời group.",
    },
    {
      key: "settings",
      href: "/settings",
      label: "Cài đặt",
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
      description: "Cấu hình hệ thống và tích hợp AI.",
    },
  ] as const;

  const topCampaigns = snapshot.campaigns
    .map((campaign, index) => ({
      ...campaign,
      score:
        campaign.targetCount > 0
          ? getCampaignProgress(campaign.targetCount, campaign.joinedCount)
          : Math.max(24, 82 - index * 12),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const chartValues = topCampaigns.map((item) => item.score);
  const eventValues = snapshot.eventFeed
    .slice(0, 6)
    .reverse()
    .map(
      (event, index) =>
        30 +
        index * 8 +
        (event.tone === "danger" ? 20 : event.tone === "warning" ? 14 : 10),
    );
  const campaignStateCounts = snapshot.campaigns.reduce(
    (acc, campaign) => {
      acc[campaign.status] += 1;
      return acc;
    },
    { Active: 0, Paused: 0, Review: 0 },
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
          {navigation.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`group flex rounded-[22px] px-4 py-4 transition-all ${
                page === item.key
                  ? "bg-[color:var(--surface-card)] shadow-[0_8px_32px_rgba(42,52,57,0.04)]"
                  : "hover:bg-white/60"
              }`}
            >
              <div className="mr-4 mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-card)] text-sm font-bold text-[color:var(--primary)]">
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
            <div className="flex items-center justify-end">
              <div className="flex shrink-0 items-center gap-2 xl:hidden 2xl:flex">
                <div
                  className={`rounded-full px-3 py-2 text-xs font-semibold ${
                    status === "connected"
                      ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                      : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                  }`}
                >
                  {status === "connected" ? "API OK" : "Fallback"}
                </div>
                {user ? (
                  <div className="max-w-[160px] truncate rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface-variant)]">
                    {user.name}
                  </div>
                ) : null}
                {onLogout ? (
                  <button
                    onClick={onLogout}
                    className="rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs font-bold text-[color:var(--on-surface)]"
                  >
                    Thoát
                  </button>
                ) : null}
                <button
                  onClick={onCreateCampaign}
                  disabled={!canCreateCampaign || isCreatingCampaign}
                  className="rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-4 py-2 text-xs font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingCampaign ? "Đang xử lý..." : "Tạo mới"}
                </button>
              </div>
            </div>

            <div className="mt-3 hidden min-w-0 items-center justify-between gap-4 border-t border-black/5 pt-3 2xl:hidden xl:flex">
              <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {navigation.map((item) => (
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
                      <span className={`whitespace-nowrap ${page === item.key ? "text-white" : ""}`}>{item.label}</span>
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
                {user ? (
                  <div className="max-w-[140px] truncate rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs text-[color:var(--on-surface-variant)]">
                    {user.name}
                  </div>
                ) : null}
                {onLogout ? (
                  <button
                    onClick={onLogout}
                    className="rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs font-bold text-[color:var(--on-surface)]"
                  >
                    Thoát
                  </button>
                ) : null}
                <button
                  onClick={onCreateCampaign}
                  disabled={!canCreateCampaign || isCreatingCampaign}
                  className="rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-4 py-2 text-xs font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingCampaign ? "Đang xử lý..." : "Tạo mới"}
                </button>
              </div>
            </div>

            <div className="mt-3 border-t border-black/5 pt-3 xl:hidden">
              <nav className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {navigation.map((item) => (
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
                      <span className={`whitespace-nowrap ${page === item.key ? "text-white" : ""}`}>{item.label}</span>
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <div className="space-y-10 px-5 py-8 lg:px-10 lg:py-10">
          {page === "dashboard" ? (
            <div className="space-y-6">
              <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
                <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                        Tổng quan
                      </p>
                      <h3 className="mt-2 text-3xl font-black leading-tight tracking-tight">
                        Theo dõi nhanh campaign, moderation và trạng thái hệ thống.
                      </h3>
                    </div>
                    <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(0,83,219,0.1),rgba(0,107,98,0.08))] px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                        Tổng sự kiện
                      </p>
                      <p className="mt-2 text-3xl font-black tracking-tight">
                        {snapshot.eventFeed.length}
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {snapshot.metrics.map((metric) => (
                      <article
                        key={metric.label}
                        className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClassMap[metric.tone]}`}
                          >
                            {metric.trend}
                          </div>
                          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                            live
                          </span>
                        </div>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                          {metric.label}
                        </p>
                        <p className="mt-2 text-3xl font-black tracking-tight">
                          {metric.value}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <article className="rounded-[28px] bg-[linear-gradient(180deg,rgba(0,83,219,0.1),rgba(255,255,255,0.96))] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                        Xu hướng campaign
                      </p>
                      <h4 className="mt-1 text-lg font-black tracking-tight">
                        Campaign có tỷ lệ vào nhóm cao
                      </h4>
                      <div className="mt-4 rounded-[24px] bg-white/75 p-3">
                        <MiniChart values={chartValues} tone="primary" />
                      </div>
                    </article>

                    <article className="rounded-[28px] bg-[color:var(--surface-low)] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                        Tỷ trọng campaign
                      </p>
                      <h4 className="mt-1 text-lg font-black tracking-tight">
                        Trạng thái hiện tại
                      </h4>
                      <div className="mt-5 space-y-4">
                        {[
                          {
                            label: "Đang chạy",
                            value: campaignStateCounts.Active,
                            tone: "success" as const,
                          },
                          {
                            label: "Chờ review",
                            value: campaignStateCounts.Review,
                            tone: "warning" as const,
                          },
                          {
                            label: "Tạm dừng",
                            value: campaignStateCounts.Paused,
                            tone: "danger" as const,
                          },
                        ].map((item) => (
                          <div key={item.label} className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-semibold">{item.label}</span>
                              <span className="text-xs font-bold">{item.value}</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-white/80">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(
                                    (item.value /
                                      Math.max(snapshot.campaigns.length, 1)) *
                                      100,
                                    item.value ? 12 : 0,
                                  )}%`,
                                  backgroundColor: toneStrokeMap[item.tone],
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                </div>

                <aside className="space-y-6">
                  <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                      Nhật ký sự kiện
                    </p>
                    <div className="mt-4 rounded-[24px] bg-[color:var(--surface-low)] p-4">
                      <MiniChart values={eventValues} tone="danger" />
                    </div>
                    <div className="mt-5 space-y-3">
                      {snapshot.eventFeed.slice(0, 4).map((event) => (
                        <article
                          key={`${event.time}-${event.title}`}
                          className="rounded-[20px] bg-[color:var(--surface-low)] px-4 py-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold">{event.title}</p>
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${toneClassMap[event.tone]}`}
                            >
                              {event.time}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                            {event.detail}
                          </p>
                        </article>
                      ))}
                    </div>
                  </div>
                </aside>
              </section>

              <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                      Top campaign
                    </p>
                    <h3 className="mt-2 text-xl font-black tracking-tight">
                      Campaign nên theo dõi
                    </h3>
                  </div>
                  <div className="rounded-full bg-[color:var(--surface-low)] px-3 py-1 text-xs font-bold text-[color:var(--on-surface-variant)]">
                    {topCampaigns.length} campaign
                  </div>
                </div>
                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  {topCampaigns.map((campaign) => {
                    const tone =
                      campaign.status === "Active"
                        ? "success"
                        : campaign.status === "Review"
                          ? "warning"
                          : "danger";
                    return (
                      <article
                        key={`${campaign.name}-${campaign.channel}`}
                        className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-black tracking-tight">
                              {campaign.name}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                              {campaign.channel}
                            </p>
                          </div>
                          <div
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClassMap[tone]}`}
                          >
                            {campaign.status}
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                          <span className="text-[color:var(--on-surface-variant)]">
                            {campaign.joinedCount}/{campaign.targetCount || 0} mục tiêu
                          </span>
                          <span className="font-bold">{campaign.score}%</span>
                        </div>
                        <div className="mt-2 h-2.5 rounded-full bg-white/80">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(Math.max(campaign.score, 10), 100)}%`,
                              backgroundColor: toneStrokeMap[tone],
                            }}
                          />
                        </div>
                        <p className="mt-3 text-xs text-[color:var(--on-surface-variant)]">
                          Invite hiện tại: {campaign.inviteCode}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}

          {page === "campaigns" ? <CampaignsWorkbench /> : null}
          {page === "members" ? <MembersWorkbench embedded /> : null}
          {page === "moderation" ? <ModerationWorkbench /> : null}
          {page === "autopost" ? <AutopostWorkbench /> : null}
          {page === "roles" ? <RolesWorkbench currentUser={user} /> : null}
          {page === "telegram" ? <TelegramControlCenter embedded /> : null}
          {page === "settings" ? <SettingsWorkbench /> : null}
        </div>
      </main>
    </div>
  );
}
