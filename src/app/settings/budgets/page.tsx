import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { budgets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AppBar } from "@/components/AppBar";
import { BudgetsClient } from "./BudgetsClient";

export default async function BudgetsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const rows = await db.select().from(budgets).where(eq(budgets.userId, session.user.id));
  return (
    <>
      <AppBar title="Budgets" subtitle="Monthly caps per category" />
      <div className="space-y-6 p-4 pb-24 md:p-8 md:pb-8">
        <BudgetsClient initial={rows.map((b) => ({ ...b, monthlyAmount: Number(b.monthlyAmount) }))} />
      </div>
    </>
  );
}
