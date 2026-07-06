import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppBar } from "@/components/AppBar";
import { listRealAssetsForUser } from "@/lib/real-assets/data";
import { AssetsClient, type AssetRow } from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const assets = await listRealAssetsForUser(session.user.id);

  return (
    <>
      <AppBar title="Assets" subtitle="Homes, vehicles, land, and other property" />
      <div className="mx-auto max-w-6xl p-4 pb-28 md:p-8 md:pb-8">
        <AssetsClient assets={assets.map(serializeAsset)} />
      </div>
    </>
  );
}

function serializeAsset(asset: Awaited<ReturnType<typeof listRealAssetsForUser>>[number]): AssetRow {
  return {
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    status: asset.status,
    valuationMode: asset.valuationMode,
    purchasePrice: asset.purchasePrice == null ? null : Number(asset.purchasePrice),
    purchaseDate: asset.purchaseDate?.toISOString() ?? null,
    currency: asset.isoCurrencyCode ?? "USD",
    metadata: asset.metadata && typeof asset.metadata === "object" ? (asset.metadata as Record<string, unknown>) : {},
    currentValue: asset.currentValue
      ? {
          id: asset.currentValue.id,
          value: asset.currentValue.value,
          currency: asset.currentValue.currency,
          source: asset.currentValue.source,
          sourceKind: asset.currentValue.sourceKind,
          asOf: new Date(asset.currentValue.asOf).toISOString(),
          rangeLow: asset.currentValue.rangeLow == null ? null : Number(asset.currentValue.rangeLow),
          rangeHigh: asset.currentValue.rangeHigh == null ? null : Number(asset.currentValue.rangeHigh),
          confidence: asset.currentValue.confidence == null ? null : Number(asset.currentValue.confidence),
          notes: asset.currentValue.notes ?? null,
        }
      : null,
    values: asset.values.slice(0, 8).map((value) => ({
      id: value.id,
      value: Number(value.value),
      currency: value.isoCurrencyCode ?? "USD",
      source: value.source,
      sourceKind: value.sourceKind,
      asOf: value.asOf.toISOString(),
      rangeLow: value.rangeLow == null ? null : Number(value.rangeLow),
      rangeHigh: value.rangeHigh == null ? null : Number(value.rangeHigh),
      confidence: value.confidence == null ? null : Number(value.confidence),
      notes: value.notes,
    })),
  };
}
