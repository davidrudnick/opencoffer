"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, Th, Td, Tr, Thead } from "@/components/DataTable";
import { Plus, Trash2 } from "lucide-react";

type Budget = { id: string; category: string; monthlyAmount: number };

const COMMON = [
  "Food & Dining",
  "Groceries",
  "Subscriptions",
  "Phone & Internet",
  "Bills & Utilities",
  "Insurance",
  "Transportation",
  "Travel",
  "Entertainment",
  "Personal Care",
  "Shopping",
  "Rent & Mortgage",
  "Healthcare",
];

export function BudgetsClient({ initial }: { initial: Budget[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState({ category: "", monthlyAmount: 0 });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category || form.monthlyAmount <= 0) return;
    const r = await fetch("/api/budgets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      const created = await r.json();
      setRows((rs) =>
        rs.find((x) => x.id === created.id)
          ? rs.map((x) => (x.id === created.id ? { ...created, monthlyAmount: Number(created.monthlyAmount) } : x))
          : [...rs, { ...created, monthlyAmount: Number(created.monthlyAmount) }],
      );
      setForm({ category: "", monthlyAmount: 0 });
      router.refresh();
    }
  };

  const del = async (id: string) => {
    await fetch("/api/budgets", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-6">
      <section className="card-elevated mfade mfade-1">
        <h2 className="title-l">Your budgets</h2>
        <p className="body-m mt-1 text-on-surface-variant">
          The chat assistant and the dashboard use these to flag overruns.
        </p>
        <div className="mt-6 -mx-6 -mb-6">
          <DataTable className="rounded-none rounded-b-2xl bg-transparent">
            <Thead>
              <Tr>
                <Th>Category</Th>
                <Th align="right">Monthly cap</Th>
                <Th align="right"></Th>
              </Tr>
            </Thead>
            <tbody>
              {rows.map((b) => (
                <Tr key={b.id}>
                  <Td>{b.category}</Td>
                  <Td align="right" mono>${b.monthlyAmount.toLocaleString()}</Td>
                  <Td align="right">
                    <button onClick={() => del(b.id)} className="btn btn-text-error">
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </Td>
                </Tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="body-m px-4 py-12 text-center text-on-surface-variant">
                    No budgets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </section>

      <section className="card-elevated mfade mfade-2">
        <h2 className="title-l">Add or update</h2>
        <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px_auto]">
          <input
            list="cat-presets"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Category"
            className="tf"
          />
          <datalist id="cat-presets">
            {COMMON.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input
            type="number"
            min={1}
            step={1}
            value={form.monthlyAmount || ""}
            onChange={(e) => setForm({ ...form, monthlyAmount: Number(e.target.value) })}
            placeholder="Monthly cap ($)"
            className="tf"
          />
          <button type="submit" className="btn btn-filled">
            <Plus size={18} strokeWidth={2} /> Save
          </button>
        </form>
      </section>
    </div>
  );
}
