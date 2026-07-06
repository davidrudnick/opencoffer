import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { realAssets } from "@/lib/db/schema";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";
import { getOwnedRealAsset, insertRealAssetValue, listRealAssetsForUser } from "@/lib/real-assets/data";

const dateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const assetBody = z.object({
  kind: z.enum(["home", "vehicle", "land", "other"]),
  name: z.string().min(1).max(120),
  valuationMode: z.enum(["manual", "provider"]).default("manual"),
  purchasePrice: z.number().positive().nullable().optional(),
  purchaseDate: dateString.nullable().optional(),
  currency: z.string().min(3).max(3).default("USD"),
  metadata: z.record(z.unknown()).default({}),
  currentValue: z.number().positive().nullable().optional(),
  valueAsOf: dateString.nullable().optional(),
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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const assets = await listRealAssetsForUser(session.user.id);
  return NextResponse.json(assets);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = assetBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const [asset] = await db
    .insert(realAssets)
    .values({
      userId: session.user.id,
      kind: parsed.data.kind,
      name: parsed.data.name,
      valuationMode: parsed.data.valuationMode,
      purchasePrice: parsed.data.purchasePrice == null ? null : String(parsed.data.purchasePrice),
      purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : null,
      isoCurrencyCode: parsed.data.currency.toUpperCase(),
      metadata: parsed.data.metadata,
    })
    .returning();

  if (parsed.data.currentValue != null) {
    await insertRealAssetValue(asset, {
      value: parsed.data.currentValue,
      source: "manual",
      sourceKind: "manual_entry",
      asOf: parsed.data.valueAsOf ? new Date(parsed.data.valueAsOf) : new Date(),
      notes: "Initial value",
    });
  }

  revalidateAssetPaths();
  snapshotUser(session.user.id);
  const full = await getOwnedRealAsset(asset.id, session.user.id);
  return NextResponse.json(full ?? asset);
}
