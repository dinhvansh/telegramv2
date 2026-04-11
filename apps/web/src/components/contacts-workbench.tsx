"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

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

type QrConfirmResult = {
  success: boolean;
  userId: string;
  username?: string;
};

type ResolvedContact = {
  phone_number: string;
  externalId?: string;
  username?: string;
  displayName?: string;
  status: "resolved" | "skipped" | "failed" | "pending";
  error?: string;
};

type ImportResult = {
  total: number;
  resolved: number;
  skipped: number;
  failed: number;
  results: ResolvedContact[];
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

export function ContactsWorkbench() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState(0);
  const [qrReady, setQrReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [tab, setTab] = useState<"qr" | "import">("qr");
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem(authStorageKey) || ""}`,
  }), []);

  const checkAuthStatus = useCallback(async () => {
    setAuthStatus({ authenticated: false });
    try {
      const res = await fetch(`${apiBaseUrl}/contacts/auth/status`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json() as AuthStatus;
        setAuthStatus(data);
        if (data.authenticated) setTab("import");
      }
    } catch {
      setAuthStatus({ authenticated: false });
    }
  }, [getHeaders]);

  // Check auth status on mount
  useEffect(() => {
    void checkAuthStatus();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [checkAuthStatus]);

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
      const data = await res.json() as QrStartResult;
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
        const data = await res.json() as QrPollResult;
        setQrToken(data.token || null);
        setQrExpires(data.expiresIn || 0);
        if (data.ready) {
          setQrReady(true);
          clearInterval(pollIntervalRef.current!);
          // Auto-confirm
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
        await res.json() as QrConfirmResult;
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
    setImportResult(null);
    try {
      const form = e.currentTarget;
      const fileInput = form.elements.namedItem("contactsFile") as HTMLInputElement;
      if (!fileInput.files?.[0]) return;

      const contacts = JSON.parse(await fileInput.files[0].text()) as unknown;
      if (!Array.isArray(contacts)) {
        alert("JSON must be an array of contacts");
        return;
      }

      const res = await fetch(`${apiBaseUrl}/contacts/import`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(contacts),
      });
      const data = await res.json() as ImportResult;
      setImportResult(data);
    } catch (err: unknown) {
      alert(`Import failed: ${getErrorMessage(err, "Unknown error")}`);
    } finally {
      setImportLoading(false);
    }
  };

  // Render QR code from token
  const renderQrImage = (token: string) => {
    if (!token) return null;
    // QR code data URL: tg://login?token=<base64url>
    const loginUrl = `tg://login?token=${token}`;
    // Use a simple QR code API that takes URL and returns image
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
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Contacts Import</h1>
          <p className="text-sm text-gray-400">
            Import Telegram contacts and resolve user IDs
          </p>
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

      <div className="p-6 max-w-5xl mx-auto">
        {/* Auth Status */}
        {authStatus?.authenticated ? (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
              <button
                onClick={() => setTab("import")}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === "import"
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Import Contacts
              </button>
              <button
                onClick={() => setTab("qr")}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === "qr"
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
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
                  Session is saved. Go to Import Contacts to resolve phone numbers.
                </p>
              </div>
            )}

            {tab === "import" && (
              <div className="space-y-6">
                {/* Import Form */}
                <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <h2 className="text-lg font-semibold text-white mb-4">Import Contacts JSON</h2>
                  <form onSubmit={handleImport} className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Upload contacts JSON file
                      </label>
                      <input
                        type="file"
                        name="contactsFile"
                        accept=".json"
                        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      {"JSON format: file chứa array of contacts [{ phone_number, first_name, last_name }]"}
                    </div>
                    <button
                      type="submit"
                      disabled={importLoading}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                    >
                      {importLoading ? "Resolving..." : "Import & Resolve"}
                    </button>
                  </form>
                </div>

                {/* Results */}
                {importResult && (
                  <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                    <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      <div className="bg-gray-800 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-white">{importResult.total}</div>
                        <div className="text-sm text-gray-400">Total</div>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-green-400">{importResult.resolved}</div>
                        <div className="text-sm text-gray-400">Resolved</div>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-400">{importResult.skipped}</div>
                        <div className="text-sm text-gray-400">Skipped</div>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-red-400">{importResult.failed}</div>
                        <div className="text-sm text-gray-400">Failed</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-800">
                            <th className="text-left py-2 px-3">Phone</th>
                            <th className="text-left py-2 px-3">Telegram ID</th>
                            <th className="text-left py-2 px-3">Username</th>
                            <th className="text-left py-2 px-3">Display Name</th>
                            <th className="text-left py-2 px-3">Status</th>
                            <th className="text-left py-2 px-3">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.results.map((r, i) => (
                            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                              <td className="py-2 px-3 font-mono text-xs">{r.phone_number}</td>
                              <td className="py-2 px-3 font-mono text-xs">{r.externalId || "-"}</td>
                              <td className="py-2 px-3">{r.username || "-"}</td>
                              <td className="py-2 px-3">{r.displayName || "-"}</td>
                              <td className="py-2 px-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  r.status === "resolved" ? "bg-green-900 text-green-300" :
                                  r.status === "skipped" ? "bg-yellow-900 text-yellow-300" :
                                  r.status === "failed" ? "bg-red-900 text-red-300" :
                                  "bg-gray-700 text-gray-300"
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-red-400 text-xs">{r.error || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* QR Login Screen */
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md"
              >
                QR Login
              </button>
              <button
                onClick={() => setTab("import")}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-md transition-colors"
              >
                Import Contacts
              </button>
            </div>

            <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 max-w-md mx-auto text-center">
              <h2 className="text-xl font-bold text-white mb-2">
                Connect Telegram Account
              </h2>
              <p className="text-gray-400 text-sm mb-6">
                Scan the QR code with your Telegram app to authorize.<br />
                This is needed to resolve user IDs from phone numbers.
              </p>

              {!qrToken ? (
                <div className="space-y-4">
                  {loginError && (
                    <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm px-4 py-2 rounded-lg">
                      {loginError}
                    </div>
                  )}
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
                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-xl">
                      {renderQrImage(qrToken)}
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="text-gray-400 text-sm">
                    Expires in <span className="font-mono text-white">{qrExpires}s</span>
                  </div>

                  {/* Ready indicator */}
                  {qrReady && (
                    <div className="bg-green-900/30 border border-green-800 text-green-300 text-sm px-4 py-2 rounded-lg">
                      QR code scanned! Confirming session...
                    </div>
                  )}

                  <button
                    onClick={() => { setQrToken(null); startQrLogin(); }}
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
