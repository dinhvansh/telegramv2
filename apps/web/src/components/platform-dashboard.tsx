"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { fallbackPlatformSnapshot, PlatformSnapshot } from "@/lib/platform-data";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000/api";

const authStorageKey = "telegram-ops-access-token";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

type CreateCampaignInput = {
  name: string;
  channel: string;
  joinRate: string;
  status: "Active" | "Paused" | "Review";
};

type PlatformDashboardProps = {
  page?:
    | "dashboard"
    | "campaigns"
    | "moderation"
    | "autopost"
    | "roles"
    | "telegram"
    | "settings";
  entryMode?: boolean;
};

function decodeLegacyString(value: string) {
  if (!/[ÃÄÆá»âœâ—â†âŒâš]/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded.includes("�") ? value : decoded;
  } catch {
    return value;
  }
}

function normalizeText<T>(value: T): T {
  if (typeof value === "string") {
    return decodeLegacyString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeText(entry)]),
    ) as T;
  }

  return value;
}

function normalizeDomText(root: ParentNode | Node | null) {
  if (!root || typeof document === "undefined") {
    return;
  }

  const shouldSkipNode = (node: Node) => {
    const parent = node.parentElement;
    if (!parent) {
      return false;
    }

    return Boolean(parent.closest(".material-symbols-outlined, script, style, noscript"));
  };

  const normalizeAttributes = (element: Element) => {
    ["placeholder", "title", "aria-label"].forEach((attribute) => {
      const currentValue = element.getAttribute(attribute);
      if (!currentValue) {
        return;
      }

      const decodedValue = decodeLegacyString(currentValue);
      if (decodedValue !== currentValue) {
        element.setAttribute(attribute, decodedValue);
      }
    });
  };

  if (root instanceof Element) {
    normalizeAttributes(root);
  }

  if (root.nodeType === Node.TEXT_NODE) {
    if (!shouldSkipNode(root)) {
      const decodedText = decodeLegacyString(root.textContent ?? "");
      if (decodedText !== root.textContent) {
        root.textContent = decodedText;
      }
    }
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const currentNode = walker.currentNode;

    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      normalizeAttributes(currentNode as Element);
      continue;
    }

    if (currentNode.nodeType === Node.TEXT_NODE && !shouldSkipNode(currentNode)) {
      const decodedText = decodeLegacyString(currentNode.textContent ?? "");
      if (decodedText !== currentNode.textContent) {
        currentNode.textContent = decodedText;
      }
    }
  }
}

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

export function PlatformDashboard({
  page = "dashboard",
  entryMode = false,
}: PlatformDashboardProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PlatformSnapshot>(normalizeText(fallbackPlatformSnapshot));
  const [status, setStatus] = useState<"connected" | "fallback">("fallback");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("admin@nexus.local");
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignNotice, setCampaignNotice] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<CreateCampaignInput>({
    name: "Spring Operator Push",
    channel: "Nexus Global",
    joinRate: "0% conversion",
    status: "Active",
  });

  const canCreateCampaign = user?.permissions.includes("campaign.manage") ?? false;

  useEffect(() => {
    const savedToken = window.localStorage.getItem(authStorageKey);
    if (savedToken) {
      setToken(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    normalizeDomText(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          normalizeDomText(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach((node) => normalizeDomText(node));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAuthenticatedState(currentToken: string) {
      try {
        const [profile, data] = await Promise.all([
          fetchJson<SessionUser>(`${apiBaseUrl}/auth/me`, {
            headers: {
              Authorization: `Bearer ${currentToken}`,
            },
          }),
          fetchJson<PlatformSnapshot>(`${apiBaseUrl}/platform`),
        ]);

        if (isMounted) {
          setUser(profile);
          setSnapshot(normalizeText(data));
          setStatus("connected");
          setAuthError(null);
          if (entryMode) {
            router.replace("/dashboard");
          }
        }
      } catch {
        if (isMounted) {
          window.localStorage.removeItem(authStorageKey);
          setToken(null);
          setUser(null);
          setStatus("fallback");
          setAuthError("Phiên đăng nhập không hợp lệ hoặc API chưa sẵn sàng.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (!token) {
      return;
    }

    setIsLoading(true);
    void loadAuthenticatedState(token);

    return () => {
      isMounted = false;
    };
  }, [entryMode, router, token]);

  async function reloadSnapshot() {
    const data = await fetchJson<PlatformSnapshot>(`${apiBaseUrl}/platform`);
    setSnapshot(normalizeText(data));
    setStatus("connected");
  }

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
      setToken(response.accessToken);
      setUser(response.user);
    } catch {
      setAuthError("Đăng nhập thất bại. Kiểm tra lại email hoặc mật khẩu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(authStorageKey);
    setToken(null);
    setUser(null);
    setStatus("fallback");
    setIsLoading(false);
  }

  async function handleCreateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !canCreateCampaign) {
      setCampaignError("Tài khoản hiện tại không có quyền tạo campaign.");
      return;
    }

    setIsCreatingCampaign(true);
    setCampaignError(null);
    setCampaignNotice(null);

    try {
      await fetchJson(`${apiBaseUrl}/campaigns`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(campaignForm),
      });

      await reloadSnapshot();
      setCampaignNotice(`Đã tạo campaign ${campaignForm.name}.`);
      setIsCreateModalOpen(false);
      setCampaignForm({
        name: "",
        channel: "Nexus Global",
        joinRate: "0% conversion",
        status: "Active",
      });
    } catch {
      setCampaignError("Không thể tạo campaign. Kiểm tra quyền hoặc trạng thái API.");
    } finally {
      setIsCreatingCampaign(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] text-[color:var(--on-surface)]">
        <div className="rounded-[28px] bg-[color:var(--surface-card)] px-8 py-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
            Loading session
          </p>
          <p className="mt-3 text-lg font-black">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[color:var(--surface)] px-5 py-10 text-[color:var(--on-surface)]">
        <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,_rgba(0,83,219,0.18),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(0,107,98,0.12),_transparent_28%)]" />
        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[32px] bg-[color:var(--surface-card)] p-8 shadow-[0_8px_32px_rgba(42,52,57,0.04)] lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--on-surface-variant)]">
              Telegram Operations Platform
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight">
              Đăng nhập vào command center để quản lý campaign, moderation và autopost.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--on-surface-variant)]">
              Bản hiện tại đã có local Docker stack, Postgres seed, API thật và frontend
              kết nối trực tiếp. Tài khoản mặc định cho môi trường local là admin seeded.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["API", "JWT login + profile endpoint đã sẵn sàng."],
                ["Database", "User admin được seed vào PostgreSQL local."],
                ["UI", "Dashboard chỉ mở sau khi xác thực thành công."],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-[24px] bg-[color:var(--surface-low)] px-5 py-5">
                  <p className="text-sm font-black">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[32px] bg-[color:var(--surface-card)] p-8 shadow-[0_8px_32px_rgba(42,52,57,0.04)] lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--on-surface-variant)]">
              Sign in
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
                  Password
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
                {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </form>

            <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm leading-7 text-[color:var(--on-surface-variant)]">
              <p>
                Demo local credentials:
                <span className="font-semibold text-[color:var(--on-surface)]">
                  {" "}
                  admin@nexus.local / admin123
                </span>
              </p>
              <p className="mt-2">
                Operator local:
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

  return (
    <>
      <DashboardShell
        snapshot={snapshot}
        status={status}
        user={user}
        page={page}
        onLogout={handleLogout}
        canCreateCampaign={canCreateCampaign}
        onCreateCampaign={() => {
          setCampaignError(null);
          setCampaignNotice(null);
          setIsCreateModalOpen(true);
        }}
        isCreatingCampaign={isCreatingCampaign}
      />

      {(campaignError || campaignNotice) && (
        <div className="fixed bottom-5 right-5 z-20 max-w-sm rounded-[24px] bg-[color:var(--surface-card)] px-5 py-4 shadow-[0_8px_32px_rgba(42,52,57,0.12)]">
          <p
            className={`text-sm font-semibold ${
              campaignError
                ? "text-[color:var(--danger)]"
                : "text-[color:var(--success)]"
            }`}
          >
            {campaignError ?? campaignNotice}
          </p>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4">
          <div className="w-full max-w-xl rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                  Campaign composer
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Tạo campaign mới
                </h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Campaign name
                </span>
                <input
                  required
                  value={campaignForm.name}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    Channel
                  </span>
                  <input
                    required
                    value={campaignForm.channel}
                    onChange={(event) =>
                      setCampaignForm((current) => ({
                        ...current,
                        channel: event.target.value,
                      }))
                    }
                    className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    Status
                  </span>
                  <select
                    value={campaignForm.status}
                    onChange={(event) =>
                      setCampaignForm((current) => ({
                        ...current,
                        status: event.target.value as CreateCampaignInput["status"],
                      }))
                    }
                    className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Review">Review</option>
                    <option value="Paused">Paused</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Join rate label
                </span>
                <input
                  value={campaignForm.joinRate}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      joinRate: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>

              {campaignError ? (
                <div className="rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
                  {campaignError}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold"
                >
                  Hủy
                </button>
                <button
                  disabled={isCreatingCampaign}
                  className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {isCreatingCampaign ? "Đang tạo..." : "Lưu campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
