"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type AuthStatus = {
  authenticated: boolean;
};

type QrStartResult = {
  token: string;
  expiresIn: number;
};

type QrPollResult = {
  ready: boolean;
  token?: string;
  expiresIn?: number;
};

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

type ContactImportItemsResponse = {
  items: ContactImportItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ErrorWithMessage = {
  message?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = (error as ErrorWithMessage).message;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN");
}

function formatStatusLabel(status: ContactImportBatch["status"] | ContactImportItem["status"]) {
  switch (status) {
    case "QUEUED":
      return "Đang chờ";
    case "PROCESSING":
      return "Đang xử lý";
    case "COMPLETED":
      return "Hoàn tất";
    case "FAILED":
      return "Thất bại";
    case "CANCELLED":
      return "Đã hủy";
    case "PENDING":
      return "Chờ xử lý";
    case "RESOLVED":
      return "Đã resolve";
    case "SKIPPED":
      return "Bỏ qua";
    default:
      return status;
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

export function ContactsWorkbench() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState(0);
  const [qrReady, setQrReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"qr" | "import">("qr");
  const [batches, setBatches] = useState<ContactImportBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState<ContactImportItemsResponse | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<"retry" | "cancel" | "export" | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem(authStorageKey) || ""}`,
    }),
    [],
  );

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const hasRunningBatch = batches.some((batch) => batch.status === "QUEUED" || batch.status === "PROCESSING");

  const loadBatchItems = useCallback(
    async (batchId: string, page = 1) => {
      setItemsLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${batchId}/items?page=${page}&pageSize=20`, {
          headers: getHeaders(),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as ContactImportItemsResponse;
        setSelectedBatchItems(data);
        setItemsPage(page);
      } catch (error) {
        setImportNotice(getErrorMessage(error, "Không tải được chi tiết batch"));
      } finally {
        setItemsLoading(false);
      }
    },
    [getHeaders],
  );

  const loadBatches = useCallback(
    async (preserveSelected = true) => {
      try {
        const res = await fetch(`${apiBaseUrl}/contacts/import-batches`, {
          headers: getHeaders(),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as ContactImportBatch[];
        setBatches(data);

        const nextSelectedId =
          preserveSelected && selectedBatchId && data.some((batch) => batch.id === selectedBatchId)
            ? selectedBatchId
            : data[0]?.id ?? null;

        setSelectedBatchId(nextSelectedId);
        if (nextSelectedId) {
          void loadBatchItems(nextSelectedId, preserveSelected ? itemsPage : 1);
        } else {
          setSelectedBatchItems(null);
        }
      } catch (error) {
        setImportNotice(getErrorMessage(error, "Không tải được lịch sử import"));
      }
    },
    [getHeaders, itemsPage, loadBatchItems, selectedBatchId],
  );

  const checkAuthStatus = useCallback(async () => {
    setAuthStatus({ authenticated: false });
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/status`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as AuthStatus;
        setAuthStatus(data);
        if (data.authenticated) {
          setTab("import");
        }
      }
    } catch {
      setAuthStatus({ authenticated: false });
    }
  }, [getHeaders]);

  useEffect(() => {
    void checkAuthStatus();
    void loadBatches(false);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [checkAuthStatus, loadBatches]);

  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (!hasRunningBatch) {
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      void loadBatches(true);
    }, 5000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [hasRunningBatch, loadBatches]);

  const startQrLogin = async () => {
    setQrLoading(true);
    setLoginError(null);
    setQrToken(null);
    setQrReady(false);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/start`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as QrStartResult;
      setQrToken(data.token);
      setQrExpires(data.expiresIn);
      startPolling();
    } catch (err: unknown) {
      setLoginError(getErrorMessage(err, "Failed to generate QR code"));
    } finally {
      setQrLoading(false);
    }
  };

  const startPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/poll`, {
          headers: getHeaders(),
        });
        if (!res.ok) {
          clearInterval(pollIntervalRef.current!);
          return;
        }
        const data = (await res.json()) as QrPollResult;
        setQrToken(data.token || null);
        setQrExpires(data.expiresIn || 0);
        if (data.ready) {
          setQrReady(true);
          clearInterval(pollIntervalRef.current!);
          await confirmQrLogin();
        }
      } catch {
        clearInterval(pollIntervalRef.current!);
      }
    }, 3000);
  };

  const confirmQrLogin = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/qr/confirm`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        setAuthStatus({ authenticated: true });
        setTab("import");
      }
    } catch (err: unknown) {
      setLoginError(getErrorMessage(err, "Failed to confirm QR login"));
    }
  };

  const handleLogout = async () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setAuthStatus({ authenticated: false });
    setQrToken(null);
    setQrReady(false);
    setTab("qr");
  };

  const handleImport = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setImportLoading(true);
    setImportNotice(null);
    try {
      const form = e.currentTarget;
      const fileInput = form.elements.namedItem("contactsFile") as HTMLInputElement;
      if (!fileInput.files?.[0]) return;

      const file = fileInput.files[0];
      const payload = JSON.parse(await file.text()) as unknown;
      const res = await fetch(`${apiBaseUrl}/contacts/import`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          fileName: file.name,
          payload,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        message?: string;
        batch?: ContactImportBatch;
      };

      if (!res.ok || data.error || !data.batch) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setImportNotice("Đã tạo batch import. Hệ thống sẽ xử lý nền theo từng lô.");
      setSelectedBatchId(data.batch.id);
      setTab("import");
      form.reset();
      await loadBatches(false);
    } catch (err: unknown) {
      setImportNotice(`Import failed: ${getErrorMessage(err, "Unknown error")}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!selectedBatchId) return;
    setActionLoading("retry");
    setImportNotice(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${selectedBatchId}/retry`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = (await res.json()) as { message?: string; batch?: ContactImportBatch; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setImportNotice(data.message || "Đã đưa các item lỗi trở lại hàng chờ.");
      await loadBatches(false);
    } catch (error) {
      setImportNotice(getErrorMessage(error, "Retry failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelBatch = async () => {
    if (!selectedBatchId) return;
    setActionLoading("cancel");
    setImportNotice(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${selectedBatchId}/cancel`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = (await res.json()) as { message?: string; batch?: ContactImportBatch; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setImportNotice(data.message || "Đã hủy batch.");
      await loadBatches(false);
    } catch (error) {
      setImportNotice(getErrorMessage(error, "Cancel failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportBatch = async () => {
    if (!selectedBatchId) return;
    setActionLoading("export");
    setImportNotice(null);
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/import-batches/${selectedBatchId}/export`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { batch: ContactImportBatch; items: ContactImportItem[] };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${data.batch.sourceFileName || "contact-import"}-${data.batch.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setImportNotice("Đã tải JSON kết quả batch.");
    } catch (error) {
      setImportNotice(getErrorMessage(error, "Export failed"));
    } finally {
      setActionLoading(null);
    }
  };

  const renderQrImage = (token: string) => {
    if (!token) return null;
    const loginUrl = `tg://login?token=${token}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(loginUrl)}`;
    return (
      <Image
        src={qrApiUrl}
        alt="Telegram QR Code"
        width={200}
        height={200}
        unoptimized
        style={{ imageRendering: "pixelated" }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Contacts Import</h1>
          <p className="text-sm text-gray-400">Import Telegram contacts, frequent contacts và resolve user IDs theo batch nền.</p>
        </div>
        {authStatus?.authenticated && (
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            Logout Telegram Session
          </button>
        )}
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {authStatus?.authenticated ? (
          <>
            <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
              <button
                onClick={() => setTab("import")}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === "import" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                Import Contacts
              </button>
              <button
                onClick={() => setTab("qr")}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === "qr" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                QR Session
              </button>
            </div>

            {tab === "qr" && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-400 font-medium">Telegram session active</span>
                </div>
                <p className="text-gray-400 text-sm">
                  Session đang được lưu. Hệ thống sẽ dùng session này để resolve phone sang Telegram ID trong nền.
                </p>
              </div>
            )}

            {tab === "import" && (
              <div className="space-y-6">
                {importNotice ? (
                  <div className="bg-sky-950 border border-sky-800 text-sky-200 px-4 py-3 rounded-lg text-sm">
                    {importNotice}
                  </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
                  <div className="space-y-6">
                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                      <h2 className="text-lg font-semibold text-white mb-4">Tạo batch import</h2>
                      <form onSubmit={handleImport} className="space-y-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">Upload file JSON</label>
                          <input
                            type="file"
                            name="contactsFile"
                            accept=".json"
                            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                          />
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                          <p>Hỗ trợ:</p>
                          <p>- Array contacts phẳng</p>
                          <p>- Telegram export có <code>contacts.list</code></p>
                          <p>- Telegram export có <code>frequent_contacts.list</code></p>
                        </div>
                        <button
                          type="submit"
                          disabled={importLoading}
                          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                        >
                          {importLoading ? "Đang tạo batch..." : "Bắt đầu import"}
                        </button>
                      </form>
                    </div>

                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Lịch sử batch</h2>
                        <button
                          type="button"
                          onClick={() => void loadBatches(false)}
                          className="px-3 py-2 rounded-lg bg-gray-800 text-xs font-semibold text-gray-200"
                        >
                          Tải lại
                        </button>
                      </div>
                      <div className="space-y-3 max-h-[520px] overflow-y-auto">
                        {batches.length === 0 ? (
                          <p className="text-sm text-gray-500">Chưa có batch import nào.</p>
                        ) : (
                          batches.map((batch) => (
                            <button
                              key={batch.id}
                              type="button"
                              onClick={() => {
                                setSelectedBatchId(batch.id);
                                void loadBatchItems(batch.id, 1);
                              }}
                              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                selectedBatchId === batch.id
                                  ? "border-blue-500 bg-blue-950/30"
                                  : "border-gray-800 bg-gray-950 hover:bg-gray-800/60"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">{batch.sourceFileName || "telegram_export.json"}</p>
                                  <p className="text-xs text-gray-500">{formatDateTime(batch.createdAt)}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-[11px] font-semibold ${statusClasses(batch.status)}`}>
                                  {formatStatusLabel(batch.status)}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                                <div>Tổng: <span className="text-white">{batch.totalCount}</span></div>
                                <div>Đã xử lý: <span className="text-white">{batch.processedCount}</span></div>
                                <div>Contacts: <span className="text-white">{batch.contactsCount}</span></div>
                                <div>Frequent: <span className="text-white">{batch.frequentCount}</span></div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold text-white">Chi tiết batch</h2>
                          <p className="text-sm text-gray-500">Tiến độ hiện tại và kết quả xử lý từng item.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedBatch ? (
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${statusClasses(selectedBatch.status)}`}>
                              {formatStatusLabel(selectedBatch.status)}
                            </span>
                          ) : null}
                          {selectedBatch ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleExportBatch()}
                                disabled={actionLoading !== null}
                                className="px-3 py-2 rounded-lg bg-gray-800 text-xs font-semibold text-gray-200 disabled:opacity-40"
                              >
                                {actionLoading === "export" ? "Đang tải..." : "Tải JSON"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRetryFailed()}
                                disabled={actionLoading !== null || selectedBatch.failedCount === 0}
                                className="px-3 py-2 rounded-lg bg-amber-900/70 text-xs font-semibold text-amber-200 disabled:opacity-40"
                              >
                                {actionLoading === "retry" ? "Đang retry..." : "Retry lỗi"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCancelBatch()}
                                disabled={actionLoading !== null || !["QUEUED", "PROCESSING"].includes(selectedBatch.status)}
                                className="px-3 py-2 rounded-lg bg-red-900/70 text-xs font-semibold text-red-200 disabled:opacity-40"
                              >
                                {actionLoading === "cancel" ? "Đang hủy..." : "Hủy batch"}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {!selectedBatch ? (
                        <p className="mt-6 text-sm text-gray-500">Chọn một batch ở cột trái để xem chi tiết.</p>
                      ) : (
                        <>
                          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-gray-800 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-white">{selectedBatch.totalCount}</div>
                              <div className="text-sm text-gray-400">Tổng</div>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-blue-300">{selectedBatch.processedCount}</div>
                              <div className="text-sm text-gray-400">Đã xử lý</div>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-green-400">{selectedBatch.resolvedCount}</div>
                              <div className="text-sm text-gray-400">Resolved</div>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-4 text-center">
                              <div className="text-2xl font-bold text-red-400">{selectedBatch.failedCount}</div>
                              <div className="text-sm text-gray-400">Failed</div>
                            </div>
                          </div>

                          <div className="mt-5 space-y-2 text-sm text-gray-400">
                            <p>Workspace: <span className="text-white">{selectedBatch.workspaceName || "-"}</span></p>
                            <p>File: <span className="text-white">{selectedBatch.sourceFileName || "-"}</span></p>
                            <p>Bắt đầu: <span className="text-white">{formatDateTime(selectedBatch.startedAt)}</span></p>
                            <p>Kết thúc: <span className="text-white">{formatDateTime(selectedBatch.finishedAt)}</span></p>
                            {selectedBatch.errorMessage ? (
                              <p className="text-red-300">Lỗi batch: {selectedBatch.errorMessage}</p>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Items</h2>
                        {selectedBatchItems ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={itemsPage <= 1 || itemsLoading || !selectedBatchId}
                              onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage - 1)}
                              className="px-3 py-1.5 rounded-lg bg-gray-800 text-xs font-semibold disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <span className="text-xs text-gray-400">
                              Trang {selectedBatchItems.page}/{selectedBatchItems.totalPages}
                            </span>
                            <button
                              type="button"
                              disabled={itemsPage >= selectedBatchItems.totalPages || itemsLoading || !selectedBatchId}
                              onClick={() => selectedBatchId && void loadBatchItems(selectedBatchId, itemsPage + 1)}
                              className="px-3 py-1.5 rounded-lg bg-gray-800 text-xs font-semibold disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {itemsLoading ? (
                        <p className="text-sm text-gray-500">Đang tải items...</p>
                      ) : !selectedBatchItems || selectedBatchItems.items.length === 0 ? (
                        <p className="text-sm text-gray-500">Chưa có item để hiển thị.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-400 border-b border-gray-800">
                                <th className="text-left py-2 px-3">Loại</th>
                                <th className="text-left py-2 px-3">Phone / ID</th>
                                <th className="text-left py-2 px-3">Tên</th>
                                <th className="text-left py-2 px-3">Username</th>
                                <th className="text-left py-2 px-3">Trạng thái</th>
                                <th className="text-left py-2 px-3">Lỗi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedBatchItems.items.map((item) => (
                                <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                  <td className="py-2 px-3">
                                    <span className="px-2 py-0.5 rounded bg-gray-800 text-xs font-semibold text-gray-200">
                                      {item.kind === "FREQUENT" ? "Frequent" : "Contact"}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 font-mono text-xs">
                                    {item.kind === "FREQUENT" ? item.telegramExternalId || "-" : item.phoneNumber || "-"}
                                  </td>
                                  <td className="py-2 px-3">{item.displayName || "-"}</td>
                                  <td className="py-2 px-3">{item.telegramUsername || item.telegramType || "-"}</td>
                                  <td className="py-2 px-3">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClasses(item.status)}`}>
                                      {formatStatusLabel(item.status)}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-red-400 text-xs">{item.errorMessage || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
              <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md">QR Login</button>
              <button
                onClick={() => setTab("import")}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-md transition-colors"
              >
                Import Contacts
              </button>
            </div>

            <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 max-w-md mx-auto text-center">
              <h2 className="text-xl font-bold text-white mb-2">Connect Telegram Account</h2>
              <p className="text-gray-400 text-sm mb-6">
                Scan QR bằng app Telegram để lưu session MTProto. Batch import sẽ dùng session này để resolve phone sang Telegram ID.
              </p>

              {!qrToken ? (
                <div className="space-y-4">
                  {loginError ? (
                    <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm px-4 py-2 rounded-lg">
                      {loginError}
                    </div>
                  ) : null}
                  <button
                    onClick={startQrLogin}
                    disabled={qrLoading}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                  >
                    {qrLoading ? "Generating QR..." : "Generate QR Code"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-xl">{renderQrImage(qrToken)}</div>
                  </div>
                  <div className="text-gray-400 text-sm">
                    Expires in <span className="font-mono text-white">{qrExpires}s</span>
                  </div>
                  {qrReady ? (
                    <div className="bg-green-900/30 border border-green-800 text-green-300 text-sm px-4 py-2 rounded-lg">
                      QR code scanned. Confirming session...
                    </div>
                  ) : null}
                  <button
                    onClick={() => {
                      setQrToken(null);
                      void startQrLogin();
                    }}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Regenerate QR Code
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
