"use client";

import { useEffect, useState } from "react";
import { WorkspacesWorkbench } from "@/components/workspaces-workbench";

const authStorageKey = "telegram-ops-access-token";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  defaultWorkspaceId: string | null;
  defaultOrganizationId: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    organizationId: string;
    organizationName: string;
    roles: string[];
  }>;
};

async function fetchJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export default function WorkspacesPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem(authStorageKey);
    if (!token) return;

    fetchJson<SessionUser>("/api/auth/me", token).then((data) => {
      setUser(data);
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)]">
        <div className="size-8 animate-spin rounded-full border-2 border-[color:var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!user?.permissions?.includes("organization.manage")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)]">
        <div className="rounded-[24px] bg-[color:var(--surface-card)] px-8 py-8 text-center shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-lg font-bold text-[color:var(--on-surface)]">Không có quyền truy cập</p>
          <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
            Bạn cần quyền <code>organization.manage</code> để truy cập trang này.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface)] px-5 py-8 lg:px-10 lg:py-10">
      <a
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-card)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] shadow-[0_4px_16px_rgba(42,52,57,0.04)] transition-all hover:bg-white/80"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Quay lại Dashboard
      </a>
      <WorkspacesWorkbench />
    </div>
  );
}
