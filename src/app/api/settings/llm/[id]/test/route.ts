import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { llmCredentials } from "@/lib/db/schema";
import { testCredential } from "@/lib/llm/providers";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [cred] = await db
    .select()
    .from(llmCredentials)
    .where(and(eq(llmCredentials.id, id), eq(llmCredentials.userId, session.user.id)))
    .limit(1);
  if (!cred) return NextResponse.json({ error: "not found" }, { status: 404 });
  const r = await testCredential(cred);
  return NextResponse.json(r);
}
