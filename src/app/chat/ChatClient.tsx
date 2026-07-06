"use client";

import { useChat } from "ai/react";
import type { Message as AiMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Wrench,
  Sparkles,
  Copy,
  Check,
  TrendingUp,
  PieChart,
  ArrowLeftRight,
  Wallet,
  Repeat,
  History,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { AppBar } from "@/components/AppBar";
import { ChatChart, type ChartSpec } from "@/components/ChatChart";
import { titleFromMessage } from "@/lib/chat/history";

type Cred = {
  id: string;
  label: string;
  provider: string;
  model: string;
  isDefault: boolean;
};

type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
};

const STARTERS: Array<{
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  body: string;
  prompt: string;
}> = [
  {
    Icon: TrendingUp,
    title: "Cash flow trend",
    body: "Income and outflow by month for the last 6 months.",
    prompt: "Show a cash flow trend chart by month for the last 6 months, and summarize the time window and exclusions.",
  },
  {
    Icon: PieChart,
    title: "Spending mix",
    body: "Consumption categories, transfers and savings excluded.",
    prompt: "Show a spending mix chart for my consumption spending by category over the last 60 days, and mention what is excluded.",
  },
  {
    Icon: ArrowLeftRight,
    title: "Net worth change",
    body: "Snapshot trend for assets minus debt.",
    prompt: "Show my net worth change over the last 6 months and call out the start and end values.",
  },
  {
    Icon: Repeat,
    title: "Recurring spend",
    body: "Detected repeat merchants and typical charges.",
    prompt: "Show a chart of my recurring spend from the last 12 months and summarize the largest repeat charges.",
  },
  {
    Icon: Wallet,
    title: "Savings rate",
    body: "How much of my income am I keeping per month?",
    prompt: "Show my savings rate over the last 90 days with consumption versus savings by month.",
  },
];

function formatThreadDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

export function ChatClient({
  credentials,
  initialThreads,
  initialThreadId,
  initialMessages,
}: {
  credentials: Cred[];
  initialThreads: ChatThread[];
  initialThreadId?: string;
  initialMessages: AiMessage[];
}) {
  const defaultCred = useMemo(
    () => credentials.find((c) => c.isDefault)?.id ?? credentials[0]?.id ?? "",
    [credentials],
  );
  const [credentialId, setCredentialId] = useState(defaultCred);
  const [threads, setThreads] = useState(initialThreads);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const [loadingThread, setLoadingThread] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const activeThreadRef = useRef<string | undefined>(initialThreadId);
  const pendingPromptRef = useRef("");

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    append,
    setMessages,
    setInput,
    stop,
  } = useChat({
    api: "/api/chat",
    initialMessages,
    body: { credentialId, threadId },
    onResponse: (res) => {
      const t = res.headers.get("x-thread-id");
      if (t) {
        activeThreadRef.current = t;
        setThreadId(t);
        const now = new Date().toISOString();
        setThreads((existing) => {
          const title = titleFromMessage(pendingPromptRef.current);
          const found = existing.find((thread) => thread.id === t);
          if (found) {
            return [
              { ...found, updatedAt: now },
              ...existing.filter((thread) => thread.id !== t),
            ];
          }
          return [{ id: t, title, updatedAt: now }, ...existing];
        });
        window.history.replaceState(null, "", `/chat?thread=${t}`);
      }
    },
    onFinish: async (message) => {
      const activeThread = activeThreadRef.current;
      if (!activeThread) return;
      const persisted = await fetch("/api/chat/persist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: activeThread, role: "assistant", content: message }),
      }).catch(() => undefined);
      const payload = persisted?.ok
        ? ((await persisted.json().catch(() => null)) as { thread?: ChatThread } | null)
        : null;
      const now = payload?.thread?.updatedAt ?? new Date().toISOString();
      setThreads((existing) =>
        existing.map((thread) =>
          thread.id === activeThread
            ? { ...thread, title: payload?.thread?.title ?? thread.title, updatedAt: now }
            : thread,
        ),
      );
    },
  });

  useEffect(() => {
    activeThreadRef.current = threadId;
  }, [threadId]);

  const sendPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    pendingPromptRef.current = trimmed;
    void append({ role: "user", content: trimmed });
  };

  const submitPrompt = (e: React.FormEvent<HTMLFormElement>) => {
    const trimmed = input.trim();
    if (trimmed) pendingPromptRef.current = trimmed;
    handleSubmit(e);
  };

  const loadThread = async (id: string) => {
    if (id === threadId || loadingThread) return;
    if (isLoading) stop();
    setLoadingThread(id);
    setHistoryError(null);
    const r = await fetch(`/api/chat/threads/${id}`);
    setLoadingThread(null);
    if (!r.ok) {
      setHistoryError((await r.json().catch(() => null))?.error ?? "Could not load chat");
      return;
    }
    const j = (await r.json()) as { messages: AiMessage[] };
    activeThreadRef.current = id;
    setThreadId(id);
    setMessages(j.messages);
    setInput("");
    window.history.replaceState(null, "", `/chat?thread=${id}`);
  };

  const newChat = () => {
    if (isLoading) stop();
    activeThreadRef.current = undefined;
    pendingPromptRef.current = "";
    setThreadId(undefined);
    setMessages([]);
    setInput("");
    setHistoryError(null);
    window.history.replaceState(null, "", "/chat");
  };

  const clearChat = async () => {
    if (isLoading) stop();
    const current = threadId;
    activeThreadRef.current = undefined;
    pendingPromptRef.current = "";
    setThreadId(undefined);
    setMessages([]);
    setInput("");
    setHistoryError(null);
    window.history.replaceState(null, "", "/chat");
    if (!current) return;
    const r = await fetch(`/api/chat/threads/${current}`, { method: "DELETE" });
    if (!r.ok) {
      setHistoryError((await r.json().catch(() => null))?.error ?? "Could not clear chat");
      return;
    }
    setThreads((existing) => existing.filter((thread) => thread.id !== current));
  };

  // Deep-link from /dashboard/charts: ?q=<prompt> auto-submits once.
  const params = useSearchParams();
  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current) return;
    const q = params.get("q");
    if (q && q.trim()) {
      consumedRef.current = true;
      const trimmed = q.trim();
      pendingPromptRef.current = trimmed;
      void append({ role: "user", content: trimmed });
    }
  }, [params, append]);

  // Auto-scroll to bottom on new messages / tokens.
  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "auto",
    });
  }, [messages, isLoading]);

  if (credentials.length === 0) {
    return (
      <>
        <AppBar title="Intelligence" />
        <div className="mx-auto max-w-2xl p-12">
          <div className="card-elevated p-10 text-center">
            <h1 className="headline-m">Add a model first</h1>
            <p className="body-l mt-4 text-on-surface-variant">
              Bring your own OpenAI or Anthropic key, point at a local Ollama, or use any
              OpenAI-compatible endpoint.
            </p>
            <Link href="/settings/llm" className="btn btn-filled mt-8 inline-flex">
              Add a model
            </Link>
          </div>
        </div>
      </>
    );
  }

  const activeCred = credentials.find((c) => c.id === credentialId);
  const activeThread = threads.find((thread) => thread.id === threadId);

  return (
    <>
      <AppBar
        title="Intelligence"
        subtitle="Grounded in your real financial data"
        actions={
          <div className="flex items-center gap-2">
            <span className="badge hidden md:inline-flex">{activeCred?.provider}</span>
            <select
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              className="h-9 max-w-[160px] truncate rounded-full border border-outline-variant bg-surface-container px-3 text-xs text-on-surface focus:border-primary focus:outline-none md:h-10 md:max-w-none md:px-4 md:text-sm"
            >
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.model}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-4xl flex-col gap-3 px-4 py-4 sm:px-6 sm:py-6 md:h-[calc(100dvh-4rem)] md:px-8">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-outline-variant bg-surface-low px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <History size={16} strokeWidth={2} className="shrink-0 text-on-surface-variant" />
            <select
              value={threadId ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                if (next) void loadThread(next);
                else newChat();
              }}
              className="h-10 min-w-0 flex-1 rounded-full border border-outline-variant bg-surface-container px-3 body-s text-on-surface focus:border-primary focus:outline-none"
              aria-label="Chat history"
            >
              <option value="">
                {messages.length > 0 ? "Unsaved new chat" : "New chat"}
              </option>
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title} · {formatThreadDate(thread.updatedAt)}
                </option>
              ))}
            </select>
          </div>
          <span className="body-s hidden max-w-[180px] truncate text-on-surface-variant md:inline">
            {loadingThread
              ? "Loading chat..."
              : activeThread
                ? formatThreadDate(activeThread.updatedAt)
                : "No saved thread"}
          </span>
          <button type="button" onClick={newChat} className="btn btn-text">
            <PlusCircle size={16} strokeWidth={2} />
            New
          </button>
          <button
            type="button"
            onClick={clearChat}
            className="btn btn-text-error"
            disabled={!threadId && messages.length === 0}
            title="Delete this saved chat and clear the current conversation"
          >
            <Trash2 size={16} strokeWidth={2} />
            Clear
          </button>
        </div>

        {historyError && (
          <div className="rounded-2xl bg-error-container px-4 py-3 body-m text-on-error-container">
            {historyError}
          </div>
        )}

        <section className="flex min-h-0 flex-1 flex-col">
            <div
              ref={messagesRef}
              className="min-h-0 flex-1 overflow-y-auto scroll-smooth pr-2"
            >
              {messages.length === 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {STARTERS.map((s) => (
                    <button
                      key={s.title}
                      onClick={() => sendPrompt(s.prompt)}
                      className="card coffer-card-hover group cursor-pointer text-left"
                    >
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                        <s.Icon size={16} strokeWidth={2} />
                      </div>
                      <div className="title-s text-on-surface group-hover:text-primary">
                        {s.title}
                      </div>
                      <div className="body-s mt-1 text-on-surface-variant">{s.body}</div>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-5">
                {messages.map((m) => (
                  <Message key={m.id} role={m.role} content={typeof m.content === "string" ? m.content : ""}>
                    <div className="prose max-w-none whitespace-pre-wrap body-l">
                      {m.content}
                    </div>
                    {m.toolInvocations && m.toolInvocations.length > 0 && (
                      <>
                        {m.toolInvocations.map((inv) => {
                          if (!("result" in inv) || !inv.result || typeof inv.result !== "object") return null;
                          const r = inv.result as { _chart?: ChartSpec };
                          if (!r._chart) return null;
                          return <ChatChart key={inv.toolCallId + "-chart"} spec={r._chart} />;
                        })}
                        <details className="mt-3">
                          <summary className="body-s flex cursor-pointer items-center gap-2 text-on-surface-variant hover:text-on-surface">
                            <Wrench size={14} strokeWidth={2} />
                            {m.toolInvocations.length} tool call
                            {m.toolInvocations.length === 1 ? "" : "s"}
                          </summary>
                          <div className="mt-2 space-y-2">
                            {m.toolInvocations.map((inv) => (
                              <div
                                key={inv.toolCallId}
                                className="rounded-xl bg-surface-container px-3 py-2 font-mono text-[12px] leading-relaxed"
                              >
                                <div className="text-primary">
                                  {inv.toolName}({JSON.stringify(inv.args).slice(0, 120)})
                                </div>
                                {"result" in inv && (
                                  <pre className="mt-1.5 overflow-x-auto text-on-surface-variant">
                                    {JSON.stringify(inv.result, null, 2).slice(0, 1200)}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      </>
                    )}
                  </Message>
                ))}

                {isLoading && (
                  <Message role="assistant">
                    <div className="flex items-center gap-2 text-on-surface-variant" aria-live="polite">
                      <span className="inline-flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                      </span>
                      <span className="body-s">thinking…</span>
                    </div>
                  </Message>
                )}

                {error && (
                  <div className="rounded-2xl bg-error-container px-4 py-3 body-m text-on-error-container">
                    {error.message}
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={submitPrompt} className="mt-4 flex items-end gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about your money…"
                className="h-14 flex-1 rounded-full border border-outline-variant bg-surface-container px-5 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-40"
                aria-label="Send"
              >
                <Send size={20} strokeWidth={2} />
              </button>
            </form>
          </section>
      </div>
    </>
  );
}

function Message({
  role,
  content,
  children,
}: {
  role: string;
  content?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const copy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className={`group flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Sparkles size={14} strokeWidth={2} />
        </div>
      )}
      <div className="max-w-[88%] flex-col">
        <div
          className={`rounded-3xl px-5 py-3 ${
            isUser
              ? "rounded-br-md bg-primary-container text-on-primary-container"
              : "rounded-bl-md bg-surface-container text-on-surface"
          }`}
        >
          {children}
        </div>
        {!isUser && content && (
          <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={copy}
              className="btn btn-text body-s"
              aria-label="Copy assistant message"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
