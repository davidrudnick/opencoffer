"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      confirmState?.resolve(value);
      setConfirmState(null);
    },
    [confirmState],
  );

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog.Root open={Boolean(confirmState)} onOpenChange={(open) => !open && close(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-scrim/45 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-outline-variant bg-surface-container-high p-6 text-on-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none">
            <Dialog.Title className="title-l">{confirmState?.title}</Dialog.Title>
            <Dialog.Description className="body-m mt-3 text-on-surface-variant">
              {confirmState?.body}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-text">
                  {confirmState?.cancelLabel ?? "Cancel"}
                </button>
              </Dialog.Close>
              <button type="button" className="btn btn-filled bg-error text-on-error hover:bg-error/90" onClick={() => close(true)}>
                {confirmState?.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}
