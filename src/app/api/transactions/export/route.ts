import { NextResponse } from "next/server";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { financialAccounts, transactions } from "@/lib/db/schema";
import { escapeCsvField } from "@/lib/csv";

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim();
  const accountId = url.searchParams.get("accountId")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const startDate = url.searchParams.get("startDate")?.trim();
  const endDate = url.searchParams.get("endDate")?.trim();

  const conditions = [eq(transactions.userId, session.user.id)];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (startDate) conditions.push(gte(transactions.date, new Date(startDate)));
  if (endDate) conditions.push(lte(transactions.date, new Date(endDate)));
  if (category) {
    conditions.push(
      or(
        ilike(transactions.overrideCategory, category),
        ilike(transactions.aiCategory, category),
        ilike(transactions.category, category),
      )!,
    );
  }
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        ilike(transactions.name, like),
        ilike(transactions.merchantName, like),
        ilike(transactions.overrideMerchant, like),
        ilike(financialAccounts.name, like),
        ilike(transactions.overrideCategory, like),
        ilike(transactions.aiCategory, like),
        ilike(transactions.category, like),
      )!,
    );
  }

  const rows = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      currency: transactions.isoCurrencyCode,
      name: transactions.name,
      merchant: transactions.merchantName,
      overrideMerchant: transactions.overrideMerchant,
      category: transactions.category,
      aiCategory: transactions.aiCategory,
      overrideCategory: transactions.overrideCategory,
      subcategory: transactions.subcategory,
      aiSubcategory: transactions.aiSubcategory,
      overrideSubcategory: transactions.overrideSubcategory,
      accountName: financialAccounts.name,
      pending: transactions.pending,
      isTransfer: transactions.isTransfer,
      overrideIsTransfer: transactions.overrideIsTransfer,
      notes: transactions.userNotes,
    })
    .from(transactions)
    .leftJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .where(and(...conditions))
    .orderBy(desc(transactions.date));

  const header = [
    "date",
    "amount",
    "currency",
    "name",
    "merchant",
    "category",
    "subcategory",
    "account name",
    "pending",
    "is_transfer",
    "notes",
  ];
  const lines = [
    header.map(escapeCsvField).join(","),
    ...rows.map((row) =>
      [
        ymd(row.date),
        row.amount,
        row.currency ?? "USD",
        row.name,
        row.overrideMerchant ?? row.merchant ?? "",
        row.overrideCategory ?? row.aiCategory ?? row.category ?? "",
        row.overrideSubcategory ?? row.aiSubcategory ?? row.subcategory ?? "",
        row.accountName ?? "",
        row.pending ? "true" : "false",
        row.overrideIsTransfer ?? row.isTransfer ? "true" : "false",
        row.notes ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ];

  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="opencoffer-transactions-${ymd(new Date())}.csv"`,
    },
  });
}
