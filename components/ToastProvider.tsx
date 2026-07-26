"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type ToastMessage = {
  id: number;
  title: string;
  text: string;
  variant: "success" | "error";
};

type ToastContextValue = {
  showToast: (
    title: string,
    text: string,
    variant?: ToastMessage["variant"]
  ) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const showToast = useCallback(
    (
      title: string,
      text: string,
      variant: ToastMessage["variant"] = "success"
    ) => {
      setIsExiting(false);
      setToast((current) => ({
        id: (current?.id ?? 0) + 1,
        title,
        text,
        variant,
      }));
    },
    []
  );

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsExiting(true);
    }, 3_000);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!toast || !isExiting) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [isExiting, toast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[100] flex flex-col-reverse items-center gap-2 px-3 sm:bottom-7"
        data-testid="toast-region"
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-fit max-w-[min(420px,calc(100vw-24px))] items-center gap-2 rounded-[11px] border px-4 py-2.5 text-left shadow-sm shadow-black/[0.04] ${
              toast.variant === "error"
                ? "border-stone-200 bg-white"
                : "border-soft-panel-border bg-soft-panel"
            } ${isExiting ? "toast-exit" : "toast-enter"}`}
            data-testid="toast"
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                toast.variant === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-soft-panel-hover text-soft-panel-fg"
              }`}
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-2">
                {toast.variant === "error" ? (
                  <path
                    d="m4.5 4.5 7 7m0-7-7 7"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="m3.25 8.25 3 3 6.5-6.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            </span>
            <p
              className={`min-w-0 text-[13px] font-normal leading-5 sm:whitespace-nowrap ${
                toast.variant === "error"
                  ? "text-stone-700"
                  : "text-soft-panel-fg"
              }`}
            >
              <span
                className={`font-semibold ${
                  toast.variant === "error"
                    ? "text-stone-900"
                    : "text-soft-panel-fg"
                }`}
              >
                {toast.title}
              </span>{" "}
              {toast.text}
            </p>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}
