"use client";

import { FormEvent, useEffect, useState } from "react";
import { useToast } from "@/context/toast-context";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";
const departmentOptions = [
  "Vận hành",
  "Kinh doanh",
  "Marketing",
  "Chăm sóc khách hàng",
  "Cộng đồng",
  "Kỹ thuật",
  "Kế toán",
  "Quản trị",
];

type RoleItem = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
};

type PermissionItem = {
  code: string;
  description: string;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  department: string;
  workspaces?: Array<{
    id: string;
    name: string;
    roleName: string;
  }>;
  status: "ACTIVE" | "DISABLED";
  statusLabel: string;
  statusTone: "success" | "warning" | "danger";
  roles: Array<{
    id: string;
    name: string;
    permissions: string[];
  }>;
  primaryRole: string;
  permissionCount: number;
};

type WorkspaceCatalogItem = { id: string; name: string; slug: string; organizationId: string };
type SessionProfile = {
  workspaces: WorkspaceCatalogItem[];
};

type WorkspaceCatalogResponse = {
  workspaces: WorkspaceCatalogItem[];
};

type CreateUserForm = {
  name: string;
  email: string;
  password: string;
  department: string;
  workspaceId: string;
  roleId: string;
  status: "ACTIVE" | "DISABLED";
};

type EditUserForm = {
  id: string;
  name: string;
  email: string;
  department: string;
  workspaceId: string;
  roleId: string;
  status: "ACTIVE" | "DISABLED";
  resetPassword?: string;
};

type EditRoleForm = {
  id: string;
  name: string;
  description: string;
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
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function decodeLegacyString(value: string) {
  const exactMap = new Map<string, string>([
    ["Qu?n tr? workspace", "Quản trị workspace"],
    ["Qu?n tr? h? th?ng", "Quản trị hệ thống"],
    ["Ki?m duy?t vi?n", "Kiểm duyệt viên"],
    ["V?n h?nh", "Vận hành"],
    ["C?ng t?c vi?n", "Cộng tác viên"],
    [
      "To�n quy?n v?n h�nh trong workspace, g?m user, role, settings, campaign, moderation v� autopost.",
      "Toàn quyền vận hành trong workspace, gồm user, role, settings, campaign, moderation và autopost.",
    ],
    [
      "To�n quy?n v?n h�nh trong workspace, tr? qu?n l� user v� ph�n quy?n.",
      "Toàn quyền vận hành trong workspace, trừ quản lý user và phân quyền.",
    ],
    [
      "Ch? xem campaign ???c giao v? k?t qu? link m?i c? nh?n.",
      "Chỉ xem campaign được giao và kết quả link mời cá nhân.",
    ],
    ["C?ng t?c vi?n", "Cộng tác viên"],
    ["ChÆ°a gÃ¡n", "Chưa gán"],
  ]);
  const exactHit = exactMap.get(value);
  if (exactHit) {
    return exactHit;
  }
  try {
    const bytes = Uint8Array.from(
      Array.from(value).map((character) => character.charCodeAt(0)),
    );
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded.includes("�") ? value : decoded;
  } catch {
    return value;
  }
}

function text(value?: string | null) {
  return decodeLegacyString(String(value ?? ""));
}

function workspaceLabel(user: UserItem) {
  if (!user.workspaces?.length) {
    return "Chưa gán";
  }

  return user.workspaces.map((workspace) => text(workspace.name)).join(", ");
}

function getToneClass(tone: UserItem["statusTone"]) {
  switch (tone) {
    case "warning":
      return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
    case "danger":
      return "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
    default:
      return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  }
}

export function RolesWorkbench({
  currentUser,
}: {
  currentUser?: {
    name: string;
    email: string;
    roles: string[];
    permissions?: string[];
  };
}) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [workspaceCatalog, setWorkspaceCatalog] = useState<WorkspaceCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>("");
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<EditUserForm | null>(null);
  const [editingRole, setEditingRole] = useState<EditRoleForm | null>(null);
  const [form, setForm] = useState<CreateUserForm>({
    name: "Người dùng mới",
    email: "new.user@nexus.local",
    password: "ChangeMe123!",
    department: "Vận hành",
    workspaceId: "",
    roleId: "",
    status: "ACTIVE",
  });

  const canManageUsers = Boolean(
    currentUser?.permissions?.includes("workspace.manage"),
  );
  const canEditRolePermissions = Boolean(
    currentUser?.permissions?.includes("organization.manage"),
  );

  const filteredUsers = filterWorkspaceId
    ? users.filter((u) => u.workspaces?.some((ws) => ws.id === filterWorkspaceId))
    : users;

  function canDeleteUser(user: UserItem) {
    if (!canManageUsers) {
      return false;
    }

    if (currentUser?.email === user.email) {
      return false;
    }

    const targetIsSuperadmin = user.roles.some((role) =>
      role.permissions.includes("organization.manage"),
    );

    return canEditRolePermissions || !targetIsSuperadmin;
  }

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  useEffect(() => {
    let active = true;

    async function load(currentToken: string) {
      try {
        const headers = { Authorization: `Bearer ${currentToken}` };
        const [rolesResponse, usersResponse, permissionResponse, profileResponse] = await Promise.all([
          fetchJson<RoleItem[]>(`${apiBaseUrl}/roles`, { headers }),
          fetchJson<UserItem[]>(`${apiBaseUrl}/users`, { headers }),
          fetchJson<PermissionItem[]>(`${apiBaseUrl}/roles/catalog`, { headers }),
          fetchJson<SessionProfile>(`${apiBaseUrl}/auth/me`, { headers }),
        ]);
        const workspaceResponse = canEditRolePermissions
          ? await fetchJson<WorkspaceCatalogResponse>(`${apiBaseUrl}/workspaces/catalog`, {
              headers,
            })
          : null;

        if (!active) {
          return;
        }

        setRoles(rolesResponse);
        setUsers(usersResponse);
        setPermissionCatalog(permissionResponse);
        setWorkspaceCatalog(
          workspaceResponse?.workspaces?.length
            ? workspaceResponse.workspaces
            : (profileResponse.workspaces ?? []),
        );
        setForm((current) => ({
          ...current,
          roleId: current.roleId || rolesResponse[0]?.id || "",
          workspaceId:
            current.workspaceId ||
            workspaceResponse?.workspaces?.[0]?.id ||
            profileResponse.workspaces?.[0]?.id ||
            "",
        }));
      } catch (loadError) {
        if (!active) {
          return;
        }

        toast({
          message:
            loadError instanceof Error
              ? loadError.message
              : "Không thể tải dữ liệu phân quyền.",
          type: "error",
        });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void load(token);

    return () => {
      active = false;
    };
  }, [canEditRolePermissions, token, toast]);

  async function refreshData() {
    if (!token) {
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    const [rolesResponse, usersResponse, permissionResponse, profileResponse] = await Promise.all([
      fetchJson<RoleItem[]>(`${apiBaseUrl}/roles`, { headers }),
      fetchJson<UserItem[]>(`${apiBaseUrl}/users`, { headers }),
      fetchJson<PermissionItem[]>(`${apiBaseUrl}/roles/catalog`, { headers }),
      fetchJson<SessionProfile>(`${apiBaseUrl}/auth/me`, { headers }),
    ]);
    const workspaceResponse = canEditRolePermissions
      ? await fetchJson<WorkspaceCatalogResponse>(`${apiBaseUrl}/workspaces/catalog`, {
          headers,
        })
      : null;

    setRoles(rolesResponse);
    setUsers(usersResponse);
    setPermissionCatalog(permissionResponse);
    setWorkspaceCatalog(
      workspaceResponse?.workspaces?.length
        ? workspaceResponse.workspaces
        : (profileResponse.workspaces ?? []),
    );
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !form.roleId || !form.workspaceId) {
      return;
    }

    setIsCreating(true);

    try {
      await fetchJson(`${apiBaseUrl}/users`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      await refreshData();
      toast({ message: `Đã tạo user ${form.email}.`, type: "success" });
      setForm((current) => ({
        ...current,
        name: "",
        email: "",
        password: "",
        department: "Vận hành",
        status: "ACTIVE",
      }));
    } catch (createError) {
      toast({
        message:
          createError instanceof Error
            ? createError.message
            : "Không thể tạo user mới.",
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  }

  

  async function handleDeleteUser(user: UserItem) {
    if (!token || !canDeleteUser(user)) {
      return;
    }

    const confirmed = window.confirm(
      `Xóa user ${user.email}? Hành động này không thể hoàn tác.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);

    try {
      await fetchJson(`${apiBaseUrl}/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshData();
      toast({ message: `Đã xóa user ${user.email}.`, type: "success" });
      if (editingUser?.id === user.id) {
        setEditingUser(null);
      }
    } catch (deleteError) {
      toast({
        message:
          deleteError instanceof Error
            ? deleteError.message
            : "Không thể xóa user.",
        type: "error",
      });
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleSaveUser() {
    if (!token || !editingUser) {
      return;
    }

    setIsSavingUser(true);

    try {
      await fetchJson(`${apiBaseUrl}/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editingUser.name,
          department: editingUser.department,
          workspaceId: editingUser.workspaceId,
          roleId: editingUser.roleId,
          status: editingUser.status,
        }),
      });

      if (editingUser.resetPassword !== undefined) {
        await fetchJson<{
          reset: boolean;
          userId: string;
          temporaryPassword: string;
        }>(`${apiBaseUrl}/users/${editingUser.id}/reset-password`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            password: editingUser.resetPassword.trim() || undefined,
          }),
        });
        toast({
          message: `Đã cập nhật và reset mật khẩu cho ${editingUser.name}.`,
          type: "success",
        });
      } else {
        toast({ message: `Đã cập nhật user ${editingUser.name}.`, type: "success" });
      }

      await refreshData();
      setEditingUser(null);
    } catch (saveError) {
      toast({
        message:
          saveError instanceof Error
            ? saveError.message
            : "Không thể cập nhật user.",
        type: "error",
      });
    } finally {
      setIsSavingUser(false);
    }
  }

  async function handleSaveRole() {
    if (!token || !editingRole || !canEditRolePermissions) {
      return;
    }

    setSavingRoleId(editingRole.id);

    try {
      await fetchJson(`${apiBaseUrl}/roles/${editingRole.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          description: editingRole.description,
          permissions: editingRole.permissions,
        }),
      });
      await refreshData();
      toast({ message: `Đã cập nhật quyền cho role ${text(editingRole.name)}.`, type: "success" });
      setEditingRole(null);
    } catch (saveError) {
      toast({
        message:
          saveError instanceof Error
            ? saveError.message
            : "Không thể cập nhật quyền cho role.",
        type: "error",
      });
    } finally {
      setSavingRoleId(null);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
          Đang tải dữ liệu phân quyền...
        </p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--warning)]">
          Cần đăng nhập bằng tài khoản có quyền quản trị để xem RBAC.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Vai trò và quyền
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            Xem role thực tế và tập permission đang cấp trong CRM
          </h3>

          {!canEditRolePermissions ? (
            <p className="mt-3 text-sm font-semibold text-[color:var(--warning)]">
              Chỉ superadmin mới được sửa quyền của role.
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {roles.map((role) => (
              <article
                key={role.id}
                className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold">{text(role.name)}</p>
                  {canEditRolePermissions ? (
                  <button
                    type="button"
                    onClick={() =>
                      setEditingRole({
                        id: role.id,
                        name: role.name,
                        description: role.description,
                        permissions: [...role.permissions],
                      })
                    }
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[color:var(--primary)]"
                  >
                    Sửa quyền
                  </button>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  {text(role.description)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.permissions.map((permission) => (
                    <span
                      key={`${role.id}-${permission}`}
                      className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[color:var(--on-surface)]"
                    >
                      {permission}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Phiên hiện tại
          </p>
          <div className="mt-5 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm leading-7">
            <p className="font-bold">{text(currentUser?.name ?? "Chưa có session")}</p>
            <p className="text-[color:var(--on-surface-variant)]">
              {currentUser?.email ?? "-"}
            </p>
            <p className="mt-3 font-semibold">
              Roles: {currentUser?.roles.map((role) => text(role)).join(", ") ?? "-"}
            </p>
            <p className="text-[color:var(--on-surface-variant)]">
              Permissions: {currentUser?.permissions?.join(", ") ?? "-"}
            </p>
          </div>

          <form onSubmit={handleCreateUser} className="mt-5 space-y-4">
            <p className="text-sm font-bold">Tạo user mới</p>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Họ tên"
              />
              <input
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Email"
                type="email"
              />
            </div>

            <div>
              <input
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Mật khẩu tạm"
                type="password"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <select
                value={form.department}
                onChange={(event) =>
                  setForm((current) => ({ ...current, department: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
              <select
                value={form.workspaceId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, workspaceId: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                <option value="">Workspace</option>
                {workspaceCatalog.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              <select
                value={form.roleId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, roleId: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {text(role.name)}
                  </option>
                ))}
              </select>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as CreateUserForm["status"],
                  }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                <option value="ACTIVE">Hoạt động</option>
                <option value="DISABLED">Tạm khóa</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {isCreating ? "Đang tạo..." : "Tạo user"}
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Người dùng hệ thống
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">
              Danh sách user, role chính và số permission đang có
            </h3>
          </div>
          {canEditRolePermissions ? (
            <select
              value={filterWorkspaceId}
              onChange={(event) => setFilterWorkspaceId(event.target.value)}
              className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
            >
              <option value="">Tất cả workspace</option>
              {workspaceCatalog.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="min-w-[1180px] w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Workspace</th>
                <th className="px-5 py-4 font-semibold">Người dùng</th>
                <th className="px-5 py-4 font-semibold">Phòng ban</th>
                <th className="px-5 py-4 font-semibold">Vai trò</th>
                <th className="px-5 py-4 font-semibold">Trạng thái</th>
                <th className="px-5 py-4 font-semibold">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => (
                <tr key={user.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-semibold text-[color:var(--on-surface)]">
                      {workspaceLabel(user)}
                    </p>
                    {user.workspaces?.length ? (
                      <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                        {user.workspaces.length} workspace
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-bold">{text(user.name)}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      {user.email}
                    </p>
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                    {text(user.department)}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-semibold">{text(user.primaryRole)}</p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                      {user.permissionCount} permission
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {user.roles
                        .flatMap((role) => role.permissions)
                        .slice(0, 4)
                        .map((permission) => (
                          <span
                            key={`${user.id}-${permission}`}
                            className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[color:var(--on-surface)]"
                          >
                            {permission}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span
                      className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${getToneClass(
                        user.statusTone,
                      )}`}
                    >
                      {user.statusLabel}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          title="Sửa user"
                          aria-label={`Sửa user ${user.email}`}
                          onClick={() =>
                            setEditingUser({
                              id: user.id,
                              name: user.name,
                              email: user.email,
                              department: user.department,
                              workspaceId: user.workspaces?.[0]?.id || workspaceCatalog[0]?.id || "",
                              roleId: user.roles[0]?.id || roles[0]?.id || "",
                              status: user.status,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                        >
                          <span>✎</span>
                          <span>Sửa</span>
                        </button>
                        {canDeleteUser(user) ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteUser(user)}
                            disabled={deletingUserId === user.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--danger-soft)] px-4 py-1.5 text-xs font-semibold text-[color:var(--danger)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span>✕</span>
                            <span>Xóa</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingRole && canEditRolePermissions ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-2xl rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                  Role editor
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Sửa quyền role {text(editingRole.name)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingRole(null)}
                className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
              >
                Đóng
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <textarea
                value={editingRole.description}
                onChange={(event) =>
                  setEditingRole((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current,
                  )
                }
                className="min-h-24 w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              />

              <div className="grid gap-3 md:grid-cols-2">
                {permissionCatalog.map((permission) => {
                  const enabled = editingRole.permissions.includes(permission.code);
                  return (
                    <label
                      key={permission.code}
                      className="flex items-start gap-3 rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) =>
                          setEditingRole((current) => {
                            if (!current) {
                              return current;
                            }

                            return {
                              ...current,
                              permissions: event.target.checked
                                ? [...current.permissions, permission.code]
                                : current.permissions.filter(
                                    (code) => code !== permission.code,
                                  ),
                            };
                          })
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-semibold">{permission.code}</span>
                        <span className="mt-1 block text-[color:var(--on-surface-variant)]">
                          {permission.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  className="rounded-full bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveRole()}
                  disabled={savingRoleId === editingRole.id}
                  className="rounded-full bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingRoleId === editingRole.id ? "Đang lưu..." : "Lưu quyền"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-2xl rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                  User editor
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Sửa user
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
              >
                Đóng
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-[20px] bg-[color:var(--surface-low)] px-4 py-4 text-sm">
                <p className="text-xs text-[color:var(--on-surface-variant)]">Email</p>
                <p className="font-semibold">{editingUser.email}</p>
              </div>

              <div>
                <input
                  value={editingUser.name}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  placeholder="Họ tên"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <select
                  value={editingUser.department}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current ? { ...current, department: event.target.value } : current,
                    )
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                >
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
                <select
                  value={editingUser.workspaceId}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current ? { ...current, workspaceId: event.target.value } : current,
                    )
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                >
                  <option value="">Workspace</option>
                  {workspaceCatalog.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
                <select
                  value={editingUser.roleId}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current ? { ...current, roleId: event.target.value } : current,
                    )
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {text(role.name)}
                    </option>
                  ))}
                </select>
                <select
                  value={editingUser.status}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as EditUserForm["status"],
                          }
                        : current,
                    )
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                >
                  <option value="ACTIVE">Hoạt động</option>
                    <option value="DISABLED">Tạm khóa</option>
                </select>
              </div>

              <div className="rounded-[20px] bg-[color:var(--surface-low)] px-4 py-4">
                <p className="mb-3 text-xs font-semibold text-[color:var(--on-surface-variant)]">
                  Reset mật khẩu
                </p>
                <input
                  value={editingUser.resetPassword ?? ""}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current ? { ...current, resetPassword: event.target.value } : current,
                    )
                  }
                  className="w-full rounded-[18px] bg-white px-4 py-4 text-sm outline-none"
                  placeholder="Để trống = tự sinh mật khẩu tạm, hoặc nhập mật khẩu mới"
                  type="password"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-full bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveUser()}
                  disabled={isSavingUser}
                  className="rounded-full bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingUser ? "Đang lưu..." : "Lưu user"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </section>
  );
}
