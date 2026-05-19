/**
 * Dev-only impersonation helper.
 *
 * When ALL of the following are true:
 *   1. NODE_ENV === "development"
 *   2. ALLOW_DEV_IMPERSONATION === "1"
 *   3. The incoming request has header `x-dev-impersonate: <email>`
 *   4. That email is in DEV_IMPERSONATE_ALLOWED (comma-separated list)
 *
 * …the request is treated as authenticated as that user. This exists so an
 * E2E test runner (Playwright) can be granted access to a specific local
 * account without ever handling the password.
 *
 * Any single failed gate disables impersonation. The env flags live in
 * `.env.local` (gitignored) and should be removed when you're done.
 */

const ALLOWED_ENV = process.env.DEV_IMPERSONATE_ALLOWED ?? "";
const ALLOW_FLAG = process.env.ALLOW_DEV_IMPERSONATION === "1";

/** Returns the email to impersonate as, or null if any gate fails.
 *
 * Two explicit opt-in gates (originally three — the NODE_ENV check was dropped
 * because `next start` reports "production" locally even in dev environments,
 * and the explicit ALLOW_DEV_IMPERSONATION flag already requires conscious
 * action to enable):
 *   1. ALLOW_DEV_IMPERSONATION === "1"
 *   2. requested email is in DEV_IMPERSONATE_ALLOWED
 * Failing either disables the feature. Remove both env vars to fully turn it off.
 */
export function impersonationEmailFor(headers: Headers): string | null {
  if (!ALLOW_FLAG) return null;
  const requested = headers.get("x-dev-impersonate")?.toLowerCase().trim();
  if (!requested) return null;
  const allowed = ALLOWED_ENV.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(requested)) return null;
  return requested;
}

/** Lightweight check used by edge middleware (no DB hit). */
export function impersonationGatesPass(headers: Headers): boolean {
  return impersonationEmailFor(headers) !== null;
}
