"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/toast-context";

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

type ContactImportBatchSummary = {
  id: string;
  workspaceId: string | null;
  workspaceName: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  sourceType: string;
  sourceFileName: string | null;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalCount: number;
  contactsCount: number;
  frequentCount: number;
  processedCount: number;
  resolvedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ContactImportBatchListResponse = ContactImportBatchSummary[];

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

function formatDateTime(value: string | null) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

function getBatchProgressPercent(batch: ContactImportBatchSummary) {
  if (!batch.totalCount) return 0;
  return Math.max(0, Math.min(100, Math.round((batch.processedCount / batch.totalCount) * 100)));
}

export function SettingsWorkbench({ telegramBotId = null }: { telegramBotId?: string | null }) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [catalog, setCatalog] = useState<WorkspaceCatalog | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importBatches, setImportBatches] = useState<ContactImportBatchSummary[]>([]);
  const [isImportBatchesLoading, setIsImportBatchesLoading] = useState(false);
  const [activeImportAction, setActiveImportAction] = useState<string | null>(null);
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
  const [tgLoginMode, setTgLoginMode] = useState<"qr" | "phone">("phone");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState(0);
  const [qrReady, setQrReady] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [phoneAuthStep, setPhoneAuthStep] = useState<"phone" | "code" | "password">("phone");
  const [phoneAuthForm, setPhoneAuthForm] = useState({ phoneNumber: "", phoneCode: "", password: "" });
  const [phoneAuthLoading, setPhoneAuthLoading] = useState(false);
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
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi khi tải.", type: "error" }); }
    setIsRefreshing(false);
  }, [headers]);

  useEffect(() => { if (headers) void loadAll(); }, [headers, loadAll]);

  async function handleSave() {
    if (!headers) return;
    setIsSaving(true);
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
      toast({ message: "Đã lưu.", type: "success" });
      void loadAll();
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi khi lưu.", type: "error" }); } finally { setIsSaving(false); }
  }

  async function handleLoadModels() {
    if (!headers) return;
    setIsLoadingModels(true);
    try {
      const p = await fetchJson<LoadAiModelsResponse>(`${apiBaseUrl}/settings/ai/models`, { method: "POST", headers, body: JSON.stringify({ baseUrl: form.aiBaseUrl.trim(), apiToken: form.aiApiToken.trim() }) });
      setModelOptions(p.models || []);
      if (!form.aiModel && p.models[0]?.id) setForm((c) => ({ ...c, aiModel: p.models[0].id }));
      toast({ message: p.error ? `Dự phòng. ${p.error}` : `Tải được ${p.models.length} model từ ${p.source}.`, type: "info" });
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi tải model.", type: "error" }); } finally { setIsLoadingModels(false); }
  }

  async function handleCreate(kind: string) {
    if (!headers) return;
    try {
      if (kind === "org") {
        await fetchJson(`${apiBaseUrl}/workspaces/organizations`, { method: "POST", headers, body: JSON.stringify(createOrgForm) });
        toast({ message: "Đã tạo organization.", type: "success" }); setCreateOrgForm({ name: "", slug: "" }); setShowCreateOrg(false);
      } else if (kind === "ws") {
        await fetchJson(`${apiBaseUrl}/workspaces`, { method: "POST", headers, body: JSON.stringify(createWsForm) });
        toast({ message: "Đã tạo workspace.", type: "success" }); setCreateWsForm({ orgId: createWsForm.orgId, name: "", slug: "" }); setShowCreateWs(false);
      } else if (kind === "bot") {
        await fetchJson(`${apiBaseUrl}/workspaces/${createBotForm.wsId}/bots`, { method: "POST", headers, body: JSON.stringify({ label: createBotForm.label, username: createBotForm.username, botToken: createBotForm.botToken }) });
        toast({ message: "Đã tạo bot.", type: "success" }); setCreateBotForm({ wsId: createBotForm.wsId, label: "", username: "", botToken: "" }); setShowCreateBot(false);
      }
      void loadAll();
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi khi tạo.", type: "error" }); }
  }

  async function handleEdit(kind: string) {
    if (!headers) return;
    try {
      if (kind === "org" && editOrgId) {
        await fetchJson(`${apiBaseUrl}/workspaces/organizations/${editOrgId}`, { method: "PATCH", headers, body: JSON.stringify(editOrgForm) });
        toast({ message: "Đã cập nhật organization.", type: "success" }); setEditOrgId(null);
      } else if (kind === "ws" && editWsId) {
        await fetchJson(`${apiBaseUrl}/workspaces/${editWsId}`, { method: "PATCH", headers, body: JSON.stringify(editWsForm) });
        toast({ message: "Đã cập nhật workspace.", type: "success" }); setEditWsId(null);
      } else if (kind === "bot" && editBotId) {
        await fetchJson(`${apiBaseUrl}/workspaces/bots/${editBotId}`, { method: "PATCH", headers, body: JSON.stringify(editBotForm) });
        toast({ message: "Đã cập nhật bot.", type: "success" }); setEditBotId(null);
      }
      void loadAll();
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi khi cập nhật.", type: "error" }); }
  }

  async function handleToggle(kind: string, id: string, current: boolean) {
    if (!headers) return;
    try {
      const base = kind === "ws" ? "/workspaces" : kind === "bot" ? "/workspaces/bots" : "/workspaces/memberships";
      await fetchJson(`${apiBaseUrl}${base}/${id}`, { method: "PATCH", headers, body: JSON.stringify({ isActive: !current }) });
      toast({ message: `Đã ${!current ? "bật" : "tắt"}.`, type: "success" }); void loadAll();
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi.", type: "error" }); }
  }

  async function handleSetPrimary(botId: string) {
    if (!headers) return;
    try { await fetchJson(`${apiBaseUrl}/workspaces/bots/${botId}`, { method: "PATCH", headers, body: JSON.stringify({ isPrimary: true, isActive: true }) }); toast({ message: "Đã đặt bot chính.", type: "success" }); void loadAll(); }
    catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi.", type: "error" }); }
  }

  async function handleDelete() {
    if (!headers || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const base = deleteTarget.kind === "org" ? "/workspaces/organizations" : deleteTarget.kind === "ws" ? "/workspaces" : "/workspaces/bots";
      await fetchJson(`${apiBaseUrl}${base}/${deleteTarget.id}`, { method: "DELETE", headers });
      toast({ message: `Đã xóa ${deleteTarget.kind}.`, type: "success" }); void loadAll();
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Lỗi.", type: "error" }); }
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

  const loadImportBatches = useCallback(async () => {
    if (!headers || !canManageContacts) return;
    setIsImportBatchesLoading(true);
    try {
      const data = await fetchJson<ContactImportBatchListResponse>(`${apiBaseUrl}/contacts/import-batches`, { headers });
      setImportBatches(data);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Không thể tải batch import.", type: "error" });
    } finally {
      setIsImportBatchesLoading(false);
    }
  }, [headers, canManageContacts, toast]);

  // Check Telegram auth status on mount
  useEffect(() => {
    void checkTgAuthStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checkTgAuthStatus]);

  useEffect(() => {
    if (!headers || !canManageContacts) return;
    void loadImportBatches();
  }, [headers, canManageContacts, loadImportBatches]);

  useEffect(() => {
    if (!headers || !canManageContacts) return;
    const hasRunningBatch = importBatches.some((batch) => batch.status === "QUEUED" || batch.status === "PROCESSING");
    if (!hasRunningBatch) return;

    const timer = setInterval(() => {
      void loadImportBatches();
    }, 4000);

    return () => clearInterval(timer);
  }, [headers, canManageContacts, importBatches, loadImportBatches]);

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
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.message || `HTTP ${res.status}`);
      }
      setTgAuthStatus({ authenticated: true });
      setQrError(null);
      toast({ message: "Đăng nhập Telegram bằng QR thành công.", type: "success" });
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Xác nhận QR thất bại");
      toast({ message: e instanceof Error ? e.message : "Xác nhận QR thất bại", type: "error" });
    }
  }

  async function handleTgLogout() {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await fetch(`${apiBaseUrl}/contacts/auth/session/reset`, { method: "POST", headers });
    } catch { /* ignore */ }
    setTgAuthStatus({ authenticated: false });
    setQrToken(null);
    setQrReady(false);
    setQrError(null);
    setPhoneAuthStep("phone");
    setPhoneAuthForm({ phoneNumber: "", phoneCode: "", password: "" });
  }

  async function startPhoneLogin() {
    setPhoneAuthLoading(true);
    setQrError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/phone/start`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phoneNumber: phoneAuthForm.phoneNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setPhoneAuthStep("code");
      toast({ message: "Đã gửi mã đăng nhập Telegram. Nhập mã OTP để tiếp tục.", type: "success" });
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Gửi mã đăng nhập thất bại");
    } finally {
      setPhoneAuthLoading(false);
    }
  }

  async function verifyPhoneCode() {
    setPhoneAuthLoading(true);
    setQrError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/phone/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phoneCode: phoneAuthForm.phoneCode }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; requiresPassword?: boolean; userId?: string };
      if (!res.ok) throw new Error((data as { message?: string; error?: string }).message || (data as { error?: string }).error || `HTTP ${res.status}`);
      if (data.requiresPassword) {
        setPhoneAuthStep("password");
        toast({ message: "Tài khoản bật 2FA. Nhập mật khẩu Telegram để hoàn tất.", type: "success" });
        return;
      }
      setTgAuthStatus({ authenticated: true });
      setPhoneAuthStep("phone");
      setPhoneAuthForm({ phoneNumber: "", phoneCode: "", password: "" });
      toast({ message: "Đăng nhập Telegram thành công.", type: "success" });
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Xác minh mã thất bại");
    } finally {
      setPhoneAuthLoading(false);
    }
  }

  async function verifyPhonePassword() {
    setPhoneAuthLoading(true);
    setQrError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/phone/password`, {
        method: "POST",
        headers,
        body: JSON.stringify({ password: phoneAuthForm.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setTgAuthStatus({ authenticated: true });
      setPhoneAuthStep("phone");
      setPhoneAuthForm({ phoneNumber: "", phoneCode: "", password: "" });
      toast({ message: "Đăng nhập Telegram thành công.", type: "success" });
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Xác minh mật khẩu 2FA thất bại");
    } finally {
      setPhoneAuthLoading(false);
    }
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
        toast({ message: "JSON phải là mảng contact hoặc file Telegram export có contacts.list hoặc frequent_contacts.list.", type: "error" });
        setImportLoading(false);
        return;
      }

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
      toast({ message: `Đã tạo batch ${data.batch?.id ?? ""}. Vào màn /contacts để theo dõi tiến độ.`, type: "success" });
      await loadImportBatches();
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Import thất bại.", type: "error" }); }
    finally { setImportLoading(false); }
  }

  async function handleBatchAction(
    batchId: string,
    action: "retry" | "cancel",
  ) {
    if (!headers) return;
    setActiveImportAction(`${action}:${batchId}`);
    try {
      await fetchJson(`${apiBaseUrl}/contacts/import-batches/${batchId}/${action}`, {
        method: "POST",
        headers,
      });
      toast({
        message: action === "retry" ? "Đã đưa các dòng lỗi về hàng chờ." : "Đã hủy batch import.",
        type: "success",
      });
      await loadImportBatches();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Thao tác batch thất bại.", type: "error" });
    } finally {
      setActiveImportAction(null);
    }
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
          Chọn một trong hai cách đăng nhập Telegram để resolve user ID từ số điện thoại: quét QR hoặc nhập số điện thoại + OTP + 2FA.
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
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTgLoginMode("phone")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${tgLoginMode === "phone" ? "bg-[color:var(--primary)] text-white" : "bg-white text-[color:var(--on-surface-variant)]"}`}
                >
                  Số điện thoại
                </button>
                <button
                  type="button"
                  onClick={() => setTgLoginMode("qr")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${tgLoginMode === "qr" ? "bg-[color:var(--primary)] text-white" : "bg-white text-[color:var(--on-surface-variant)]"}`}
                >
                  QR Code
                </button>
              </div>

              {tgLoginMode === "phone" ? (
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div className="rounded-[16px] bg-white px-5 py-4">
                    <p className="text-sm font-bold">Đăng nhập bằng số điện thoại</p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">Flow ổn định hơn QR: nhập số điện thoại, nhận mã OTP trên Telegram/SMS, sau đó nhập 2FA nếu tài khoản có bật.</p>

                    <div className="mt-4 space-y-3">
                      <input
                        value={phoneAuthForm.phoneNumber}
                        onChange={(e) => setPhoneAuthForm((current) => ({ ...current, phoneNumber: e.target.value }))}
                        placeholder="+84901234567"
                        className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                        disabled={phoneAuthStep !== "phone" || phoneAuthLoading}
                      />
                      <button
                        type="button"
                        onClick={() => void startPhoneLogin()}
                        disabled={phoneAuthLoading || !phoneAuthForm.phoneNumber.trim() || phoneAuthStep !== "phone"}
                        className="rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {phoneAuthLoading && phoneAuthStep === "phone" ? "Đang gửi mã..." : "Gửi mã đăng nhập"}
                      </button>

                      {phoneAuthStep === "code" ? (
                        <div className="space-y-3 border-t border-black/5 pt-3">
                          <input
                            value={phoneAuthForm.phoneCode}
                            onChange={(e) => setPhoneAuthForm((current) => ({ ...current, phoneCode: e.target.value }))}
                            placeholder="Nhập mã OTP"
                            className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                            disabled={phoneAuthLoading}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void verifyPhoneCode()}
                              disabled={phoneAuthLoading || !phoneAuthForm.phoneCode.trim()}
                              className="rounded-[16px] bg-[color:var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                            >
                              {phoneAuthLoading ? "Đang xác minh..." : "Xác minh mã"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPhoneAuthStep("phone")}
                              disabled={phoneAuthLoading}
                              className="rounded-[16px] bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold"
                            >
                              Đổi số
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {phoneAuthStep === "password" ? (
                        <div className="space-y-3 border-t border-black/5 pt-3">
                          <input
                            type="password"
                            value={phoneAuthForm.password}
                            onChange={(e) => setPhoneAuthForm((current) => ({ ...current, password: e.target.value }))}
                            placeholder="Nhập mật khẩu 2FA Telegram"
                            className="w-full rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3 text-sm outline-none"
                            disabled={phoneAuthLoading}
                          />
                          <button
                            type="button"
                            onClick={() => void verifyPhonePassword()}
                            disabled={phoneAuthLoading || !phoneAuthForm.password.trim()}
                            className="rounded-[16px] bg-[color:var(--primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                          >
                            {phoneAuthLoading ? "Đang xác minh..." : "Xác minh 2FA"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[16px] bg-white px-5 py-4">
                    <p className="text-sm font-bold">Lưu ý</p>
                    <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">Backend cần có <code>TELEGRAM_API_ID</code> và <code>TELEGRAM_API_HASH</code> trong file môi trường.</p>
                    <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">Mã OTP có thể đến trong app Telegram trước, không nhất thiết là SMS.</p>
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
          )}
        </div>
      </section>
      ) : null}

      {/* ===== CONTACTS IMPORT ===== */}
      {canManageContacts ? (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">Contacts</p>
            <h3 className="mt-1 text-xl font-black tracking-tight">Import danh bạ JSON</h3>
            <p className="mt-2 max-w-3xl text-sm text-[color:var(--on-surface-variant)]">
              Khu này gom cả flow của demo resolver: upload JSON Telegram export, tạo batch nền, theo dõi tiến độ xử lý, xem tỷ lệ resolved và thao tác retry/cancel ngay trong một màn hình.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!tgAuthStatus?.authenticated ? (
              <span className="rounded-full bg-[color:var(--warning-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--warning)]">
                Cần kết nối Telegram trước
              </span>
            ) : (
              <span className="rounded-full bg-[color:var(--success-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--success)]">
                Resolver sẵn sàng
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadImportBatches()}
              disabled={isImportBatchesLoading}
              className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {isImportBatchesLoading ? "Đang tải..." : "Tải lại batch"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <div className="rounded-[18px] bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Batch gần đây</p>
            <p className="mt-2 text-2xl font-black">{importBatches.length}</p>
          </div>
          <div className="rounded-[18px] bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Đang chạy</p>
            <p className="mt-2 text-2xl font-black">{importBatches.filter((batch) => batch.status === "QUEUED" || batch.status === "PROCESSING").length}</p>
          </div>
          <div className="rounded-[18px] bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Resolved</p>
            <p className="mt-2 text-2xl font-black">{importBatches.reduce((sum, batch) => sum + batch.resolvedCount, 0)}</p>
          </div>
          <div className="rounded-[18px] bg-white px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Failed</p>
            <p className="mt-2 text-2xl font-black">{importBatches.reduce((sum, batch) => sum + batch.failedCount, 0)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={handleImportContacts} className="rounded-[24px] bg-white px-5 py-5 shadow-[0_6px_18px_rgba(42,52,57,0.04)]">
            <p className="text-sm font-bold">Tạo batch import mới</p>
            <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">
              Hỗ trợ cả file Telegram export chuẩn và mảng contact JSON đã rút gọn.
            </p>
            <div className="mt-4">
              <input
                type="file"
                name="contactsFile"
                accept=".json"
                disabled={!tgAuthStatus?.authenticated}
                className="block w-full text-sm text-[color:var(--on-surface-variant)] file:mr-4 file:py-2 file:px-4 file:rounded-[14px] file:border-0 file:text-sm file:font-semibold file:bg-[color:var(--primary)] file:text-white hover:file:bg-[color:var(--primary-dim)] file:cursor-pointer cursor-pointer disabled:opacity-40"
              />
              <p className="mt-3 text-xs leading-6 text-[color:var(--on-surface-variant)]">
                JSON format: <code className="bg-[color:var(--surface-low)] px-1.5 py-0.5 rounded text-xs">{'[{"phone_number":"+84...","first_name":"Tên","last_name":"..."}]'}</code>, hoặc Telegram export có <code className="bg-[color:var(--surface-low)] px-1.5 py-0.5 rounded text-xs">contacts.list</code> / <code className="bg-[color:var(--surface-low)] px-1.5 py-0.5 rounded text-xs">frequent_contacts.list</code>.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!tgAuthStatus?.authenticated || importLoading}
                className="rounded-[16px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-6 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
              >
                {importLoading ? "Đang tạo batch..." : "Tạo batch import"}
              </button>
            </div>
          </form>

          <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_6px_18px_rgba(42,52,57,0.04)]">
            <p className="text-sm font-bold">Quy trình xử lý</p>
            <div className="mt-4 space-y-3 text-sm text-[color:var(--on-surface-variant)]">
              <div className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3">
                1. Parse file JSON và tách `contacts` / `frequent contacts`.
              </div>
              <div className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3">
                2. Worker nền lấy từng batch nhỏ để resolve Telegram ID.
              </div>
              <div className="rounded-[14px] bg-[color:var(--surface-low)] px-4 py-3">
                3. Ghi kết quả `resolved / skipped / failed` vào CRM để dùng lại cho những lần import sau.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] bg-[color:var(--surface-low)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">Recent Batches</p>
              <p className="text-xs text-[color:var(--on-surface-variant)]">Theo dõi trạng thái xử lý ngay trong settings, không cần chuyển màn khác.</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  <th className="px-4 py-3 font-semibold">Batch</th>
                  <th className="px-4 py-3 font-semibold">Nguồn</th>
                  <th className="px-4 py-3 font-semibold">Tiến độ</th>
                  <th className="px-4 py-3 font-semibold">Kết quả</th>
                  <th className="px-4 py-3 font-semibold">Thời gian</th>
                  <th className="px-4 py-3 font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {importBatches.map((batch, index) => (
                  <tr key={batch.id} className={index % 2 === 1 ? "bg-white/65" : ""}>
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-bold">{batch.sourceFileName || "Telegram import"}</p>
                      <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">#{batch.id.slice(0, 8)} · {batch.workspaceName || "No workspace"}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm">
                      <p>{batch.contactsCount} contacts</p>
                      <p className="mt-1 text-[color:var(--on-surface-variant)]">{batch.frequentCount} frequent</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="w-[220px]">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span
                            className={`rounded-full px-2.5 py-1 ${
                              batch.status === "COMPLETED"
                                ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                                : batch.status === "FAILED" || batch.status === "CANCELLED"
                                  ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                                  : "bg-white text-[color:var(--primary)]"
                            }`}
                          >
                            {batch.status}
                          </span>
                          <span>{getBatchProgressPercent(batch)}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)]"
                            style={{ width: `${getBatchProgressPercent(batch)}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">{batch.processedCount}/{batch.totalCount} dòng đã xử lý</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm">
                      <p>Resolved: <span className="font-bold">{batch.resolvedCount}</span></p>
                      <p className="mt-1">Skipped: <span className="font-bold">{batch.skippedCount}</span></p>
                      <p className="mt-1">Failed: <span className="font-bold">{batch.failedCount}</span></p>
                      {batch.errorMessage ? (
                        <p className="mt-2 text-xs text-[color:var(--danger)]">{batch.errorMessage}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                      <p>Tạo: {formatDateTime(batch.createdAt)}</p>
                      <p className="mt-1">Bắt đầu: {formatDateTime(batch.startedAt)}</p>
                      <p className="mt-1">Xong: {formatDateTime(batch.finishedAt)}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm">
                      <div className="flex flex-wrap gap-2">
                        {(batch.status === "FAILED" || batch.status === "CANCELLED") ? (
                          <button
                            type="button"
                            onClick={() => void handleBatchAction(batch.id, "retry")}
                            disabled={activeImportAction === `retry:${batch.id}`}
                            className="rounded-full bg-white px-4 py-2 font-semibold text-[color:var(--primary)] disabled:opacity-50"
                          >
                            {activeImportAction === `retry:${batch.id}` ? "Đang retry..." : "Retry"}
                          </button>
                        ) : null}
                        {(batch.status === "QUEUED" || batch.status === "PROCESSING") ? (
                          <button
                            type="button"
                            onClick={() => void handleBatchAction(batch.id, "cancel")}
                            disabled={activeImportAction === `cancel:${batch.id}`}
                            className="rounded-full bg-[color:var(--danger-soft)] px-4 py-2 font-semibold text-[color:var(--danger)] disabled:opacity-50"
                          >
                            {activeImportAction === `cancel:${batch.id}` ? "Đang hủy..." : "Hủy batch"}
                          </button>
                        ) : null}
                        <a
                          href={`${apiBaseUrl}/contacts/import-batches/${batch.id}/export`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-white px-4 py-2 font-semibold text-[color:var(--on-surface)]"
                        >
                          Export JSON
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {importBatches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[color:var(--on-surface-variant)]">
                      Chưa có batch import nào. Kết nối Telegram trước rồi upload file JSON để bắt đầu.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
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
