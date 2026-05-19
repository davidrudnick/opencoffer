import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { transactions, financialAccounts } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { AppBar } from "@/components/AppBar";
import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      name: transactions.name,
      merchant: transactions.merchantName,
      overrideMerchant: transactions.overrideMerchant,
      category: transactions.category,
      aiCategory: transactions.aiCategory,
      overrideCategory: transactions.overrideCategory,
      aiSubcategory: transactions.aiSubcategory,
      overrideSubcategory: transactions.overrideSubcategory,
      isTransfer: transactions.isTransfer,
      overrideIsTransfer: transactions.overrideIsTransfer,
      isRecurring: transactions.isRecurring,
      userNotes: transactions.userNotes,
      pending: transactions.pending,
      currency: transactions.isoCurrencyCode,
      accountName: financialAccounts.name,
      accountMask: financialAccounts.mask,
    })
    .from(transactions)
    .leftJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .where(eq(transactions.userId, session.user.id))
    .orderBy(desc(transactions.date))
    .limit(500);

  return (
    <>
      <AppBar title="Transactions" subtitle={`Latest ${rows.length}. Click any row to edit.`} />
      <div className="p-4 pb-24 md:p-8 md:pb-8">
        <TransactionsClient
          rows={rows.map((r) => ({
            ...r,
            date: r.date.toISOString(),
            amount: Number(r.amount),
          }))}
        />
      </div>
    </>
  );
}
