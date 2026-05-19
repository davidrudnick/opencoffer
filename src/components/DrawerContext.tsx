"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const DrawerCtx = createContext<Ctx>({ open: false, setOpen: () => {} });

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [path]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape-key closes the drawer (helps a11y + e2e tests).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return <DrawerCtx.Provider value={{ open, setOpen }}>{children}</DrawerCtx.Provider>;
}

export function useDrawer() {
  return useContext(DrawerCtx);
}
