import assert from "node:assert/strict";
import {
  buildSavingsDestinationSlices,
  classifyOutflowKind,
  collapseSmallSlices,
  effectiveCategoryFromParts,
  exclusionsForSpendingKind,
} from "./display";

assert.equal(
  effectiveCategoryFromParts({
    overrideCategory: "Date Night",
    aiCategory: "Food & Dining",
    rawCategory: "Restaurants",
  }),
  "Date Night",
);

assert.equal(
  effectiveCategoryFromParts({
    overrideCategory: null,
    aiCategory: "Groceries",
    rawCategory: "Shops",
  }),
  "Groceries",
);

assert.equal(
  effectiveCategoryFromParts({
    overrideCategory: null,
    aiCategory: null,
    rawCategory: "Bank category",
  }),
  "Bank category",
);

assert.equal(
  effectiveCategoryFromParts({
    overrideCategory: null,
    aiCategory: null,
    rawCategory: null,
  }),
  "Uncategorized",
);

assert.equal(classifyOutflowKind({ category: "Transfer", isTransfer: false }), "transfer");
assert.equal(classifyOutflowKind({ category: "Groceries", isTransfer: true }), "transfer");
assert.equal(classifyOutflowKind({ category: "Retirement Contributions", isTransfer: false }), "savings");
assert.equal(classifyOutflowKind({ category: "Investments", isTransfer: false }), "savings");
assert.equal(classifyOutflowKind({ category: "Income - Salary", isTransfer: false }), "income");
assert.equal(classifyOutflowKind({ category: "Income — Dividend", isTransfer: false }), "income");
assert.equal(classifyOutflowKind({ category: "Groceries", isTransfer: false }), "consumption");

assert.deepEqual(exclusionsForSpendingKind("consumption"), [
  "transfers",
  "income",
  "retirement contributions",
  "investment outflows",
]);

assert.deepEqual(
  collapseSmallSlices(
    [
      { name: "Groceries", value: 500 },
      { name: "Rent", value: 1400 },
      { name: "Coffee", value: 60 },
      { name: "Fees", value: 20 },
      { name: "Transit", value: 200 },
    ],
    { maxSlices: 3, minPercent: 0.05 },
  ),
  [
    { name: "Rent", value: 1400 },
    { name: "Groceries", value: 500 },
    { name: "Transit", value: 200 },
    { name: "Other", value: 80 },
  ],
);

assert.deepEqual(
  buildSavingsDestinationSlices({
    income: 10_000,
    consumption: 4_000,
    savingsOutflows: [
      { accountGroup: "retirement", userAccountGroup: null, value: 1_500 },
      { accountGroup: "brokerage", userAccountGroup: null, value: 500 },
      { accountGroup: "brokerage", userAccountGroup: "cash", value: 200 },
    ],
  }),
  [
    { name: "Cash retained", value: 3_800 },
    { name: "Retirement", value: 1_500 },
    { name: "Brokerage", value: 500 },
    { name: "Cash", value: 200 },
  ],
);

console.log("finance display helpers passed");
