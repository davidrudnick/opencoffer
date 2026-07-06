import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesCategoryRule } from "@/lib/finance/rules";

describe("matchesCategoryRule", () => {
  it("matches merchant contains case-insensitively", () => {
    assert.equal(
      matchesCategoryRule(
        { field: "merchant", matchType: "contains", pattern: "coffee" },
        { name: "POS PURCHASE", merchantName: "Blue Bottle Coffee" },
      ),
      true,
    );
  });

  it("matches name equals case-insensitively after trimming", () => {
    assert.equal(
      matchesCategoryRule(
        { field: "name", matchType: "equals", pattern: "payroll deposit" },
        { name: "  PAYROLL DEPOSIT  ", merchantName: null },
      ),
      true,
    );
  });

  it("does not fall back to name for merchant rules", () => {
    assert.equal(
      matchesCategoryRule(
        { field: "merchant", matchType: "contains", pattern: "target" },
        { name: "Target Store 123", merchantName: null },
      ),
      false,
    );
  });
});
