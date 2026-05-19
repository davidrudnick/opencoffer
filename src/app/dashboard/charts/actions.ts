"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { llmCredentials, savedCharts } from "@/lib/db/schema";
import { getModel } from "@/lib/llm/providers";
import { financeTools } from "@/lib/finance/tools";

const titleSchema = z.string().min(2).max(80);
const SAVED_CHART_TOOL_NAMES = [
  "chart_spending_trend",
  "chart_category_breakdown",
  "chart_savings_destinations",
  "chart_cash_flow",
  "chart_recurring_merchants",
  "chart_top_merchants",
  "chart_budget_status",
  "chart_balances_by_group",
  "chart_net_worth_history",
  "chart_consumption_vs_savings",
] as const;
/** Whitelist of chart tools the model is allowed to pick. */
const CHART_TOOLS = financeTools
  .filter((t) => (SAVED_CHART_TOOL_NAMES as readonly string[]).includes(t.name))
  .map((t) => ({ name: t.name, description: t.description, schema: t.schema }));

const PlanSchema = z.discriminatedUnion("toolName", [
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_spending_trend"),
    args: z.object({
      days: z.number().int().min(14).max(730),
      groupBy: z.enum(["week", "month"]),
      kind: z.enum(["consumption", "savings", "all"]),
    }).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_category_breakdown"),
    args: z.object({
      days: z.number().int().min(7).max(730),
      kind: z.enum(["consumption", "savings", "all"]),
    }).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_savings_destinations"),
    args: z.object({
      days: z.number().int().min(14).max(730),
    }).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_cash_flow"),
    args: z.object({
      days: z.number().int().min(14).max(730),
      groupBy: z.enum(["week", "month"]),
    }).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_recurring_merchants"),
    args: z.object({
      days: z.number().int().min(30).max(730),
      limit: z.number().int().min(3).max(12),
    }).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_top_merchants"),
    args: z.object({
      days: z.number().int().min(7).max(730),
      limit: z.number().int().min(3).max(15),
    }).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_budget_status"),
    args: z.object({}).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_balances_by_group"),
    args: z.object({}).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_net_worth_history"),
    args: z.object({
      days: z.number().int().min(7).max(1825),
    }).strict(),
  }),
  z.object({
    title: titleSchema,
    toolName: z.literal("chart_consumption_vs_savings"),
    args: z.object({
      days: z.number().int().min(14).max(730),
      groupBy: z.enum(["week", "month"]),
    }).strict(),
  }),
]);

export async function addSavedChart(prompt: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const userId = session.user.id;
  const trimmed = prompt.trim();
  if (trimmed.length < 4) throw new Error("prompt too short");
  if (trimmed.length > 400) throw new Error("prompt too long");

  // Use whichever credential is marked for analysis, else default, else first.
  const creds = await db
    .select()
    .from(llmCredentials)
    .where(eq(llmCredentials.userId, userId));
  const cred =
    creds.find((c) => c.useForAnalysis) ?? creds.find((c) => c.isDefault) ?? creds[0];
  if (!cred) throw new Error("no LLM credential configured");

  const toolDocs = CHART_TOOLS.map(
    (t) => `- ${t.name}: ${t.description}`,
  ).join("\n");

  const systemPrompt = `You turn a user's natural-language request for a finance dashboard chart
into a structured tool call. Available chart tools:

${toolDocs}

Rules:
- Pick ONE tool from the list and return args that match that tool exactly.
- Use sensible defaults: days=180, groupBy="month", kind="consumption", limit=8 unless the user asks otherwise.
- "spending" / "expenses" → kind="consumption". "savings" / "investing" → kind="savings".
  "all outflow" / "everything that left my account" → kind="all".
- "this year", "ytd" → days=365.
- "cash flow trend" → chart_cash_flow.
- "spending mix" / "where did I spend" → chart_category_breakdown.
- "net worth change" → chart_net_worth_history.
- "recurring spend" / "subscriptions" → chart_recurring_merchants.
- "savings rate" → chart_consumption_vs_savings.
- "where savings goes" / "savings destinations" → chart_savings_destinations.
- "top merchants" / "biggest merchants" → chart_top_merchants.
- "budgets" / "budget progress" → chart_budget_status.
- Produce a concise card title (3-5 words) capturing intent.
- Args must match the tool's schema EXACTLY. If unsure, prefer the safe defaults above.`;

  const model = await getModel(cred);
  let object: z.infer<typeof PlanSchema>;
  try {
    const result = await generateObject({
      model,
      schema: PlanSchema,
      system: systemPrompt,
      prompt: `User wants: ${trimmed}\n\nReturn the tool name, args, and a short title.`,
      temperature: 0,
    });
    object = result.object;
  } catch (e) {
    console.error("[charts] saved chart planning failed:", (e as Error).message);
    throw new Error(
      "Couldn't create a valid chart from that prompt. Try cash flow trend, spending mix, net worth change, recurring spend, or savings rate with a time window.",
    );
  }

  // Validate the args against the actual tool's zod schema before persisting.
  const tool = financeTools.find((t) => t.name === object.toolName);
  if (!tool) throw new Error(`unknown tool: ${object.toolName}`);
  let parsed: Record<string, unknown>;
  try {
    parsed = tool.schema.parse(object.args) as Record<string, unknown>;
  } catch (e) {
    console.error("[charts] chart args failed validation:", (e as Error).message);
    throw new Error(
      "The chart request produced invalid settings. Try a simpler prompt with a time window, such as 'cash flow for the last 6 months'.",
    );
  }

  const [maxPos] = await db
    .select({ p: savedCharts.position })
    .from(savedCharts)
    .where(eq(savedCharts.userId, userId))
    .orderBy(desc(savedCharts.position))
    .limit(1);
  const nextPos = (maxPos?.p ?? -1) + 1;

  const [row] = await db
    .insert(savedCharts)
    .values({
      userId,
      title: object.title,
      prompt: trimmed,
      toolName: object.toolName,
      args: parsed,
      position: nextPos,
    })
    .returning({ id: savedCharts.id });

  revalidatePath("/dashboard/charts");
  return { ok: true, id: row.id, title: object.title, toolName: object.toolName };
}

export async function deleteSavedChart(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const r = await db
    .delete(savedCharts)
    .where(and(eq(savedCharts.id, id), eq(savedCharts.userId, session.user.id)))
    .returning({ id: savedCharts.id });
  revalidatePath("/dashboard/charts");
  return { ok: r.length > 0 };
}

export async function listSavedCharts(userId: string) {
  return db
    .select()
    .from(savedCharts)
    .where(eq(savedCharts.userId, userId))
    .orderBy(asc(savedCharts.position), asc(savedCharts.createdAt));
}
