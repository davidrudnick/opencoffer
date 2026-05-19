import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  aiInsights,
  budgets,
  chatMessages,
  chatThreads,
  connections,
  financialAccounts,
  holdings,
  llmCredentials,
  netWorthSnapshots,
  securities,
  transactions,
  users,
} from "@/lib/db/schema";

const DEMO_USER_ID = "demo-opencoffer-user";
const DEMO_EMAIL = "demo@opencoffer.local";

const now = new Date("2026-05-18T16:00:00.000Z");

function daysAgo(days: number) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date;
}

function monthDate(monthsAgo: number, day = 8) {
  const date = new Date(Date.UTC(2026, 4 - monthsAgo, day, 12, 0, 0));
  return date;
}

async function main() {
  await db.delete(users).where(eq(users.email, DEMO_EMAIL));

  await db.insert(users).values({
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    name: "OpenCoffer Demo",
    createdAt: daysAgo(180),
  });

  const [connection] = await db
    .insert(connections)
    .values({
      userId: DEMO_USER_ID,
      accessUrlCipher: "demo-only-not-a-real-simplefin-token",
      orgName: "Demo Financial",
      orgDomain: "demo.opencoffer.local",
      label: "Demo accounts",
      institutions: [{ name: "Demo Financial", domain: "demo.opencoffer.local", accounts: 5 }],
      status: "active",
      createdAt: daysAgo(180),
      lastSyncedAt: daysAgo(0),
      earliestSyncedDate: daysAgo(180),
    })
    .returning({ id: connections.id });

  const accountRows = await db
    .insert(financialAccounts)
    .values([
      {
        connectionId: connection.id,
        userId: DEMO_USER_ID,
        externalAccountId: "demo-checking",
        name: "Harbor Checking",
        officialName: "OpenCoffer Demo Checking",
        mask: "1024",
        type: "depository",
        subtype: "checking",
        accountGroup: "cash",
        currentBalance: "14820.62",
        availableBalance: "14690.44",
        updatedAt: now,
      },
      {
        connectionId: connection.id,
        userId: DEMO_USER_ID,
        externalAccountId: "demo-savings",
        name: "Reserve Savings",
        officialName: "OpenCoffer Demo Savings",
        mask: "2048",
        type: "depository",
        subtype: "savings",
        accountGroup: "cash",
        currentBalance: "38240.19",
        availableBalance: "38240.19",
        updatedAt: now,
      },
      {
        connectionId: connection.id,
        userId: DEMO_USER_ID,
        externalAccountId: "demo-credit",
        name: "Rewards Card",
        officialName: "OpenCoffer Demo Visa",
        mask: "7788",
        type: "credit",
        subtype: "credit card",
        accountGroup: "credit",
        currentBalance: "-3210.74",
        availableBalance: "1789.26",
        updatedAt: now,
      },
      {
        connectionId: connection.id,
        userId: DEMO_USER_ID,
        externalAccountId: "demo-retirement",
        name: "Future 401k",
        officialName: "OpenCoffer Demo 401k",
        mask: "401K",
        type: "investment",
        subtype: "401k",
        accountGroup: "retirement",
        currentBalance: "122480.10",
        updatedAt: now,
      },
      {
        connectionId: connection.id,
        userId: DEMO_USER_ID,
        externalAccountId: "demo-brokerage",
        name: "Core Brokerage",
        officialName: "OpenCoffer Demo Brokerage",
        mask: "5531",
        type: "investment",
        subtype: "brokerage",
        accountGroup: "brokerage",
        currentBalance: "46850.00",
        updatedAt: now,
      },
    ])
    .returning({ id: financialAccounts.id, externalAccountId: financialAccounts.externalAccountId });

  const accountId = Object.fromEntries(accountRows.map((row) => [row.externalAccountId, row.id]));

  const txValues: Array<typeof transactions.$inferInsert> = [];
  const monthly = [
    { monthsAgo: 5, dining: 410, grocery: 780, travel: 260, shopping: 350 },
    { monthsAgo: 4, dining: 530, grocery: 810, travel: 190, shopping: 410 },
    { monthsAgo: 3, dining: 620, grocery: 760, travel: 330, shopping: 520 },
    { monthsAgo: 2, dining: 480, grocery: 835, travel: 280, shopping: 460 },
    { monthsAgo: 1, dining: 440, grocery: 790, travel: 220, shopping: 390 },
    { monthsAgo: 0, dining: 390, grocery: 760, travel: 180, shopping: 330 },
  ];

  for (const m of monthly) {
    const date = monthDate(m.monthsAgo);
    txValues.push(
      {
        accountId: accountId["demo-checking"],
        userId: DEMO_USER_ID,
        externalTxId: `payroll-${m.monthsAgo}`,
        date: monthDate(m.monthsAgo, 1),
        amount: "8450.00",
        name: "Acme Payroll",
        merchantName: "Acme Payroll",
        category: "Income",
        aiCategory: "Income",
        aiClassifiedAt: now,
      },
      {
        accountId: accountId["demo-credit"],
        userId: DEMO_USER_ID,
        externalTxId: `rent-${m.monthsAgo}`,
        date: monthDate(m.monthsAgo, 3),
        amount: "-2450.00",
        name: "Riverfront Lofts",
        merchantName: "Riverfront Lofts",
        category: "Housing",
        aiCategory: "Housing",
        aiClassifiedAt: now,
        isRecurring: true,
        recurrenceCadence: "monthly",
      },
      {
        accountId: accountId["demo-credit"],
        userId: DEMO_USER_ID,
        externalTxId: `grocery-${m.monthsAgo}`,
        date,
        amount: `-${m.grocery.toFixed(2)}`,
        name: "Green Market",
        merchantName: "Green Market",
        category: "Groceries",
        aiCategory: "Groceries",
        aiClassifiedAt: now,
      },
      {
        accountId: accountId["demo-credit"],
        userId: DEMO_USER_ID,
        externalTxId: `dining-${m.monthsAgo}`,
        date: monthDate(m.monthsAgo, 12),
        amount: `-${m.dining.toFixed(2)}`,
        name: "Northstar Dining",
        merchantName: "Northstar Dining",
        category: "Dining",
        aiCategory: "Dining",
        aiClassifiedAt: now,
      },
      {
        accountId: accountId["demo-credit"],
        userId: DEMO_USER_ID,
        externalTxId: `travel-${m.monthsAgo}`,
        date: monthDate(m.monthsAgo, 18),
        amount: `-${m.travel.toFixed(2)}`,
        name: "Metro Transit",
        merchantName: "Metro Transit",
        category: "Transportation",
        aiCategory: "Transportation",
        aiClassifiedAt: now,
      },
      {
        accountId: accountId["demo-credit"],
        userId: DEMO_USER_ID,
        externalTxId: `shopping-${m.monthsAgo}`,
        date: monthDate(m.monthsAgo, 22),
        amount: `-${m.shopping.toFixed(2)}`,
        name: "Evergreen Goods",
        merchantName: "Evergreen Goods",
        category: "Shopping",
        aiCategory: "Shopping",
        aiClassifiedAt: now,
      },
      {
        accountId: accountId["demo-checking"],
        userId: DEMO_USER_ID,
        externalTxId: `brokerage-save-${m.monthsAgo}`,
        date: monthDate(m.monthsAgo, 25),
        amount: "-900.00",
        name: "Brokerage Transfer",
        merchantName: "Core Brokerage",
        category: "Investments",
        aiCategory: "Investments",
        aiClassifiedAt: now,
      },
      {
        accountId: accountId["demo-checking"],
        userId: DEMO_USER_ID,
        externalTxId: `retirement-${m.monthsAgo}`,
        date: monthDate(m.monthsAgo, 1),
        amount: "-1100.00",
        name: "401k Contribution",
        merchantName: "Future 401k",
        category: "Retirement Contributions",
        aiCategory: "Retirement Contributions",
        aiClassifiedAt: now,
      },
    );
  }

  txValues.push(
    {
      accountId: accountId["demo-credit"],
      userId: DEMO_USER_ID,
      externalTxId: "spotify-demo",
      date: daysAgo(8),
      amount: "-16.99",
      name: "Spotify",
      merchantName: "Spotify",
      category: "Subscriptions",
      aiCategory: "Subscriptions",
      aiClassifiedAt: now,
      isRecurring: true,
      recurrenceCadence: "monthly",
    },
    {
      accountId: accountId["demo-credit"],
      userId: DEMO_USER_ID,
      externalTxId: "gym-demo",
      date: daysAgo(10),
      amount: "-72.00",
      name: "City Gym",
      merchantName: "City Gym",
      category: "Health & Fitness",
      aiCategory: "Health & Fitness",
      aiClassifiedAt: now,
      isRecurring: true,
      recurrenceCadence: "monthly",
    },
  );

  await db.insert(transactions).values(txValues);

  const [security] = await db
    .insert(securities)
    .values({
      connectionId: connection.id,
      externalSecurityId: "demo-index-fund",
      tickerSymbol: "VTI",
      name: "Total Market Index",
      type: "mutual fund",
      closePrice: "245.120000",
      closePriceAsOf: now,
    })
    .returning({ id: securities.id });

  await db.insert(holdings).values({
    accountId: accountId["demo-brokerage"],
    userId: DEMO_USER_ID,
    securityId: security.id,
    quantity: "191.130000",
    costBasis: "39200.0000",
    institutionPrice: "245.120000",
    institutionValue: "46850.0000",
    updatedAt: now,
  });

  await db.insert(budgets).values([
    { userId: DEMO_USER_ID, category: "Groceries", monthlyAmount: "900.0000" },
    { userId: DEMO_USER_ID, category: "Dining", monthlyAmount: "500.0000" },
    { userId: DEMO_USER_ID, category: "Shopping", monthlyAmount: "450.0000" },
  ]);

  await db.insert(netWorthSnapshots).values(
    [5, 4, 3, 2, 1, 0].map((monthsAgo) => {
      const netWorth = 190000 + (5 - monthsAgo) * 5200;
      return {
        userId: DEMO_USER_ID,
        snapshotDate: monthDate(monthsAgo, 15),
        assets: `${netWorth + 3210.74}`,
        liabilities: "3210.7400",
        netWorth: `${netWorth}`,
        byGroup: {
          cash: 52000 + (5 - monthsAgo) * 300,
          retirement: 118000 + (5 - monthsAgo) * 2200,
          brokerage: 40000 + (5 - monthsAgo) * 2700,
          credit: -3210.74,
        },
      };
    }),
  );

  await db.insert(aiInsights).values([
    {
      userId: DEMO_USER_ID,
      kind: "savings",
      severity: "praise",
      title: "Savings rate is improving",
      body: "You retained roughly 32% of income over the last 90 days after excluding transfers.",
      dataRef: { chart: "chart_consumption_vs_savings", days: 90 },
      generatedAt: now,
    },
    {
      userId: DEMO_USER_ID,
      kind: "spending",
      severity: "info",
      title: "Dining cooled off",
      body: "Dining is down 11% from the prior month while groceries stayed within budget.",
      dataRef: { chart: "chart_category_breakdown", days: 60 },
      generatedAt: now,
    },
  ]);

  await db.insert(llmCredentials).values({
    userId: DEMO_USER_ID,
    provider: "openai-compat",
    label: "Demo Local Analyst",
    baseUrl: "http://localhost:7777/v1",
    model: "demo-analyst",
    apiKeyCipher: null,
    isDefault: true,
    useForAnalysis: true,
  });

  const [thread] = await db
    .insert(chatThreads)
    .values({
      userId: DEMO_USER_ID,
      title: "Cash Flow Trend",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(0),
    })
    .returning({ id: chatThreads.id });

  await db.insert(chatMessages).values([
    {
      threadId: thread.id,
      role: "user",
      content: "Show my cash flow trend and explain what is excluded.",
      createdAt: daysAgo(1),
    },
    {
      threadId: thread.id,
      role: "assistant",
      content: {
        id: "demo-assistant-message",
        role: "assistant",
        content:
          "Income is ahead of consumption by $3,130 over the last 30 days. The chart excludes transfers, retirement contributions, and investment outflows.",
        parts: [
          {
            type: "text",
            text:
              "Income is ahead of consumption by $3,130 over the last 30 days. The chart excludes transfers, retirement contributions, and investment outflows.",
          },
        ],
      },
      createdAt: daysAgo(0),
    },
  ]);

  console.log(`Seeded fake demo data for ${DEMO_EMAIL}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
