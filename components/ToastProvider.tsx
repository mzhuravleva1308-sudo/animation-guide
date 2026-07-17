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
};

type ToastContextValue = {
  showToast: (title: string, text: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const showToast = useCallback((title: string, text: string) => {
    setIsExiting(false);
    setToast((current) => ({
      id: (current?.id ?? 0) + 1,
      title,
      text,
    }));
  }, []);

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
    }, 170);

    return () => window.clearTimeout(timeoutId);
  }, [isExiting, toast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 top-[calc(20px+env(safe-area-inset-top))] z-[100] flex justify-center sm:top-[calc(32px+env(safe-area-inset-top))]"
        data-testid="toast-region"
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-fit max-w-[420px] items-center gap-2 rounded-[13px] border border-stone-200 bg-white px-3.5 py-2 text-left shadow-md shadow-black/10 max-[639px]:w-[calc(100vw-24px)] ${
              isExiting ? "toast-exit" : "toast-enter"
            }`}
            data-testid="toast"
          >
            <span
              aria-hidden="true"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-2">
                <path d="m3.25 8.25 3 3 6.5-6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="min-w-0 text-[13px] font-normal leading-5 text-stone-700 max-[639px]:line-clamp-2 sm:whitespace-nowrap">
              <span className="font-semibold text-stone-900">{toast.title}</span>{" "}
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
