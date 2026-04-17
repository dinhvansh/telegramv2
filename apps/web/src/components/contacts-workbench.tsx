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

function displayStatus(status: ContactImportBatch["status"] | ContactImportItem["status"]) {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "PROCESSING":
      return "Processing";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    case "PENDING":
      return "Pending";
    case "RESOLVED":
      return "Resolved";
    case "SKIPPED":
      return "Skipped";
    default:
      return status;
  }
}

function statusTone(status: ContactImportBatch["status"] | ContactImportItem["status"]) {
  switch (status) {
    case "COMPLETED":
    case "RESOLVED":
      return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
    case "QUEUED":
    case "PENDING":
      return "bg-[color:var(--primary-soft)] text-[color:var(--primary)]";
    case "PROCESSING":
      return "bg-sky-100 text-sky-700";
    case "SKIPPED":
      return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
    case "FAILED":
    case "CANCELLED":
      return "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
    default:
      return "bg-[color:var(--surface-low)] text-[color:var(--on-surface-variant)]";
  }
}

function progressPercent(batch: ContactImportBatch) {
  if (!batch.totalCount) return 0;
  return Math.min(100, Math.round((batch.processedCount / batch.totalCount) * 100));
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
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", file.name);
      const res = await fetch(`${apiBaseUrl}/contacts/import`, {
        method: "POST",
        headers: {
          Authorization: getHeaders().Authorization,
        },
        body: formData,
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

  const handleExportBatchExcel = async () => {
    if (!selectedBatchId) return;
    setActionLoading("export");
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${selectedBatchId}/export?format=xlsx`, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const fileName = selectedBatch?.sourceFileName || "contact-import";
      anchor.download = `${fileName}-${selectedBatchId}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ message: "Đã tải Excel kết quả batch.", type: "success" });
    } catch (error) {
      toast({ message: getErrorMessage(error, "Export Excel thất bại"), type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const renderQrImage = (token: string) => {
    const loginUrl = `tg://login?token=${token}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(loginUrl)}`;
    return (
      <Image
        src={qrApiUrl}
        alt="Telegram QR Code"
        width={220}
        height={220}
        unoptimized
        style={{ imageRendering: "pixelated" }}
      />
    );
  };

  const authPanel = authStatus?.authenticated ? (
    <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-[color:var(--success-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--success)]">
            Telegram session active
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
            Contacts resolver is ready
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            The current MTProto session is already stored. Every import batch in this screen reuses it to resolve
            phone numbers into Telegram IDs.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex rounded-full border border-[color:var(--outline)]/70 bg-white px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]"
        >
          Create new session
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Batches</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[color:var(--on-surface)]">{totals.total}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Running</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-sky-700">{totals.running}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Resolved</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[color:var(--success)]">{totals.resolved}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Failed</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[color:var(--danger)]">{totals.failed}</p>
        </div>
      </div>
    </section>
  ) : (
    <section className="mx-auto max-w-5xl rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">
            Telegram auth
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
            Connect Telegram inside Contacts
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            Login and import now live in the same workspace screen. No separate settings flow is required.
          </p>
        </div>
        <span className="inline-flex rounded-full bg-[color:var(--surface-low)] px-3 py-1 text-xs font-semibold text-[color:var(--on-surface-variant)]">
          Session required
        </span>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] p-1">
        <button type="button" onClick={() => setLoginMethod('phone')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          loginMethod === 'phone'
            ? 'bg-[color:var(--primary)] text-white shadow-sm'
            : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'
        }`}>Phone</button>
        <button type="button" onClick={() => setLoginMethod('qr')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          loginMethod === 'qr'
            ? 'bg-[color:var(--primary)] text-white shadow-sm'
            : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'
        }`}>QR code</button>
      </div>

      {loginSuccess ? <div className="mt-5 rounded-[20px] border border-[color:var(--success)]/20 bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">{loginSuccess} Redirecting to batches...</div> : null}
      {loginError ? <div className="mt-5 rounded-[20px] border border-[color:var(--danger)]/20 bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">{loginError}</div> : null}

      {loginMethod === 'phone' ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-5">
            <p className="text-sm font-semibold text-[color:var(--on-surface)]">Login with phone number</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Use this flow when QR is unavailable. OTP and 2FA are handled directly in this screen.</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--on-surface)]">Telegram phone number</label>
                <input type="text" value={phoneAuthForm.phoneNumber} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+84901234567" className="w-full rounded-[18px] border border-[color:var(--outline)]/70 bg-white px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]" />
              </div>
              <button type="button" onClick={() => void startPhoneLogin()} disabled={phoneAuthLoading || !phoneAuthForm.phoneNumber.trim() || phoneAuthStep !== 'phone'} className="w-full rounded-[18px] bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{phoneAuthLoading && phoneAuthStep === 'phone' ? 'Sending OTP...' : 'Send OTP'}</button>
              {(phoneAuthStep === 'code' || phoneAuthStep === 'password') ? (
                <div className="rounded-[22px] border border-[color:var(--outline)]/60 bg-white p-4">
                  <label className="mb-2 block text-sm font-medium text-[color:var(--on-surface)]">Verification code</label>
                  <input type="text" value={phoneAuthForm.phoneCode} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, phoneCode: event.target.value }))} placeholder="Enter OTP" className="w-full rounded-[16px] border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]" />
                  <button type="button" onClick={() => void verifyPhoneCode()} disabled={phoneAuthLoading || !phoneAuthForm.phoneCode.trim() || phoneAuthStep !== 'code'} className="mt-3 w-full rounded-[16px] border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-50">{phoneAuthLoading && phoneAuthStep === 'code' ? 'Verifying...' : 'Confirm OTP'}</button>
                </div>
              ) : null}
              {phoneAuthStep === 'password' ? (
                <div className="rounded-[22px] border border-[color:var(--warning)]/20 bg-[color:var(--warning-soft)] p-4">
                  <label className="mb-2 block text-sm font-medium text-[color:var(--warning)]">2FA password</label>
                  <input type="password" value={phoneAuthForm.password} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="Enter your password" className="w-full rounded-[16px] border border-[color:var(--warning)]/25 bg-white px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--warning)]" />
                  <button type="button" onClick={() => void verifyPhonePassword()} disabled={phoneAuthLoading || !phoneAuthForm.password.trim()} className="mt-3 w-full rounded-[16px] bg-[color:var(--warning)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{phoneAuthLoading ? 'Checking 2FA...' : 'Finish login'}</button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-[28px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-5">
            <p className="text-sm font-semibold text-[color:var(--on-surface)]">Notes</p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
              <li>OTP can arrive in Telegram app first, not necessarily by SMS.</li>
              <li>If the account uses 2FA, the password step appears in the same panel.</li>
              <li>After login completes, this page switches straight to batch import.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
          <div className="rounded-[28px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-5">
            <p className="text-sm font-semibold text-[color:var(--on-surface)]">Login with QR</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Scan the code from Telegram to store the session quickly. If QR has issues, switch back to phone login above.</p>
          </div>
          {!qrToken ? (
            <div className="flex justify-center">
              <button onClick={startQrLogin} disabled={qrLoading} className="rounded-full bg-[color:var(--primary)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{qrLoading ? 'Generating QR...' : 'Generate QR code'}</button>
            </div>
          ) : (
            <div className="rounded-[28px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-6 text-center">
              <div className="flex justify-center"><div className="rounded-[24px] bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">{renderQrImage(qrToken)}</div></div>
              <p className="mt-4 text-sm text-[color:var(--on-surface-variant)]">Expires in <span className="font-mono font-semibold text-[color:var(--on-surface)]">{qrExpires}s</span></p>
              {qrReady ? <div className="mt-4 rounded-[18px] border border-[color:var(--success)]/20 bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">QR scanned. Confirming session...</div> : null}
              <button onClick={() => { setQrToken(null); void startQrLogin(); }} className="mt-4 text-sm font-semibold text-[color:var(--primary)] transition hover:opacity-80">Regenerate QR code</button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  const importPanel = (
    <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <span className="inline-flex rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">New import</span>
          <h2 className="mt-4 text-xl font-black tracking-tight text-[color:var(--on-surface)]">Create a new batch</h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">Upload a Telegram export JSON and run resolve in the same workspace.</p>
          <form onSubmit={handleImport} className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--on-surface)]">JSON file</label>
              <input type="file" name="contactsFile" accept=".json" className="block w-full cursor-pointer rounded-[18px] border border-dashed border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-4 text-sm text-[color:var(--on-surface-variant)] file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-[color:var(--primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
            </div>
            <div className="rounded-[22px] bg-[color:var(--surface-low)] p-4 text-sm leading-6 text-[color:var(--on-surface-variant)]">
              <p>1. Parse JSON and split contact data.</p>
              <p>2. Resolve Telegram IDs in background.</p>
              <p>3. Review result status, retry failures, or export the batch.</p>
            </div>
            <button type="submit" disabled={importLoading} className="w-full rounded-[18px] bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{importLoading ? 'Creating batch...' : 'Create import batch'}</button>
          </form>
        </section>

        <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-[color:var(--on-surface)]">Recent batches</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Pick a batch to inspect progress and items.</p>
            </div>
            <button type="button" onClick={() => void loadBatches(false)} className="rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]">Refresh</button>
          </div>
          <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {batches.length === 0 ? <p className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]">No import batch yet.</p> : batches.map((batch) => (
              <button key={batch.id} type="button" onClick={() => { setSelectedBatchId(batch.id); void loadBatchItems(batch.id, 1); }} className={`w-full rounded-[24px] border p-4 text-left transition ${
                selectedBatchId === batch.id
                  ? 'border-[color:var(--primary)] bg-[color:var(--primary-soft)]/60'
                  : 'border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] hover:border-[color:var(--primary)]/50'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[color:var(--on-surface)]">{batch.sourceFileName || 'telegram_export.json'}</p>
                    <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">#{batch.id.slice(0, 8)} ? {formatDateTime(batch.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusTone(batch.status)}`}>{displayStatus(batch.status)}</span>
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--on-surface-variant)]"><span>{batch.processedCount}/{batch.totalCount} rows</span><span>{progressPercent(batch)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-[color:var(--primary)] to-sky-400" style={{ width: `${progressPercent(batch)}%` }} /></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[color:var(--on-surface-variant)]">
                  <div>Contacts: <span className="font-semibold text-[color:var(--on-surface)]">{batch.contactsCount}</span></div>
                  <div>Frequent: <span className="font-semibold text-[color:var(--on-surface)]">{batch.frequentCount}</span></div>
                  <div>Resolved: <span className="font-semibold text-[color:var(--success)]">{batch.resolvedCount}</span></div>
                  <div>Failed: <span className="font-semibold text-[color:var(--danger)]">{batch.failedCount}</span></div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-[color:var(--on-surface)]">Batch details</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Progress, source info, and batch actions stay in one panel.</p>
            </div>
            {selectedBatch ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(selectedBatch.status)}`}>{displayStatus(selectedBatch.status)}</span>
                <button type="button" onClick={() => void handleExportBatch()} disabled={actionLoading !== null} className="rounded-full border border-[color:var(--outline)]/70 bg-white px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'export' ? 'Exporting...' : 'Export JSON'}</button>
                <button type="button" onClick={() => void handleExportBatchExcel()} disabled={actionLoading !== null || !['COMPLETED', 'FAILED', 'CANCELLED'].includes(selectedBatch.status)} className="rounded-full bg-[color:var(--success-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--success)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'export' ? 'Exporting...' : 'Export Excel'}</button>
                <button type="button" onClick={() => void handleRetryFailed()} disabled={actionLoading !== null || selectedBatch.failedCount === 0} className="rounded-full bg-[color:var(--warning-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--warning)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'retry' ? 'Retrying...' : 'Retry failed'}</button>
                <button type="button" onClick={() => void handleCancelBatch()} disabled={actionLoading !== null || !['QUEUED', 'PROCESSING'].includes(selectedBatch.status)} className="rounded-full bg-[color:var(--danger-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--danger)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel batch'}</button>
              </div>
            ) : null}
          </div>
          {!selectedBatch ? <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]">Select a batch from the left column to see details.</div> : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-[22px] bg-[color:var(--surface-low)] p-4 text-center"><div className="text-3xl font-black tracking-tight text-[color:var(--on-surface)]">{selectedBatch.totalCount}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Total</div></div>
                <div className="rounded-[22px] bg-[color:var(--surface-low)] p-4 text-center"><div className="text-3xl font-black tracking-tight text-sky-700">{selectedBatch.processedCount}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Processed</div></div>
                <div className="rounded-[22px] bg-[color:var(--surface-low)] p-4 text-center"><div className="text-3xl font-black tracking-tight text-[color:var(--success)]">{selectedBatch.resolvedCount}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Resolved</div></div>
                <div className="rounded-[22px] bg-[color:var(--surface-low)] p-4 text-center"><div className="text-3xl font-black tracking-tight text-[color:var(--danger)]">{selectedBatch.failedCount}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Failed</div></div>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Workspace</p><p className="mt-2 font-medium text-[color:var(--on-surface)]">{selectedBatch.workspaceName || '-'}</p></div>
                <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">File</p><p className="mt-2 font-medium text-[color:var(--on-surface)]">{selectedBatch.sourceFileName || '-'}</p></div>
                <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Started at</p><p className="mt-2 font-medium text-[color:var(--on-surface)]">{formatDateTime(selectedBatch.startedAt)}</p></div>
                <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Finished at</p><p className="mt-2 font-medium text-[color:var(--on-surface)]">{formatDateTime(selectedBatch.finishedAt)}</p></div>
              </div>
              {selectedBatch.errorMessage ? <div className="mt-4 rounded-[22px] border border-[color:var(--danger)]/20 bg-[color:var(--danger-soft)] px-4 py-4 text-sm text-[color:var(--danger)]">Batch error: {selectedBatch.errorMessage}</div> : null}
            </>
          )}
        </section>

        <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-[color:var(--on-surface)]">Batch items</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Review contact rows and Telegram resolution output.</p>
            </div>
            {selectedBatchItems ? (
              <div className="flex items-center gap-2">
                <button type="button" disabled={itemsPage <= 1 || itemsLoading || !selectedBatchId} onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage - 1)} className="rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-40">Prev</button>
                <span className="text-xs font-medium text-[color:var(--on-surface-variant)]">Page {selectedBatchItems.page}/{selectedBatchItems.totalPages}</span>
                <button type="button" disabled={itemsPage >= selectedBatchItems.totalPages || itemsLoading || !selectedBatchId} onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage + 1)} className="rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
            ) : null}
          </div>
          {itemsLoading ? <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]">Loading items...</div> : !selectedBatchItems || selectedBatchItems.items.length === 0 ? <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]">No items to display.</div> : (
            <div className="mt-6 overflow-x-auto rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)]">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--outline)]/60 text-left text-xs uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Telegram ID</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Username</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBatchItems.items.map((item) => (
                    <tr key={item.id} className="border-b border-[color:var(--outline)]/50 align-top last:border-b-0">
                      <td className="px-4 py-3"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[color:var(--on-surface)]">{item.kind === 'FREQUENT' ? 'Frequent' : 'Contact'}</span></td>
                      <td className="px-4 py-3 font-mono text-xs text-[color:var(--on-surface)]">{item.phoneNumber || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-sky-700">{item.telegramExternalId || '-'}</td>
                      <td className="px-4 py-3 text-[color:var(--on-surface)]">{item.displayName || '-'}</td>
                      <td className="px-4 py-3 text-[color:var(--on-surface-variant)]">{item.telegramUsername || item.telegramType || '-'}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{displayStatus(item.status)}</span></td>
                      <td className="px-4 py-3 text-xs text-[color:var(--danger)]">{item.errorMessage || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff2d8_0%,#f7f5ef_32%,#eef3f8_100%)] text-[color:var(--on-surface)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-[36px] border border-white/70 bg-white/58 p-4 shadow-[0_32px_120px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-4 border-b border-[color:var(--outline)]/50 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <a href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-[color:var(--outline)]/70 bg-white px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M15 18l-6-6 6-6" /></svg>
                Back to dashboard
              </a>
              <h1 className="mt-5 text-3xl font-black tracking-tight text-[color:var(--on-surface)] sm:text-4xl">Contacts Resolver</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">Login to Telegram, import export JSON, monitor resolve progress, and inspect batch items in one workspace.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${authStatus?.authenticated ? 'bg-[color:var(--success-soft)] text-[color:var(--success)]' : 'bg-[color:var(--warning-soft)] text-[color:var(--warning)]'}`}>{authStatus?.authenticated ? 'Session connected' : 'Session missing'}</span>
              {hasRunningBatch ? <span className="rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">Batch processing</span> : null}
            </div>
          </div>
          {hasRunningBatch ? <div className="mt-6 rounded-[24px] border border-[color:var(--primary)]/15 bg-[color:var(--primary-soft)] px-4 py-4 text-sm text-[color:var(--primary)]">A batch is still running in the background. You can leave this page and processing will continue.</div> : null}
          {authStatus?.authenticated ? (
            <>
              <div className="mt-6 inline-flex rounded-full border border-[color:var(--outline)]/70 bg-white p-1">
                <button onClick={() => setTab('import')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'import' ? 'bg-[color:var(--primary)] text-white shadow-sm' : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'}`}>Import & batches</button>
                <button onClick={() => setTab('auth')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'auth' ? 'bg-[color:var(--primary)] text-white shadow-sm' : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'}`}>Telegram session</button>
              </div>
              <div className="mt-6">{tab === 'auth' ? authPanel : importPanel}</div>
            </>
          ) : <div className="mt-6">{authPanel}</div>}
        </div>
      </div>
    </div>
  );
}
