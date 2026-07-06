"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, type NavItem } from "@/components/nav-config";

export function DesktopNavLink({ href, label, Icon }: NavItem) {
  const path = usePathname();
  const active = isActive(path, href);

  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "flex h-11 items-center gap-3 rounded-2xl px-3 text-on-surface-variant transition-colors hover:bg-on-surface/[0.06] hover:text-on-surface",
        active && "bg-primary-container text-on-primary-container hover:bg-primary-container hover:text-on-primary-container",
      )}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={20} strokeWidth={active ? 2.1 : 1.9} />
      <span className="body-m text-inherit">{label}</span>
    </Link>
  );
}
