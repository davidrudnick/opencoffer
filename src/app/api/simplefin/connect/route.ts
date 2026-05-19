import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { connections } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { claimSetupToken } from "@/lib/simplefin/client";
import { syncConnection } from "@/lib/simplefin/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({
  setupToken: z.string().min(8),
  label: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  let accessUrl: string;
  try {
    accessUrl = await claimSetupToken(parsed.data.setupToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to claim setup token";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const [row] = await db
    .insert(connections)
    .values({
      userId: session.user.id,
      accessUrlCipher: encrypt(accessUrl),
      label: parsed.data.label ?? null,
    })
    .returning();

  // Fire-and-forget initial 2-year backfill.
  syncConnection(row.id).catch((e) => console.error("initial simplefin sync failed", e));

  return NextResponse.json({ id: row.id });
}
