"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

export function SpendingChart({ data }: { data: Array<{ month: string; total: number }> }) {
  if (data.length === 0)
    return (
      <div className="grid h-56 place-items-center rounded-2xl bg-surface-container text-on-surface-variant">
        <span className="body-m">No spending data yet</span>
      </div>
    );
  const max = Math.max(...data.map((d) => d.total));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="36%">
          <CartesianGrid stroke="hsl(218 11% 79%)" vertical={false} strokeDasharray="2 4" />
          <XAxis
            dataKey="month"
            stroke="hsl(214 8% 28%)"
            tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
            tickMargin={10}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="hsl(214 8% 28%)"
            tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
            tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
            axisLine={false}
            tickLine={false}
            width={42}
          />
          <Tooltip
            cursor={{ fill: "hsl(207 100% 32% / 0.08)" }}
            contentStyle={{
              background: "hsl(220 4% 19%)",
              border: 0,
              borderRadius: 8,
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "hsl(240 11% 95%)",
              padding: "8px 12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            }}
            labelStyle={{
              color: "hsl(240 11% 78%)",
              fontSize: 11,
              fontWeight: 500,
              marginBottom: 4,
            }}
            formatter={(v: number) => [`$${v.toLocaleString()}`, "spent"]}
          />
          <Bar dataKey="total" radius={[8, 8, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.total === max ? "hsl(207 100% 32%)" : "hsl(207 100% 32% / 0.55)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
