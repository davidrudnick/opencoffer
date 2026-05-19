import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { llmCredentials } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { buildCredentialUpdateValues, LLM_PROVIDERS } from "@/lib/llm/settings";

const patch = z.object({
  label: z.string().optional(),
  provider: z.enum(LLM_PROVIDERS).optional(),
  baseUrl: z.string().optional().nullable(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  authJson: z.string().optional(),
  isDefault: z.boolean().optional(),
  useForAnalysis: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const [existing] = await db
    .select()
    .from(llmCredentials)
    .where(and(eq(llmCredentials.id, id), eq(llmCredentials.userId, session.user.id)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { values, error } = buildCredentialUpdateValues({
    body: parsed.data,
    existing,
    encryptSecret: encrypt,
  });
  if (error) return NextResponse.json({ error }, { status: 400 });

  if (Object.keys(values).length > 0) {
    await db
      .update(llmCredentials)
      .set(values)
      .where(and(eq(llmCredentials.userId, session.user.id), eq(llmCredentials.id, id)));
  }

  if (parsed.data.isDefault) {
    await db
      .update(llmCredentials)
      .set({ isDefault: false })
      .where(and(eq(llmCredentials.userId, session.user.id), ne(llmCredentials.id, id)));
    await db
      .update(llmCredentials)
      .set({ isDefault: true })
      .where(and(eq(llmCredentials.userId, session.user.id), eq(llmCredentials.id, id)));
  }
  if (parsed.data.useForAnalysis !== undefined) {
    if (parsed.data.useForAnalysis) {
      await db
        .update(llmCredentials)
        .set({ useForAnalysis: false })
        .where(and(eq(llmCredentials.userId, session.user.id), ne(llmCredentials.id, id)));
      await db
        .update(llmCredentials)
        .set({ useForAnalysis: true })
        .where(and(eq(llmCredentials.userId, session.user.id), eq(llmCredentials.id, id)));
    } else {
      await db
        .update(llmCredentials)
        .set({ useForAnalysis: false })
        .where(and(eq(llmCredentials.userId, session.user.id), eq(llmCredentials.id, id)));
    }
  }

  const [row] = await db
    .select({
      id: llmCredentials.id,
      label: llmCredentials.label,
      provider: llmCredentials.provider,
      model: llmCredentials.model,
      baseUrl: llmCredentials.baseUrl,
      isDefault: llmCredentials.isDefault,
      useForAnalysis: llmCredentials.useForAnalysis,
      createdAt: llmCredentials.createdAt,
    })
    .from(llmCredentials)
    .where(and(eq(llmCredentials.id, id), eq(llmCredentials.userId, session.user.id)))
    .limit(1);
  return NextResponse.json({ ...row, createdAt: row.createdAt.toISOString() });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db
    .delete(llmCredentials)
    .where(and(eq(llmCredentials.id, id), eq(llmCredentials.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
