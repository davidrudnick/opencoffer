import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { llmCredentials } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { parseCodexAuthJson } from "@/lib/llm/chatgpt-subscription";

const body = z.object({
  label: z.string().min(1),
  provider: z.enum(["openai-compat", "anthropic", "chatgpt-subscription"]),
  baseUrl: z.string().optional().nullable(),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  /** For chatgpt-subscription: raw contents of ~/.codex/auth.json */
  authJson: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { label, provider, baseUrl, model, apiKey, authJson, isDefault } = parsed.data;

  let apiKeyCipher: string | null = null;

  if (provider === "anthropic" && !apiKey && !baseUrl) {
    return NextResponse.json(
      { error: "Anthropic requires either an API key or a custom base URL" },
      { status: 400 },
    );
  }
  if (provider === "openai-compat" || provider === "anthropic") {
    apiKeyCipher = apiKey ? encrypt(apiKey) : null;
  }
  if (provider === "chatgpt-subscription") {
    if (!authJson) {
      return NextResponse.json(
        { error: "ChatGPT subscription requires the contents of ~/.codex/auth.json" },
        { status: 400 },
      );
    }
    try {
      const bundle = parseCodexAuthJson(authJson);
      apiKeyCipher = encrypt(JSON.stringify(bundle));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid auth.json" },
        { status: 400 },
      );
    }
  }

  if (isDefault) {
    await db
      .update(llmCredentials)
      .set({ isDefault: false })
      .where(and(eq(llmCredentials.userId, session.user.id), eq(llmCredentials.isDefault, true)));
  }

  const [row] = await db
    .insert(llmCredentials)
    .values({
      userId: session.user.id,
      label,
      provider,
      baseUrl: baseUrl || null,
      model,
      apiKeyCipher,
      isDefault: !!isDefault,
    })
    .returning({
      id: llmCredentials.id,
      label: llmCredentials.label,
      provider: llmCredentials.provider,
      model: llmCredentials.model,
      baseUrl: llmCredentials.baseUrl,
      isDefault: llmCredentials.isDefault,
      useForAnalysis: llmCredentials.useForAnalysis,
      createdAt: llmCredentials.createdAt,
    });
  return NextResponse.json({ ...row, createdAt: row.createdAt.toISOString() });
}
