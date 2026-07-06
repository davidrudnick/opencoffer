import NextAuth from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { authConfig } from "@/auth.config";
import { impersonationEmailFor } from "@/lib/devImpersonation";
import { clearRateLimit, rateLimitAttempt, type RateLimitStore } from "@/lib/auth/rateLimit";

const loginAttemptsByEmail: RateLimitStore = new Map();

const nextAuth = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        if (!rateLimitAttempt(loginAttemptsByEmail, email)) return null;
        const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!u || !u.passwordHash) return null;
        const ok = await bcrypt.compare(password, u.passwordHash);
        if (!ok) return null;
        clearRateLimit(loginAttemptsByEmail, email);
        return { id: u.id, email: u.email, name: u.name };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Wrapped auth(): when dev-impersonation gates pass and a valid email header
 * is present, synthesize a session for that user without going through the
 * normal NextAuth flow. Otherwise behaves identically to the original.
 *
 * Gates checked inside impersonationEmailFor():
 *   - NODE_ENV === "development"
 *   - ALLOW_DEV_IMPERSONATION === "1"
 *   - header `x-dev-impersonate: <email>` in DEV_IMPERSONATE_ALLOWED
 */
export const auth = (async (): Promise<Session | null> => {
  // Server-only: pull headers from the current request.
  try {
    const h = await headers();
    const email = impersonationEmailFor(h);
    if (email) {
      const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (u) {
        // Big warning trail so we never miss when this is active.
        console.warn("[dev-impersonation] serving request as", email, "(user.id =", u.id + ")");
        return {
          user: { id: u.id, email: u.email, name: u.name ?? null, image: null },
          expires: new Date(Date.now() + 30 * 60_000).toISOString(),
        } as Session;
      }
    }
  } catch {
    // headers() throws outside request scope — fall through to real auth.
  }
  return nextAuth.auth();
}) as typeof nextAuth.auth;
