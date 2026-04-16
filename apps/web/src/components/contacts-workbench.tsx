"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/toast-context";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type AuthStatus = { authenticated: boolean };
type QrStartResult = { token: string; expiresIn: number };
type QrPollResult = { ready: boolean; token?: string; expiresIn?: number; authenticated?: boolean };
type PhoneLoginStartResult = { phoneNumber: string; sent: boolean; isCodeViaApp: boolean };
type PhoneLoginVerifyResult = { success: boolean; requiresPassword: boolean; userId?: string; username?: string };
type ContactImportBatch = {
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
type ContactImportItem = {
  id: string;
  kind: "CONTACT" | "FREQUENT";
  status: "PENDING" | "PROCESSING" | "RESOLVED" | "SKIPPED" | "FAILED";
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  telegramExternalId: string | null;
  telegramUsername: string | null;
  telegramType: string | null;
  rating: number | null;
  errorMessage: string | null;
  attemptCount: number;
  processedAt: string | null;
  createdAt: string;
  debugRequest?: unknown;
  debugResponse?: unknown;
};
type ContactImportItemsResponse = { items: ContactImportItem[]; page: number; pageSize: number; total: number; totalPages: number };
type ErrorWithMessage = { message?: string };

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as ErrorWithMessage).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN");
}

function formatStatusLabel(status: ContactImportBatch["status"] | ContactImportItem["status"]) {
  switch (status) {
    case "QUEUED": return "Đang chờ";
    case "PROCESSING": return "Đang xử lý";
    case "COMPLETED": return "Hoàn tất";
    case "FAILED": return "Thất bại";
    case "CANCELLED": return "Đã hủy";
    case "PENDING": return "Chờ xử lý";
    case "RESOLVED": return "Đã resolve";
    case "SKIPPED": return "Bỏ qua";
    default: return status;
  }
}

function statusClasses(status: ContactImportBatch["status"] | ContactImportItem["status"]) {
  switch (status) {
    case "COMPLETED":
    case "RESOLVED":
      return "bg-green-900 text-green-300";
    case "QUEUED":
    case "PENDING":
      return "bg-sky-900 text-sky-300";
    case "PROCESSING":
      return "bg-blue-900 text-blue-300";
    case "SKIPPED":
      return "bg-yellow-900 text-yellow-300";
    case "FAILED":
    case "CANCELLED":
      return "bg-red-900 text-red-300";
    default:
      return "bg-gray-800 text-gray-300";
  }
}

function progressPercent(batch: ContactImportBatch) {
  if (!batch.totalCount) return 0;
  return Math.min(100, Math.round((batch.processedCount / batch.totalCount) * 100));
}

function formatDebugValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ContactsWorkbench() {
  const { toast } = useToast();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [tab, setTab] = useState<"auth" | "import">("auth");
  const [loginMethod, setLoginMethod] = useState<"phone" | "qr">("phone");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState(0);
  const [qrReady, setQrReady] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [phoneAuthStep, setPhoneAuthStep] = useState<"phone" | "code" | "password">("phone");
  const [phoneAuthForm, setPhoneAuthForm] = useState({ phoneNumber: "", phoneCode: "", password: "" });
  const [phoneAuthLoading, setPhoneAuthLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [batches, setBatches] = useState<ContactImportBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState<ContactImportItemsResponse | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<"retry" | "cancel" | "export" | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchItemsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousAuthRef = useRef<boolean | null>(null);
  const authSuccessRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedBatchIdRef = useRef<string | null>(null);
  const itemsPageRef = useRef(1);

  const getHeaders = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem(authStorageKey) || ""}` }),
    [],
  );

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) ?? null, [batches, selectedBatchId]);
  const hasRunningBatch = useMemo(() => batches.some((batch) => batch.status === "QUEUED" || batch.status === "PROCESSING"), [batches]);
  const totals = useMemo(
    () => ({
      total: batches.length,
      running: batches.filter((batch) => batch.status === "QUEUED" || batch.status === "PROCESSING").length,
      resolved: batches.reduce((sum, batch) => sum + batch.resolvedCount, 0),
      failed: batches.reduce((sum, batch) => sum + batch.failedCount, 0),
    }),
    [batches],
  );

  const loadBatchItems = useCallback(async (batchId: string, page = 1, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setItemsLoading(true);
    }
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${batchId}/items?page=${page}&pageSize=20`, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ContactImportItemsResponse;
      setSelectedBatchItems(data);
      setItemsPage(page);
      itemsPageRef.current = page;
    } catch (error) {
      toast({ message: getErrorMessage(error, "Không tải được chi tiết batch"), type: "error" });
    } finally {
      if (!options?.silent) {
        setItemsLoading(false);
      }
    }
  }, [getHeaders, toast]);

  const loadBatches = useCallback(async (preserveSelected = true) => {
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches`, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ContactImportBatch[];
      setBatches(data);
      const currentSelectedBatchId = selectedBatchIdRef.current;
      const nextSelectedId =
        preserveSelected && currentSelectedBatchId && data.some((batch) => batch.id === currentSelectedBatchId)
          ? currentSelectedBatchId
          : data[0]?.id ?? null;
      if (nextSelectedId !== currentSelectedBatchId) {
        setSelectedBatchId(nextSelectedId);
        selectedBatchIdRef.current = nextSelectedId;
        if (nextSelectedId) {
          void loadBatchItems(nextSelectedId, preserveSelected ? itemsPageRef.current : 1);
        } else {
          setSelectedBatchItems(null);
        }
      } else if (!nextSelectedId) {
        setSelectedBatchItems(null);
      }
    } catch (error) {
      toast({ message: getErrorMessage(error, "Không tải được lịch sử import"), type: "error" });
    }
  }, [getHeaders, loadBatchItems, toast]);

  const handleAuthSuccess = useCallback((message: string) => {
    if (authSuccessRedirectRef.current) {
      clearTimeout(authSuccessRedirectRef.current);
      authSuccessRedirectRef.current = null;
    }

    setAuthStatus({ authenticated: true });
    previousAuthRef.current = true;
    setLoginError(null);
    setLoginSuccess(message);
    toast({ message, type: "success" });

    authSuccessRedirectRef.current = setTimeout(() => {
      setLoginSuccess(null);
      setTab("import");
      authSuccessRedirectRef.current = null;
    }, 1200);
  }, [toast]);

  const checkAuthStatus = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/status`, { headers: getHeaders() });
      if (!res.ok) return false;
      const data = (await res.json()) as AuthStatus;
      const previousAuth = previousAuthRef.current;
      previousAuthRef.current = data.authenticated;
      setAuthStatus(data);
      if (data.authenticated) {
        if (!loginSuccess) {
          setTab("import");
        }
      } else {
        setLoginSuccess(null);
        setTab("auth");
        if (previousAuth && !options?.silent) {
          toast({ message: "Session Telegram đã hết hạn. Hãy đăng nhập lại để tiếp tục.", type: "warning" });
        }
      }
      return data.authenticated;
    } catch {
      return false;
    }
  }, [getHeaders, loginSuccess, toast]);

  useEffect(() => {
    void checkAuthStatus({ silent: true });
    void loadBatches(false);
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      if (batchPollRef.current) clearInterval(batchPollRef.current);
      if (batchItemsPollRef.current) clearInterval(batchItemsPollRef.current);
      if (authPollRef.current) clearInterval(authPollRef.current);
      if (authSuccessRedirectRef.current) clearTimeout(authSuccessRedirectRef.current);
    };
  }, [checkAuthStatus, loadBatches]);

  useEffect(() => {
    selectedBatchIdRef.current = selectedBatchId;
  }, [selectedBatchId]);

  useEffect(() => {
    itemsPageRef.current = itemsPage;
  }, [itemsPage]);

  useEffect(() => {
    if (authPollRef.current) {
      clearInterval(authPollRef.current);
      authPollRef.current = null;
    }

    const pollAuthStatus = () => {
      if (document.visibilityState === "visible") {
        void checkAuthStatus();
      }
    };

    authPollRef.current = setInterval(pollAuthStatus, 10000);
    document.addEventListener("visibilitychange", pollAuthStatus);

    return () => {
      if (authPollRef.current) clearInterval(authPollRef.current);
      document.removeEventListener("visibilitychange", pollAuthStatus);
    };
  }, [checkAuthStatus]);

  useEffect(() => {
    if (batchPollRef.current) {
      clearInterval(batchPollRef.current);
      batchPollRef.current = null;
    }
    if (batchItemsPollRef.current) {
      clearInterval(batchItemsPollRef.current);
      batchItemsPollRef.current = null;
    }
    if (!hasRunningBatch) return;

    batchPollRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadBatches(true);
      }
    }, 4000);

    batchItemsPollRef.current = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        selectedBatch &&
        selectedBatchIdRef.current === selectedBatch.id &&
        (selectedBatch.status === "QUEUED" || selectedBatch.status === "PROCESSING")
      ) {
        void loadBatchItems(selectedBatch.id, itemsPageRef.current, { silent: true });
      }
    }, 2000);

    return () => {
      if (batchPollRef.current) clearInterval(batchPollRef.current);
      if (batchItemsPollRef.current) clearInterval(batchItemsPollRef.current);
    };
  }, [hasRunningBatch, loadBatchItems, loadBatches, selectedBatch]);

  const confirmQrLogin = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/confirm`, { headers: getHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as ErrorWithMessage).message || `HTTP ${res.status}`);
      handleAuthSuccess("Đăng nhập Telegram bằng QR thành công.");
    } catch (error) {
      setLoginError(getErrorMessage(error, "Không thể xác nhận phiên QR"));
    }
  }, [getHeaders, handleAuthSuccess]);

  const startQrPolling = useCallback(() => {
    if (qrPollRef.current) clearInterval(qrPollRef.current);
    qrPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/poll`, { headers: getHeaders() });
        if (!res.ok) {
          clearInterval(qrPollRef.current!);
          return;
        }
        const data = (await res.json()) as QrPollResult;
        setQrToken(data.token || null);
        setQrExpires(data.expiresIn || 0);
        if (data.ready) {
          setQrReady(true);
          clearInterval(qrPollRef.current!);
          await confirmQrLogin();
        }
      } catch {
        clearInterval(qrPollRef.current!);
      }
    }, 3000);
  }, [confirmQrLogin, getHeaders]);

  const startQrLogin = async () => {
    setQrLoading(true);
    setLoginError(null);
    setLoginSuccess(null);
    setQrToken(null);
    setQrReady(false);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/start`, { method: "POST", headers: getHeaders() });
      const data = (await res.json().catch(() => ({}))) as QrStartResult & { message?: string };
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setQrToken(data.token);
      setQrExpires(data.expiresIn);
      startQrPolling();
    } catch (error) {
      setLoginError(getErrorMessage(error, "Không thể tạo QR code"));
    } finally {
      setQrLoading(false);
    }
  };

  const startPhoneLogin = async () => {
    setPhoneAuthLoading(true);
    setLoginError(null);
    setLoginSuccess(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/phone/start`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ phoneNumber: phoneAuthForm.phoneNumber }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneLoginStartResult & { message?: string };
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setPhoneAuthStep("code");
      toast({
        message: data.isCodeViaApp ? "Mã xác thực đã được gửi trong app Telegram." : "Mã xác thực đã được gửi.",
        type: "success",
      });
    } catch (error) {
      setLoginError(getErrorMessage(error, "Không thể bắt đầu đăng nhập bằng số điện thoại"));
    } finally {
      setPhoneAuthLoading(false);
    }
  };

  const verifyPhoneCode = async () => {
    setPhoneAuthLoading(true);
    setLoginError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/phone/verify`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ phoneCode: phoneAuthForm.phoneCode }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneLoginVerifyResult & { message?: string };
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      if (data.requiresPassword) {
        setPhoneAuthStep("password");
        toast({ message: "Tài khoản này đang bật 2FA. Nhập mật khẩu để hoàn tất.", type: "warning" });
        return;
      }
      handleAuthSuccess("Đăng nhập Telegram bằng số điện thoại thành công.");
    } catch (error) {
      setLoginError(getErrorMessage(error, "Mã xác thực không hợp lệ"));
    } finally {
      setPhoneAuthLoading(false);
    }
  };

  const verifyPhonePassword = async () => {
    setPhoneAuthLoading(true);
    setLoginError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/phone/password`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ password: phoneAuthForm.password }),
      });
      const data = (await res.json().catch(() => ({}))) as PhoneLoginVerifyResult & { message?: string };
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      handleAuthSuccess("Xác thực 2FA thành công.");
    } catch (error) {
      setLoginError(getErrorMessage(error, "Mật khẩu 2FA không hợp lệ"));
    } finally {
      setPhoneAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (qrPollRef.current) clearInterval(qrPollRef.current);
    try {
      await fetch(`${apiBaseUrl}/contacts/auth/session/reset`, { method: "POST", headers: getHeaders() });
    } catch {
      // ignore
    }
    setAuthStatus({ authenticated: false });
    previousAuthRef.current = false;
    setQrToken(null);
    setQrReady(false);
    setPhoneAuthStep("phone");
    setPhoneAuthForm({ phoneNumber: "", phoneCode: "", password: "" });
    setLoginError(null);
    setLoginSuccess(null);
    setTab("auth");
  };

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImportLoading(true);
    try {
      const form = event.currentTarget;
      const fileInput = form.elements.namedItem("contactsFile") as HTMLInputElement;
      if (!fileInput.files?.[0]) return;
      const authenticated = await checkAuthStatus({ silent: true });
      if (!authenticated) {
        toast({ message: "Session Telegram đã hết hạn. Đăng nhập lại rồi import tiếp.", type: "warning" });
        setTab("auth");
        return;
      }
      const file = fileInput.files[0];
      const payload = JSON.parse(await file.text()) as unknown;
      const res = await fetch(`${apiBaseUrl}/contacts/import`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ fileName: file.name, payload }),
      });
      const data = (await res.json()) as { error?: string; message?: string; batch?: ContactImportBatch };
      if (!res.ok || data.error || !data.batch) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ message: "Đã tạo batch import. Hệ thống sẽ xử lý nền theo từng lô.", type: "success" });
      setSelectedBatchId(data.batch.id);
      setTab("import");
      form.reset();
      await loadBatches(false);
    } catch (error) {
      toast({ message: getErrorMessage(error, "Import thất bại"), type: "error" });
    } finally {
      setImportLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!selectedBatchId) return;
    setActionLoading("retry");
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${selectedBatchId}/retry`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ message: data.message || "Đã đưa các item lỗi về hàng chờ.", type: "success" });
      await loadBatches(false);
    } catch (error) {
      toast({ message: getErrorMessage(error, "Retry thất bại"), type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelBatch = async () => {
    if (!selectedBatchId) return;
    setActionLoading("cancel");
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${selectedBatchId}/cancel`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ message: data.message || "Đã hủy batch.", type: "success" });
      await loadBatches(false);
    } catch (error) {
      toast({ message: getErrorMessage(error, "Hủy batch thất bại"), type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportBatch = async () => {
    if (!selectedBatchId) return;
    setActionLoading("export");
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${selectedBatchId}/export`, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { batch: ContactImportBatch; items: ContactImportItem[] };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${data.batch.sourceFileName || "contact-import"}-${data.batch.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ message: "Đã tải JSON kết quả batch.", type: "success" });
    } catch (error) {
      toast({ message: getErrorMessage(error, "Export thất bại"), type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const renderQrImage = (token: string) => {
    const loginUrl = `tg://login?token=${token}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(loginUrl)}`;
    return <Image src={qrApiUrl} alt="Telegram QR Code" width={220} height={220} unoptimized style={{ imageRendering: "pixelated" }} />;
  };

  const authPanel = authStatus?.authenticated ? (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Telegram đã kết nối</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Session MTProto hiện đã được lưu. Tất cả batch import trong màn Contacts này sẽ dùng session đó để resolve số điện thoại sang Telegram ID.
          </p>
        </div>
        <div className="rounded-full bg-green-950 px-4 py-2 text-sm font-semibold text-green-300">Connected</div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4"><p className="text-xs uppercase tracking-[0.16em] text-gray-500">Batch gần đây</p><p className="mt-2 text-2xl font-bold text-white">{totals.total}</p></div>
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4"><p className="text-xs uppercase tracking-[0.16em] text-gray-500">Đang chạy</p><p className="mt-2 text-2xl font-bold text-blue-300">{totals.running}</p></div>
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4"><p className="text-xs uppercase tracking-[0.16em] text-gray-500">Resolved</p><p className="mt-2 text-2xl font-bold text-green-400">{totals.resolved}</p></div>
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4"><p className="text-xs uppercase tracking-[0.16em] text-gray-500">Failed</p><p className="mt-2 text-2xl font-bold text-red-400">{totals.failed}</p></div>
      </div>
    </div>
  ) : (
    <div className="mx-auto max-w-4xl rounded-2xl border border-gray-800 bg-gray-900 p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Kết nối Telegram ngay trong Contacts</h2>
          <p className="mt-2 text-sm text-gray-400">Không cần qua settings. Toàn bộ luồng đăng nhập và import giờ nằm chung ở màn <code>/contacts</code>.</p>
        </div>
        <div className="rounded-full bg-gray-950 px-4 py-2 text-xs font-semibold text-gray-300">Resolver chưa sẵn sàng</div>
      </div>
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-950 p-1">
        <button type="button" onClick={() => setLoginMethod("phone")} className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${loginMethod === "phone" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>Số điện thoại</button>
        <button type="button" onClick={() => setLoginMethod("qr")} className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${loginMethod === "qr" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>QR Code</button>
      </div>
      {loginSuccess ? <div className="mb-5 rounded-lg border border-green-800 bg-green-950/30 px-4 py-3 text-sm text-green-300">{loginSuccess} Đang chuyển sang màn batch...</div> : null}
      {loginError ? <div className="mb-5 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">{loginError}</div> : null}
      {loginMethod === "phone" ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-5"><p className="text-sm font-semibold text-white">Đăng nhập bằng số điện thoại</p><p className="mt-2 text-sm text-gray-400">Flow này ổn định hơn khi QR bị lỗi. Hệ thống hỗ trợ đủ OTP và mật khẩu 2FA.</p></div>
            <div><label className="mb-2 block text-sm text-gray-400">Số điện thoại Telegram</label><input type="text" value={phoneAuthForm.phoneNumber} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+84901234567" className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500" /></div>
            <button type="button" onClick={() => void startPhoneLogin()} disabled={phoneAuthLoading || !phoneAuthForm.phoneNumber.trim() || phoneAuthStep !== "phone"} className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">{phoneAuthLoading && phoneAuthStep === "phone" ? "Đang gửi mã..." : "Gửi mã OTP"}</button>
            {phoneAuthStep === "code" || phoneAuthStep === "password" ? <div className="rounded-xl border border-gray-800 bg-gray-950 p-5"><label className="mb-2 block text-sm text-gray-400">Mã xác thực</label><input type="text" value={phoneAuthForm.phoneCode} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, phoneCode: event.target.value }))} placeholder="Nhập OTP" className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500" /><button type="button" onClick={() => void verifyPhoneCode()} disabled={phoneAuthLoading || !phoneAuthForm.phoneCode.trim() || phoneAuthStep !== "code"} className="mt-3 w-full rounded-lg bg-white px-6 py-3 text-sm font-medium text-gray-950 transition-colors hover:bg-gray-200 disabled:opacity-50">{phoneAuthLoading && phoneAuthStep === "code" ? "Đang xác thực..." : "Xác nhận OTP"}</button></div> : null}
            {phoneAuthStep === "password" ? <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-5"><label className="mb-2 block text-sm text-amber-200">Mật khẩu 2FA</label><input type="password" value={phoneAuthForm.password} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="Nhập mật khẩu hai lớp" className="w-full rounded-lg border border-amber-900 bg-gray-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-500" /><button type="button" onClick={() => void verifyPhonePassword()} disabled={phoneAuthLoading || !phoneAuthForm.password.trim()} className="mt-3 w-full rounded-lg bg-amber-500 px-6 py-3 text-sm font-medium text-gray-950 transition-colors hover:bg-amber-400 disabled:opacity-50">{phoneAuthLoading ? "Đang xác minh 2FA..." : "Hoàn tất đăng nhập"}</button></div> : null}
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-5"><p className="text-sm font-semibold text-white">Lưu ý</p><ul className="mt-3 space-y-3 text-sm text-gray-400"><li>OTP có thể được gửi trong app Telegram trước, không nhất thiết là SMS.</li><li>Nếu tài khoản bật xác thực hai lớp, bạn sẽ thấy bước nhập mật khẩu 2FA ngay trên màn này.</li><li>Sau khi đăng nhập xong, màn Contacts sẽ chuyển thẳng sang khu import batch.</li></ul></div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-5"><p className="text-sm font-semibold text-white">Đăng nhập bằng QR</p><p className="mt-2 text-sm text-gray-400">Quét QR bằng app Telegram để lưu session nhanh. Nếu QR có vấn đề, bạn có thể chuyển sang login bằng số điện thoại ngay phía trên.</p></div>
          {!qrToken ? <div className="text-center"><button onClick={startQrLogin} disabled={qrLoading} className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">{qrLoading ? "Generating QR..." : "Generate QR Code"}</button></div> : <div className="space-y-4 text-center"><div className="flex justify-center"><div className="rounded-xl bg-white p-4">{renderQrImage(qrToken)}</div></div><div className="text-sm text-gray-400">Expires in <span className="font-mono text-white">{qrExpires}s</span></div>{qrReady ? <div className="rounded-lg border border-green-800 bg-green-950/30 px-4 py-2 text-sm text-green-300">QR code scanned. Confirming session...</div> : null}<button onClick={() => { setQrToken(null); void startQrLogin(); }} className="text-sm text-gray-400 transition-colors hover:text-white">Regenerate QR Code</button></div>}
        </div>
      )}
    </div>
  );

  const importPanel = (
    <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">Tạo batch import mới</h2>
          <p className="mt-2 text-sm text-gray-400">Hỗ trợ Telegram export chuẩn với <code>contacts.list</code>, <code>frequent_contacts.list</code> hoặc mảng contact JSON rút gọn.</p>
          <form onSubmit={handleImport} className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-gray-400">Upload file JSON</label>
              <input type="file" name="contactsFile" accept=".json" className="block w-full cursor-pointer text-sm text-gray-400 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700" />
            </div>
            <div className="rounded-lg bg-gray-950 p-4 text-xs text-gray-500">
              <p>1. Parse file JSON và tách contacts / frequent contacts.</p>
              <p className="mt-1">2. Worker nền resolve Telegram ID theo từng lô.</p>
              <p className="mt-1">3. Ghi kết quả resolved / skipped / failed để export hoặc retry.</p>
            </div>
            <button type="submit" disabled={importLoading} className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">{importLoading ? "Đang tạo batch..." : "Tạo batch import"}</button>
          </form>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-white">Recent Batches</h2><p className="text-sm text-gray-500">Chọn một batch để xem tiến độ và chi tiết item.</p></div>
            <button type="button" onClick={() => void loadBatches(false)} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200">Tải lại</button>
          </div>
          <div className="mt-5 max-h-[540px] space-y-3 overflow-y-auto">
            {batches.length === 0 ? <p className="text-sm text-gray-500">Chưa có batch import nào.</p> : batches.map((batch) => (
              <button key={batch.id} type="button" onClick={() => { setSelectedBatchId(batch.id); void loadBatchItems(batch.id, 1); }} className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedBatchId === batch.id ? "border-blue-500 bg-blue-950/30" : "border-gray-800 bg-gray-950 hover:bg-gray-800/60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-semibold text-white">{batch.sourceFileName || "telegram_export.json"}</p><p className="mt-1 text-xs text-gray-500">#{batch.id.slice(0, 8)} · {formatDateTime(batch.createdAt)}</p></div>
                  <span className={`rounded px-2 py-1 text-[11px] font-semibold ${statusClasses(batch.status)}`}>{formatStatusLabel(batch.status)}</span>
                </div>
                <div className="mt-4"><div className="mb-2 flex items-center justify-between text-xs text-gray-400"><span>{batch.processedCount}/{batch.totalCount} dòng</span><span>{progressPercent(batch)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${progressPercent(batch)}%` }} /></div></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400"><div>Contacts: <span className="text-white">{batch.contactsCount}</span></div><div>Frequent: <span className="text-white">{batch.frequentCount}</span></div><div>Resolved: <span className="text-green-300">{batch.resolvedCount}</span></div><div>Failed: <span className="text-red-300">{batch.failedCount}</span></div></div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><h2 className="text-lg font-semibold text-white">Chi tiết batch</h2><p className="text-sm text-gray-500">Tiến độ hiện tại, thông tin nguồn và thao tác retry/cancel/export.</p></div>
            {selectedBatch ? <div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-1 text-xs font-semibold ${statusClasses(selectedBatch.status)}`}>{formatStatusLabel(selectedBatch.status)}</span><button type="button" onClick={() => void handleExportBatch()} disabled={actionLoading !== null} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 disabled:opacity-40">{actionLoading === "export" ? "Đang tải..." : "Tải JSON"}</button><button type="button" onClick={() => void handleRetryFailed()} disabled={actionLoading !== null || selectedBatch.failedCount === 0} className="rounded-lg bg-amber-900/70 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-40">{actionLoading === "retry" ? "Đang retry..." : "Retry lỗi"}</button><button type="button" onClick={() => void handleCancelBatch()} disabled={actionLoading !== null || !["QUEUED", "PROCESSING"].includes(selectedBatch.status)} className="rounded-lg bg-red-900/70 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-40">{actionLoading === "cancel" ? "Đang hủy..." : "Hủy batch"}</button></div> : null}
          </div>
          {!selectedBatch ? <p className="mt-6 text-sm text-gray-500">Chọn một batch ở cột trái để xem chi tiết.</p> : <>
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-gray-800 p-4 text-center"><div className="text-2xl font-bold text-white">{selectedBatch.totalCount}</div><div className="text-sm text-gray-400">Tổng</div></div>
              <div className="rounded-lg bg-gray-800 p-4 text-center"><div className="text-2xl font-bold text-blue-300">{selectedBatch.processedCount}</div><div className="text-sm text-gray-400">Đã xử lý</div></div>
              <div className="rounded-lg bg-gray-800 p-4 text-center"><div className="text-2xl font-bold text-green-400">{selectedBatch.resolvedCount}</div><div className="text-sm text-gray-400">Resolved</div></div>
              <div className="rounded-lg bg-gray-800 p-4 text-center"><div className="text-2xl font-bold text-red-400">{selectedBatch.failedCount}</div><div className="text-sm text-gray-400">Failed</div></div>
            </div>
            <div className="mt-5 grid gap-2 text-sm text-gray-400 md:grid-cols-2"><p>Workspace: <span className="text-white">{selectedBatch.workspaceName || "-"}</span></p><p>File: <span className="text-white">{selectedBatch.sourceFileName || "-"}</span></p><p>Bắt đầu: <span className="text-white">{formatDateTime(selectedBatch.startedAt)}</span></p><p>Kết thúc: <span className="text-white">{formatDateTime(selectedBatch.finishedAt)}</span></p></div>
            {selectedBatch.errorMessage ? <div className="mt-4 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">Lỗi batch: {selectedBatch.errorMessage}</div> : null}
          </>}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-white">Items</h2><p className="text-sm text-gray-500">Danh sách contact / frequent contact trong batch được chọn.</p></div>
            {selectedBatchItems ? <div className="flex items-center gap-2"><button type="button" disabled={itemsPage <= 1 || itemsLoading || !selectedBatchId} onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage - 1)} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Prev</button><span className="text-xs text-gray-400">Trang {selectedBatchItems.page}/{selectedBatchItems.totalPages}</span><button type="button" disabled={itemsPage >= selectedBatchItems.totalPages || itemsLoading || !selectedBatchId} onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage + 1)} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Next</button></div> : null}
          </div>
          {itemsLoading ? <p className="mt-6 text-sm text-gray-500">Đang tải items...</p> : !selectedBatchItems || selectedBatchItems.items.length === 0 ? <p className="mt-6 text-sm text-gray-500">Chưa có item để hiển thị.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-800 text-gray-400"><th className="px-3 py-2 text-left">Loại</th><th className="px-3 py-2 text-left">Phone / ID</th><th className="px-3 py-2 text-left">Tên</th><th className="px-3 py-2 text-left">Username</th><th className="px-3 py-2 text-left">Trạng thái</th><th className="px-3 py-2 text-left">Lỗi</th><th className="px-3 py-2 text-left">Request</th><th className="px-3 py-2 text-left">Response</th></tr></thead><tbody>{selectedBatchItems.items.map((item) => <tr key={item.id} className="border-b border-gray-800/50 align-top hover:bg-gray-800/30"><td className="px-3 py-2"><span className="rounded bg-gray-800 px-2 py-0.5 text-xs font-semibold text-gray-200">{item.kind === "FREQUENT" ? "Frequent" : "Contact"}</span></td><td className="px-3 py-2 font-mono text-xs">{item.kind === "FREQUENT" ? item.telegramExternalId || "-" : item.phoneNumber || "-"}</td><td className="px-3 py-2">{item.displayName || "-"}</td><td className="px-3 py-2">{item.telegramUsername || item.telegramType || "-"}</td><td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClasses(item.status)}`}>{formatStatusLabel(item.status)}</span></td><td className="px-3 py-2 text-xs text-red-400">{item.errorMessage || "-"}</td><td className="px-3 py-2"><pre className="max-w-xs overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-950 p-2 text-[11px] text-gray-300">{formatDebugValue(item.debugRequest)}</pre></td><td className="px-3 py-2"><pre className="max-w-xs overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-950 p-2 text-[11px] text-cyan-300">{formatDebugValue(item.debugResponse)}</pre></td></tr>)}</tbody></table></div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div><h1 className="text-xl font-bold text-white">Contacts Resolver</h1><p className="text-sm text-gray-400">Đăng nhập Telegram, import Telegram export JSON, theo dõi batch resolve và xem item chi tiết ngay trong một màn.</p></div>
          {authStatus?.authenticated ? <button onClick={handleLogout} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700">Tạo session mới</button> : null}
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-6">
        <a
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-100 transition-colors hover:bg-gray-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Quay lại Dashboard
        </a>
        {hasRunningBatch ? <div className="mb-6 flex items-center justify-between rounded-lg border border-blue-800 bg-blue-950 px-4 py-3 text-sm text-blue-200"><span>Đang có batch xử lý nền. Bạn có thể rời trang, hệ thống vẫn tiếp tục chạy.</span><span className="rounded-full bg-blue-900 px-3 py-1 text-xs font-semibold">PROCESSING</span></div> : null}
        {authStatus?.authenticated ? <>
          <div className="mb-6 flex gap-1 rounded-lg bg-gray-900 p-1 w-fit"><button onClick={() => setTab("import")} className={`rounded-md px-4 py-2 text-sm transition-colors ${tab === "import" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>Import & Batches</button><button onClick={() => setTab("auth")} className={`rounded-md px-4 py-2 text-sm transition-colors ${tab === "auth" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>Telegram Session</button></div>
          {tab === "auth" ? authPanel : importPanel}
        </> : authPanel}
      </div>
    </div>
  );
}
