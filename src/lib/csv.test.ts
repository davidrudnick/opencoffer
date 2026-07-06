import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeCsvField, parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses quoted fields with embedded commas, newlines, quotes, and CRLF rows", () => {
    const parsed = parseCsv(
      'Date,Description,Amount\r\n2026-01-02,"Coffee, bagel",-12.34\r\n2026-01-03,"Line one\nLine ""two""",45\r\n',
    );

    assert.deepEqual(parsed, {
      headers: ["Date", "Description", "Amount"],
      rows: [
        ["2026-01-02", "Coffee, bagel", "-12.34"],
        ["2026-01-03", "Line one\nLine \"two\"", "45"],
      ],
    });
  });

  it("keeps blank fields and ignores a trailing empty record", () => {
    const parsed = parseCsv("date,merchant,category\n2026-04-05,,Groceries\n");

    assert.deepEqual(parsed, {
      headers: ["date", "merchant", "category"],
      rows: [["2026-04-05", "", "Groceries"]],
    });
  });
});

describe("escapeCsvField", () => {
  it("quotes fields containing commas, quotes, newlines, or carriage returns", () => {
    assert.equal(escapeCsvField("plain"), "plain");
    assert.equal(escapeCsvField("Coffee, bagel"), '"Coffee, bagel"');
    assert.equal(escapeCsvField('Line "two"'), '"Line ""two"""');
    assert.equal(escapeCsvField("Line one\nLine two"), '"Line one\nLine two"');
    assert.equal(escapeCsvField("Line one\r\nLine two"), '"Line one\r\nLine two"');
  });

  it("serializes nullish values as empty fields", () => {
    assert.equal(escapeCsvField(null), "");
    assert.equal(escapeCsvField(undefined), "");
  });
});
