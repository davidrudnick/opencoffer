"use client";

import * as Toast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { clientId } from "@/lib/clientCompat";

type ToastVariant = "success" | "error";

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastEntry = ToastInput & {
  id: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const toast = useCallback((input: ToastInput) => {
    const id = clientId();
    setToasts((current) => [
      ...current,
      { ...input, id, variant: input.variant ?? "success" },
    ]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: "success" }),
      error: (title, description) => toast({ title, description, variant: "error" }),
    }),
    [toast],
  );

  return (
    <Toast.Provider swipeDirection="right" duration={4200}>
      <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
      {toasts.map((item) => (
        <Toast.Root
          key={item.id}
          className={cn(
            "grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[swipe=end]:animate-out data-[swipe=end]:fade-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[swipe=end]:animate-none",
            item.variant === "error"
              ? "border-error/20 bg-error-container text-on-error-container"
              : "border-success/20 bg-success-container text-on-success-container",
          )}
          onOpenChange={(open) => {
            if (!open) setToasts((current) => current.filter((toast) => toast.id !== item.id));
          }}
        >
          {item.variant === "error" ? (
            <XCircle size={20} strokeWidth={2} className="mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={20} strokeWidth={2} className="mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <Toast.Title className="title-s">{item.title}</Toast.Title>
            {item.description && (
              <Toast.Description className="body-s mt-1 opacity-80">
                {item.description}
              </Toast.Description>
            )}
          </div>
          <Toast.Close className="btn-icon -mr-2 -mt-2 h-9 w-9 text-inherit" aria-label="Dismiss">
            <span aria-hidden>×</span>
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport
        aria-live="polite"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-3 z-[80] flex w-[min(calc(100vw-1.5rem),24rem)] flex-col gap-2 outline-none md:bottom-6 md:right-6"
      />
    </Toast.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToasterProvider");
  return value;
}
