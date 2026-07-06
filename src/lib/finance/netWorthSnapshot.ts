import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { financialAccounts, netWorthSnapshots, users } from "@/lib/db/schema";
import { listRealAssetsForUser } from "@/lib/real-assets/data";

/**
 * Insert today's net-worth snapshot for one user. Idempotent (one per day);
 * if today already exists, update it in case the user has just synced more
 * data within the same day.
 */
export async function snapshotNetWorthForUser(userId: string) {
  const rows = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.userId, userId));
  const realAssetRows = await listRealAssetsForUser(userId);

  let assets = 0;
  let liabilities = 0;
  const byGroup: Record<string, number> = {};
  for (const a of rows) {
    const bal = Number(a.currentBalance ?? 0);
    if (a.type === "depository" || a.type === "investment") assets += bal;
    else if (a.type === "credit" || a.type === "loan") liabilities += Math.abs(bal);
    const g = a.userAccountGroup ?? a.accountGroup;
    byGroup[g] = (byGroup[g] ?? 0) + bal;
  }
  for (const asset of realAssetRows) {
    if (asset.status !== "active" || !asset.currentValue) continue;
    const value = asset.currentValue.value;
    assets += value;
    const g = asset.kind === "other" ? "other assets" : asset.kind;
    byGroup[g] = (byGroup[g] ?? 0) + value;
  }
  const net = assets - liabilities;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db
    .insert(netWorthSnapshots)
    .values({
      userId,
      snapshotDate: today,
      assets: String(assets),
      liabilities: String(liabilities),
      netWorth: String(net),
      byGroup,
    })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
      set: {
        assets: String(assets),
        liabilities: String(liabilities),
        netWorth: String(net),
        byGroup,
      },
    });
}

export async function snapshotAllUsers() {
  const us = await db.select({ id: users.id }).from(users);
  for (const u of us) {
    try {
      await snapshotNetWorthForUser(u.id);
    } catch (e) {
      console.error("[snapshot] failed for", u.id, e);
    }
  }
}
