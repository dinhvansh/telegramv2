"use client";

import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

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
  status: "ACTIVE" | "AWAY" | "DISABLED";
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

type CreateUserForm = {
  name: string;
  email: string;
  username: string;
  password: string;
  department: string;
  roleId: string;
  status: "ACTIVE" | "AWAY" | "DISABLED";
};

type EditUserForm = {
  id: string;
  name: string;
  username: string;
  department: string;
  roleId: string;
  status: "ACTIVE" | "AWAY" | "DISABLED";
};

type ResetPasswordForm = {
  id: string;
  email: string;
  password: string;
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
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<EditUserForm | null>(null);
  const [editingRole, setEditingRole] = useState<EditRoleForm | null>(null);
  const [resetPasswordUser, setResetPasswordUser] =
    useState<ResetPasswordForm | null>(null);
  const [form, setForm] = useState<CreateUserForm>({
    name: "Người dùng mới",
    email: "new.user@nexus.local",
    username: "new_user",
    password: "ChangeMe123!",
    department: "Vận hành",
    roleId: "",
    status: "ACTIVE",
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  useEffect(() => {
    let active = true;

    async function load(currentToken: string) {
      try {
        const headers = { Authorization: `Bearer ${currentToken}` };
        const [rolesResponse, usersResponse, permissionResponse] = await Promise.all([
          fetchJson<RoleItem[]>(`${apiBaseUrl}/roles`, { headers }),
          fetchJson<UserItem[]>(`${apiBaseUrl}/users`, { headers }),
          fetchJson<PermissionItem[]>(`${apiBaseUrl}/roles/catalog`, { headers }),
        ]);

        if (!active) {
          return;
        }

        setRoles(rolesResponse);
        setUsers(usersResponse);
        setPermissionCatalog(permissionResponse);
        setForm((current) => ({
          ...current,
          roleId: current.roleId || rolesResponse[0]?.id || "",
        }));
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải dữ liệu phân quyền.",
        );
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
  }, [token]);

  async function refreshData() {
    if (!token) {
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    const [rolesResponse, usersResponse, permissionResponse] = await Promise.all([
      fetchJson<RoleItem[]>(`${apiBaseUrl}/roles`, { headers }),
      fetchJson<UserItem[]>(`${apiBaseUrl}/users`, { headers }),
      fetchJson<PermissionItem[]>(`${apiBaseUrl}/roles/catalog`, { headers }),
    ]);

    setRoles(rolesResponse);
    setUsers(usersResponse);
    setPermissionCatalog(permissionResponse);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !form.roleId) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setNotice(null);
    setTemporaryPassword(null);

    try {
      await fetchJson(`${apiBaseUrl}/users`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      await refreshData();
      setNotice(`Đã tạo user ${form.email}.`);
      setForm((current) => ({
        ...current,
        name: "",
        email: "",
        username: "",
        password: "",
        department: "Vận hành",
        status: "ACTIVE",
      }));
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Không thể tạo user mới.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleUser(user: UserItem) {
    if (!token) {
      return;
    }

    const nextStatus = user.status === "DISABLED" ? "ACTIVE" : "DISABLED";

    setUpdatingUserId(user.id);
    setError(null);
    setNotice(null);
    setTemporaryPassword(null);

    try {
      await fetchJson(`${apiBaseUrl}/users/${user.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      await refreshData();
      setNotice(
        nextStatus === "DISABLED"
          ? `Đã khóa user ${user.email}.`
          : `Đã mở lại user ${user.email}.`,
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Không thể cập nhật trạng thái user.",
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleResetPassword() {
    if (!token || !resetPasswordUser) {
      return;
    }

    setResettingUserId(resetPasswordUser.id);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{
        reset: boolean;
        userId: string;
        temporaryPassword: string;
      }>(`${apiBaseUrl}/users/${resetPasswordUser.id}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          password: resetPasswordUser.password.trim() || undefined,
        }),
      });

      setTemporaryPassword(result.temporaryPassword);
      setNotice(`Đã reset mật khẩu cho ${resetPasswordUser.email}.`);
      setResetPasswordUser(null);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Không thể reset mật khẩu.",
      );
    } finally {
      setResettingUserId(null);
    }
  }

  async function handleSaveUser() {
    if (!token || !editingUser) {
      return;
    }

    setIsSavingUser(true);
    setError(null);
    setNotice(null);
    setTemporaryPassword(null);

    try {
      await fetchJson(`${apiBaseUrl}/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editingUser.name,
          username: editingUser.username,
          department: editingUser.department,
          roleId: editingUser.roleId,
          status: editingUser.status,
        }),
      });
      await refreshData();
      setNotice(`Đã cập nhật user ${editingUser.name}.`);
      setEditingUser(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể cập nhật user.",
      );
    } finally {
      setIsSavingUser(false);
    }
  }

  async function handleSaveRole() {
    if (!token || !editingRole) {
      return;
    }

    setSavingRoleId(editingRole.id);
    setError(null);
    setNotice(null);
    setTemporaryPassword(null);

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
      setNotice(`Đã cập nhật quyền cho role ${editingRole.name}.`);
      setEditingRole(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể cập nhật quyền cho role.",
      );
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
      {error ? (
        <div className="rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-[18px] bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">
          {notice}
          {temporaryPassword ? (
            <span className="ml-2 font-bold text-[color:var(--on-surface)]">
              Mật khẩu mới: {temporaryPassword}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Vai trò và quyền
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            Xem role thực tế và tập permission đang cấp trong CRM
          </h3>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {roles.map((role) => (
              <article
                key={role.id}
                className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold">{role.name}</p>
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
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  {role.description}
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
            <p className="font-bold">{currentUser?.name ?? "Chưa có session"}</p>
            <p className="text-[color:var(--on-surface-variant)]">
              {currentUser?.email ?? "-"}
            </p>
            <p className="mt-3 font-semibold">
              Roles: {currentUser?.roles.join(", ") ?? "-"}
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

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({ ...current, username: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Username"
              />
              <input
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Mật khẩu"
                type="password"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <input
                value={form.department}
                onChange={(event) =>
                  setForm((current) => ({ ...current, department: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Phòng ban"
              />
              <select
                value={form.roleId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, roleId: event.target.value }))
                }
                className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
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
                <option value="AWAY">Vắng mặt</option>
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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
          Người dùng hệ thống
        </p>
        <h3 className="mt-2 text-2xl font-black tracking-tight">
          Danh sách user, role chính và số permission đang có
        </h3>

        <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="min-w-[1040px] w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Người dùng</th>
                <th className="px-5 py-4 font-semibold">Phòng ban</th>
                <th className="px-5 py-4 font-semibold">Vai trò</th>
                <th className="px-5 py-4 font-semibold">Trạng thái</th>
                <th className="px-5 py-4 font-semibold">Quản lý</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-bold">{user.name}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      {user.email}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
                      @{user.username ?? "chưa gán username"}
                    </p>
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                    {user.department}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-semibold">{user.primaryRole}</p>
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
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getToneClass(
                        user.statusTone,
                      )}`}
                    >
                      {user.statusLabel}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        title="Sửa user"
                        aria-label={`Sửa user ${user.email}`}
                        onClick={() =>
                          setEditingUser({
                            id: user.id,
                            name: user.name,
                            username: user.username ?? "",
                            department: user.department,
                            roleId: user.roles[0]?.id || roles[0]?.id || "",
                            status: user.status,
                          })
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleUser(user)}
                        disabled={updatingUserId === user.id}
                        className={`inline-flex rounded-full px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                          user.status === "DISABLED"
                            ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                            : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                        }`}
                      >
                        {updatingUserId === user.id
                          ? "Đang cập nhật..."
                          : user.status === "DISABLED"
                            ? "Active"
                            : "Inactive"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setResetPasswordUser({
                            id: user.id,
                            email: user.email,
                            password: "",
                          })
                        }
                        disabled={resettingUserId === user.id}
                        className="inline-flex rounded-full bg-[color:var(--warning-soft)] px-4 py-2 font-semibold text-[color:var(--warning)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {resettingUserId === user.id
                          ? "Đang reset..."
                          : "Reset mật khẩu"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingRole ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-2xl rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                  Role editor
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Sửa quyền role {editingRole.name}
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
          <div className="w-full max-w-xl rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
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
              <div className="grid gap-4 md:grid-cols-2">
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
                <input
                  value={editingUser.username}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current ? { ...current, username: event.target.value } : current,
                    )
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  placeholder="Username"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <input
                  value={editingUser.department}
                  onChange={(event) =>
                    setEditingUser((current) =>
                      current ? { ...current, department: event.target.value } : current,
                    )
                  }
                  className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  placeholder="Phòng ban"
                />
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
                      {role.name}
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
                  <option value="AWAY">Vắng mặt</option>
                  <option value="DISABLED">Tạm khóa</option>
                </select>
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

      {resetPasswordUser ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-lg rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
                  Password reset
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Reset mật khẩu
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
              >
                Đóng
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-[20px] bg-[color:var(--surface-low)] px-4 py-4 text-sm">
                <p className="font-semibold">{resetPasswordUser.email}</p>
                <p className="mt-2 leading-6 text-[color:var(--on-surface-variant)]">
                  Nhập mật khẩu mới nếu muốn đặt thủ công. Để trống nếu muốn hệ
                  thống tự sinh mật khẩu tạm.
                </p>
              </div>

              <input
                value={resetPasswordUser.password}
                onChange={(event) =>
                  setResetPasswordUser((current) =>
                    current ? { ...current, password: event.target.value } : current,
                  )
                }
                className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                placeholder="Nhập mật khẩu mới hoặc để trống"
                type="password"
              />

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="rounded-full bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetPassword()}
                  disabled={resettingUserId === resetPasswordUser.id}
                  className="rounded-full bg-[color:var(--warning)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resettingUserId === resetPasswordUser.id
                    ? "Đang reset..."
                    : "Lưu mật khẩu mới"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
