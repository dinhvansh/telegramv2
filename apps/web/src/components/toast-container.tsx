"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useToast, type Toast } from "@/context/toast-context";

function typeStyles(type: Toast["type"]) {
  switch (type) {
    case "error":
      return "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
    case "success":
      return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
    case "warning":
      return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
    default:
      return "bg-[color:var(--primary-soft)] text-[color:var(--primary)]";
  }
}

function typeIcon(type: Toast["type"]) {
  switch (type) {
    case "error":
      return "✕";
    case "success":
      return "✓";
    case "warning":
      return "⚠";
    default:
      return "ℹ";
  }
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`flex items-center gap-3 rounded-[16px] px-4 py-3 text-sm font-semibold shadow-[0_8px_32px_rgba(42,52,57,0.12)] ${typeStyles(toast.type)}`}
    >
      <span className="text-base leading-none">{typeIcon(toast.type)}</span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-xs opacity-60 transition-opacity hover:opacity-100"
        aria-label="Đóng thông báo"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Thông báo"
      className="fixed right-5 top-28 z-[9999] flex flex-col gap-2"
      style={{ pointerEvents: "none" }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
