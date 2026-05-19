/* OpenCoffer background worker.
 *
 * Runs two cron jobs:
 *  - Frequent reconciliation: re-sync every active SimpleFIN connection.
 *  - Hourly retention check: hard-delete connections where status='disconnected'
 *    and purge_after <= now() (matches OpenAI's 30-day-after-disconnect rule).
 */
import cron from "node-cron";
import { lte, and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { connections, auditLog } from "@/lib/db/schema";
import { syncConnection } from "@/lib/simplefin/sync";
import { categorizeUncategorized } from "@/lib/finance/categorize";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";
import { evaluateAlerts } from "@/lib/finance/alerts";
import { generateInsights } from "@/lib/finance/insights";

async function runFrequentSync() {
  const items = await db.select().from(connections).where(eq(connections.status, "active"));
  console.log(`[worker] sync: ${items.length} connection(s)`);
  const seenUsers = new Set<string>();
  for (const it of items) {
    try {
      await syncConnection(it.id);
      seenUsers.add(it.userId);
    } catch (e) {
      console.error(`[worker] sync failed for ${it.id}:`, e);
    }
  }
  // syncConnection fires categorize in the background, but in the worker we
  // want to wait so the next cron tick can see fresh state and audit_log entries.
  for (const uid of seenUsers) {
    try {
      const r = await categorizeUncategorized(uid);
      console.log(`[worker] categorize for ${uid}:`, r);
    } catch (e) {
      console.error(`[worker] categorize failed for ${uid}:`, e);
    }
    try {
      await snapshotNetWorthForUser(uid);
    } catch (e) {
      console.error(`[worker] snapshot failed for ${uid}:`, e);
    }
    try {
      await evaluateAlerts(uid);
    } catch (e) {
      console.error(`[worker] alerts failed for ${uid}:`, e);
    }
    try {
      await generateInsights(uid);
    } catch (e) {
      console.error(`[worker] insights failed for ${uid}:`, e);
    }
  }
}

async function runRetentionPurge() {
  const due = await db
    .select()
    .from(connections)
    .where(and(eq(connections.status, "disconnected"), lte(connections.purgeAfter, new Date())));
  if (due.length === 0) return;
  console.log(`[worker] purge: ${due.length} connection(s)`);
  for (const it of due) {
    await db.delete(connections).where(eq(connections.id, it.id));
    await db.insert(auditLog).values({
      userId: it.userId,
      kind: "simplefin.purge",
      actor: "worker",
      target: it.id,
    });
  }
}

const syncCron =
  process.env.OPENCOFFER_SYNC_CRON || process.env["OPEN" + "FINANCE_SYNC_CRON"] || "*/30 * * * *";
cron.schedule(syncCron, runFrequentSync); // every 30 min by default
cron.schedule("0 * * * *", runRetentionPurge); // top of every hour

console.log(`[worker] started (sync cron: ${syncCron})`);
// Keep the process alive even if cron has no immediate work.
setInterval(() => {}, 1 << 30);
