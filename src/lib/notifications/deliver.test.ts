import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNotificationRequest } from "@/lib/notifications/deliver";

const alert = {
  id: "alert-1",
  title: "Large spend: $500",
  body: "A large transaction posted.",
  kind: "large_tx",
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
};

describe("buildNotificationRequest", () => {
  it("builds an ntfy request with topic and bearer auth", () => {
    const request = buildNotificationRequest(
      { kind: "ntfy", config: { url: "https://ntfy.example.com", topic: "money", authToken: "tok" } },
      alert,
    );

    assert.equal(request.url, "https://ntfy.example.com/money");
    assert.equal(request.headers.Title, alert.title);
    assert.equal(request.headers.Authorization, "Bearer tok");
    assert.equal(request.body, alert.body);
  });

  it("builds discord and slack webhook payloads", () => {
    const discord = buildNotificationRequest(
      { kind: "discord", config: { url: "https://discord.example/webhook" } },
      alert,
    );
    const slack = buildNotificationRequest(
      { kind: "slack", config: { url: "https://hooks.slack.example/webhook" } },
      alert,
    );

    assert.deepEqual(JSON.parse(discord.body), { content: `${alert.title}\n${alert.body}` });
    assert.deepEqual(JSON.parse(slack.body), { text: `${alert.title}\n${alert.body}` });
  });

  it("builds a generic webhook JSON payload", () => {
    const request = buildNotificationRequest(
      { kind: "webhook", config: { url: "https://example.com/hook" } },
      alert,
    );

    assert.deepEqual(JSON.parse(request.body), {
      title: alert.title,
      body: alert.body,
      severity: alert.kind,
      alertId: alert.id,
      createdAt: "2026-07-01T12:00:00.000Z",
    });
  });
});
