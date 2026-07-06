import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { financialAccounts } from "@/lib/db/schema";
import { snapshotNetWorthForUser } from "@/lib/finance/netWorthSnapshot";
import { ACCOUNT_GROUPS, ACCOUNT_TYPES, normalizeManualAccountInput } from "@/lib/manualAccounts";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  accountGroup: z.enum(ACCOUNT_GROUPS),
  balance: z.number().finite(),
  currency: z.string().trim().length(3).default("USD"),
});

function revalidateAccountPaths() {
  revalidatePath("/settings/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/charts");
  revalidatePath("/dashboard/investments");
}

function snapshotUser(userId: string) {
  void snapshotNetWorthForUser(userId).catch((error) => {
    console.error("[manual-accounts] snapshot failed:", error);
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(financialAccounts)
    .where(and(eq(financialAccounts.userId, session.user.id), eq(financialAccounts.source, "manual")));

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const normalized = normalizeManualAccountInput(parsed.data);
  const [account] = await db
    .insert(financialAccounts)
    .values({
      connectionId: null,
      source: "manual",
      userId: session.user.id,
      externalAccountId: `manual_${crypto.randomUUID()}`,
      name: normalized.name,
      officialName: null,
      mask: null,
      type: normalized.type,
      subtype: null,
      accountGroup: normalized.accountGroup,
      currentBalance: normalized.balance,
      availableBalance: normalized.balance,
      isoCurrencyCode: normalized.currency,
    })
    .returning();

  revalidateAccountPaths();
  snapshotUser(session.user.id);
  return NextResponse.json(account, { status: 201 });
}
