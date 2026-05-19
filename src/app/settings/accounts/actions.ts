"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { financialAccounts } from "@/lib/db/schema";
import { householdUserIds } from "@/lib/household";

const ALLOWED_GROUPS = ["cash", "credit", "retirement", "brokerage", "hsa", "loan", "other"] as const;
type Group = (typeof ALLOWED_GROUPS)[number];

export async function setAccountGroup(accountId: string, group: Group | "default") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  if (group !== "default" && !ALLOWED_GROUPS.includes(group)) {
    throw new Error(`invalid group: ${group}`);
  }
  const ids = await householdUserIds(session.user.id);
  const value: Group | null = group === "default" ? null : group;

  const r = await db
    .update(financialAccounts)
    .set({ userAccountGroup: value })
    .where(and(inArray(financialAccounts.userId, ids), eq(financialAccounts.id, accountId)))
    .returning({ id: financialAccounts.id });

  if (r.length === 0) throw new Error("account not found");

  revalidatePath("/settings/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/investments");
  revalidatePath("/dashboard/charts");
  return { ok: true };
}
