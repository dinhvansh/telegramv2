"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
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

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@nexus.local");
  const [password, setPassword] = useState("admin123");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem(authStorageKey);
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const response = await fetchJson<{
        accessToken: string;
        user: SessionUser;
      }>(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      window.localStorage.setItem(authStorageKey, response.accessToken);
      router.replace("/dashboard");
    } catch {
      setAuthError("Đăng nhập thất bại. Kiểm tra lại email hoặc mật khẩu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[color:var(--surface)] px-5 py-10 text-[color:var(--on-surface)]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(0,83,219,0.22),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(0,107,98,0.18),_transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(242,246,252,1))]" />

      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[36px] bg-[color:var(--surface-card)] p-8 shadow-[0_18px_64px_rgba(27,39,94,0.08)] lg:p-10">
          <div className="flex items-center gap-5">
            <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#082673_0%,#0053db_52%,#009688_100%)] text-white shadow-[0_18px_40px_rgba(0,83,219,0.24)]">
              <div className="absolute inset-[7px] rounded-[22px] border border-white/20" />
              <div className="relative flex flex-col items-center leading-none">
                <span className="text-[2rem] font-black tracking-[-0.08em]">S</span>
                <span className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.36em] text-white/90">
                  TG
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--on-surface-variant)]">
                Skynet Telegram CRM
              </p>
              <h1 className="mt-2 text-4xl font-black leading-tight tracking-tight">
                Điều phối campaign, moderation và autopost trên một màn hình.
              </h1>
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-base leading-8 text-[color:var(--on-surface-variant)]">
            Nơi vận hành tập trung cho bot Telegram: quản lý group, kiểm soát chống spam,
            theo dõi thành viên và đo hiệu quả campaign theo link mời.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Campaign", "Tạo link mời thật, đặt mục tiêu và theo dõi user vào nhóm."],
              ["Moderation", "Điều khiển rule chống spam, cảnh báo, mute, kick và ban."],
              ["Autopost", "Lên lịch gửi bài nhiều group, có log gửi và trạng thái chạy."],
            ].map(([title, detail]) => (
              <div
                key={title}
                className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5"
              >
                <p className="text-sm font-black">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[36px] bg-[color:var(--surface-card)] p-8 shadow-[0_18px_64px_rgba(27,39,94,0.08)] lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--on-surface-variant)]">
            Đăng nhập
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                Email
              </span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                type="email"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                Mật khẩu
              </span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                type="password"
                autoComplete="current-password"
              />
            </label>

            {authError ? (
              <div className="rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
                {authError}
              </div>
            ) : null}

            <button
              disabled={isSubmitting}
              className="w-full rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-4 text-sm font-bold text-white shadow-[0_16px_40px_rgba(0,83,219,0.24)] disabled:opacity-60"
            >
              {isSubmitting ? "Đang đăng nhập..." : "Vào hệ thống"}
            </button>
          </form>

          <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm leading-7 text-[color:var(--on-surface-variant)]">
            <p>
              Tài khoản quản trị:
              <span className="font-semibold text-[color:var(--on-surface)]">
                {" "}
                admin@nexus.local / admin123
              </span>
            </p>
            <p className="mt-2">
              Tài khoản vận hành:
              <span className="font-semibold text-[color:var(--on-surface)]">
                {" "}
                operator@nexus.local / operator123
              </span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
