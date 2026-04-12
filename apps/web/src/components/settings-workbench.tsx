"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type SettingItem = { key: string; value: string };
type AiModelItem = { id: string; label: string };
type LoadAiModelsResponse = { source: string; baseUrl: string; error?: string; models: AiModelItem[] };
type SessionProfile = {
  id: string;
  permissions: string[];
  workspaces: Array<{ id: string; name: string; slug: string; organizationId: string; organizationName: string; roles: string[] }>;
};
type WorkspaceOverview = {
  organizations: Array<{ id: string; name: string; slug: string; workspaceCount: number }>;
  workspaces: Array<{
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    organizationName: string;
    description: string | null;
    isActive: boolean;
    botCount: number;
    groupCount: number;
    campaignCount: number;
    membershipCount: number;
    memberships: Array<{ id: string; isActive: boolean; userId: string; userName: string; userEmail: string; userStatus: string; roleId: string; roleName: string }>;
  }>;
  bots: Array<{ id: string; label: string; username: string | null; displayName: string | null; workspaceId: string; workspaceName: string; groupCount: number; campaignCount: number; isVerified: boolean; webhookRegistered: boolean; hasToken: boolean; publicBaseUrl: string | null; isPrimary: boolean; isActive: boolean }>;
};
type WorkspaceCatalog = {
  organizations: Array<{ id: string; name: string; slug: string }>;
  workspaces: Array<{ id: string; name: string; slug: string; organizationId: string }>;
  users: Array<{ id: string; name: string; email: string; status: string }>;
  roles: Array<{ id: string; name: string }>;
};

type ContactsImportPayloadObject = {
  contacts?: {
    list?: unknown[];
  };
  list?: unknown[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try { const p = await response.json(); detail = Array.isArray(p?.message) ? p.message.join(", ") : (p?.message ?? detail); } catch { detail = (await response.text()) || detail; }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

function mapSettings(items: SettingItem[]) { const m = new Map<string, string>(); for (const i of items) m.set(i.key, i.value); return m; }

function normalizeContactsPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object" || payload === null) return null;

  const candidate = payload as ContactsImportPayloadObject & {
    frequent_contacts?: { list?: unknown[] };
  };

  if (Array.isArray(candidate.contacts?.list)) return payload;
  if (Array.isArray(candidate.frequent_contacts?.list)) return payload;
  if (Array.isArray(candidate.list)) return payload;

  return null;
}

function Notice({ msg, type }: { msg: string; type: "error" | "success" | "info" }) {
  return (
    <div className={`rounded-[16px] px-4 py-3 text-sm font-semibold ${type === "error" ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]" : type === "success" ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--primary-soft)] text-[color:var(--primary)]"}`}>
      {msg}
    </div>
  );
}

export function SettingsWorkbench({ telegramBotId = null }: { telegramBotId?: string | null }) {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [catalog, setCatalog] = useState<WorkspaceCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modelsNotice, setModelsNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<AiModelItem[]>([]);

  const [form, setForm] = useState({ systemName: "", twoFaRequired: true, websocketStrategy: "", aiBaseUrl: "", aiApiToken: "", aiModel: "", aiPrompt: "" });

  // Create modals
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [showCreateBot, setShowCreateBot] = useState(false);

  // Create forms state
  const [createOrgForm, setCreateOrgForm] = useState({ name: "", slug: "" });
  const [createWsForm, setCreateWsForm] = useState({ orgId: "", name: "", slug: "" });
  const [createBotForm, setCreateBotForm] = useState({ wsId: "", label: "", username: "", botToken: "" });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ kind: string; id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  void telegramBotId;
  void isDeleting;

  // Telegram QR Login state
  const [tgAuthStatus, setTgAuthStatus] = useState<{ authenticated: boolean } | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState(0);
  const [qrReady, setQrReady] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Edit forms
  const [editOrgId, setEditOrgId] = useState<string | null>(null);
  const [editOrgForm, setEditOrgForm] = useState({ name: "", slug: "" });
  const [editWsId, setEditWsId] = useState<string | null>(null);
  const [editWsForm, setEditWsForm] = useState({ name: "", slug: "" });
  const [editBotId, setEditBotId] = useState<string | null>(null);
  const [editBotForm, setEditBotForm] = useState({ label: "", username: "", botToken: "", publicBaseUrl: "" });

  useEffect(() => { setToken(window.localStorage.getItem(authStorageKey)); }, []);
  const headers = useMemo(() => token ? { Authorization: `Bearer ${token}` } : undefined, [token]);
  const isSuperAdmin = Boolean(profile?.permissions.includes("organization.manage"));
  const canManageContacts = Boolean(profile?.permissions.includes("contacts.manage"));

  const loadAll = useCallback(async () => {
    if (!headers) return;
    setIsRefreshing(true);
    try {
      const [items, me] = await Promise.all([
        fetchJson<SettingItem[]>(`${apiBaseUrl}/settings`, { headers }),
        fetchJson<SessionProfile>(`${apiBaseUrl}/auth/me`, { headers }),
      ]);
      let ov: WorkspaceOverview | null = null;
      let cat: WorkspaceCatalog | null = null;

      if (me.permissions.includes("organization.manage")) {
        [ov, cat] = await Promise.all([
          fetchJson<WorkspaceOverview>(`${apiBaseUrl}/workspaces/overview`, { headers }),
          fetchJson<WorkspaceCatalog>(`${apiBaseUrl}/workspaces/catalog`, { headers }),
        ]);
      }
      const m = mapSettings(items);
      setProfile(me); setOverview(ov); setCatalog(cat);
      setForm({ systemName: m.get("system.name") || "Telegram Ops", twoFaRequired: String(m.get("security.2fa") || "").includes("required"), websocketStrategy: m.get("websocket.strategy") || "", aiBaseUrl: m.get("ai.base_url") || "", aiApiToken: m.get("ai.api_token") || "", aiModel: m.get("ai.model") || "gpt-5-mini", aiPrompt: m.get("ai.prompt") || "" });
      setCreateWsForm((c) => ({ ...c, orgId: c.orgId || cat?.organizations[0]?.id || "" }));
      setCreateBotForm((c) => ({ ...c, wsId: c.wsId || cat?.workspaces[0]?.id || "" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi khi tải."); }
    setIsRefreshing(false);
  }, [headers]);

  useEffect(() => { if (headers) void loadAll(); }, [headers, loadAll]);

  async function handleSave() {
    if (!headers) return;
    setIsSaving(true); setError(null); setNotice(null);
    try {
      await fetchJson(`${apiBaseUrl}/settings`, { method: "PUT", headers, body: JSON.stringify({ entries: [
        { key: "system.name", value: form.systemName.trim() || "Telegram Ops" },
        { key: "security.2fa", value: form.twoFaRequired ? "required-for-admins" : "optional" },
        { key: "websocket.strategy", value: form.websocketStrategy.trim() },
        { key: "ai.base_url", value: form.aiBaseUrl.trim() },
        { key: "ai.api_token", value: form.aiApiToken.trim() },
        { key: "ai.model", value: form.aiModel.trim() || "gpt-5-mini" },
        { key: "ai.prompt", value: form.aiPrompt.trim() },
      ]}) });
      setNotice("Đã lưu.");
      void loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi khi lưu."); } finally { setIsSaving(false); }
  }

  async function handleLoadModels() {
    if (!headers) return;
    setIsLoadingModels(true); setError(null); setModelsNotice(null);
    try {
      const p = await fetchJson<LoadAiModelsResponse>(`${apiBaseUrl}/settings/ai/models`, { method: "POST", headers, body: JSON.stringify({ baseUrl: form.aiBaseUrl.trim(), apiToken: form.aiApiToken.trim() }) });
      setModelOptions(p.models || []);
      if (!form.aiModel && p.models[0]?.id) setForm((c) => ({ ...c, aiModel: p.models[0].id }));
      setModelsNotice(p.error ? `Dự phòng. ${p.error}` : `Tải được ${p.models.length} model từ ${p.source}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi tải model."); } finally { setIsLoadingModels(false); }
  }

  async function handleCreate(kind: string) {
    if (!headers) return;
    setError(null); setNotice(null);
    try {
      if (kind === "org") {
        await fetchJson(`${apiBaseUrl}/workspaces/organizations`, { method: "POST", headers, body: JSON.stringify(createOrgForm) });
        setNotice("Đã tạo organization."); setCreateOrgForm({ name: "", slug: "" }); setShowCreateOrg(false);
      } else if (kind === "ws") {
        await fetchJson(`${apiBaseUrl}/workspaces`, { method: "POST", headers, body: JSON.stringify(createWsForm) });
        setNotice("Đã tạo workspace."); setCreateWsForm({ orgId: createWsForm.orgId, name: "", slug: "" }); setShowCreateWs(false);
      } else if (kind === "bot") {
        await fetchJson(`${apiBaseUrl}/workspaces/${createBotForm.wsId}/bots`, { method: "POST", headers, body: JSON.stringify({ label: createBotForm.label, username: createBotForm.username, botToken: createBotForm.botToken }) });
        setNotice("Đã tạo bot."); setCreateBotForm({ wsId: createBotForm.wsId, label: "", username: "", botToken: "" }); setShowCreateBot(false);
      }
      void loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi khi tạo."); }
  }

  async function handleEdit(kind: string) {
    if (!headers) return;
    setError(null); setNotice(null);
    try {
      if (kind === "org" && editOrgId) {
        await fetchJson(`${apiBaseUrl}/workspaces/organizations/${editOrgId}`, { method: "PATCH", headers, body: JSON.stringify(editOrgForm) });
        setNotice("Đã cập nhật organization."); setEditOrgId(null);
      } else if (kind === "ws" && editWsId) {
        await fetchJson(`${apiBaseUrl}/workspaces/${editWsId}`, { method: "PATCH", headers, body: JSON.stringify(editWsForm) });
        setNotice("Đã cập nhật workspace."); setEditWsId(null);
      } else if (kind === "bot" && editBotId) {
        await fetchJson(`${apiBaseUrl}/workspaces/bots/${editBotId}`, { method: "PATCH", headers, body: JSON.stringify(editBotForm) });
        setNotice("Đã cập nhật bot."); setEditBotId(null);
      }
      void loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi khi cập nhật."); }
  }

  async function handleToggle(kind: string, id: string, current: boolean) {
    if (!headers) return;
    setError(null); setNotice(null);
    try {
      const base = kind === "ws" ? "/workspaces" : kind === "bot" ? "/workspaces/bots" : "/workspaces/memberships";
      await fetchJson(`${apiBaseUrl}${base}/${id}`, { method: "PATCH", headers, body: JSON.stringify({ isActive: !current }) });
      setNotice(`Đã ${!current ? "bật" : "tắt"}.`); void loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi."); }
  }

  async function handleSetPrimary(botId: string) {
    if (!headers) return;
    setError(null); setNotice(null);
    try { await fetchJson(`${apiBaseUrl}/workspaces/bots/${botId}`, { method: "PATCH", headers, body: JSON.stringify({ isPrimary: true, isActive: true }) }); setNotice("Đã đặt bot chính."); void loadAll(); }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi."); }
  }

  async function handleDelete() {
    if (!headers || !deleteTarget) return;
    setIsDeleting(true); setError(null); setNotice(null);
    try {
      const base = deleteTarget.kind === "org" ? "/workspaces/organizations" : deleteTarget.kind === "ws" ? "/workspaces" : "/workspaces/bots";
      await fetchJson(`${apiBaseUrl}${base}/${deleteTarget.id}`, { method: "DELETE", headers });
      setNotice(`Đã xóa ${deleteTarget.kind}.`); void loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi."); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  }

  const checkTgAuthStatus = useCallback(async () => {
    if (!headers) { setTgAuthStatus({ authenticated: false }); return; }
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/status`, { headers });
      if (res.ok) setTgAuthStatus(await res.json() as { authenticated: boolean });
      else setTgAuthStatus({ authenticated: false });
    } catch { setTgAuthStatus({ authenticated: false }); }
  }, [headers]);

  // Check Telegram auth status on mount
  useEffect(() => {
    void checkTgAuthStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checkTgAuthStatus]);

  async function startQrLogin() {
    setQrLoading(true); setQrError(null); setQrToken(null); setQrReady(false);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/start`, { method: "POST", headers });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);
      const data = await res.json() as { token: string; expiresIn: number };
      setQrToken(data.token);
      setQrExpires(data.expiresIn);
      startPolling();
    } catch (e) { setQrError(e instanceof Error ? e.message : "Tạo QR thất bại"); }
    finally { setQrLoading(false); }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/poll`, { headers });
        if (!res.ok) { clearInterval(pollRef.current!); return; }
        const data = await res.json() as { ready: boolean; token?: string; expiresIn?: number };
        setQrToken(data.token || null);
        setQrExpires(data.expiresIn || 0);
        if (data.ready) {
          setQrReady(true);
          clearInterval(pollRef.current!);
          await confirmQrLogin();
        }
      } catch { clearInterval(pollRef.current!); }
    }, 3000);
  }

  async function confirmQrLogin() {
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/confirm`, { headers });
      if (res.ok) setTgAuthStatus({ authenticated: true });
    } catch { /* ignore */ }
  }

  async function handleTgLogout() {
    if (pollRef.current) clearInterval(pollRef.current);
    setTgAuthStatus({ authenticated: false });
    setQrToken(null);
    setQrReady(false);
  }

  async function handleImportContacts(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setImportLoading(true);
    const fileInput = e.currentTarget.elements.namedItem("contactsFile") as HTMLInputElement;
    if (!fileInput.files?.[0]) {
      setImportLoading(false);
      return;
    }

    try {
      const payload = JSON.parse(await fileInput.files[0].text()) as unknown;
      const importPayload = normalizeContactsPayload(payload);
      if (!importPayload) {
        setError("JSON phải là mảng contact hoặc file Telegram export có contacts.list hoặc frequent_contacts.list.");
        return;
      }

      setNotice("Đang tạo batch import...");
      const res = await fetch(`${apiBaseUrl}/contacts/import`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileName: fileInput.files[0].name,
          payload: importPayload,
        }),
      });
      const data = await res.json() as { batch?: { id: string; totalCount: number }; error?: string };
      if (data.error) throw new Error(data.error);
      setNotice(`Đã tạo batch ${data.batch?.id ?? ""}. Vào màn /contacts để theo dõi tiến độ.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Import thất bại."); }
    finally { setImportLoading(false); }
  }
  if (!token) return <div className="flex h-48 items-center justify-center"><p className="text-sm font-semibold text-[color:var(--warning)]">Cần đăng nhập.</p></div>;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <a
        href="/dashboard"
        className="mb-2 inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-card)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] shadow-[0_4px_16px_rgba(42,52,57,0.04)] transition-all hover:bg-white/80"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Quay lại Dashboard
      </a>

      {/* Alerts */}
      {error && <Notice msg={error} type="error" />}
      {notice && <Notice msg={notice} type="success" />}
      {modelsNotice && <Notice msg={modelsNotice} type="info" />}

      {/* ===== AI SETTINGS ===== */}
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">AI Moderation</p>
            <h3 className="mt-1 text-xl font-black tracking-tight">Cấu hình AI provider</h3>
          </div>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">
            {isSaving ? "Đang lưu..." : "Lưu cài đặt"}
          </button>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {/* Left column */}
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Base URL</label>
              <input value={form.aiBaseUrl} onChange={(e) => setForm((c) => ({ ...c, aiBaseUrl: e.target.value }))} placeholder="https://api.openai.com/v1" className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">API Token</label>
              <input type="password" value={form.aiApiToken} onChange={(e) => setForm((c) => ({ ...c, aiApiToken: e.target.value }))} placeholder="sk-..." className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Model</label>
                <div className="flex gap-2">
                  <input value={form.aiModel} onChange={(e) => setForm((c) => ({ ...c, aiModel: e.target.value }))} placeholder="gpt-5-mini" className="min-w-0 flex-1 rounded-[14px] bg-white px-4 py-3 text-sm outline-none" />
                  <button type="button" onClick={() => void handleLoadModels()} disabled={isLoadingModels || !form.aiBaseUrl.trim()} className="shrink-0 rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold disabled:opacity-40">{isLoadingModels ? "..." : "Load"}</button>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Tên hệ thống</label>
                <input value={form.systemName} onChange={(e) => setForm((c) => ({ ...c, systemName: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" />
              </div>
            </div>

            {modelOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {modelOptions.map((m) => (
                  <button key={m.id} type="button" onClick={() => setForm((c) => ({ ...c, aiModel: m.id }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${form.aiModel === m.id ? "bg-[color:var(--primary)] text-white" : "bg-white text-[color:var(--on-surface-variant)]"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">AI Prompt</label>
              <textarea value={form.aiPrompt} onChange={(e) => setForm((c) => ({ ...c, aiPrompt: e.target.value }))} rows={6}
                placeholder="Bạn là AI moderation assistant..." className="w-full resize-none rounded-[14px] bg-white px-4 py-3 text-sm leading-6 outline-none" />
            </div>
            <div className="flex items-center justify-between rounded-[14px] bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Yêu cầu 2FA</p>
                <p className="mt-0.5 text-xs text-[color:var(--on-surface-variant)]">Bật xác thực hai bước cho admin</p>
              </div>
              <button type="button" onClick={() => setForm((c) => ({ ...c, twoFaRequired: !c.twoFaRequired }))}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${form.twoFaRequired ? "bg-[color:var(--primary)]" : "bg-[color:var(--surface-low)]"}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.twoFaRequired ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TELEGRAM QR LOGIN ===== */}
      {canManageContacts ? (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">Telegram Userbot</p>
            <h3 className="mt-1 text-xl font-black tracking-tight">Kết nối tài khoản Telegram</h3>
          </div>
          <div>
            {tgAuthStatus?.authenticated ? (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--success)]" />
                <span className="text-sm font-semibold text-[color:var(--success)]">Đã kết nối</span>
                <button type="button" onClick={() => handleTgLogout()} className="rounded-[14px] bg-[color:var(--danger-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--danger)]">Ngắt kết nối</button>
              </div>
            ) : (
              <span className="text-sm font-semibold text-[color:var(--on-surface-variant)]">Chưa kết nối</span>
            )}
          </div>
        </div>

        <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
          Quét QR để đăng nhập bằng tài khoản Telegram của bạn. Dùng để resolve user ID từ số điện thoại.
        </p>

        {qrError && (
          <div className="mt-4 rounded-[16px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--danger)]">{qrError}</div>
        )}

        <div className="mt-6">
          {!tgAuthStatus ? (
            <p className="text-sm text-[color:var(--on-surface-variant)]">Đang kiểm tra...</p>
          ) : tgAuthStatus.authenticated ? (
            <div className="flex items-center gap-3 rounded-[16px] bg-white px-5 py-4">
              <span className="h-10 w-10 rounded-full bg-[color:var(--success-soft)] flex items-center justify-center text-lg">✓</span>
              <div>
                <p className="text-sm font-bold">Đã kết nối Telegram</p>
                <p className="text-xs text-[color:var(--on-surface-variant)]">Có thể resolve user ID từ số điện thoại</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center gap-4">
                {!qrToken ? (
                  <button type="button" onClick={() => void startQrLogin()} disabled={qrLoading}
                    className="rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">
                    {qrLoading ? "Đang tạo QR..." : "Tạo QR Code"}
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-xl bg-white p-4">
                      <Image
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent("tg://login?token=" + qrToken)}`}
                        alt="Telegram QR"
                        width={200}
                        height={200}
                        unoptimized
                      />
                    </div>
                    <p className="text-sm text-[color:var(--on-surface-variant)]">Quét bằng app Telegram</p>
                    <p className="text-xs font-mono text-[color:var(--on-surface-variant)]">Hết hạn trong {qrExpires}s</p>
                    {qrReady && <p className="text-sm font-bold text-[color:var(--success)]">Đã quét! Đang xác nhận...</p>}
                    <button type="button" onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setQrToken(null); }}
                      className="text-xs text-[color:var(--on-surface-variant)] hover:text-white">Tạo lại QR</button>
                  </div>
                )}
              </div>
              <div className="rounded-[16px] bg-white px-5 py-4">
                <p className="text-sm font-bold">Cần API credentials</p>
                <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Thêm TELEGRAM_API_ID và TELEGRAM_API_HASH vào .env rồi restart server.</p>
                <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">Lấy tại <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-[color:var(--primary)] underline">my.telegram.org</a></p>
              </div>
            </div>
          )}
        </div>
      </section>
      ) : null}

      {/* ===== CONTACTS IMPORT ===== */}
      {canManageContacts ? (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">Contacts</p>
            <h3 className="mt-1 text-xl font-black tracking-tight">Import danh bạ JSON</h3>
          </div>
          {!tgAuthStatus?.authenticated && (
            <span className="rounded-full bg-[color:var(--warning-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--warning)]">
              Cần kết nối Telegram trước
            </span>
          )}
        </div>

        <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
          Upload file JSON chứa danh sách contacts từ Telegram export. Hệ thống sẽ tạo batch nền để resolve user ID và import frequent contacts nếu có.
        </p>

        <form onSubmit={handleImportContacts} className="mt-6 space-y-4">
          <div>
            <input
              type="file"
              name="contactsFile"
              accept=".json"
              disabled={!tgAuthStatus?.authenticated}
              className="block w-full text-sm text-[color:var(--on-surface-variant)] file:mr-4 file:py-2 file:px-4 file:rounded-[14px] file:border-0 file:text-sm file:font-semibold file:bg-[color:var(--primary)] file:text-white hover:file:bg-[color:var(--primary-dim)] file:cursor-pointer cursor-pointer disabled:opacity-40"
            />
            <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
              JSON format: <code className="bg-[color:var(--surface-low)] px-1.5 py-0.5 rounded text-xs">{'[{"phone_number":"+84...","first_name":"Tên","last_name":"..."}]'}</code> hoặc Telegram export có <code className="bg-[color:var(--surface-low)] px-1.5 py-0.5 rounded text-xs">contacts.list</code> / <code className="bg-[color:var(--surface-low)] px-1.5 py-0.5 rounded text-xs">frequent_contacts.list</code>
            </p>
          </div>
          <button
            type="submit"
            disabled={!tgAuthStatus?.authenticated || importLoading}
            className="rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-6 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
          >
            {importLoading ? "Đang tạo batch..." : "Tạo batch import"}
          </button>
        </form>
      </section>
      ) : null}

      {/* ===== WORKSPACE ADMIN ===== */}
      {isSuperAdmin ? (
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">SuperAdmin</p>
              <h3 className="mt-1 text-xl font-black tracking-tight">Quản lý Workspace</h3>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void loadAll()} disabled={isRefreshing} className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-2.5 text-xs font-semibold">{isRefreshing ? "..." : "Tải lại"}</button>
              <button type="button" onClick={() => setShowCreateOrg(true)} className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-2.5 text-xs font-semibold">+ Org</button>
              <button type="button" onClick={() => setShowCreateWs(true)} className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-2.5 text-xs font-semibold">+ Workspace</button>
              <button type="button" onClick={() => setShowCreateBot(true)} className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-2.5 text-xs font-semibold">+ Bot</button>
            </div>
          </div>

          {/* Organizations */}
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-bold">Organizations ({overview?.organizations.length ?? 0})</h4>
            <div className="space-y-2">
              {overview?.organizations.map((org) => (
                <div key={org.id} className="flex items-center justify-between rounded-[16px] bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-bold">{org.name}</p>
                    <p className="text-xs text-[color:var(--on-surface-variant)]">{org.slug} · {org.workspaceCount} workspace</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditOrgId(org.id); setEditOrgForm({ name: org.name, slug: org.slug }); }} className="rounded-[12px] bg-[color:var(--surface-low)] px-3 py-2 text-xs font-semibold">Sửa</button>
                    <button type="button" onClick={() => setDeleteTarget({ kind: "org", id: org.id, name: org.name })} className="rounded-[12px] bg-[color:var(--danger-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--danger)]">Xóa</button>
                  </div>
                </div>
              ))}
              {overview?.organizations.length === 0 && <p className="text-sm text-[color:var(--on-surface-variant)]">Chưa có organization nào.</p>}
            </div>
          </div>

          {/* Workspaces */}
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-bold">Workspaces ({overview?.workspaces.length ?? 0})</h4>
            <div className="space-y-2">
              {overview?.workspaces.map((ws) => (
                <div key={ws.id} className="rounded-[16px] bg-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ws.isActive ? "bg-[color:var(--success)]" : "bg-[color:var(--on-surface-variant)]/30"}`} />
                      <div>
                        <p className="text-sm font-bold">{ws.name}</p>
                        <p className="text-xs text-[color:var(--on-surface-variant)]">{ws.organizationName} · {ws.botCount} bot · {ws.groupCount} group · {ws.membershipCount} user</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleToggle("ws", ws.id, ws.isActive)}
                        className={`rounded-[12px] px-3 py-2 text-xs font-semibold ${ws.isActive ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--surface-low)]"}`}>
                        {ws.isActive ? "Tắt" : "Bật"}
                      </button>
                      <button type="button" onClick={() => { setEditWsId(ws.id); setEditWsForm({ name: ws.name, slug: ws.slug }); }} className="rounded-[12px] bg-[color:var(--surface-low)] px-3 py-2 text-xs font-semibold">Sửa</button>
                      <button type="button" onClick={() => setDeleteTarget({ kind: "ws", id: ws.id, name: ws.name })} className="rounded-[12px] bg-[color:var(--danger-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--danger)]">Xóa</button>
                    </div>
                  </div>
                  {/* Members */}
                  {ws.memberships.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-5.5">
                      {ws.memberships.map((m) => (
                        <span key={m.id} className="inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-low)] px-3 py-1.5 text-xs">
                          <span className="font-semibold">{m.userName}</span>
                          <span className="text-[color:var(--on-surface-variant)]">{m.roleName}</span>
                          <button type="button" onClick={() => handleToggle("member", m.id, m.isActive)} className={`ml-1 text-[10px] ${m.isActive ? "text-[color:var(--on-surface-variant)]" : "text-[color:var(--primary)] font-bold"}`}>{m.isActive ? "Tắt" : "Bật"}</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {overview?.workspaces.length === 0 && <p className="text-sm text-[color:var(--on-surface-variant)]">Chưa có workspace nào.</p>}
            </div>
          </div>

          {/* Bots */}
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-bold">Bots ({overview?.bots.length ?? 0})</h4>
            <div className="space-y-2">
              {overview?.bots.map((bot) => (
                <div key={bot.id} className="flex items-center justify-between rounded-[16px] bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${bot.isActive ? "bg-[color:var(--success)]" : "bg-[color:var(--on-surface-variant)]/30"}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold">{bot.label}</p>
                        {bot.isPrimary && <span className="rounded-full bg-[color:var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--primary)]">Bot chính</span>}
                      </div>
                      <p className="text-xs text-[color:var(--on-surface-variant)]">{bot.workspaceName}{bot.username ? ` · @${bot.username}` : ""} · {bot.groupCount} group · {bot.campaignCount} campaign</p>
                      <p className="text-[10px] text-[color:var(--on-surface-variant)]">{bot.hasToken ? "✓ có token" : "✗ chưa token"} · {bot.webhookRegistered ? "✓ webhook" : "✗ chưa webhook"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleToggle("bot", bot.id, bot.isActive)}
                      className={`rounded-[12px] px-3 py-2 text-xs font-semibold ${bot.isActive ? "bg-[color:var(--success-soft)] text-[color:var(--success)]" : "bg-[color:var(--surface-low)]"}`}>
                      {bot.isActive ? "Tắt" : "Bật"}
                    </button>
                    {!bot.isPrimary && (
                      <button type="button" onClick={() => void handleSetPrimary(bot.id)} className="rounded-[12px] bg-[color:var(--primary-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--primary)]">Đặt chính</button>
                    )}
                    <button type="button" onClick={() => { setEditBotId(bot.id); setEditBotForm({ label: bot.label, username: bot.username || "", botToken: "", publicBaseUrl: bot.publicBaseUrl || "" }); }} className="rounded-[12px] bg-[color:var(--surface-low)] px-3 py-2 text-xs font-semibold">Sửa</button>
                    <button type="button" onClick={() => setDeleteTarget({ kind: "bot", id: bot.id, name: bot.label })} className="rounded-[12px] bg-[color:var(--danger-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--danger)]">Xóa</button>
                  </div>
                </div>
              ))}
              {overview?.bots.length === 0 && <p className="text-sm text-[color:var(--on-surface-variant)]">Chưa có bot nào.</p>}
            </div>
          </div>
        </section>
      ) : null}

      {/* ===== CREATE MODALS ===== */}
      {showCreateOrg && (
        <Modal title="Tạo Organization" onClose={() => setShowCreateOrg(false)} onSave={() => void handleCreate("org")} saveLabel="Tạo">
          <Field label="Tên"><input value={createOrgForm.name} onChange={(e) => setCreateOrgForm((c) => ({ ...c, name: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="Slug"><input value={createOrgForm.slug} onChange={(e) => setCreateOrgForm((c) => ({ ...c, slug: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
        </Modal>
      )}

      {showCreateWs && (
        <Modal title="Tạo Workspace" onClose={() => setShowCreateWs(false)} onSave={() => void handleCreate("ws")} saveLabel="Tạo">
          <Field label="Organization">
            <select value={createWsForm.orgId} onChange={(e) => setCreateWsForm((c) => ({ ...c, orgId: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none">
              <option value="">Chọn organization</option>
              {catalog?.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Tên"><input value={createWsForm.name} onChange={(e) => setCreateWsForm((c) => ({ ...c, name: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="Slug"><input value={createWsForm.slug} onChange={(e) => setCreateWsForm((c) => ({ ...c, slug: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
        </Modal>
      )}

      {showCreateBot && (
        <Modal title="Tạo Bot" onClose={() => setShowCreateBot(false)} onSave={() => void handleCreate("bot")} saveLabel="Tạo">
          <Field label="Workspace">
            <select value={createBotForm.wsId} onChange={(e) => setCreateBotForm((c) => ({ ...c, wsId: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none">
              <option value="">Chọn workspace</option>
              {catalog?.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Tên bot"><input value={createBotForm.label} onChange={(e) => setCreateBotForm((c) => ({ ...c, label: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="@Username"><input value={createBotForm.username} onChange={(e) => setCreateBotForm((c) => ({ ...c, username: e.target.value }))} placeholder="@telegram_bot" className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="Bot Token"><input type="password" value={createBotForm.botToken} onChange={(e) => setCreateBotForm((c) => ({ ...c, botToken: e.target.value }))} placeholder="123456:ABC-..." className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
        </Modal>
      )}

      {/* ===== EDIT MODALS ===== */}
      {editOrgId && (
        <Modal title="Sửa Organization" onClose={() => setEditOrgId(null)} onSave={() => void handleEdit("org")} saveLabel="Lưu">
          <Field label="Tên"><input value={editOrgForm.name} onChange={(e) => setEditOrgForm((c) => ({ ...c, name: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="Slug"><input value={editOrgForm.slug} onChange={(e) => setEditOrgForm((c) => ({ ...c, slug: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
        </Modal>
      )}

      {editWsId && (
        <Modal title="Sửa Workspace" onClose={() => setEditWsId(null)} onSave={() => void handleEdit("ws")} saveLabel="Lưu">
          <Field label="Tên"><input value={editWsForm.name} onChange={(e) => setEditWsForm((c) => ({ ...c, name: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="Slug"><input value={editWsForm.slug} onChange={(e) => setEditWsForm((c) => ({ ...c, slug: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
        </Modal>
      )}

      {editBotId && (
        <Modal title="Sửa Bot" onClose={() => setEditBotId(null)} onSave={() => void handleEdit("bot")} saveLabel="Lưu">
          <Field label="Tên bot"><input value={editBotForm.label} onChange={(e) => setEditBotForm((c) => ({ ...c, label: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="@Username"><input value={editBotForm.username} onChange={(e) => setEditBotForm((c) => ({ ...c, username: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="Public Base URL"><input value={editBotForm.publicBaseUrl} onChange={(e) => setEditBotForm((c) => ({ ...c, publicBaseUrl: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
          <Field label="Bot Token (để trống nếu không đổi)"><input type="password" value={editBotForm.botToken} onChange={(e) => setEditBotForm((c) => ({ ...c, botToken: e.target.value }))} className="w-full rounded-[14px] bg-white px-4 py-3 text-sm outline-none" /></Field>
        </Modal>
      )}

      {/* ===== DELETE CONFIRM ===== */}
      {deleteTarget && (
        <Modal title={`Xóa ${deleteTarget.kind === "org" ? "Organization" : deleteTarget.kind === "ws" ? "Workspace" : "Bot"}?`} onClose={() => setDeleteTarget(null)} onSave={() => void handleDelete()} saveLabel="Xóa" danger>
          <p className="text-sm text-[color:var(--on-surface-variant)]">Xóa <strong>{deleteTarget.name}</strong>. Hành động này sẽ lưu trữ dữ liệu.</p>
        </Modal>
      )}
    </div>
  );
}

// ===== SHARED MODAL COMPONENT =====
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose, onSave, saveLabel, danger }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-md rounded-[28px] bg-[color:var(--surface-card)] p-7 shadow-[0_24px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">{title}</p>
          <button type="button" onClick={onClose} className="rounded-full bg-[color:var(--surface-low)] px-3 py-1 text-xs font-semibold">✕</button>
        </div>
        <div className="mt-5 space-y-4">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-[14px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold">Hủy</button>
          <button type="button" onClick={onSave} className={`rounded-[14px] px-5 py-3 text-sm font-bold text-white ${danger ? "bg-[color:var(--danger)]" : "bg-[color:var(--primary)]"}`}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}
