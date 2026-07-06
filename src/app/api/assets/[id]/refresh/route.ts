import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";
import { getOwnedRealAsset } from "@/lib/real-assets/data";
import { refreshRealAssetMarketValue } from "@/lib/real-assets/refresh";

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

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const asset = await getOwnedRealAsset(id, session.user.id);
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await refreshRealAssetMarketValue(asset);
  revalidateAssetPaths();
  snapshotUser(session.user.id);
  return NextResponse.json(result);
}
