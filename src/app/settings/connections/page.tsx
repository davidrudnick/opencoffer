import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { connections, financialAccounts, llmCredentials } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { formatDate } from "@/lib/utils";
import { ConnectionsClient } from "./ConnectionsClient";
import { AppBar } from "@/components/AppBar";

export default async function ConnectionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const items = await db
    .select({
      id: connections.id,
      orgName: connections.orgName,
      orgDomain: connections.orgDomain,
      institutions: connections.institutions,
      label: connections.label,
      status: connections.status,
      createdAt: connections.createdAt,
      lastSyncedAt: connections.lastSyncedAt,
      disconnectedAt: connections.disconnectedAt,
      purgeAfter: connections.purgeAfter,
      accountCount: sql<number>`(select count(*)::int from ${financialAccounts} where ${financialAccounts.connectionId} = ${connections.id})`,
    })
    .from(connections)
    .where(eq(connections.userId, session.user.id))
    .orderBy(connections.createdAt);

  const safeItems = items.map((it) => ({
    ...it,
    institutions: (it.institutions as Array<{ name: string; domain: string | null; accounts: number }> | null) ?? null,
    createdAt: it.createdAt?.toISOString() ?? null,
    lastSyncedAt: it.lastSyncedAt?.toISOString() ?? null,
    disconnectedAt: it.disconnectedAt?.toISOString() ?? null,
    purgeAfter: it.purgeAfter?.toISOString() ?? null,
    createdAtFmt: it.createdAt ? formatDate(it.createdAt) : "—",
    lastSyncedAtFmt: it.lastSyncedAt ? formatDate(it.lastSyncedAt) : "never",
    purgeAfterFmt: it.purgeAfter ? formatDate(it.purgeAfter) : null,
  }));

  const llmList = await db
    .select({
      id: llmCredentials.id,
      label: llmCredentials.label,
      model: llmCredentials.model,
      isDefault: llmCredentials.isDefault,
      useForAnalysis: llmCredentials.useForAnalysis,
    })
    .from(llmCredentials)
    .where(eq(llmCredentials.userId, session.user.id));

  return (
    <>
      <AppBar
        title="Connections"
        subtitle="Link banks and brokerages via SimpleFIN"
      />
      <div className="space-y-6 p-4 pb-24 md:p-8 md:pb-8">
        <div className="card-elevated mfade mfade-1">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="title-l">SimpleFIN connections</h2>
              <p className="body-m mt-2 text-on-surface-variant">
                Get a setup token from a SimpleFIN bridge (e.g.{" "}
                <a
                  href="https://bridge.simplefin.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  bridge.simplefin.org
                </a>{" "}
                — $1.50/mo, supports Fidelity, Vanguard, Schwab, and most US banks). Paste the
                token below to link. Tokens are single-use; we exchange it for a permanent access
                URL and store only that, encrypted.
              </p>
              <p className="body-s mt-2 text-on-surface-variant">
                Disconnect schedules deletion in 30 days. <em>Delete now</em> purges immediately.
              </p>
            </div>
          </div>
        </div>
        <ConnectionsClient items={safeItems} llms={llmList} />
      </div>
    </>
  );
}
