"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after N ms (0 keeps it until closed). Default 4000. */
  duration?: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const VARIANT_META: Record<ToastVariant, { icon: React.ComponentType<{ className?: string }>; color: string; ring: string }> = {
  success: { icon: CheckCircle2, color: "text-ctp-green", ring: "border-ctp-green/30" },
  error: { icon: AlertCircle, color: "text-ctp-red", ring: "border-ctp-red/30" },
  info: { icon: Info, color: "text-ctp-sky", ring: "border-ctp-sky/30" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const remove = React.useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = ++idRef.current;
      const variant = input.variant ?? "info";
      setToasts((list) => [...list, { id, title: input.title, description: input.description, variant }]);
      const duration = input.duration ?? 4000;
      if (duration > 0) window.setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: "success" }),
      error: (title, description) => toast({ title, description, variant: "error", duration: 6000 }),
      info: (title, description) => toast({ title, description, variant: "info" }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const meta = VARIANT_META[toast.variant];
  const Icon = meta.icon;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex animate-toast-in items-start gap-3 rounded-lg border bg-card p-3 shadow-xl",
        meta.ring,
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.color)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="-mr-1 -mt-1 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
