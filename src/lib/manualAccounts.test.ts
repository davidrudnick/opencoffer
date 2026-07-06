import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeManualAccountInput } from "@/lib/manualAccounts";

describe("normalizeManualAccountInput", () => {
  it("trims names, uppercases currency, and stringifies balances for storage", () => {
    assert.deepEqual(
      normalizeManualAccountInput({
        name: "  Cash jar  ",
        type: "depository",
        accountGroup: "cash",
        balance: 125.5,
        currency: "usd",
      }),
      {
        name: "Cash jar",
        type: "depository",
        accountGroup: "cash",
        balance: "125.5",
        currency: "USD",
      },
    );
  });

  it("defaults blank currency to USD", () => {
    assert.equal(
      normalizeManualAccountInput({
        name: "Loan",
        type: "loan",
        accountGroup: "loan",
        balance: -500,
        currency: "",
      }).currency,
      "USD",
    );
  });
});
