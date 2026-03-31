import Link from "next/link";
import { AutopostWorkbench } from "@/components/autopost-workbench";
import { CampaignsWorkbench } from "@/components/campaigns-workbench";
import { MembersWorkbench } from "@/components/members-workbench";
import { ModerationWorkbench } from "@/components/moderation-workbench";
import { RolesWorkbench } from "@/components/roles-workbench";
import { TelegramControlCenter } from "@/components/telegram-control-center";
import { PlatformSnapshot } from "@/lib/platform-data";

const toneClassMap = {
  primary: "bg-[color:var(--primary-soft)] text-[color:var(--primary)]",
  success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  warning: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]",
  danger: "bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
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
  user?: {
    name: string;
    email: string;
    roles: string[];
    permissions?: string[];
  };
  onLogout?: () => void;
  canCreateCampaign?: boolean;
  onCreateCampaign?: () => void;
  isCreatingCampaign?: boolean;
};

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
      icon: "◌",
      description: "KPI hệ thống và tín hiệu vận hành.",
    },
    {
      key: "campaigns",
      href: "/campaigns",
      label: "Campaign",
      icon: "✦",
      description: "Chiến dịch đang chạy, vào nhóm và rời nhóm.",
    },
    {
      key: "members",
      href: "/members",
      label: "Thành viên",
      icon: "◎",
      description: "Danh sách user, owner và ghi chú chăm sóc.",
    },
    {
      key: "moderation",
      href: "/moderation",
      label: "Chống spam",
      icon: "⛨",
      description: "Rule chống spam và hàng đợi review.",
    },
    {
      key: "autopost",
      href: "/autopost",
      label: "Autopost",
      icon: "↗",
      description: "Lịch gửi bài và log điều phối.",
    },
    {
      key: "roles",
      href: "/roles",
      label: "Phân quyền",
      icon: "⌘",
      description: "Vai trò và quyền truy cập.",
    },
    {
      key: "telegram",
      href: "/telegram",
      label: "Telegram",
      icon: "✧",
      description: "Bot config, webhook và vòng đời group.",
    },
    {
      key: "settings",
      href: "/settings",
      label: "Cài đặt",
      icon: "⚙",
      description: "Cấu hình hệ thống và lộ trình triển khai.",
    },
  ] as const;

  const pageMeta = navigation.find((item) => item.key === page) ?? navigation[0];

  return (
    <div className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,_rgba(0,83,219,0.18),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(0,107,98,0.12),_transparent_28%)]" />

      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col bg-[color:var(--surface-low)] px-5 py-6 lg:flex">
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

        <nav className="mt-8 space-y-2">
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
                {item.icon}
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

        <div className="mt-auto rounded-[28px] bg-[linear-gradient(160deg,rgba(0,83,219,0.08),rgba(255,255,255,0.92))] p-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
            Build Focus
          </p>
          <h2 className="mt-2 text-lg font-black">CRM-first moderation</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            Ưu tiên campaign, thành viên, chống spam và Telegram sync trước AI.
          </p>
        </div>
      </aside>

      <main className="lg:ml-72">
        <header className="sticky top-0 z-10 bg-white/72 px-5 py-4 backdrop-blur-xl lg:px-10">
          <div className="flex flex-col gap-4 rounded-[28px] bg-[color:var(--surface-card)] px-5 py-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)] lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--on-surface-variant)]">
                {pageMeta.label}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight">{pageMeta.description}</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div
                className={`self-start rounded-full px-4 py-3 text-sm font-semibold sm:self-auto ${
                  status === "connected"
                    ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                    : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                }`}
              >
                API {status === "connected" ? "đã kết nối" : "fallback"}
              </div>
              {user ? (
                <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)]">
                  {user.name} · {user.roles.join(", ")}
                </div>
              ) : null}
              {onLogout ? (
                <button
                  onClick={onLogout}
                  className="w-full rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-bold text-[color:var(--on-surface)] sm:w-auto"
                >
                  Đăng xuất
                </button>
              ) : null}
              <button
                onClick={onCreateCampaign}
                disabled={!canCreateCampaign || isCreatingCampaign}
                className="w-full rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {isCreatingCampaign ? "Đang xử lý..." : "Tạo campaign mới"}
              </button>
            </div>
          </div>
        </header>

        <div className="px-5 pt-2 lg:hidden">
          <nav className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navigation.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`shrink-0 rounded-full px-4 py-3 text-sm font-semibold transition-all ${
                  page === item.key
                    ? "bg-[color:var(--primary)] text-white shadow-[0_12px_28px_rgba(0,83,219,0.24)]"
                    : "bg-[color:var(--surface-card)] text-[color:var(--on-surface)]"
                }`}
              >
                <span className="mr-2 text-xs">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="space-y-10 px-5 py-8 lg:px-10 lg:py-10">
          {page === "dashboard" ? (
            <section className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
              <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                  Tổng quan hệ thống
                </p>
                <h3 className="mt-2 max-w-3xl text-3xl font-black leading-tight tracking-tight">
                  Nền quản trị Telegram theo kiến trúc CRM-first và sẵn sàng cho moderation engine.
                </h3>
                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {snapshot.metrics.map((metric) => (
                    <article
                      key={metric.label}
                      className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5"
                    >
                      <div
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClassMap[metric.tone]}`}
                      >
                        {metric.trend}
                      </div>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                        {metric.label}
                      </p>
                      <p className="mt-2 text-3xl font-black tracking-tight">{metric.value}</p>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="rounded-[32px] bg-[linear-gradient(180deg,rgba(0,83,219,0.09),rgba(255,255,255,1))] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                  Quy tắc triển khai
                </p>
                <ul className="mt-5 space-y-4">
                  <li className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-6">
                    CRM là nguồn cấu hình duy nhất. Bot Telegram chỉ nhận update và thực thi.
                  </li>
                  <li className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-6">
                    Campaign phải nhìn được số vào nhóm, còn ở lại và đã rời trên cùng một màn.
                  </li>
                  <li className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-6">
                    Mọi quyết định moderation đều phải có log và owner phụ trách rõ ràng.
                  </li>
                </ul>
              </aside>
            </section>
          ) : null}

          {page === "campaigns" ? <CampaignsWorkbench /> : null}
          {page === "members" ? <MembersWorkbench embedded /> : null}
          {page === "moderation" ? <ModerationWorkbench /> : null}
          {page === "autopost" ? <AutopostWorkbench /> : null}

          {false ? (
            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[32px] bg-[color:var(--surface-low)] p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                  Autopost
                </p>
                <h3 className="mt-2 text-xl font-black tracking-tight">
                  Điều phối bài đăng theo lịch, có retry và có log.
                </h3>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {snapshot.autopostCapabilities.map((item) => (
                    <div key={item.title} className="rounded-[22px] bg-[color:var(--surface-card)] px-4 py-4">
                      <p className="text-sm font-bold">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                  Vai trò vận hành
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {snapshot.roles.map((role) => (
                    <article key={role.title} className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
                      <p className="text-sm font-bold">{role.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                        {role.detail}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {page === "roles" ? <RolesWorkbench currentUser={user} /> : null}

          {page === "telegram" ? <TelegramControlCenter embedded /> : null}

          {page === "settings" ? (
            <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                    Lộ trình triển khai
                  </p>
                  <h3 className="mt-2 text-xl font-black tracking-tight">
                    Thứ tự triển khai đã khóa theo dependency thực tế
                  </h3>
                </div>
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-2">
                {snapshot.roadmap.map((phase) => (
                  <article key={phase.phase} className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                      {phase.phase}
                    </p>
                    <h4 className="mt-2 text-lg font-black tracking-tight">{phase.outcome}</h4>
                    <ul className="mt-4 space-y-3">
                      {phase.tasks.map((task) => (
                        <li key={task} className="rounded-[18px] bg-white/72 px-4 py-3 text-sm leading-6">
                          {task}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
