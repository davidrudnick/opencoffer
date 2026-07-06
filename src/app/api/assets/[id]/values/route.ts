import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";
import { getOwnedRealAsset, insertRealAssetValue } from "@/lib/real-assets/data";

const dateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const valueBody = z.object({
  value: z.number().positive(),
  asOf: dateString.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = valueBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const asset = await getOwnedRealAsset(id, session.user.id);
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = await insertRealAssetValue(asset, {
    value: parsed.data.value,
    source: "manual",
    sourceKind: "manual_entry",
    asOf: parsed.data.asOf ? new Date(parsed.data.asOf) : new Date(),
    notes: parsed.data.notes ?? "Manual value",
  });
  revalidateAssetPaths();
  snapshotUser(session.user.id);
  return NextResponse.json(row);
}
