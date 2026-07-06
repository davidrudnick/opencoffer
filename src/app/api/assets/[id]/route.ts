import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { realAssets } from "@/lib/db/schema";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";
import { getOwnedRealAsset } from "@/lib/real-assets/data";

const dateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const patchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(["active", "sold", "archived"]).optional(),
  valuationMode: z.enum(["manual", "provider"]).optional(),
  purchasePrice: z.number().positive().nullable().optional(),
  purchaseDate: dateString.nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function revalidateAssetPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/charts");
  revalidatePath("/dashboard/assets");
}

function snapshotUser(userId: string) {
  void snapshotNetWorthForUser(userId).catch((error) => {
    console.error("[assets] snapshot failed:", error);
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const existing = await getOwnedRealAsset(id, session.user.id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [updated] = await db
    .update(realAssets)
    .set({
      ...("name" in parsed.data ? { name: parsed.data.name } : {}),
      ...("status" in parsed.data ? { status: parsed.data.status } : {}),
      ...("valuationMode" in parsed.data ? { valuationMode: parsed.data.valuationMode } : {}),
      ...("purchasePrice" in parsed.data
        ? { purchasePrice: parsed.data.purchasePrice == null ? null : String(parsed.data.purchasePrice) }
        : {}),
      ...("purchaseDate" in parsed.data
        ? { purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : null }
        : {}),
      ...("metadata" in parsed.data
        ? {
            metadata: {
              ...((existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {}) as Record<string, unknown>),
              ...parsed.data.metadata,
            },
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(realAssets.id, id), eq(realAssets.userId, session.user.id)))
    .returning();

  revalidateAssetPaths();
  snapshotUser(session.user.id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.delete(realAssets).where(and(eq(realAssets.id, id), eq(realAssets.userId, session.user.id)));
  revalidateAssetPaths();
  snapshotUser(session.user.id);
  return NextResponse.json({ ok: true });
}
