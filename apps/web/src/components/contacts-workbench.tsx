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


function displayStatus(status: ContactImportBatch["status"] | ContactImportItem["status"]) {
  switch (status) {
    case "QUEUED":
      return "Đang chờ";
    case "PROCESSING":
      return "Đang xử lý";
    case "COMPLETED":
      return "Hoàn tất";
    case "FAILED":
      return "Lỗi";
    case "CANCELLED":
      return "Đã hủy";
    case "PENDING":
      return "Chờ xử lý";
    case "RESOLVED":
      return "Đã resolve";
    case "SKIPPED":
      return "Đã bỏ qua";
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
      toast({ message: getErrorMessage(error, "Không tải được chi tiết lô import"), type: "error" });
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
          toast({ message: "Phiên Telegram đã hết hạn. Hãy đăng nhập lại để tiếp tục.", type: "warning" });
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
      setLoginError(getErrorMessage(error, "Không thể tạo mã QR"));
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
        toast({ message: "Phiên Telegram đã hết hạn. Đăng nhập lại rồi import tiếp.", type: "warning" });
        setTab("auth");
        return;
      }
      const file = fileInput.files[0];
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(await file.text()) as unknown;
      } catch {
        throw new Error("File tải lên phải là JSON hợp lệ");
      }
      const res = await fetch(`${apiBaseUrl}/contacts/import`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          fileName: file.name,
          payload: parsedPayload,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string; batch?: ContactImportBatch };
      if (!res.ok || data.error || !data.batch) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ message: "Đã tạo batch import. Hệ thống sẽ xử lý nền theo từng lô.", type: "success" });
      setSelectedBatchId(data.batch.id);
      setTab("import");
      form.reset();
      await loadBatches(false);
    } catch (error) {
      toast({ message: getErrorMessage(error, "Nhập dữ liệu thất bại"), type: "error" });
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
      toast({ message: getErrorMessage(error, "Chạy lại thất bại"), type: "error" });
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
      toast({ message: getErrorMessage(error, "Hủy lô import thất bại"), type: "error" });
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
      toast({ message: getErrorMessage(error, "Xuất file thất bại"), type: "error" });
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
      toast({ message: getErrorMessage(error, "Xuất Excel thất bại"), type: "error" });
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
        alt="Mã QR Telegram"
        width={220}
        height={220}
        unoptimized
        style={{ imageRendering: "pixelated" }}
      />
    );
  };

  const authPanel = authStatus?.authenticated ? (
    <section className="w-full rounded-[24px] bg-[color:var(--surface-card)] p-6 shadow-[0_8px_32px_rgba(42,52,57,0.04)] xl:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-[color:var(--success-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--success)]">
            Phiên Telegram đang hoạt động
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
            Bộ resolve danh bạ đã sẵn sàng
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            Phiên MTProto hiện tại đã được lưu. Mọi lô import trên màn hình này sẽ dùng lại phiên đó để resolve
            số điện thoại thành Telegram ID.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex rounded-full border border-[color:var(--outline)]/70 bg-white px-4 py-2 text-sm font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]"
        >
          Tạo phiên mới
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Lô import</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[color:var(--on-surface)]">{totals.total}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Đang chạy</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-sky-700">{totals.running}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Đã resolve</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[color:var(--success)]">{totals.resolved}</p>
        </div>
        <div className="rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Lỗi</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[color:var(--danger)]">{totals.failed}</p>
        </div>
      </div>
    </section>
  ) : (
    <section className="w-full rounded-[24px] bg-[color:var(--surface-card)] p-6 shadow-[0_8px_32px_rgba(42,52,57,0.04)] xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">
            Đăng nhập Telegram
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-[color:var(--on-surface)]">
            Kết nối Telegram trong Danh bạ
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            Đăng nhập và import nằm ngay trong cùng màn hình workspace. Không cần mở luồng cài đặt riêng.
          </p>
        </div>
        <span className="inline-flex rounded-full bg-[color:var(--surface-low)] px-3 py-1 text-xs font-semibold text-[color:var(--on-surface-variant)]">
          Cần phiên đăng nhập
        </span>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] p-1">
        <button type="button" onClick={() => setLoginMethod('phone')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          loginMethod === 'phone'
            ? 'bg-[color:var(--primary)] text-white shadow-sm'
            : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'
        }`}>Số điện thoại</button>
        <button type="button" onClick={() => setLoginMethod('qr')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          loginMethod === 'qr'
            ? 'bg-[color:var(--primary)] text-white shadow-sm'
            : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'
        }`}>Mã QR</button>
      </div>

      {loginSuccess ? <div className="mt-5 rounded-[20px] border border-[color:var(--success)]/20 bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">{loginSuccess} Đang chuyển sang danh sách lô...</div> : null}
      {loginError ? <div className="mt-5 rounded-[20px] border border-[color:var(--danger)]/20 bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">{loginError}</div> : null}

      {loginMethod === 'phone' ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="rounded-[22px] bg-[color:var(--surface-low)] p-5">
            <p className="text-sm font-semibold text-[color:var(--on-surface)]">Đăng nhập bằng số điện thoại</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Dùng luồng này khi không quét được QR. Mã OTP và 2FA được xử lý trực tiếp tại đây.</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--on-surface)]">Số điện thoại Telegram</label>
                <input type="text" value={phoneAuthForm.phoneNumber} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+84901234567" className="w-full rounded-[18px] border border-[color:var(--outline)]/70 bg-white px-4 py-4 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]" />
              </div>
              <button type="button" onClick={() => void startPhoneLogin()} disabled={phoneAuthLoading || !phoneAuthForm.phoneNumber.trim() || phoneAuthStep !== 'phone'} className="w-full rounded-[18px] bg-[color:var(--primary)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{phoneAuthLoading && phoneAuthStep === 'phone' ? 'Đang gửi OTP...' : 'Gửi OTP'}</button>
              {(phoneAuthStep === 'code' || phoneAuthStep === 'password') ? (
                <div className="rounded-[22px] border border-[color:var(--outline)]/60 bg-white p-4">
                  <label className="mb-2 block text-sm font-medium text-[color:var(--on-surface)]">Mã xác thực</label>
                  <input type="text" value={phoneAuthForm.phoneCode} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, phoneCode: event.target.value }))} placeholder="Nhập OTP" className="w-full rounded-[16px] border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--primary)]" />
                  <button type="button" onClick={() => void verifyPhoneCode()} disabled={phoneAuthLoading || !phoneAuthForm.phoneCode.trim() || phoneAuthStep !== 'code'} className="mt-3 w-full rounded-[16px] border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-5 py-3 text-sm font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-50">{phoneAuthLoading && phoneAuthStep === 'code' ? 'Đang xác thực...' : 'Xác nhận OTP'}</button>
                </div>
              ) : null}
              {phoneAuthStep === 'password' ? (
                <div className="rounded-[22px] border border-[color:var(--warning)]/20 bg-[color:var(--warning-soft)] p-4">
                  <label className="mb-2 block text-sm font-medium text-[color:var(--warning)]">Mật khẩu 2FA</label>
                  <input type="password" value={phoneAuthForm.password} onChange={(event) => setPhoneAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="Nhập mật khẩu" className="w-full rounded-[16px] border border-[color:var(--warning)]/25 bg-white px-4 py-3 text-sm text-[color:var(--on-surface)] outline-none transition focus:border-[color:var(--warning)]" />
                  <button type="button" onClick={() => void verifyPhonePassword()} disabled={phoneAuthLoading || !phoneAuthForm.password.trim()} className="mt-3 w-full rounded-[16px] bg-[color:var(--warning)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{phoneAuthLoading ? 'Đang kiểm tra 2FA...' : 'Hoàn tất đăng nhập'}</button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-[22px] bg-[color:var(--surface-low)] p-5">
            <p className="text-sm font-semibold text-[color:var(--on-surface)]">Lưu ý</p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-[color:var(--on-surface-variant)]">
              <li>OTP có thể gửi vào app Telegram trước, không nhất thiết gửi qua SMS.</li>
              <li>Nếu tài khoản bật 2FA, bước nhập mật khẩu sẽ hiện ngay trong khung này.</li>
              <li>Sau khi đăng nhập xong, trang sẽ chuyển thẳng sang phần import.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)] xl:items-center">
          <div className="rounded-[22px] bg-[color:var(--surface-low)] p-5">
            <p className="text-sm font-semibold text-[color:var(--on-surface)]">Đăng nhập bằng QR</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Quét mã từ Telegram để lưu phiên nhanh. Nếu QR lỗi, chuyển lại đăng nhập bằng số điện thoại ở trên.</p>
          </div>
          {!qrToken ? (
            <div className="flex justify-center">
              <button onClick={startQrLogin} disabled={qrLoading} className="rounded-full bg-[color:var(--primary)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{qrLoading ? 'Đang tạo QR...' : 'Tạo mã QR'}</button>
            </div>
          ) : (
            <div className="rounded-[22px] bg-[color:var(--surface-low)] p-6 text-center">
              <div className="flex justify-center"><div className="rounded-[24px] bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">{renderQrImage(qrToken)}</div></div>
              <p className="mt-4 text-sm text-[color:var(--on-surface-variant)]">Hết hạn sau <span className="font-mono font-semibold text-[color:var(--on-surface)]">{qrExpires}s</span></p>
              {qrReady ? <div className="mt-4 rounded-[18px] border border-[color:var(--success)]/20 bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">Đã quét QR. Đang xác nhận phiên...</div> : null}
              <button onClick={() => { setQrToken(null); void startQrLogin(); }} className="mt-4 text-sm font-semibold text-[color:var(--primary)] transition hover:opacity-80">Tạo lại mã QR</button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  const importPanel = (
    <div className="space-y-6">
      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_340px]">
          <div>
            <span className="inline-flex rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">Nhập dữ liệu mới</span>
            <h2 className="mt-3 text-xl font-black tracking-tight text-[color:var(--on-surface)]">Tạo lô import mới</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">Tải file JSON export gốc từ Telegram lên, sau đó theo dõi tiến trình resolve ngay bên dưới.</p>
            <form onSubmit={handleImport} className="mt-4 space-y-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--on-surface)]">File JSON</label>
                <input type="file" name="contactsFile" accept=".json" className="block w-full cursor-pointer rounded-[16px] border border-dashed border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-3 text-sm text-[color:var(--on-surface-variant)] file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-[color:var(--primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
              </div>
              <button type="submit" disabled={importLoading} className="inline-flex rounded-[16px] bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{importLoading ? 'Đang tạo lô...' : 'Tạo lô import'}</button>
            </form>
          </div>
          <div className="rounded-[22px] bg-[color:var(--surface-low)] p-4 text-sm leading-6 text-[color:var(--on-surface-variant)]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">Quy trình</p>
            <div className="mt-2 space-y-1.5">
              <p>1. Tải file JSON export gốc từ Telegram.</p>
              <p>2. Server tạo một lô import và resolve từng dòng ở nền.</p>
              <p>3. Xem trạng thái, chạy lại dòng lỗi và xuất file kết quả bên dưới.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-[color:var(--on-surface)]">Lô import gần đây</h2>
            <p className="mt-1 text-sm leading-6 text-[color:var(--on-surface-variant)]">Chọn một lô để xem tiến trình và các dòng kết quả.</p>
          </div>
          <button type="button" onClick={() => void loadBatches(false)} className="rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]">Làm mới</button>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {batches.length === 0 ? <p className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)] xl:col-span-2 2xl:col-span-3">Chưa có lô import nào.</p> : batches.map((batch) => (
            <button key={batch.id} type="button" onClick={() => { setSelectedBatchId(batch.id); void loadBatchItems(batch.id, 1); }} className={`w-full rounded-[22px] border p-3.5 text-left transition ${
              selectedBatchId === batch.id
                ? 'border-[color:var(--primary)] bg-[color:var(--primary-soft)]/60'
                : 'border-[color:var(--outline)]/60 bg-[color:var(--surface-low)] hover:border-[color:var(--primary)]/50'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[color:var(--on-surface)]">{batch.sourceFileName || 'telegram_export.json'}</p>
                  <p className="mt-1 text-xs text-[color:var(--on-surface-variant)]">#{batch.id.slice(0, 8)} • {formatDateTime(batch.createdAt)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusTone(batch.status)}`}>{displayStatus(batch.status)}</span>
              </div>
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--on-surface-variant)]"><span>{batch.processedCount}/{batch.totalCount} dòng</span><span>{progressPercent(batch)}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-[color:var(--primary)] to-sky-400" style={{ width: `${progressPercent(batch)}%` }} /></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[color:var(--on-surface-variant)]">
                <div>Danh bạ: <span className="font-semibold text-[color:var(--on-surface)]">{batch.contactsCount}</span></div>
                <div>Thường gặp: <span className="font-semibold text-[color:var(--on-surface)]">{batch.frequentCount}</span></div>
                <div>Đã resolve: <span className="font-semibold text-[color:var(--success)]">{batch.resolvedCount}</span></div>
                <div>Lỗi: <span className="font-semibold text-[color:var(--danger)]">{batch.failedCount}</span></div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-[color:var(--on-surface)]">Chi tiết lô import</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Tiến trình, nguồn dữ liệu và thao tác lô nằm chung trong một khung.</p>
            </div>
            {selectedBatch ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(selectedBatch.status)}`}>{displayStatus(selectedBatch.status)}</span>
                <button type="button" onClick={() => void handleExportBatch()} disabled={actionLoading !== null} className="rounded-full border border-[color:var(--outline)]/70 bg-white px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'export' ? 'Đang xuất...' : 'Xuất JSON'}</button>
                <button type="button" onClick={() => void handleExportBatchExcel()} disabled={actionLoading !== null || !['COMPLETED', 'FAILED', 'CANCELLED'].includes(selectedBatch.status)} className="rounded-full bg-[color:var(--success-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--success)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'export' ? 'Đang xuất...' : 'Xuất Excel'}</button>
                <button type="button" onClick={() => void handleRetryFailed()} disabled={actionLoading !== null || selectedBatch.failedCount === 0} className="rounded-full bg-[color:var(--warning-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--warning)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'retry' ? 'Đang chạy lại...' : 'Chạy lại dòng lỗi'}</button>
                <button type="button" onClick={() => void handleCancelBatch()} disabled={actionLoading !== null || !['QUEUED', 'PROCESSING'].includes(selectedBatch.status)} className="rounded-full bg-[color:var(--danger-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--danger)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">{actionLoading === 'cancel' ? 'Đang hủy...' : 'Hủy lô'}</button>
              </div>
            ) : null}
          </div>
          {!selectedBatch ? <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]">Chọn một lô ở danh sách bên trên để xem chi tiết.</div> : (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-[18px] bg-[color:var(--surface-low)] p-3 text-center"><div className="text-2xl font-black tracking-tight text-[color:var(--on-surface)]">{selectedBatch.totalCount}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Tổng</div></div>
                <div className="rounded-[18px] bg-[color:var(--surface-low)] p-3 text-center"><div className="text-2xl font-black tracking-tight text-sky-700">{selectedBatch.processedCount}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Đã xử lý</div></div>
                <div className="rounded-[18px] bg-[color:var(--surface-low)] p-3 text-center"><div className="text-2xl font-black tracking-tight text-[color:var(--success)]">{selectedBatch.resolvedCount}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Đã resolve</div></div>
                <div className="rounded-[18px] bg-[color:var(--surface-low)] p-3 text-center"><div className="text-2xl font-black tracking-tight text-[color:var(--danger)]">{selectedBatch.failedCount}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Lỗi</div></div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-3 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">WP</p><p className="mt-1.5 font-medium text-[color:var(--on-surface)]">{selectedBatch.workspaceName || '-'}</p></div>
                <div className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-3 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Tệp</p><p className="mt-1.5 font-medium text-[color:var(--on-surface)]">{selectedBatch.sourceFileName || '-'}</p></div>
                <div className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-3 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Bắt đầu</p><p className="mt-1.5 font-medium text-[color:var(--on-surface)]">{formatDateTime(selectedBatch.startedAt)}</p></div>
                <div className="rounded-[18px] bg-[color:var(--surface-low)] px-4 py-3 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">Kết thúc</p><p className="mt-1.5 font-medium text-[color:var(--on-surface)]">{formatDateTime(selectedBatch.finishedAt)}</p></div>
              </div>
              {selectedBatch.errorMessage ? <div className="mt-4 rounded-[22px] border border-[color:var(--danger)]/20 bg-[color:var(--danger-soft)] px-4 py-4 text-sm text-[color:var(--danger)]">Lỗi lô import: {selectedBatch.errorMessage}</div> : null}
            </>
          )}
        </section>

      <section className="rounded-[24px] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-[color:var(--on-surface)]">Dòng trong lô</h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">Kiểm tra từng dòng contact và kết quả resolve từ Telegram.</p>
          </div>
          {selectedBatchItems ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled={itemsPage <= 1 || itemsLoading || !selectedBatchId} onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage - 1)} className="rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-40">Trước</button>
              <span className="text-xs font-medium text-[color:var(--on-surface-variant)]">Trang {selectedBatchItems.page}/{selectedBatchItems.totalPages}</span>
              <button type="button" disabled={itemsPage >= selectedBatchItems.totalPages || itemsLoading || !selectedBatchId} onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage + 1)} className="rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-low)] px-4 py-2 text-xs font-semibold text-[color:var(--on-surface)] transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-40">Sau</button>
            </div>
          ) : null}
        </div>
        {itemsLoading ? <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]">Đang tải các dòng...</div> : !selectedBatchItems || selectedBatchItems.items.length === 0 ? <div className="mt-6 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-5 text-sm text-[color:var(--on-surface-variant)]">Chưa có dòng để hiển thị.</div> : (
          <div className="mt-6 overflow-x-auto rounded-[24px] border border-[color:var(--outline)]/60 bg-[color:var(--surface-low)]">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--outline)]/60 text-left text-xs uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                  <th className="px-4 py-3 font-semibold">Loại</th>
                  <th className="px-4 py-3 font-semibold">Số điện thoại</th>
                  <th className="px-4 py-3 font-semibold">Telegram ID</th>
                  <th className="px-4 py-3 font-semibold">Tên</th>
                  <th className="px-4 py-3 font-semibold">Username</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {selectedBatchItems.items.map((item) => (
                  <tr key={item.id} className="border-b border-[color:var(--outline)]/50 align-top last:border-b-0">
                    <td className="px-4 py-3"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[color:var(--on-surface)]">{item.kind === 'FREQUENT' ? 'Thường gặp' : 'Danh bạ'}</span></td>
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
  );

  return (
    <div className="space-y-6 text-[color:var(--on-surface)]">
      <section className="rounded-[24px] bg-[color:var(--surface-card)] px-5 py-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
              Danh bạ
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[color:var(--on-surface)]">
              Resolve danh bạ Telegram
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--on-surface-variant)]">
              Đăng nhập Telegram, import JSON, theo dõi tiến trình resolve và kiểm tra batch trong cùng workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${authStatus?.authenticated ? 'bg-[color:var(--success-soft)] text-[color:var(--success)]' : 'bg-[color:var(--warning-soft)] text-[color:var(--warning)]'}`}>
              {authStatus?.authenticated ? 'Đã kết nối phiên' : 'Thiếu phiên Telegram'}
            </span>
            {hasRunningBatch ? (
              <span className="rounded-full bg-[color:var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--primary)]">
                Lô đang xử lý
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {hasRunningBatch ? (
        <div className="rounded-[20px] border border-[color:var(--primary)]/15 bg-[color:var(--primary-soft)] px-4 py-4 text-sm text-[color:var(--primary)]">
          Lô vẫn đang chạy nền. Bạn có thể rời trang, hệ thống vẫn tiếp tục xử lý.
        </div>
      ) : null}

      {authStatus?.authenticated ? (
        <>
          <div className="inline-flex rounded-full border border-[color:var(--outline)]/70 bg-[color:var(--surface-card)] p-1">
            <button onClick={() => setTab('import')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'import' ? 'bg-[color:var(--primary)] text-white shadow-sm' : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'}`}>Nhập dữ liệu & lô xử lý</button>
            <button onClick={() => setTab('auth')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === 'auth' ? 'bg-[color:var(--primary)] text-white shadow-sm' : 'text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)]'}`}>Phiên Telegram</button>
          </div>
          {tab === 'auth' ? authPanel : importPanel}
        </>
      ) : (
        authPanel
      )}
    </div>
  );
}
