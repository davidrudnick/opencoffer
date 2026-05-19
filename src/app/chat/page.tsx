import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { chatMessages, chatThreads, llmCredentials } from "@/lib/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { normalizeStoredMessage, toClientMessage } from "@/lib/chat/history";
import { ChatClient } from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ thread?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const creds = await db
    .select({
      id: llmCredentials.id,
      label: llmCredentials.label,
      provider: llmCredentials.provider,
      model: llmCredentials.model,
      isDefault: llmCredentials.isDefault,
    })
    .from(llmCredentials)
    .where(eq(llmCredentials.userId, session.user.id));

  const threads = await db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.userId, session.user.id))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(30);
  const initialThreadId =
    threads.find((thread) => thread.id === params?.thread)?.id ?? threads[0]?.id;
  const initialRows = initialThreadId
    ? await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, initialThreadId))
        .orderBy(asc(chatMessages.createdAt))
    : [];
  const initialMessages = initialRows.map(normalizeStoredMessage).map(toClientMessage);

  return (
    <AppShell email={session.user.email}>
      <Suspense fallback={null}>
        <ChatClient
          credentials={creds}
          initialThreads={threads.map((thread) => ({
            ...thread,
            updatedAt: thread.updatedAt.toISOString(),
          }))}
          initialThreadId={initialThreadId}
          initialMessages={initialMessages}
        />
      </Suspense>
    </AppShell>
  );
}
