"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

// ─── Types ────────────────────────────────────────────────────────────────────

type Organization = {
  id: string;
  name: string;
  slug: string;
  workspaceCount?: number;
};

type Workspace = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  botCount: number;
  groupCount: number;
  campaignCount: number;
  membershipCount: number;
  memberships: Array<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userStatus: string;
    roleId: string;
    roleName: string;
    isActive: boolean;
  }>;
};

type Bot = {
  id: string;
  label: string;
  username: string | null;
  displayName: string | null;
  workspaceId: string;
  workspaceName: string;
  groupCount: number;
  campaignCount: number;
  isVerified: boolean;
  webhookRegistered: boolean;
  hasToken: boolean;
  publicBaseUrl: string | null;
  isPrimary: boolean;
  isActive: boolean;
};

type Catalog = {
  organizations: Organization[];
  workspaces: Array<{ id: string; name: string; slug: string; organizationId: string }>;
  users: Array<{ id: string; name: string; email: string; status: string }>;
  roles: Array<{ id: string; name: string }>;
};

type Overview = {
  organizations: Organization[];
  workspaces: Workspace[];
  bots: Bot[];
};

// ─── API helpers ───────────────────────────────────────────────────────────────

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
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ─── Shared components ────────────────────────────────────────────────────────

function Banner({ message, tone = "danger", extraClass = "" }: { message: string; tone?: "success" | "warning" | "danger"; extraClass?: string }) {
  const toneClass = tone === "success"
    ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
    : tone === "warning"
    ? "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
    : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
  return (
    <div className={`mt-3 rounded-[16px] px-4 py-3 text-sm font-semibold ${toneClass} ${extraClass}`}>
      {message}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="size-8 animate-spin rounded-full border-2 border-[color:var(--primary)] border-t-transparent" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[20px] bg-[color:var(--surface-low)] px-6 py-12 text-center text-sm text-[color:var(--on-surface-variant)]">
      {message}
    </div>
  );
}

// ─── Organization Tab ─────────────────────────────────────────────────────────

function OrganizationTab({
  token,
  overview,
  catalog,
  onCreated,
  onDeleted,
}: {
  token: string;
  overview: Overview | null;
  catalog: Catalog | null;
  onCreated: () => void;
  onDeleted: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [creatingName, setCreatingName] = useState("");
  const [creatingSlug, setCreatingSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!creatingName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/organizations`, token, {
        method: "POST",
        body: JSON.stringify({ name: creatingName.trim(), slug: creatingSlug.trim() || undefined }),
      });
      setCreatingName("");
      setCreatingSlug("");
      setIsCreating(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo thất bại");
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xóa organization "${name}"? Dữ liệu sẽ bị archive.`)) return;
    setDeletingId(id);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/organizations/${id}`, token, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xóa thất bại");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Tạo Organization mới
        </p>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Tên</label>
            <input
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              placeholder="Công ty A"
              className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Slug (tùy chọn)</label>
            <input
              value={creatingSlug}
              onChange={(e) => setCreatingSlug(e.target.value)}
              placeholder="cong-ty-a"
              className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isCreating || !creatingName.trim()}
            className="rounded-[14px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isCreating ? "Đang tạo..." : "Tạo"}
          </button>
        </form>
        {error ? <Banner message={error} extraClass="mt-3" /> : null}
      </section>

      {/* List */}
      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Danh sách Organizations
        </p>
        {!overview ? (
          <LoadingSpinner />
        ) : overview.organizations.length === 0 ? (
          <EmptyState message="Chưa có organization nào." />
        ) : (
          <div className="space-y-3">
            {overview.organizations.map((org) => (
              <div key={org.id} className="flex items-center justify-between rounded-[16px] bg-[color:var(--surface-low)] px-5 py-4">
                <div>
                  <p className="font-bold text-[color:var(--on-surface)]">{org.name}</p>
                  <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">/{org.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">
                    {org.workspaceCount ?? 0} workspace
                  </span>
                  <button
                    onClick={() => handleDelete(org.id, org.name)}
                    disabled={deletingId === org.id}
                    className="rounded-[12px] bg-[color:var(--danger-soft)] px-3 py-2 text-xs font-bold text-[color:var(--danger)] disabled:opacity-50"
                  >
                    {deletingId === org.id ? "..." : "Xóa"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Workspace Tab ───────────────────────────────────────────────────────────

function WorkspaceTab({
  token,
  overview,
  catalog,
  onCreated,
  onDeleted,
}: {
  token: string;
  overview: Overview | null;
  catalog: Catalog | null;
  onCreated: () => void;
  onDeleted: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ organizationId: "", name: "", slug: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces`, token, {
        method: "POST",
        body: JSON.stringify({ organizationId: form.organizationId, name: form.name.trim(), slug: form.slug.trim() || undefined, description: form.description.trim() || undefined }),
      });
      setForm({ organizationId: "", name: "", slug: "", description: "" });
      setIsCreating(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo thất bại");
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xóa workspace "${name}"?`)) return;
    setDeletingId(id);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/${id}`, token, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xóa thất bại");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Tạo Workspace mới
        </p>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Organization</label>
              <select
                value={form.organizationId}
                onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                required
              >
                <option value="">-- Chọn organization --</option>
                {catalog?.organizations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Tên workspace</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sales, Support, Affiliate..."
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Slug (tùy chọn)</label>
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="sales"
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Mô tả (tùy chọn)</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Nhóm kinh doanh"
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isCreating || !form.organizationId || !form.name.trim()}
            className="rounded-[14px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isCreating ? "Đang tạo..." : "Tạo Workspace"}
          </button>
        </form>
        {error ? <Banner message={error} extraClass="mt-3" /> : null}
      </section>

      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Danh sách Workspaces
        </p>
        {!overview ? (
          <LoadingSpinner />
        ) : overview.workspaces.length === 0 ? (
          <EmptyState message="Chưa có workspace nào." />
        ) : (
          <div className="space-y-3">
            {overview.workspaces.map((ws) => (
              <div key={ws.id} className="flex items-start justify-between gap-4 rounded-[16px] bg-[color:var(--surface-low)] px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-[color:var(--on-surface)]">{ws.name}</p>
                    <span className="rounded-full bg-[color:var(--primary-soft)] px-2 py-0.5 text-xs font-semibold text-[color:var(--primary)]">
                      {ws.isActive ? "Hoạt động" : "Đã tắt"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                    /{ws.slug} · {ws.membershipCount} thành viên · {ws.botCount} bot · {ws.groupCount} group
                  </p>
                  {ws.description ? (
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">{ws.description}</p>
                  ) : null}
                </div>
                <button
                  onClick={() => handleDelete(ws.id, ws.name)}
                  disabled={deletingId === ws.id}
                  className="shrink-0 rounded-[12px] bg-[color:var(--danger-soft)] px-3 py-2 text-xs font-bold text-[color:var(--danger)] disabled:opacity-50"
                >
                  {deletingId === ws.id ? "..." : "Xóa"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Bots Tab ─────────────────────────────────────────────────────────────────

function BotsTab({
  token,
  overview,
  catalog,
  onCreated,
}: {
  token: string;
  overview: Overview | null;
  catalog: Catalog | null;
  onCreated: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ workspaceId: "", label: "", botToken: "" });
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.workspaceId || !form.label.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/${form.workspaceId}/bots`, token, {
        method: "POST",
        body: JSON.stringify({
          label: form.label.trim(),
          botToken: form.botToken.trim() || undefined,
        }),
      });
      setForm({ workspaceId: "", label: "", botToken: "" });
      setIsCreating(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo thất bại");
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Thêm Bot mới
        </p>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Workspace</label>
              <select
                value={form.workspaceId}
                onChange={(e) => setForm({ ...form, workspaceId: e.target.value })}
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                required
              >
                <option value="">-- Chọn workspace --</option>
                {catalog?.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Tên bot</label>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Sales Bot, Support Bot..."
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">
                Bot Token (tùy chọn)
              </label>
              <input
                value={form.botToken}
                onChange={(e) => setForm({ ...form, botToken: e.target.value })}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isCreating || !form.workspaceId || !form.label.trim()}
            className="rounded-[14px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isCreating ? "Đang tạo..." : "Thêm Bot"}
          </button>
        </form>
        {error ? <Banner message={error} extraClass="mt-3" /> : null}
      </section>

      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Danh sách Bots
        </p>
        {!overview ? (
          <LoadingSpinner />
        ) : overview.bots.length === 0 ? (
          <EmptyState message="Chưa có bot nào." />
        ) : (
          <div className="space-y-3">
            {overview.bots.map((bot) => (
              <div key={bot.id} className="flex flex-wrap items-start justify-between gap-4 rounded-[16px] bg-[color:var(--surface-low)] px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-[color:var(--on-surface)]">{bot.label}</p>
                    {bot.isPrimary ? (
                      <span className="rounded-full bg-[color:var(--success-soft)] px-2 py-0.5 text-xs font-bold text-[color:var(--success)]">★ Primary</span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${bot.isActive ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"}`}>
                      {bot.isActive ? "Hoạt động" : "Đã tắt"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                    @{bot.username ?? "không có username"} · Workspace: {bot.workspaceName}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {bot.isVerified ? (
                      <span className="rounded-full bg-[color:var(--success-soft)] px-2 py-0.5 text-xs text-[color:var(--success)]">Verified</span>
                    ) : (
                      <span className="rounded-full bg-[color:var(--surface-card)] px-2 py-0.5 text-xs text-[color:var(--on-surface-variant)]">Chưa verify</span>
                    )}
                    {bot.hasToken ? (
                      <span className="rounded-full bg-[color:var(--success-soft)] px-2 py-0.5 text-xs text-[color:var(--success)]">Có token</span>
                    ) : (
                      <span className="rounded-full bg-[color:var(--surface-card)] px-2 py-0.5 text-xs text-[color:var(--on-surface-variant)]">Không có token</span>
                    )}
                    <span className="rounded-full bg-[color:var(--surface-card)] px-2 py-0.5 text-xs text-[color:var(--on-surface-variant)]">
                      {bot.groupCount} group · {bot.campaignCount} campaign
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Memberships Tab ──────────────────────────────────────────────────────────

function MembershipsTab({
  token,
  overview,
  catalog,
  onCreated,
}: {
  token: string;
  overview: Overview | null;
  catalog: Catalog | null;
  onCreated: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ workspaceId: "", userId: "", roleId: "" });
  const [error, setError] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.workspaceId || !form.userId || !form.roleId) return;
    setIsCreating(true);
    setError(null);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/${form.workspaceId}/memberships`, token, {
        method: "POST",
        body: JSON.stringify({ userId: form.userId, roleId: form.roleId }),
      });
      setForm({ workspaceId: "", userId: "", roleId: "" });
      setIsCreating(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gán thất bại");
      setIsCreating(false);
    }
  }

  async function handleToggle(membershipId: string, currentActive: boolean) {
    setToggleLoading(membershipId);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/memberships/${membershipId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentActive }),
      });
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setToggleLoading(null);
    }
  }

  const allMemberships = overview?.workspaces.flatMap((ws) =>
    ws.memberships.map((m) => ({ ...m, workspaceName: ws.name, workspaceId: ws.id })),
  ) ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Gán User vào Workspace
        </p>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Workspace</label>
            <select
              value={form.workspaceId}
              onChange={(e) => setForm({ ...form, workspaceId: e.target.value })}
              className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
              required
            >
              <option value="">-- Chọn workspace --</option>
              {catalog?.workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">User</label>
            <select
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
              required
            >
              <option value="">-- Chọn user --</option>
              {catalog?.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Vai trò</label>
            <select
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
              required
            >
              <option value="">-- Chọn role --</option>
              {catalog?.roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isCreating || !form.workspaceId || !form.userId || !form.roleId}
            className="rounded-[14px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isCreating ? "Đang gán..." : "Gán"}
          </button>
        </form>
        {error ? <Banner message={error} extraClass="mt-3" /> : null}
      </section>

      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
          Tất cả Memberships
        </p>
        {!overview ? (
          <LoadingSpinner />
        ) : allMemberships.length === 0 ? (
          <EmptyState message="Chưa có membership nào." />
        ) : (
          <div className="space-y-2">
            <div className="grid gap-2 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)] md:grid-cols-[1fr_1fr_1fr_80px_100px]">
              <span>User</span>
              <span>Workspace</span>
              <span>Vai trò</span>
              <span>Trạng thái</span>
              <span></span>
            </div>
            {allMemberships.map((m) => (
              <div key={m.id} className="grid items-center gap-2 rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm md:grid-cols-[1fr_1fr_1fr_80px_100px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.userName}</p>
                  <p className="truncate text-xs text-[color:var(--on-surface-variant)]">{m.userEmail}</p>
                </div>
                <span className="text-xs">{m.workspaceName}</span>
                <span className="rounded-full bg-[color:var(--primary-soft)] px-2 py-0.5 text-xs font-semibold text-[color:var(--primary)]">
                  {m.roleName}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.isActive ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--surface-card)] text-[color:var(--on-surface-variant)]"}`}>
                  {m.isActive ? "Hoạt động" : "Đã tắt"}
                </span>
                <button
                  onClick={() => handleToggle(m.id, m.isActive)}
                  disabled={toggleLoading === m.id}
                  className="rounded-[10px] bg-[color:var(--surface-card)] px-2 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  {toggleLoading === m.id ? "..." : m.isActive ? "Tắt" : "Bật"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Main Workbench ───────────────────────────────────────────────────────────

type ActiveTab = "organizations" | "workspaces" | "bots" | "memberships";

export function WorkspacesWorkbench() {
  const [token, setToken] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("organizations");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (currentToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [ov, cat] = await Promise.all([
        fetchJson<Overview>(`${apiBaseUrl}/workspaces/overview`, currentToken),
        fetchJson<Catalog>(`${apiBaseUrl}/workspaces/catalog`, currentToken),
      ]);
      setOverview(ov);
      setCatalog(cat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tải dữ liệu thất bại");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(authStorageKey);
    if (!storedToken) {
      setError("Không có phiên đăng nhập");
      setIsLoading(false);
      return;
    }
    setToken(storedToken);
    loadData(storedToken);
  }, [loadData]);

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "organizations", label: "Organizations" },
    { key: "workspaces", label: "Workspaces" },
    { key: "bots", label: "Bots" },
    { key: "memberships", label: "Memberships" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Hệ thống
          </p>
          <h3 className="mt-1 text-2xl font-black tracking-tight">Quản lý Workspaces</h3>
          <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
            Quản lý Organization, Workspace, Bot và phân quyền truy cập.
          </p>
        </div>
        <button
          onClick={() => loadData(token!)}
          className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface-variant)]"
        >
          Tải lại
        </button>
      </div>

      {error ? <Banner message={error} extraClass="mb-6" /> : null}

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-[14px] px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-[color:var(--primary)] text-white shadow-[0_12px_28px_rgba(0,83,219,0.24)]"
                : "bg-[color:var(--surface-low)] text-[color:var(--on-surface-variant)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {activeTab === "organizations" && token && (
            <OrganizationTab
              token={token}
              overview={overview}
              catalog={catalog}
              onCreated={() => loadData(token)}
              onDeleted={() => loadData(token)}
            />
          )}
          {activeTab === "workspaces" && token && (
            <WorkspaceTab
              token={token}
              overview={overview}
              catalog={catalog}
              onCreated={() => loadData(token)}
              onDeleted={() => loadData(token)}
            />
          )}
          {activeTab === "bots" && token && (
            <BotsTab
              token={token}
              overview={overview}
              catalog={catalog}
              onCreated={() => loadData(token)}
            />
          )}
          {activeTab === "memberships" && token && (
            <MembershipsTab
              token={token}
              overview={overview}
              catalog={catalog}
              onCreated={() => loadData(token)}
            />
          )}
        </>
      )}
    </div>
  );
}
