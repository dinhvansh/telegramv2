import Link from "next/link";
import { PlatformSnapshot } from "@/lib/platform-data";

const toneClassMap = {
  primary: "bg-[color:var(--primary-soft)] text-[color:var(--primary)]",
  success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  warning: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]",
  danger: "bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
};

const statusClassMap = {
  Active: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  Paused: "bg-[color:var(--danger-soft)] text-[color:var(--danger)]",
  Review: "bg-[color:var(--warning-soft)] text-[color:var(--warning)]",
};

type DashboardShellProps = {
  snapshot: PlatformSnapshot;
  status?: "connected" | "fallback";
  page?:
    | "dashboard"
    | "campaigns"
    | "moderation"
    | "autopost"
    | "roles"
    | "telegram"
    | "settings";
  user?: {
    name: string;
    email: string;
    roles: string[];
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
      label: "Dashboard",
      icon: "◌",
      description: "KPI, Telegram health và activity feed.",
    },
    {
      key: "campaigns",
      href: "/campaigns",
      label: "Campaigns",
      icon: "✦",
      description: "Danh sách campaign và thao tác tạo mới.",
    },
    {
      key: "moderation",
      href: "/moderation",
      label: "Moderation",
      icon: "⛨",
      description: "Rule anti-spam và hàng đợi review.",
    },
    {
      key: "autopost",
      href: "/autopost",
      label: "Autopost",
      icon: "↗",
      description: "Execution model và năng lực dispatch.",
    },
    {
      key: "roles",
      href: "/roles",
      label: "Roles",
      icon: "⌘",
      description: "Vai trò, permission và quyền truy cập.",
    },
    {
      key: "telegram",
      href: "/telegram",
      label: "Telegram",
      icon: "✆",
      description: "Webhook, tunnel và trạng thái integration.",
    },
    {
      key: "settings",
      href: "/settings",
      label: "Settings",
      icon: "⚙",
      description: "System config và roadmap triển khai.",
    },
  ] as const;

  const pageMeta =
    navigation.find((item) => item.key === page) ?? navigation[0];

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
          <h2 className="mt-2 text-lg font-black">MVP theo luồng vận hành thật</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            Ưu tiên flow campaign, join tracking, anti-spam và autopost trước AI.
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
              <h2 className="mt-1 text-xl font-black tracking-tight">
                {pageMeta.description}
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div
                className={`rounded-full px-4 py-3 text-sm font-semibold ${
                  status === "connected"
                    ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                    : "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                }`}
              >
                API {status === "connected" ? "connected" : "fallback"}
              </div>
              <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)]">
                Search campaign, user, event...
              </div>
              {user ? (
                <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)]">
                  {user.name} · {user.roles.join(", ")}
                </div>
              ) : null}
              {onLogout ? (
                <button
                  onClick={onLogout}
                  className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-bold text-[color:var(--on-surface)]"
                >
                  Logout
                </button>
              ) : null}
              <button
                onClick={onCreateCampaign}
                disabled={!canCreateCampaign || isCreatingCampaign}
                className="rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingCampaign ? "Đang xử lý..." : "Tạo campaign mới"}
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-10 px-5 py-8 lg:px-10 lg:py-10">
          {page === "dashboard" ? (
          <section id="overview" className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
            <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Tổng quan hệ thống
              </p>
              <h3 className="mt-2 max-w-3xl text-3xl font-black leading-tight tracking-tight">
                Nền quản trị Telegram theo kiến trúc modular monolith, queue-first và realtime-ready.
              </h3>
              <p className="mt-4 max-w-3xl text-base leading-8 text-[color:var(--on-surface-variant)]">
                Baseline hiện tại đã được dựng theo đúng roadmap: admin shell, module map,
                KPI vận hành, campaign intelligence, moderation strategy và execution plan
                để tiếp tục triển khai backend, webhook, queue và AI.
              </p>

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
                  Không xử lý nặng trong webhook. Tất cả event Telegram phải đi qua queue.
                </li>
                <li className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-6">
                  Mọi module vận hành phải có audit trail và trạng thái hiển thị được trong UI.
                </li>
                <li className="rounded-[22px] bg-white/72 px-4 py-4 text-sm leading-6">
                  Anti-spam triển khai rule engine trước, AI moderation sau.
                </li>
              </ul>
            </aside>
          </section>
          ) : null}

          {page === "campaigns" ? (
          <section id="campaigns" className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                    Campaign & Invite Links
                  </p>
                  <h3 className="mt-2 text-xl font-black tracking-tight">
                    Các chiến dịch tăng trưởng đang được ưu tiên xây dựng
                  </h3>
                </div>
                <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  CRUD + tracking + metrics
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-[24px] bg-[color:var(--surface-low)]">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                      <th className="px-5 py-4 font-semibold">Campaign</th>
                      <th className="px-5 py-4 font-semibold">Kênh</th>
                      <th className="px-5 py-4 font-semibold">Link</th>
                      <th className="px-5 py-4 font-semibold">Hiệu quả</th>
                      <th className="px-5 py-4 font-semibold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.campaigns.map((campaign, index) => (
                      <tr
                        key={campaign.inviteCode}
                        className={index % 2 === 1 ? "bg-white/65" : ""}
                      >
                        <td className="px-5 py-4 text-sm font-bold">{campaign.name}</td>
                        <td className="px-5 py-4 text-sm text-[color:var(--on-surface-variant)]">
                          {campaign.channel}
                        </td>
                        <td className="px-5 py-4 text-sm font-mono text-[color:var(--primary)]">
                          {campaign.inviteCode}
                        </td>
                        <td className="px-5 py-4 text-sm text-[color:var(--on-surface-variant)]">
                          {campaign.joinRate}
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClassMap[campaign.status]}`}
                          >
                            {campaign.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-[32px] bg-[color:var(--surface-low)] p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Flow chuẩn
              </p>
              <ol className="mt-5 space-y-4">
                {[
                  "User tạo campaign và chọn Telegram group đích.",
                  "API gọi Telegram Bot API để tạo invite link.",
                  "Webhook nhận user join và đẩy event vào queue.",
                  "Worker map campaign, cập nhật metrics và emit realtime.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-4 rounded-[22px] bg-white/72 px-4 py-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-card)] text-xs font-black text-[color:var(--primary)]">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </section>
          ) : null}

          {page === "moderation" ? (
          <section id="moderation" className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Anti-spam strategy
              </p>
              <h3 className="mt-2 text-xl font-black tracking-tight">
                Rule engine trước, AI moderation sau, mọi quyết định đều có log.
              </h3>
              <div className="mt-6 space-y-3">
                {snapshot.moderationRules.map((rule) => (
                  <div
                    key={rule}
                    className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm leading-7"
                  >
                    {rule}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] bg-[linear-gradient(160deg,rgba(159,64,61,0.08),rgba(255,255,255,1))] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Event feed
              </p>
              <div className="mt-5 space-y-4">
                {snapshot.eventFeed.map((event) => (
                  <article key={`${event.time}-${event.title}`} className="rounded-[22px] bg-white/75 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold">{event.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                          {event.detail}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${toneClassMap[event.tone]}`}
                      >
                        {event.time}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
          ) : null}

          {page === "autopost" ? (
          <section id="autopost" className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[32px] bg-[color:var(--surface-low)] p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Autopost execution
              </p>
              <h3 className="mt-2 text-xl font-black tracking-tight">
                Queue-driven dispatch với retry, log và target selection.
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

            <div id="roles" className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Auth, RBAC, settings
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
              <div className="mt-6 rounded-[24px] bg-[linear-gradient(135deg,rgba(0,83,219,0.08),rgba(0,107,98,0.08))] px-5 py-5">
                <p className="text-sm font-bold">Cấu hình hệ thống bắt buộc</p>
                <p className="mt-2 text-sm leading-7 text-[color:var(--on-surface-variant)]">
                  Bot token phải được mã hóa. 2FA hiện tại:{" "}
                  <span className="font-semibold">{snapshot.settings["security.2fa"]}</span>. WebSocket strategy:{" "}
                  <span className="font-semibold">
                    {snapshot.settings["websocket.strategy"]}
                  </span>.
                </p>
              </div>
            </div>
          </section>
          ) : null}

          {page === "roles" ? (
          <section id="roles" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Roles và permission
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

            <div className="rounded-[32px] bg-[color:var(--surface-low)] p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Phiên hiện tại
              </p>
              <div className="mt-5 rounded-[22px] bg-[color:var(--surface-card)] px-4 py-4 text-sm leading-7">
                <p className="font-bold">{user?.name}</p>
                <p className="text-[color:var(--on-surface-variant)]">{user?.email}</p>
                <p className="mt-3 font-semibold">Roles: {user?.roles.join(", ")}</p>
              </div>
            </div>
          </section>
          ) : null}

          {page === "telegram" ? (
          <section id="telegram" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Telegram integration
              </p>
              <div className="mt-5 space-y-3">
                <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm leading-7">
                  Dùng route này để theo dõi webhook, bot token, tunnel public và trạng thái tích hợp Telegram.
                </div>
                <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm leading-7">
                  Nếu muốn Telegram gọi webhook thật thì cần public HTTPS endpoint, local-only chỉ test được bằng mock hoặc POST thủ công.
                </div>
              </div>
            </div>

            <div className="rounded-[32px] bg-[color:var(--surface-low)] p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Test path
              </p>
              <ol className="mt-5 space-y-4">
                {[
                  "Cấu hình token và public base URL ở phần settings.",
                  "Register webhook khi đã có HTTPS public URL.",
                  "Dùng /api/telegram/mock và /api/telegram/webhook để test local trước.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-4 rounded-[22px] bg-white/72 px-4 py-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-card)] text-xs font-black text-[color:var(--primary)]">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
          ) : null}

          {page === "settings" ? (
          <section id="settings" className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                  Delivery roadmap
                </p>
                <h3 className="mt-2 text-xl font-black tracking-tight">
                  Thứ tự triển khai đã được khóa theo dependency thực tế
                </h3>
              </div>
              <p className="text-sm font-bold text-[color:var(--primary)]">
                Xem chi tiết trong docs/implementation_master_plan.md
              </p>
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
