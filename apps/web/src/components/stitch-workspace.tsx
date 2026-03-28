"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "/api";

const authStorageKey = "telegram-ops-access-token";

type StitchWorkspaceProps = {
  html: string;
  entryMode?: boolean;
};

type SessionUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

function decodeLegacyString(value: string) {
  if (!/[ÃƒÃ„Ã†Ã¡Â»Ã¢Å“Ã¢â€”Ã¢â€ Ã¢Å’Ã¢Å¡]/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded.includes("ï¿½") ? value : decoded;
  } catch {
    return value;
  }
}

function normalizeDomText(root: ParentNode | Node | null) {
  if (!root || typeof document === "undefined") {
    return;
  }

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
    const decodedText = decodeLegacyString(root.textContent ?? "");
    if (decodedText !== root.textContent) {
      root.textContent = decodedText;
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

    if (currentNode.nodeType === Node.TEXT_NODE) {
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

export function StitchWorkspace({
  html,
  entryMode = false,
}: StitchWorkspaceProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("admin@nexus.local");
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(authStorageKey);
    if (savedToken) {
      setToken(savedToken);
      return;
    }

    setIsLoading(false);
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

    async function validateSession(currentToken: string) {
      try {
        await fetchJson<SessionUser>(`${apiBaseUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        });

        if (!isMounted) {
          return;
        }

        if (entryMode) {
          router.replace("/dashboard");
        }
      } catch {
        if (!isMounted) {
          return;
        }

        window.localStorage.removeItem(authStorageKey);
        setToken(null);
        setAuthError("Phiên đăng nhập không hợp lệ hoặc API chưa sẵn sàng.");
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
    void validateSession(token);

    return () => {
      isMounted = false;
    };
  }, [entryMode, router, token]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const response = await fetchJson<{ accessToken: string }>(
        `${apiBaseUrl}/auth/login`,
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );

      window.localStorage.setItem(authStorageKey, response.accessToken);
      setToken(response.accessToken);

      if (entryMode) {
        router.replace("/dashboard");
      }
    } catch {
      setAuthError("Đăng nhập thất bại. Kiểm tra lại email hoặc mật khẩu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] text-[color:var(--on-surface)]">
        <div className="rounded-[24px] bg-white px-8 py-7 shadow-[0_10px_40px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
            Loading session
          </p>
          <p className="mt-3 text-base font-bold">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[color:var(--surface)] px-5 py-10 text-[color:var(--on-surface)]">
        <div className="absolute inset-x-0 top-0 -z-10 h-[26rem] bg-[radial-gradient(circle_at_top_left,_rgba(0,83,219,0.16),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(0,107,98,0.10),_transparent_28%)]" />
        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[32px] bg-white p-8 shadow-[0_10px_40px_rgba(42,52,57,0.04)] lg:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Telegram Operations Platform
            </p>
            <h1 className="mt-3 max-w-3xl text-[44px] font-black leading-[1.02] tracking-[-0.05em]">
              Giao diện sẽ render trực tiếp từ các màn trong thư mục `stitch/`.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-[color:var(--on-surface-variant)]">
              Auth vẫn dùng API thật ở local. Sau khi đăng nhập, route sẽ hiển thị đúng HTML bạn đã thiết kế trong stitch.
            </p>
          </section>

          <section className="rounded-[32px] bg-white p-8 shadow-[0_10px_40px_rgba(42,52,57,0.04)] lg:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Sign in
            </p>
            <form onSubmit={handleLogin} className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
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
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
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
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <iframe
        className="block min-h-screen w-full border-0"
        srcDoc={html}
        title="Stitch Workspace"
      />
    </div>
  );
}
