import assert from "node:assert/strict";
import { test } from "node:test";
import { isActive } from "./nav-config";

test("isActive matches dashboard only at the dashboard root", () => {
  assert.equal(isActive("/dashboard", "/dashboard"), true);
  assert.equal(isActive("/dashboard/assets", "/dashboard"), false);
});

test("isActive matches nested non-dashboard routes", () => {
  assert.equal(isActive("/dashboard/assets", "/dashboard/assets"), true);
  assert.equal(isActive("/dashboard/assets/123", "/dashboard/assets"), true);
  assert.equal(isActive("/settings/llm", "/settings"), true);
  assert.equal(isActive("/chat", "/dashboard/charts"), false);
});
