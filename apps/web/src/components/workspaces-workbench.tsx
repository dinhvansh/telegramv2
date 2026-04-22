"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/toast-context";

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// ─── Shared components ────────────────────────────────────────────────────────

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

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight text-[color:var(--on-surface)]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[color:var(--on-surface-variant)]">{hint}</p>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[220px] flex-1">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[color:var(--on-surface-variant)]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] py-3 pl-11 pr-4 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
      />
    </div>
  );
}

// ─── Organization Tab ─────────────────────────────────────────────────────────

export function OrganizationTab({
  token,
  overview,
  onCreated,
  onDeleted,
}: {
  token: string;
  overview: Overview | null;
  onCreated: () => void;
  onDeleted: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [creatingName, setCreatingName] = useState("");
  const [creatingSlug, setCreatingSlug] = useState("");
  const [creatingSlugTouched, setCreatingSlugTouched] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  function handleCreatingNameChange(value: string) {
    const previousAutoSlug = slugify(creatingName);
    const nextAutoSlug = slugify(value);

    setCreatingName(value);

    if (!creatingSlugTouched || !creatingSlug.trim() || creatingSlug === previousAutoSlug) {
      setCreatingSlug(nextAutoSlug);
      setCreatingSlugTouched(false);
    }
  }

  function handleCreatingSlugChange(value: string) {
    setCreatingSlug(slugify(value));
    setCreatingSlugTouched(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!creatingName.trim()) return;
    setIsCreating(true);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/organizations`, token, {
        method: "POST",
        body: JSON.stringify({ name: creatingName.trim(), slug: creatingSlug.trim() || undefined }),
      });
      setCreatingName("");
      setCreatingSlug("");
      setCreatingSlugTouched(false);
      setIsCreating(false);
      onCreated();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Tạo thất bại", type: "error" });
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
      toast({ message: err instanceof Error ? err.message : "Xóa thất bại", type: "error" });
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
              onChange={(e) => handleCreatingNameChange(e.target.value)}
              placeholder="Công ty A"
              className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Slug (tùy chọn)</label>
            <input
              value={creatingSlug}
              onChange={(e) => handleCreatingSlugChange(e.target.value)}
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
  const [workspaceSlugTouched, setWorkspaceSlugTouched] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const { toast } = useToast();

  const organizations = useMemo(
    () => catalog?.organizations ?? [],
    [catalog?.organizations],
  );
  const workspaces = useMemo(
    () => overview?.workspaces ?? [],
    [overview?.workspaces],
  );

  const organizationNameById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization.name])),
    [organizations],
  );

  const filteredWorkspaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return workspaces.filter((workspace) => {
      const matchesOrganization =
        organizationFilter === "all" || workspace.organizationId === organizationFilter;

      if (!matchesOrganization) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchTarget = [
        workspace.name,
        workspace.slug,
        workspace.description ?? "",
        organizationNameById.get(workspace.organizationId) ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchTarget.includes(normalizedQuery);
    });
  }, [organizationFilter, organizationNameById, query, workspaces]);

  const activeWorkspaceCount = useMemo(
    () => workspaces.filter((workspace) => workspace.isActive).length,
    [workspaces],
  );

  function handleWorkspaceNameChange(value: string) {
    const previousAutoSlug = slugify(form.name);
    const shouldSyncSlug =
      !workspaceSlugTouched || !form.slug.trim() || form.slug === previousAutoSlug;

    setForm((current) => ({
      ...current,
      name: value,
      ...(shouldSyncSlug ? { slug: slugify(value) } : {}),
    }));

    if (shouldSyncSlug) {
      setWorkspaceSlugTouched(false);
    }
  }

  function handleWorkspaceSlugChange(value: string) {
    setForm((current) => ({ ...current, slug: slugify(value) }));
    setWorkspaceSlugTouched(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.name.trim()) return;
    setIsCreating(true);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces`, token, {
        method: "POST",
        body: JSON.stringify({ organizationId: form.organizationId, name: form.name.trim(), slug: form.slug.trim() || undefined, description: form.description.trim() || undefined }),
      });
      setForm({ organizationId: "", name: "", slug: "", description: "" });
      setWorkspaceSlugTouched(false);
      setIsCreating(false);
      onCreated();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Tạo thất bại", type: "error" });
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Xóa hẳn workspace "${name}"? Dữ liệu liên quan như bot, group, campaign và membership của workspace này sẽ bị xóa khỏi hệ thống.`,
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/${id}/permanent`, token, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Xóa thất bại", type: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                Danh sách WP
              </p>
              <h4 className="mt-2 text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
                Tìm nhanh, thao tác nhanh
              </h4>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">
                Lọc theo organization, xem số member, bot, group và xóa hẳn WP ngay trên từng dòng.
              </p>
            </div>

            <div className="hidden">
              <MetricCard
                label="Total"
                value={workspaces.length}
                hint="All workspaces across organizations."
              />
              <MetricCard
                label="Active"
                value={activeWorkspaceCount}
                hint="Currently enabled and ready for operations."
              />
              <MetricCard
                label="Shown"
                value={filteredWorkspaces.length}
                hint="Results after search and organization filter."
              />
            </div>

            <div className="rounded-[22px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="Tìm theo tên, slug, mô tả, organization..."
                />
                <select
                  value={organizationFilter}
                  onChange={(e) => setOrganizationFilter(e.target.value)}
                  className="min-w-[220px] rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                >
                  <option value="all">Tất cả organization</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!overview ? (
              <LoadingSpinner />
            ) : filteredWorkspaces.length === 0 ? (
              <EmptyState message="Không có WP khớp bộ lọc hiện tại." />
            ) : (
              <div className="overflow-hidden rounded-[18px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)]">
                <div className="hidden grid-cols-[minmax(220px,1.3fr)_minmax(150px,0.9fr)_110px_90px_90px_90px_110px] gap-3 border-b border-[color:var(--outline)]/60 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)] xl:grid">
                  <span>WP</span>
                  <span>Organization</span>
                  <span>Trạng thái</span>
                  <span>Members</span>
                  <span>Bots</span>
                  <span>Groups</span>
                  <span></span>
                </div>
                {filteredWorkspaces.map((workspace) => {
                  const organizationName =
                    organizationNameById.get(workspace.organizationId) ?? "Unknown organization";

                  return (
                    <div
                      key={workspace.id}
                      className="grid gap-3 border-b border-[color:var(--outline)]/60 px-4 py-4 text-sm last:border-b-0 xl:grid-cols-[minmax(220px,1.3fr)_minmax(150px,0.9fr)_110px_90px_90px_90px_110px] xl:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-[color:var(--on-surface)]">{workspace.name}</p>
                        <p className="mt-1 truncate text-xs text-[color:var(--on-surface-variant)]">
                          /{workspace.slug}
                          {workspace.description ? ` · ${workspace.description}` : ""}
                        </p>
                      </div>
                      <p className="truncate text-xs font-semibold text-[color:var(--on-surface-variant)]">
                        {organizationName}
                      </p>
                      <span
                        className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          workspace.isActive
                            ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                            : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                        }`}
                      >
                        {workspace.isActive ? "Đang bật" : "Đã tắt"}
                      </span>
                      <span className="font-bold text-[color:var(--on-surface)]">{workspace.membershipCount}</span>
                      <span className="font-bold text-[color:var(--on-surface)]">{workspace.botCount}</span>
                      <span className="font-bold text-[color:var(--on-surface)]">
                        {workspace.groupCount}
                        <span className="ml-1 text-xs font-semibold text-[color:var(--on-surface-variant)]">
                          / {workspace.campaignCount} campaigns
                        </span>
                      </span>
                      <button
                        onClick={() => handleDelete(workspace.id, workspace.name)}
                        disabled={deletingId === workspace.id}
                        className="w-fit rounded-[12px] bg-[color:var(--danger-soft)] px-3 py-2 text-xs font-bold text-[color:var(--danger)] disabled:opacity-50"
                      >
                        {deletingId === workspace.id ? "..." : "Xóa hẳn"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
              Tạo WP
            </p>
            <h5 className="mt-2 text-xl font-black tracking-tight text-[color:var(--on-surface)]">
              Thêm workspace mới
            </h5>
            <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
              Chọn organization và nhập tên WP. Slug sẽ tự sinh ngầm khi lưu.
            </p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                  Organization
                </label>
                <select
                  value={form.organizationId}
                  onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                  className="w-full rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                  required
                >
                  <option value="">Chọn organization</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                  Tên WP
                </label>
                <input
                  value={form.name}
                  onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                  placeholder="Sales, Support, Affiliate..."
                  className="w-full rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                  required
                />
              </div>

              <div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                  Mô tả
                  </label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Ghi chú ngắn"
                    className="w-full rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating || !form.organizationId || !form.name.trim()}
                className="w-full rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3.5 text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,83,219,0.24)] disabled:opacity-50"
              >
                {isCreating ? "Đang tạo..." : "Tạo WP"}
              </button>
            </form>

      </aside>
        </div>
      </section>

      <div className="hidden">
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
                onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                placeholder="Sales, Support, Affiliate..."
                className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[color:var(--on-surface-variant)]">Slug (tùy chọn)</label>
              <input
                value={form.slug}
                onChange={(e) => handleWorkspaceSlugChange(e.target.value)}
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
    </div>
  );
}

// ─── Bots Tab ─────────────────────────────────────────────────────────────────

export function BotsTab({
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
  const { toast } = useToast();

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.workspaceId || !form.label.trim()) return;
    setIsCreating(true);
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
      toast({ message: err instanceof Error ? err.message : "Tạo thất bại", type: "error" });
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

export function MembershipsTab({
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
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.workspaceId || !form.userId || !form.roleId) return;
    setIsCreating(true);
    try {
      await fetchJson(`${apiBaseUrl}/workspaces/${form.workspaceId}/memberships`, token, {
        method: "POST",
        body: JSON.stringify({ userId: form.userId, roleId: form.roleId }),
      });
      setForm({ workspaceId: "", userId: "", roleId: "" });
      setIsCreating(false);
      onCreated();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Gán thất bại", type: "error" });
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
      toast({ message: err instanceof Error ? err.message : "Cập nhật thất bại", type: "error" });
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

export function WorkspacesWorkbench() {
  const [token, setToken] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadData = useCallback(async (currentToken: string) => {
    setIsLoading(true);
    try {
      const [ov, cat] = await Promise.all([
        fetchJson<Overview>(`${apiBaseUrl}/workspaces/overview`, currentToken),
        fetchJson<Catalog>(`${apiBaseUrl}/workspaces/catalog`, currentToken),
      ]);
      setOverview(ov);
      setCatalog(cat);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Tải dữ liệu thất bại", type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(authStorageKey);
    if (!storedToken) {
      toast({ message: "Không có phiên đăng nhập", type: "error" });
      setIsLoading(false);
      return;
    }
    setToken(storedToken);
    loadData(storedToken);
  }, [loadData, toast]);

  const activeWorkspaceCount = useMemo(
    () => overview?.workspaces.filter((workspace) => workspace.isActive).length ?? 0,
    [overview?.workspaces],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[24px] bg-[color:var(--surface-card)] px-5 py-4 shadow-[0_8px_32px_rgba(42,52,57,0.04)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
            Workspaces
          </p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
            Quản lý WP
          </h3>
          <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
            Tạo, lọc và xóa hẳn workspace trong một màn hình.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[color:var(--surface-low)] px-3 py-2 text-xs font-bold text-[color:var(--on-surface)]">
            {overview?.workspaces.length ?? 0} WP
          </span>
          <span className="rounded-full bg-[color:var(--success-soft)] px-3 py-2 text-xs font-bold text-[color:var(--success)]">
            {activeWorkspaceCount} đang bật
          </span>
          <button
            onClick={() => token && loadData(token)}
            disabled={!token || isLoading}
            className="rounded-[14px] bg-[color:var(--surface-low)] px-3 py-2 text-xs font-bold text-[color:var(--on-surface-variant)] disabled:opacity-50"
          >
            Tải lại
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : token ? (
        <WorkspaceTab
          token={token}
          overview={overview}
          catalog={catalog}
          onCreated={() => loadData(token)}
          onDeleted={() => loadData(token)}
        />
      ) : (
        <EmptyState message="Không có phiên đăng nhập." />
      )}
    </div>
  );
}
