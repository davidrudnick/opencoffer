# Family accounts — "held for" tagging

Tag an account as **held for** a family member — typically a child's 529 or
UTMA — and OpenCoffer stops counting that money as yours. This documents the
exact semantics so nothing about your dashboards or the chat tools is
surprising.

## The model

- **Family members** are lightweight records (just a name), managed in
  **Settings → Accounts → Family members**.
- Any account (synced or manual, any type) can be held for at most one
  member, via the **Held for** selector on its row in Settings → Accounts.
  `null` = your own money. The tag is stored on the account
  (`financial_accounts.held_for_id`) and survives syncs.
- **Contributions into a held-for account are treated as irreversible
  gifts.** That is the intended mental model: once money lands in the
  child's account it is theirs, not a savings bucket of yours.

## What changes when an account is tagged

**Excluded from your numbers.** Net worth, balances by group/type,
portfolio summary, holdings, and every spending/income/cash-flow/budget
aggregate ignore held-for accounts. Activity *inside* them (dividends,
interest, fund purchases) is the member's, not your income or spending.
`get_net_worth` reports the excluded total separately as
`heldForFamilyTotal`, and the dashboard shows a "Held for family
(excluded)" stat linking to the Family page.

**Gifts, not savings.** `get_consumption_vs_savings` gains a `gifts` line:
money arriving in held-for accounts (measured at the destination, minus the
member's own investment income). Gifts never count toward the savings rate
and are subtracted from `net`.

**History is rebuilt, not kinked.** Tagging or untagging an account
triggers a net-worth history backfill (365 days), so your chart
retroactively excludes (or re-includes) the account instead of showing a
cliff on tag day. The member's own daily value history
(`family_member_snapshots`) is reconstructed by the same backfill and then
maintained nightly alongside the household snapshot.

**Their own views.** **Dashboard → Family** shows one section per member:
total value, gifted amount over 12 months, allocation by group, positions
with gains, and a value-over-time chart.

## Transaction browsing is unchanged

`get_recent_transactions` and `search_transactions` still show everything —
analysis excludes the member's money; the ledger does not hide it.

## Chat / MCP surface

- `set_account_held_for(accountId, heldFor)` — tag an account; the member
  is created if new; `heldFor: "clear"` untags. Rebuilds history.
- `get_family_members()` — members with their accounts and totals.
- `get_portfolio_summary({ familyMember })`, `get_holdings({ familyMember })`,
  `chart_net_worth_history({ familyMember })` — member-scoped views
  (name lookup is case-insensitive).

## One caveat

Gifts are measured at the **destination** because an outflow row in your
checking account doesn't know where the money went. The outgoing leg is
normally classified as a transfer (excluded from everything), which is
correct. But if you manually categorize that outgoing leg as
"Investments" or "Retirement Contributions", it will count as *your
savings* in addition to the gift measured on the child's side. If a
contribution shows up in your savings numbers, recategorize the outgoing
transaction to "Transfer".
