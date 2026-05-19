import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { connections, financialAccounts, transactions } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";

/**
 * CSV import for accounts SimpleFIN doesn't cover (e.g. detailed Fidelity 401k
 * activity statements). Accepts a CSV body (text/csv or text/plain) plus an
 * `accountName` query param. Auto-detects common header names: Date, Amount,
 * Description (or Payee, Name).
 *
 * Creates a connection labelled "Manual import — {accountName}" with a junk
 * accessUrl placeholder so it shows up in /settings/connections like any other.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const accountName = url.searchParams.get("accountName") || "Manual";
  const type = (url.searchParams.get("type") || "depository").toLowerCase();
  const group = (url.searchParams.get("group") || "cash").toLowerCase();
  const text = await req.text();
  if (!text || text.length < 4) return NextResponse.json({ error: "empty CSV" }, { status: 400 });

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return NextResponse.json({ error: "need header + 1 row" }, { status: 400 });

  const header = parseRow(lines[0]).map((h) => h.toLowerCase().trim());
  const dateIdx = findCol(header, ["date", "posted", "posted date", "transaction date"]);
  const amtIdx = findCol(header, ["amount", "amt", "debit/credit"]);
  const descIdx = findCol(header, ["description", "name", "payee", "merchant", "memo"]);
  if (dateIdx < 0 || amtIdx < 0)
    return NextResponse.json({ error: "need at least Date + Amount columns" }, { status: 400 });

  // Persist as a connection so it survives like the real ones.
  const [conn] = await db
    .insert(connections)
    .values({
      userId: session.user.id,
      accessUrlCipher: encrypt(`manual://${crypto.randomUUID()}`),
      orgDomain: null,
      orgName: "Manual import",
      label: `Manual — ${accountName}`,
    })
    .returning();

  const [acct] = await db
    .insert(financialAccounts)
    .values({
      connectionId: conn.id,
      userId: session.user.id,
      externalAccountId: `manual:${conn.id}`,
      name: accountName,
      type,
      subtype: null,
      accountGroup: group,
      currentBalance: "0",
      availableBalance: "0",
      isoCurrencyCode: "USD",
    })
    .returning();

  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const dateStr = cols[dateIdx]?.trim();
    const amtStr = cols[amtIdx]?.trim().replace(/[,$]/g, "");
    const desc = descIdx >= 0 ? cols[descIdx] ?? "(no description)" : "(no description)";
    if (!dateStr || !amtStr) continue;
    const date = new Date(dateStr);
    const amount = Number(amtStr);
    if (isNaN(date.getTime()) || isNaN(amount)) continue;
    try {
      await db.insert(transactions).values({
        accountId: acct.id,
        userId: session.user.id,
        externalTxId: `csv:${conn.id}:${i}`,
        date,
        amount: String(amount),
        name: desc.slice(0, 500),
        merchantName: null,
      });
      imported++;
    } catch {
      // dup or bad row — skip
    }
  }

  // Recompute account balance as sum of imported transactions.
  const { sql } = await import("drizzle-orm");
  await db
    .update(financialAccounts)
    .set({
      currentBalance: sql`(select coalesce(sum(amount),0) from ${transactions} where account_id = ${acct.id})`,
      availableBalance: sql`(select coalesce(sum(amount),0) from ${transactions} where account_id = ${acct.id})`,
      updatedAt: new Date(),
    })
    .where(eq(financialAccounts.id, acct.id));

  return NextResponse.json({ ok: true, connectionId: conn.id, accountId: acct.id, imported });
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function findCol(header: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = header.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}
