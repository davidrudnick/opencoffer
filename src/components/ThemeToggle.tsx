"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Mode = "light" | "dark" | "system";

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("of-theme") as Mode | null) ?? "dark";
    setMode(saved);
    apply(saved);
  }, []);

  const cycle = () => {
    const next: Mode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    setMode(next);
    localStorage.setItem("of-theme", next);
    apply(next);
  };

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

  return (
    <button
      onClick={cycle}
      className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-white/10 hover:text-on-surface"
      aria-label={`Theme: ${mode}. Click to switch.`}
      title={`Theme: ${mode}`}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}
