# CSV import format — backfilling historical transactions

This document specifies the exact CSV format OpenCoffer imports, so an
assistant (e.g. Claude reading bank/card statements) can produce files that
import cleanly. It reflects the actual parser in `src/lib/csv.ts` and the
import pipeline in `src/app/dashboard/transactions/TransactionsClient.tsx`
→ `POST /api/transactions/import`.

## Where to import

**Dashboard → Transactions → Import (upload icon).** Choose the target
account, upload the CSV, review the column mapping and 10-row preview, then
import. The importer sends parsed JSON to the server; the server enforces
the rules below.

Import into the account the statement belongs to. If the account doesn't
exist in OpenCoffer (e.g. a closed card), create a manual account first
(Settings → Accounts) and import into that.

## Canonical format (produce exactly this)

```csv
date,amount,name,merchant,category,subcategory
2024-03-01,-52.18,"WHOLE FOODS MARKET #10236","Whole Foods","Groceries",
2024-03-01,-4.50,"STARBUCKS STORE 08882","Starbucks","Coffee & Cafes",
2024-03-02,2841.77,"ACME CORP PAYROLL PPD","Acme Corp","Income — Salary",
2024-03-03,-1200.00,"ZELLE TO J SMITH RENT MARCH",,"Rent & Mortgage",
2024-03-04,-89.99,"AMAZON.COM*RT4Y72",,"",
```

### Columns

| Column | Required | Rules |
| --- | --- | --- |
| `date` | **yes** | Prefer ISO `YYYY-MM-DD`. `MM/DD/YYYY` works if the "US dates" hint is selected at import time; ISO needs no hint and is never ambiguous. One transaction per row. |
| `amount` | **yes** | **Signed decimal. Negative = money out (purchases, fees), positive = money in (payments received, refunds, income).** No currency symbol needed (`$`, commas, and parentheses-for-negative are tolerated, but plain `-52.18` is safest). The import dialog has a sign-flip option, but produce negative-outflow so no one has to remember to use it. |
| `name` | **yes** | The raw statement description, up to 500 chars. **Must make the row unique — see deduplication below.** |
| `merchant` | no | Clean human merchant name if identifiable ("Whole Foods"), else leave empty. |
| `category` | no | Optional. If provided, use OpenCoffer's categories (list below). If left empty, the AI categorizer fills it in after import — leaving it empty is fine and often better. |
| `subcategory` | no | Optional free-form lowercase label ("spotify", "rent"). |

Header names are matched case-insensitively; `date`/`amount`/`name` also
match aliases (`posted date`, `transaction date` / `amt`, `debit/credit`,
`value` / `description`, `payee`, `memo`), but use the canonical names above.

### CSV mechanics

- UTF-8 plain text; `\n` or `\r\n` both fine.
- Quote fields containing commas, quotes, or newlines with double quotes;
  escape embedded quotes by doubling (`"say ""hi"""`).
- First row must be the header. Blank lines are ignored.
- Max **5,000 rows per file** (server limit). Split larger backfills into
  multiple files; each import call is deduplicated independently, so
  overlapping files are safe.

## ⚠️ Deduplication — the one real gotcha

The server derives each row's identity as **`sha256(date | amount | name)`**
scoped to the target account, and silently skips duplicates. This makes
re-importing the same file safe (idempotent), **but it also means two
genuinely different transactions with the same date, amount, AND name
collapse into one** — e.g. two $4.50 Starbucks charges on the same day.

**When generating CSVs from statements, make `name` unique for same-day
same-amount rows** — append the statement's reference/sequence number or a
counter: `"STARBUCKS STORE 08882 (2)"`. The importer reports
`inserted` vs `skipped`; if `skipped > 0` on a *fresh* import, look for
collapsed rows.

## Transfers and credit-card payments

Rows like "PAYMENT THANK YOU" (on a card) or "AUTOPAY TO CHASE CARD" (on
checking) are internal transfers, not income/spending. Import them anyway —
**do not omit or re-sign them** — the categorizer marks them `Transfer` so
aggregates exclude them. On a credit-card statement, the payment appears as
a POSITIVE amount; keep it positive.

## Standard categories (optional `category` column)

Food & Dining · Groceries · Coffee & Cafes · Transportation · Gas · Travel ·
Shopping · Entertainment · Subscriptions · Bills & Utilities ·
Phone & Internet · Healthcare · Insurance · Education · Personal Care ·
Home & Maintenance · Rent & Mortgage · Taxes · Charity & Gifts · Cash & ATM ·
Fees · Investments · Retirement Contributions · Income — Salary ·
Income — Dividend · Income — Refund · Income — Other · Transfer · Other

(The dash in `Income — Salary` is an em-dash. Custom category names are also
accepted, but the standard list keeps dashboards coherent.)

## After import

The server auto-runs AI categorization on new rows and refreshes the
net-worth snapshot. Verify totals on Dashboard → Transactions (filter by
account) against the statement's ending balance math.

## Hygiene

Statement files and generated CSVs must never be committed to this repo —
`.gitignore` blocks `*.csv`, `*.ofx`, `*.qfx`, and the `/import/` folder.
Keep working files in `/import/` (ignored) or outside the repo entirely.
