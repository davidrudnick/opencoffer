"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { familyMembers, financialAccounts } from "@/lib/db/schema";
import { householdUserIds } from "@/lib/household";
import { backfillNetWorth } from "@/lib/finance/netWorthBackfill";

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

  revalidateAccountViews();
  return { ok: true };
}

export async function renameAccount(accountId: string, name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) throw new Error("name must be 1-120 characters");
  const ids = await householdUserIds(session.user.id);

  const r = await db
    .update(financialAccounts)
    .set({ name: trimmed, nameIsCustom: true, updatedAt: new Date() })
    .where(and(inArray(financialAccounts.userId, ids), eq(financialAccounts.id, accountId)))
    .returning({ id: financialAccounts.id });

  if (r.length === 0) throw new Error("account not found");

  revalidateAccountViews();
  return { ok: true, name: trimmed };
}

/** Restore the provider-supplied name. If the provider name hasn't been captured
 *  yet (older rows), the current name is kept and the next sync restores it. */
export async function resetAccountName(accountId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const ids = await householdUserIds(session.user.id);

  const r = await db
    .update(financialAccounts)
    .set({
      name: sql`coalesce(${financialAccounts.officialName}, ${financialAccounts.name})`,
      nameIsCustom: false,
      updatedAt: new Date(),
    })
    .where(and(inArray(financialAccounts.userId, ids), eq(financialAccounts.id, accountId)))
    .returning({ name: financialAccounts.name });

  if (r.length === 0) throw new Error("account not found");

  revalidateAccountViews();
  return { ok: true, name: r[0].name };
}

/* ---------- Family members ("held for" tagging) ---------- */

export async function createFamilyMember(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) throw new Error("name must be 1-80 characters");
  const ids = await householdUserIds(session.user.id);
  const [existing] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(and(inArray(familyMembers.userId, ids), sql`lower(${familyMembers.name}) = ${trimmed.toLowerCase()}`))
    .limit(1);
  if (existing) throw new Error("a family member with that name already exists");
  const [created] = await db
    .insert(familyMembers)
    .values({ userId: session.user.id, name: trimmed })
    .returning({ id: familyMembers.id, name: familyMembers.name });
  revalidateAccountViews();
  return created;
}

export async function renameFamilyMember(memberId: string, name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) throw new Error("name must be 1-80 characters");
  const ids = await householdUserIds(session.user.id);
  const r = await db
    .update(familyMembers)
    .set({ name: trimmed })
    .where(and(inArray(familyMembers.userId, ids), eq(familyMembers.id, memberId)))
    .returning({ id: familyMembers.id });
  if (r.length === 0) throw new Error("family member not found");
  revalidateAccountViews();
  return { ok: true };
}

/** Deleting a member returns their accounts to the user's own money
 *  (held_for_id is SET NULL by the FK) and drops their snapshot history. */
export async function deleteFamilyMember(memberId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const ids = await householdUserIds(session.user.id);
  const affected = await db
    .select({ userId: financialAccounts.userId })
    .from(financialAccounts)
    .where(and(inArray(financialAccounts.userId, ids), eq(financialAccounts.heldForId, memberId)));
  const r = await db
    .delete(familyMembers)
    .where(and(inArray(familyMembers.userId, ids), eq(familyMembers.id, memberId)))
    .returning({ id: familyMembers.id });
  if (r.length === 0) throw new Error("family member not found");
  // Their accounts just rejoined the user's net worth — rebuild history.
  for (const owner of new Set(affected.map((a) => a.userId))) {
    await backfillNetWorth(owner, 365);
  }
  revalidateAccountViews();
  return { ok: true };
}

export async function setAccountHeldFor(accountId: string, memberId: string | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const ids = await householdUserIds(session.user.id);
  if (memberId) {
    const [member] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(and(inArray(familyMembers.userId, ids), eq(familyMembers.id, memberId)))
      .limit(1);
    if (!member) throw new Error("family member not found");
  }
  const r = await db
    .update(financialAccounts)
    .set({ heldForId: memberId, updatedAt: new Date() })
    .where(and(inArray(financialAccounts.userId, ids), eq(financialAccounts.id, accountId)))
    .returning({ id: financialAccounts.id, userId: financialAccounts.userId });
  if (r.length === 0) throw new Error("account not found");
  // Rebuild history so the tag applies retroactively (no cliff on tag day).
  await backfillNetWorth(r[0].userId, 365);
  revalidateAccountViews();
  return { ok: true };
}

function revalidateAccountViews() {
  revalidatePath("/settings/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/investments");
  revalidatePath("/dashboard/family");
  revalidatePath("/dashboard/charts");
}
