import type { NextAuthConfig, DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/**
 * Edge-safe Auth.js config — no adapter, no node-only imports.
 * Used by `src/middleware.ts`. The full config in `src/auth.ts`
 * extends this with the Drizzle adapter and credentials authorize().
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.uid = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
