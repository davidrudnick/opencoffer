import type { Message } from "ai";

type StoredMessage = {
  id: string;
  role: string;
  content: unknown;
  createdAt: Date;
};

type MessageRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MessageRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRole(role: unknown): Message["role"] {
  return role === "user" || role === "assistant" || role === "system" || role === "data"
    ? role
    : "assistant";
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      if (!isRecord(part)) return "";
      return part.type === "text" && typeof part.text === "string" ? part.text : "";
    })
    .filter(Boolean)
    .join("");
}

export function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return textFromParts(content);
  if (isRecord(content)) {
    if (typeof content.content === "string") return content.content;
    return textFromParts(content.parts);
  }
  return content == null ? "" : JSON.stringify(content);
}

export function normalizeStoredMessage(row: StoredMessage): Message {
  const role = normalizeRole(row.role);

  if (typeof row.content === "string") {
    return {
      id: row.id,
      role,
      content: row.content,
      createdAt: row.createdAt,
      parts: row.content ? [{ type: "text", text: row.content }] : [],
    };
  }

  if (Array.isArray(row.content)) {
    const content = textFromParts(row.content);
    return {
      id: row.id,
      role,
      content,
      createdAt: row.createdAt,
      parts: row.content as Message["parts"],
    };
  }

  if (isRecord(row.content)) {
    const contentRole = normalizeRole(row.content.role);
    const content =
      typeof row.content.content === "string"
        ? row.content.content
        : textFromParts(row.content.parts);
    const parts = Array.isArray(row.content.parts)
      ? (row.content.parts as Message["parts"])
      : content
        ? [{ type: "text" as const, text: content }]
        : [];
    const message: Message = {
      id: typeof row.content.id === "string" ? row.content.id : row.id,
      role: contentRole,
      content,
      createdAt: row.createdAt,
      parts,
    };
    if (Array.isArray(row.content.toolInvocations)) {
      message.toolInvocations = row.content.toolInvocations as Message["toolInvocations"];
    }
    return message;
  }

  const content = row.content == null ? "" : JSON.stringify(row.content);
  return {
    id: row.id,
    role,
    content,
    createdAt: row.createdAt,
    parts: content ? [{ type: "text", text: content }] : [],
  };
}

export function toClientMessage(message: Message): Message {
  const client: Message = {
    id: message.id,
    role: message.role,
    content: message.content,
    parts: message.parts ?? [],
  };
  if (message.toolInvocations) client.toolInvocations = message.toolInvocations;
  if (message.annotations) client.annotations = message.annotations;
  if (message.data !== undefined) client.data = message.data;
  if (message.experimental_attachments) {
    client.experimental_attachments = message.experimental_attachments;
  }
  return client;
}

export function titleFromMessage(content: unknown): string {
  const text = textFromMessageContent(content);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "New chat";
  if (normalized.length <= 48) return normalized;
  return normalized.slice(0, 48).replace(/\s+\S*$/, "") || normalized.slice(0, 48);
}

export function cleanGeneratedTitle(raw: string, fallback: string): string {
  const cleaned = raw
    .split("\n")[0]
    .replace(/^#+\s*/, "")
    .replace(/^title:\s*/i, "")
    .replace(/^["'`]+|["'`.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = cleaned || fallback;
  if (title.length <= 56) return title;
  return title.slice(0, 56).replace(/\s+\S*$/, "") || title.slice(0, 56);
}

export function titlePromptForConversation({
  user,
  assistant,
}: {
  user: string;
  assistant: string;
}): string {
  return `Name this personal-finance chat thread in 3 to 7 words.
Return only the title. Do not include quotes, punctuation, emoji, or a "Title:" prefix.

User:
${user.slice(0, 1200)}

Assistant:
${assistant.slice(0, 1200)}`;
}
