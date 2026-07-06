import assert from "node:assert/strict";
import test from "node:test";
import { localDayKey } from "./netWorthBackfill";

test("localDayKey formats dates from local calendar parts", () => {
  const date = new Date(2026, 0, 2, 0, 30);

  assert.equal(localDayKey(date), "2026-01-02");
});
