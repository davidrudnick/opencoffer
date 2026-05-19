import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { llmCredentials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { LlmClient } from "./LlmClient";
import { AppBar } from "@/components/AppBar";

export default async function LlmPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const creds = await db
    .select({
      id: llmCredentials.id,
      label: llmCredentials.label,
      provider: llmCredentials.provider,
      model: llmCredentials.model,
      baseUrl: llmCredentials.baseUrl,
      isDefault: llmCredentials.isDefault,
      useForAnalysis: llmCredentials.useForAnalysis,
      createdAt: llmCredentials.createdAt,
    })
    .from(llmCredentials)
    .where(eq(llmCredentials.userId, session.user.id));

  return (
    <>
      <AppBar
        title="Models"
        subtitle="Bring your own model — OpenAI, Anthropic, OpenAI-compatible, Ollama, Hermes"
      />
      <div className="space-y-6 p-4 pb-24 md:p-8 md:pb-8">
        <LlmClient initial={creds.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))} />
      </div>
    </>
  );
}
