"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const STALE_MINUTES = 30;
const MIN_CHECK_INTERVAL_MS = 60 * 60_000;
const CHECK_KEY = "opencoffer:last-auto-refresh-check";
const LOCK_KEY = "opencoffer:auto-refresh-lock";
const LOCK_TTL_MS = 2 * 60_000;

function requestIdle(fn: () => void) {
  if ("requestIdleCallback" in window) {
    let idleId: number | null = null;
    const timeout = window.setTimeout(() => {
      idleId = window.requestIdleCallback(fn, { timeout: 15_000 });
    }, 12_000);
    return () => {
      window.clearTimeout(timeout);
      if (idleId != null) window.cancelIdleCallback(idleId);
    };
  }
  const id = setTimeout(fn, 12_000);
  return () => clearTimeout(id);
}

function readNumber(key: string) {
  const value = Number(window.sessionStorage.getItem(key) ?? "0");
  return Number.isFinite(value) ? value : 0;
}

function acquireRefreshLock(now: number) {
  const lockedAt = readNumber(LOCK_KEY);
  if (lockedAt > 0 && now - lockedAt < LOCK_TTL_MS) return false;
  window.sessionStorage.setItem(LOCK_KEY, String(now));
  return true;
}

function releaseRefreshLock() {
  window.sessionStorage.removeItem(LOCK_KEY);
}

function markChecked(now: number) {
  window.sessionStorage.setItem(CHECK_KEY, String(now));
}

function shouldCheck(now: number) {
  return now - readNumber(CHECK_KEY) >= MIN_CHECK_INTERVAL_MS;
}

/**
 * Keeps stored finance data reasonably fresh without blocking initial mobile
 * render. The API skips work when every active connection synced recently, and
 * this component only refreshes the route when at least one connection changed.
 */
export function DataAutoRefresh() {
  const router = useRouter();
  const lastCheck = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkFreshness() {
      if (cancelled || document.visibilityState !== "visible" || inFlight.current) return;
      const now = Date.now();
      if (now - lastCheck.current < MIN_CHECK_INTERVAL_MS || !shouldCheck(now)) return;
      if (!acquireRefreshLock(now)) return;
      lastCheck.current = now;
      markChecked(now);
      inFlight.current = true;
      try {
        const res = await fetch(`/api/simplefin/sync?staleMinutes=${STALE_MINUTES}`, {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { synced?: number };
        if (!cancelled && (json.synced ?? 0) > 0) router.refresh();
      } catch {
        // Background freshness should never disrupt navigation or typing.
      } finally {
        inFlight.current = false;
        releaseRefreshLock();
      }
    }

    const cancelIdle = requestIdle(checkFreshness);
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [router]);

  return null;
}
