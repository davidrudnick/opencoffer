import { and, asc, inArray, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { familyMembers, financialAccounts, transactions } from "@/lib/db/schema";

/**
 * Scope helpers for the "held for" family-member feature.
 *
 * Accounts with `heldForId` set hold money that belongs to a family member
 * (e.g. a child's 529/UTMA): contributions into them are irreversible gifts.
 * Every aggregate that answers "how much do I have / earn / spend" must use
 * these filters so the member's money never counts as the user's.
 */

/** Accounts holding the household's own money. */
export function ownAccountsWhere(userIds: string[]): SQL {
  return and(inArray(financialAccounts.userId, userIds), isNull(financialAccounts.heldForId))!;
}

/** True when `accountIdCol` does NOT point at a held-for account. Works for any
 *  table carrying an account id (transactions, holdings). */
export function notHeldForWhere(accountIdCol: SQLWrapper): SQL {
  return sql`not exists (
    select 1 from ${financialAccounts}
    where ${financialAccounts.id} = ${accountIdCol}
      and ${financialAccounts.heldForId} is not null
  )`;
}

/** True when `accountIdCol` points at an account held for the given member. */
export function heldForMemberWhere(accountIdCol: SQLWrapper, memberId: string): SQL {
  return sql`exists (
    select 1 from ${financialAccounts}
    where ${financialAccounts.id} = ${accountIdCol}
      and ${financialAccounts.heldForId} = ${memberId}
  )`;
}

/** True when `accountIdCol` points at any held-for account. */
export function heldForAnyWhere(accountIdCol: SQLWrapper): SQL {
  return sql`exists (
    select 1 from ${financialAccounts}
    where ${financialAccounts.id} = ${accountIdCol}
      and ${financialAccounts.heldForId} is not null
  )`;
}

/** Restrict transaction aggregates to the household's own accounts. Activity
 *  inside held-for accounts (contributions landing, dividends, fund purchases)
 *  is the family member's, not the user's income or spending. */
export function ownTransactionsWhere(): SQL {
  return notHeldForWhere(transactions.accountId);
}

export type FamilyMember = typeof familyMembers.$inferSelect;

export async function listFamilyMembers(userIds: string[]): Promise<FamilyMember[]> {
  return db
    .select()
    .from(familyMembers)
    .where(inArray(familyMembers.userId, userIds))
    .orderBy(asc(familyMembers.name));
}

/** Case-insensitive lookup of a household family member by name. */
export async function findFamilyMember(userIds: string[], name: string): Promise<FamilyMember | null> {
  const rows = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        inArray(familyMembers.userId, userIds),
        sql`lower(${familyMembers.name}) = ${name.trim().toLowerCase()}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
