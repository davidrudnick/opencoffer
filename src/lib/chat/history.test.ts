import assert from "node:assert/strict";
import {
  cleanGeneratedTitle,
  normalizeStoredMessage,
  titleFromMessage,
  titlePromptForConversation,
} from "./history";

{
  const message = normalizeStoredMessage({
    id: "11111111-1111-4111-8111-111111111111",
    role: "user",
    content: "Show my spending mix",
    createdAt: new Date("2026-05-18T12:00:00.000Z"),
  });

  assert.equal(message.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(message.role, "user");
  assert.equal(message.content, "Show my spending mix");
  assert.deepEqual(message.parts, [{ type: "text", text: "Show my spending mix" }]);
}

{
  const message = normalizeStoredMessage({
    id: "22222222-2222-4222-8222-222222222222",
    role: "assistant",
    content: {
      id: "assistant-message",
      role: "assistant",
      content: "Here is the chart.",
      toolInvocations: [{ toolCallId: "call_1", toolName: "chart_cash_flow", args: {}, result: {} }],
    },
    createdAt: new Date("2026-05-18T12:01:00.000Z"),
  });

  assert.equal(message.id, "assistant-message");
  assert.equal(message.role, "assistant");
  assert.equal(message.content, "Here is the chart.");
  assert.equal(message.toolInvocations?.[0]?.toolName, "chart_cash_flow");
}

assert.equal(
  titleFromMessage("Show a cash flow trend for the last 6 months and summarize it"),
  "Show a cash flow trend for the last 6 months",
);

assert.equal(cleanGeneratedTitle('"Cash Flow Trend"', "Fallback"), "Cash Flow Trend");
assert.equal(cleanGeneratedTitle("Title: monthly savings review.", "Fallback"), "monthly savings review");
assert.equal(cleanGeneratedTitle("", "Fallback"), "Fallback");
assert.equal(
  cleanGeneratedTitle("A very long title about cash flow and category changes that should be shortened", "Fallback"),
  "A very long title about cash flow and category changes",
);

{
  const prompt = titlePromptForConversation({
    user: "Show my spending mix for last month",
    assistant: "Dining was the largest category at $812.",
  });
  assert.match(prompt, /Show my spending mix/);
  assert.match(prompt, /Dining was the largest category/);
  assert.match(prompt, /Return only the title/);
}

console.log("chat history helpers passed");
