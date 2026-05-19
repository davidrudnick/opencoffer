import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { MobileChrome } from "@/components/MobileNav";
import { DrawerProvider } from "@/components/DrawerContext";
import { DataAutoRefresh } from "@/components/DataAutoRefresh";
import {
  WORKSPACE_NAV,
  SETTINGS_NAV,
  type NavItem,
} from "@/components/nav-config";

async function signOutAction() {
  "use server";
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/login" });
}

export function AppShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string | null;
}) {
  return (
    <DrawerProvider>
    <div className="min-h-screen bg-surface text-on-surface md:grid md:grid-cols-[244px_1fr]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/5 bg-surface/70 px-4 py-5 backdrop-blur-xl md:flex">
        <Link
          href="/dashboard"
          prefetch
          className="coffer-glass flex h-12 items-center gap-3 rounded-2xl px-3 text-on-surface"
          title="OpenCoffer"
        >
          <Logo size={34} priority withWordmark />
        </Link>

        <nav className="mt-8 flex flex-col gap-2">
          <div className="overline px-3 pb-1">Workspace</div>
          {WORKSPACE_NAV.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>

        <nav className="mt-auto flex flex-col gap-2">
          <div className="overline px-3 pb-1">Settings</div>
          {SETTINGS_NAV.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>

        <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-on-surface"
            title={email ?? "Signed in"}
          >
            <span className="title-s">{(email ?? "?").charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="body-m truncate text-on-surface">{email ?? "Signed in"}</div>
            <div className="body-s text-on-surface-variant">Local vault</div>
          </div>
            <form action={signOutAction}>
              <button type="submit" className="btn-icon" title="Sign out" aria-label="Sign out">
                <LogOut size={18} strokeWidth={1.75} />
              </button>
            </form>
        </div>
      </aside>

      <MobileChrome email={email} signOutAction={signOutAction} />
      <DataAutoRefresh />

      {/* Pages add their own bottom clearance (pb-24 md:pb-0) for the mobile
          bottom nav. The chat page opts out because it computes its own
          viewport-bound layout. */}
      <main className="min-h-screen">{children}</main>
    </div>
    </DrawerProvider>
  );
}

function NavLink({ href, label, Icon }: NavItem) {
  return (
    <Link
      href={href}
      prefetch
      className="flex h-11 items-center gap-3 rounded-2xl px-3 text-on-surface-variant transition-colors hover:bg-white/[0.06] hover:text-on-surface"
      title={label}
      aria-label={label}
    >
      <Icon size={20} strokeWidth={1.9} />
      <span className="body-m text-inherit">{label}</span>
    </Link>
  );
}
