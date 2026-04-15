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

function OrganizationTab({
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

  const organizations = catalog?.organizations ?? [];
  const workspaces = overview?.workspaces ?? [];

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
      <section className="rounded-[28px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
                Workspace overview
              </p>
              <h4 className="mt-2 text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
                Easier scanning, less guessing
              </h4>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">
                Search by name, filter by organization, and spot workload quickly before opening a workspace.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
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
                  placeholder="Search workspace, slug, description, organization..."
                />
                <select
                  value={organizationFilter}
                  onChange={(e) => setOrganizationFilter(e.target.value)}
                  className="min-w-[220px] rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                >
                  <option value="all">All organizations</option>
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
              <EmptyState message="No workspace matches the current search or filter." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredWorkspaces.map((workspace) => {
                  const organizationName =
                    organizationNameById.get(workspace.organizationId) ?? "Unknown organization";

                  return (
                    <article
                      key={workspace.id}
                      className="rounded-[22px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-5 transition hover:-translate-y-0.5 hover:border-[color:var(--primary)]/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-lg font-black tracking-tight text-[color:var(--on-surface)]">
                              {workspace.name}
                            </p>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
                                workspace.isActive
                                  ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                                  : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                              }`}
                            >
                              {workspace.isActive ? "Active" : "Paused"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
                            {organizationName}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">/{workspace.slug}</p>
                        </div>
                        <button
                          onClick={() => handleDelete(workspace.id, workspace.name)}
                          disabled={deletingId === workspace.id}
                          className="shrink-0 rounded-[12px] bg-[color:var(--danger-soft)] px-3 py-2 text-xs font-bold text-[color:var(--danger)] disabled:opacity-50"
                        >
                          {deletingId === workspace.id ? "..." : "Delete"}
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-[16px] bg-[color:var(--surface-card)] px-3 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                            Members
                          </p>
                          <p className="mt-2 text-xl font-black text-[color:var(--on-surface)]">
                            {workspace.membershipCount}
                          </p>
                        </div>
                        <div className="rounded-[16px] bg-[color:var(--surface-card)] px-3 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                            Bots
                          </p>
                          <p className="mt-2 text-xl font-black text-[color:var(--on-surface)]">
                            {workspace.botCount}
                          </p>
                        </div>
                        <div className="rounded-[16px] bg-[color:var(--surface-card)] px-3 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                            Groups
                          </p>
                          <p className="mt-2 text-xl font-black text-[color:var(--on-surface)]">
                            {workspace.groupCount}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[color:var(--surface-card)] px-3 py-1 text-xs font-semibold text-[color:var(--on-surface-variant)]">
                          {workspace.campaignCount} campaigns
                        </span>
                        <span className="rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">
                          org linked
                        </span>
                      </div>

                      {workspace.description ? (
                        <p className="mt-4 rounded-[16px] bg-[color:var(--surface-card)] px-4 py-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                          {workspace.description}
                        </p>
                      ) : (
                        <p className="mt-4 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                          No description yet.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
              Create workspace
            </p>
            <h5 className="mt-2 text-xl font-black tracking-tight text-[color:var(--on-surface)]">
              Add a new operating space
            </h5>
            <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
              Keep names short and clear so operators can identify the right workspace at a glance.
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
                  <option value="">Select organization</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                  Workspace name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                  placeholder="Sales, Support, Affiliate..."
                  className="w-full rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                    Slug
                  </label>
                  <input
                    value={form.slug}
                    onChange={(e) => handleWorkspaceSlugChange(e.target.value)}
                    placeholder="sales"
                    className="w-full rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface-variant)]">
                    Description
                  </label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Short note for operators"
                    className="w-full rounded-[14px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating || !form.organizationId || !form.name.trim()}
                className="w-full rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3.5 text-sm font-bold text-white shadow-[0_18px_40px_rgba(0,83,219,0.24)] disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create workspace"}
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
  }, []);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(authStorageKey);
    if (!storedToken) {
      toast({ message: "Không có phiên đăng nhập", type: "error" });
      setIsLoading(false);
      return;
    }
    setToken(storedToken);
    loadData(storedToken);
  }, [loadData]);

  const tabs = useMemo(
    () => [
      { key: "organizations" as const, label: "Organizations", count: overview?.organizations.length ?? 0 },
      { key: "workspaces" as const, label: "Workspaces", count: overview?.workspaces.length ?? 0 },
      { key: "bots" as const, label: "Bots", count: overview?.bots.length ?? 0 },
      {
        key: "memberships" as const,
        label: "Memberships",
        count: overview?.workspaces.reduce((total, workspace) => total + workspace.memberships.length, 0) ?? 0,
      },
    ],
    [overview],
  );

  return (
    <div>
      <section className="mb-6 overflow-hidden rounded-[32px] border border-[color:var(--outline)]/60 bg-[radial-gradient(circle_at_top_left,rgba(0,83,219,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,248,255,0.92))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--primary)]">
              Workspace control
            </p>
            <h3 className="mt-3 text-3xl font-black tracking-tight text-[color:var(--on-surface)]">
              Cleaner layout for daily operations
            </h3>
            <p className="mt-3 text-sm leading-7 text-[color:var(--on-surface-variant)]">
              Use this page to structure organizations, review workspace health, attach bots, and manage access without digging through dense lists.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
            <MetricCard
              label="Organizations"
              value={overview?.organizations.length ?? 0}
              hint="Top-level containers for teams and clients."
            />
            <MetricCard
              label="Workspaces"
              value={overview?.workspaces.length ?? 0}
              hint="Operational spaces currently configured."
            />
            <MetricCard
              label="Bots"
              value={overview?.bots.length ?? 0}
              hint="Connected bot profiles across all workspaces."
            />
          </div>
        </div>
      </section>

      <div className="hidden">
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

      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-[18px] border px-4 py-3 text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white shadow-[0_16px_36px_rgba(0,83,219,0.24)]"
                : "border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] text-[color:var(--on-surface-variant)]"
            }`}
          >
            <span className="flex items-center gap-2">
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  activeTab === tab.key
                    ? "bg-white/18 text-white"
                    : "bg-[color:var(--surface-card)] text-[color:var(--on-surface)]"
                }`}
              >
                {tab.count}
              </span>
            </span>
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
