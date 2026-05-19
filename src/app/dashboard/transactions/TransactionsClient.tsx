"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { DataTable, Th, Td, Tr, Thead } from "@/components/DataTable";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil, Search } from "lucide-react";

type Row = {
  id: string;
  date: string;
  amount: number;
  name: string;
  merchant: string | null;
  overrideMerchant: string | null;
  category: string | null;
  aiCategory: string | null;
  overrideCategory: string | null;
  aiSubcategory: string | null;
  overrideSubcategory: string | null;
  isTransfer: boolean;
  overrideIsTransfer: boolean | null;
  isRecurring: boolean;
  userNotes: string | null;
  pending: boolean;
  currency: string | null;
  accountName: string | null;
  accountMask: string | null;
};

const CATEGORIES = [
  "Food & Dining", "Groceries", "Coffee & Cafes", "Transportation", "Gas", "Travel",
  "Shopping", "Entertainment", "Subscriptions", "Bills & Utilities", "Phone & Internet",
  "Healthcare", "Insurance", "Education", "Personal Care", "Home & Maintenance",
  "Rent & Mortgage", "Taxes", "Charity & Gifts", "Cash & ATM", "Fees",
  "Investments", "Retirement Contributions",
  "Income — Salary", "Income — Dividend", "Income — Refund", "Income — Other",
  "Transfer", "Other",
];
const INITIAL_VISIBLE = 40;
const VISIBLE_STEP = 40;

export function TransactionsClient({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [editing, setEditing] = useState<Row | null>(null);
  const [items, setItems] = useState(rows);

  const filtered = useMemo(() => {
    if (!deferredFilter) return items;
    const f = deferredFilter.toLowerCase();
    return items.filter(
      (r) =>
        (r.merchant ?? r.name ?? "").toLowerCase().includes(f) ||
        (r.overrideCategory ?? r.aiCategory ?? r.category ?? "").toLowerCase().includes(f) ||
        (r.accountName ?? "").toLowerCase().includes(f),
    );
  }, [items, deferredFilter]);
  useEffect(() => setVisibleCount(INITIAL_VISIBLE), [deferredFilter]);
  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by merchant, category, account…"
            className="tf pl-9"
          />
        </div>
      </div>

      <div className="md:hidden">
        {visible.length > 0 ? (
          <ul className="space-y-3">
            {visible.map((r) => (
              <TransactionCard key={r.id} row={r} onEdit={() => setEditing(r)} />
            ))}
          </ul>
        ) : (
          <div className="body-m rounded-2xl bg-surface-low px-4 py-12 text-center text-on-surface-variant">
            No transactions match.
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <DataTable>
          <Thead>
            <Tr>
              <Th>Date</Th>
              <Th>Merchant</Th>
              <Th>Category</Th>
              <Th>Account</Th>
              <Th align="right">Amount</Th>
              <Th align="right"></Th>
            </Tr>
          </Thead>
          <tbody>
            {visible.map((r) => {
              const eff = effectiveCategory(r);
              const merch = effectiveMerchant(r);
              const xfer = effectiveTransfer(r);
              const amt = r.amount;
              return (
                <Tr key={r.id} className={xfer ? "opacity-60" : ""}>
                  <Td mono className="text-on-surface-variant">{formatDate(r.date)}</Td>
                  <Td>
                    <div className="max-w-[36ch] truncate">
                      <span className="text-on-surface">{merch}</span>
                      <TransactionBadges row={r} />
                    </div>
                    {r.userNotes && (
                      <div className="body-s text-on-surface-variant">{r.userNotes}</div>
                    )}
                  </Td>
                  <Td className="text-on-surface-variant">{eff}</Td>
                  <Td className="text-on-surface-variant">
                    {r.accountName}
                    {r.accountMask && (
                      <span className="ml-1 font-mono text-xs">··{r.accountMask}</span>
                    )}
                  </Td>
                  <Td align="right" mono className="text-on-surface">
                    {amt > 0 ? "+" : amt < 0 ? "−" : ""}
                    {formatCurrency(Math.abs(amt), r.currency ?? "USD")}
                  </Td>
                  <Td align="right">
                    <button
                      onClick={() => setEditing(r)}
                      className="btn-icon"
                      aria-label={`Edit ${merch}`}
                      title="Edit transaction"
                    >
                      <Pencil size={16} strokeWidth={2} />
                    </button>
                  </Td>
                </Tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="body-m px-4 py-16 text-center text-on-surface-variant">
                  No transactions match.
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl bg-surface-low px-4 py-3 sm:flex-row">
          <div className="body-s text-on-surface-variant">
            Showing {visible.length} of {filtered.length} transactions
          </div>
          {canLoadMore && (
            <button
              className="btn btn-outlined w-full sm:w-auto"
              onClick={() => setVisibleCount((n) => n + VISIBLE_STEP)}
            >
              Load more
            </button>
          )}
        </div>
      )}

      {editing && (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            setItems((xs) => xs.map((x) => (x.id === updated.id ? updated : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function effectiveCategory(row: Row) {
  return row.overrideCategory ?? row.aiCategory ?? row.category ?? "—";
}

function effectiveMerchant(row: Row) {
  return row.overrideMerchant ?? row.merchant ?? row.name;
}

function effectiveTransfer(row: Row) {
  return row.overrideIsTransfer ?? row.isTransfer;
}

function TransactionBadges({ row }: { row: Row }) {
  const xfer = effectiveTransfer(row);
  return (
    <>
      {row.pending && <span className="badge ml-2">pending</span>}
      {xfer && <span className="badge ml-2">transfer</span>}
      {row.isRecurring && <span className="badge ml-2">recurring</span>}
    </>
  );
}

function TransactionCard({ row, onEdit }: { row: Row; onEdit: () => void }) {
  const amt = row.amount;
  const xfer = effectiveTransfer(row);
  const amountClass = amt >= 0 ? "text-success" : xfer ? "text-on-surface-variant" : "text-on-surface";
  return (
    <li className={`rounded-2xl bg-surface-low p-4 shadow-sm ${xfer ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="body-s font-mono text-on-surface-variant">{formatDate(row.date)}</div>
          <div className="title-m mt-1 truncate text-on-surface">{effectiveMerchant(row)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="badge badge-primary">{effectiveCategory(row)}</span>
            {row.pending && <span className="badge">pending</span>}
            {xfer && <span className="badge">transfer</span>}
            {row.isRecurring && <span className="badge">recurring</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`title-m font-mono tabular-nums ${amountClass}`}>
            {amt > 0 ? "+" : amt < 0 ? "−" : ""}
            {formatCurrency(Math.abs(amt), row.currency ?? "USD")}
          </div>
          <button onClick={onEdit} className="btn-icon mt-1" aria-label={`Edit ${effectiveMerchant(row)}`}>
            <Pencil size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="body-s mt-3 truncate text-on-surface-variant">
        {row.accountName ?? "Account"}
        {row.accountMask && <span className="ml-1 font-mono">··{row.accountMask}</span>}
      </div>
      {row.userNotes && (
        <div className="body-s mt-2 rounded-xl bg-surface-container px-3 py-2 text-on-surface-variant">
          {row.userNotes}
        </div>
      )}
    </li>
  );
}

function EditModal({
  row,
  onClose,
  onSave,
}: {
  row: Row;
  onClose: () => void;
  onSave: (r: Row) => void;
}) {
  const [cat, setCat] = useState(row.overrideCategory ?? row.aiCategory ?? row.category ?? "");
  const [sub, setSub] = useState(row.overrideSubcategory ?? row.aiSubcategory ?? "");
  const [merch, setMerch] = useState(row.overrideMerchant ?? row.merchant ?? row.name ?? "");
  const [notes, setNotes] = useState(row.userNotes ?? "");
  const [xfer, setXfer] = useState<boolean>(row.overrideIsTransfer ?? row.isTransfer);

  const save = async () => {
    const patch = {
      overrideCategory: cat || null,
      overrideSubcategory: sub || null,
      overrideMerchant: merch || null,
      overrideIsTransfer: xfer,
      userNotes: notes || null,
    };
    const r = await fetch(`/api/transactions/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return;
    onSave({
      ...row,
      ...patch,
    } as Row);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="card-elevated w-full max-w-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="title-l">Edit transaction</h2>
        <div className="body-s text-on-surface-variant">{row.name}</div>

        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="overline">Category</span>
            <input
              list="cats"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="tf"
            />
            <datalist id="cats">
              {CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="block">
            <span className="overline">Subcategory</span>
            <input value={sub} onChange={(e) => setSub(e.target.value)} className="tf" />
          </label>
          <label className="block">
            <span className="overline">Merchant</span>
            <input value={merch} onChange={(e) => setMerch(e.target.value)} className="tf" />
          </label>
          <label className="block">
            <span className="overline">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="tf"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={xfer}
              onChange={(e) => setXfer(e.target.checked)}
              className="h-5 w-5 accent-[hsl(var(--md-primary))]"
            />
            <span className="body-m">Treat as transfer (exclude from spend/income totals)</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn btn-text">Cancel</button>
          <button onClick={save} className="btn btn-filled">Save</button>
        </div>
      </div>
    </div>
  );
}
