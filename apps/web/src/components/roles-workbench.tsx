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
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
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
        const [rolesResponse, usersResponse] = await Promise.all([
          fetchJson<RoleItem[]>(`${apiBaseUrl}/roles`, { headers }),
          fetchJson<UserItem[]>(`${apiBaseUrl}/users`, { headers }),
        ]);

        if (!active) {
          return;
        }

        setRoles(rolesResponse);
        setUsers(usersResponse);
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
    const [rolesResponse, usersResponse] = await Promise.all([
      fetchJson<RoleItem[]>(`${apiBaseUrl}/roles`, { headers }),
      fetchJson<UserItem[]>(`${apiBaseUrl}/users`, { headers }),
    ]);

    setRoles(rolesResponse);
    setUsers(usersResponse);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !form.roleId) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setNotice(null);

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
                <p className="text-sm font-bold">{role.name}</p>
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
            <p className="text-[color:var(--on-surface-variant)]">{currentUser?.email ?? "-"}</p>
            <p className="mt-3 font-semibold">Roles: {currentUser?.roles.join(", ") ?? "-"}</p>
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

        <div className="mt-6 overflow-hidden rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Người dùng</th>
                <th className="px-5 py-4 font-semibold">Phòng ban</th>
                <th className="px-5 py-4 font-semibold">Vai trò</th>
                <th className="px-5 py-4 font-semibold">Trạng thái</th>
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
                      {user.roles.map((role) => (
                        <span
                          key={`${user.id}-${role.id}`}
                          className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[color:var(--on-surface)]"
                        >
                          {role.name}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
