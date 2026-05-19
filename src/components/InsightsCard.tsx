"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, RefreshCw, AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";

type Insight = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  dataRef?: {
    chartRef?: {
      title?: string;
      key?: string;
    };
  } | null;
  generatedAt: string;
};

export function InsightsCard({ limit = 5 }: { limit?: number } = {}) {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    const r = await fetch("/api/insights");
    if (r.ok) {
      const rows = await r.json();
      setItems(
        rows.map((x: { id: string; kind: string; severity: string; title: string; body: string; dataRef?: Insight["dataRef"]; generatedAt: string }) => ({
          ...x,
          generatedAt: x.generatedAt,
        })),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const regen = async () => {
    setGenerating(true);
    await fetch("/api/insights", { method: "POST" });
    await fetchInsights();
    setGenerating(false);
  };

  const dismiss = async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await fetch("/api/insights", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
  };

  return (
    <section className="card-elevated mfade mfade-2 p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h2 className="title-m md:title-l">Intelligence</h2>
        </div>
        <button
          onClick={regen}
          disabled={generating}
          className="btn btn-text h-9 px-2 text-xs md:h-10 md:px-3"
          title="Regenerate from the latest data"
        >
          <RefreshCw
            size={14}
            strokeWidth={2}
            className={generating ? "animate-spin" : ""}
          />
          {generating ? "Generating…" : "Refresh analysis"}
        </button>
      </div>
      {loading && items.length === 0 ? (
        <div className="body-m mt-4 text-on-surface-variant">Loading…</div>
      ) : items.length === 0 ? (
        <div className="body-m mt-4 text-on-surface-variant">
          No callouts yet. Refresh analysis to generate from your latest data.
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2">
          {items.slice(0, limit).map((it, index) => (
            <li
              key={it.id}
              className={`rounded-2xl border border-outline-variant bg-surface-container-low p-3 ${index > 0 ? "hidden sm:block" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Badge severity={it.severity} />
                  <div className="title-s">{it.title}</div>
                </div>
                <button
                  onClick={() => dismiss(it.id)}
                  className="btn-icon"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="body-m mt-2 line-clamp-2 text-on-surface-variant md:line-clamp-3">{it.body}</p>
              {it.dataRef?.chartRef?.title && (
                <div className="body-s mt-3 text-primary">{it.dataRef.chartRef.title}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Badge({ severity }: { severity: string }) {
  if (severity === "warn") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-error-container text-error">
        <AlertTriangle size={12} strokeWidth={2.5} />
      </span>
    );
  }
  if (severity === "suggest") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
        <Lightbulb size={12} strokeWidth={2.5} />
      </span>
    );
  }
  if (severity === "praise") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-container text-on-success-container">
        <TrendingUp size={12} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
      <Sparkles size={12} strokeWidth={2.5} />
    </span>
  );
}
