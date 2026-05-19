import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { llmCredentials } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * ChatGPT-subscription provider — talks to https://chatgpt.com/backend-api/codex/v1
 * with an OAuth token bound to a user's ChatGPT Plus/Pro/Business subscription
 * (same mechanism as the official `codex` CLI and opencode's codex-auth plugin).
 *
 * The credential is stored as a JSON blob (encrypted) in llm_credentials.apiKeyCipher:
 *   { access_token, refresh_token, id_token?, account_id?, expires_at }
 *
 * We refresh access_token automatically when within 60s of expiry.
 */

const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

// NOTE: no `/v1` segment — official codex CLI hits chatgpt.com/backend-api/codex/responses
// directly. Adding /v1 produces a 404 from the codex backend.
export const CHATGPT_BACKEND_BASE = "https://chatgpt.com/backend-api/codex";

export type ChatGPTTokenBundle = {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  account_id?: string;
  /** Epoch ms when access_token expires. */
  expires_at: number;
};

/** Parse the contents of ~/.codex/auth.json (as pasted by the user). */
export function parseCodexAuthJson(raw: string): ChatGPTTokenBundle {
  const j = JSON.parse(raw);
  // codex CLI uses { tokens: { access_token, refresh_token, id_token, account_id } }
  const t = j.tokens ?? j;
  if (!t.access_token || !t.refresh_token) {
    throw new Error(
      "auth.json missing access_token or refresh_token — run `codex login` first.",
    );
  }
  const account_id = t.account_id ?? extractAccountIdFromIdToken(t.id_token);
  return {
    access_token: String(t.access_token),
    refresh_token: String(t.refresh_token),
    id_token: t.id_token ? String(t.id_token) : undefined,
    account_id,
    expires_at: extractExpiryFromJwt(t.access_token) ?? Date.now() + 50 * 60_000,
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
function extractExpiryFromJwt(jwt?: string): number | null {
  if (!jwt) return null;
  const p = decodeJwtPayload(jwt);
  return p && typeof p.exp === "number" ? p.exp * 1000 : null;
}
function extractAccountIdFromIdToken(jwt?: string): string | undefined {
  if (!jwt) return undefined;
  const p = decodeJwtPayload(jwt);
  // The chatgpt id_token carries the account in a few possible places.
  const ch = (p?.["https://api.openai.com/auth"] ?? {}) as Record<string, unknown>;
  const acc =
    (ch.chatgpt_account_id as string | undefined) ??
    (ch.account_id as string | undefined) ??
    (p?.["chatgpt_account_id"] as string | undefined);
  return acc;
}

async function refreshAccessToken(bundle: ChatGPTTokenBundle): Promise<ChatGPTTokenBundle> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: bundle.refresh_token,
      client_id: OAUTH_CLIENT_ID,
      scope: "openid profile email offline_access",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ChatGPT token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? bundle.refresh_token, // rotate if provider sent a new one
    id_token: j.id_token ?? bundle.id_token,
    account_id: extractAccountIdFromIdToken(j.id_token) ?? bundle.account_id,
    expires_at:
      extractExpiryFromJwt(j.access_token) ??
      Date.now() + (j.expires_in ? j.expires_in * 1000 : 50 * 60_000),
  };
}

/**
 * Return a valid (non-expired) ChatGPT token bundle for the given credential row.
 * Refreshes against auth.openai.com if within 60s of expiry, and persists the
 * rotated tokens back to the row (still encrypted).
 */
export async function getValidChatGPTBundle(credId: string): Promise<ChatGPTTokenBundle> {
  const [cred] = await db
    .select()
    .from(llmCredentials)
    .where(eq(llmCredentials.id, credId))
    .limit(1);
  if (!cred || !cred.apiKeyCipher) {
    throw new Error("ChatGPT subscription credential not found");
  }
  const bundle = JSON.parse(decrypt(cred.apiKeyCipher)) as ChatGPTTokenBundle;

  if (Date.now() < bundle.expires_at - 60_000) return bundle;

  const refreshed = await refreshAccessToken(bundle);
  await db
    .update(llmCredentials)
    .set({ apiKeyCipher: encrypt(JSON.stringify(refreshed)) })
    .where(eq(llmCredentials.id, credId));
  return refreshed;
}
