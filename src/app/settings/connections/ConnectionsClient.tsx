"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, Th, Td, Tr, Thead } from "@/components/DataTable";
import { Plus, RefreshCw, Sparkles, History } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type Institution = { name: string; domain: string | null; accounts: number };
type Item = {
  id: string;
  orgName: string | null;
  orgDomain: string | null;
  institutions: Institution[] | null;
  label: string | null;
  status: string;
  accountCount: number;
  createdAtFmt: string;
  lastSyncedAtFmt: string;
  purgeAfterFmt: string | null;
  disconnectedAt: string | null;
};

type Llm = {
  id: string;
  label: string;
  model: string;
  isDefault: boolean;
  useForAnalysis: boolean;
};

type CategorizeJobResponse = {
  ok?: boolean;
  jobId?: string;
  mode?: "new" | "all";
  status?: "idle" | "running" | "completed" | "failed";
  report?: {
    scanned: number;
    classified: number;
    failedBatches: number;
    flippedToTransfer: number;
  };
  categorizeStatus?: {
    total: number;
    classified: number;
    manualOverrides: number;
    uncategorized: number;
  };
  error?: string;
};

export function ConnectionsClient({ items, llms }: { items: Item[]; llms: Llm[] }) {
  const confirm = useConfirm();
  const analysisDefault =
    llms.find((l) => l.useForAnalysis)?.id ?? llms.find((l) => l.isDefault)?.id ?? llms[0]?.id ?? "";
  const [analysisModel, setAnalysisModel] = useState(analysisDefault);
  const router = useRouter();
  const [setupToken, setSetupToken] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(items.length === 0);

  const connect = async () => {
    setError(null);
    if (!setupToken.trim()) {
      setError("Paste your SimpleFIN setup token first.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/simplefin/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: setupToken.trim(), label: label.trim() || undefined }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Connect failed");
        return;
      }
      setSetupToken("");
      setLabel("");
      setShowForm(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const sync = async (id: string) => {
    setSyncingId(id);
    setError(null);
    try {
      const r = await fetch(`/api/simplefin/sync?connectionId=${id}`, { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Sync failed");
      } else {
        router.refresh();
      }
    } finally {
      setSyncingId(null);
    }
  };

  const disconnect = async (id: string, hard = false) => {
    const body = hard
      ? "Hard-delete all data from this connection? This cannot be undone."
      : "Disconnect this connection? Data will be purged automatically in 30 days.";
    const ok = await confirm({
      title: hard ? "Hard-delete connection?" : "Disconnect connection?",
      body,
      confirmLabel: hard ? "Hard-delete" : "Disconnect",
    });
    if (!ok) return;
    await fetch(`/api/simplefin/disconnect/${id}`, { method: hard ? "DELETE" : "POST" });
    router.refresh();
  };

  const [categorizing, setCategorizing] = useState<null | "new" | "all">(null);
  const [categorizeMsg, setCategorizeMsg] = useState<string | null>(null);
  const [categorizeJobId, setCategorizeJobId] = useState<string | null>(null);
  const [categorizeStatus, setCategorizeStatus] = useState<CategorizeJobResponse["categorizeStatus"] | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCategorizeStatus() {
      const r = await fetch("/api/finance/categorize", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as CategorizeJobResponse;
      if (cancelled) return;
      if (j.categorizeStatus) setCategorizeStatus(j.categorizeStatus);
      if (r.ok && j.status === "running" && j.jobId && j.mode) {
        setCategorizing(j.mode);
        setCategorizeJobId(j.jobId);
        setCategorizeMsg(j.mode === "all" ? "Re-categorization is running in the background." : "Categorization is running in the background.");
      }
    }
    void loadCategorizeStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const backfill = async () => {
    setBackfilling(true);
    setError(null);
    try {
      const r = await fetch("/api/finance/backfill-snapshots?days=365", { method: "POST" });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "Backfill failed");
      else setCategorizeMsg(`Net-worth backfilled — ${j.snapshotsWritten} daily snapshots over ${j.days}d`);
      router.refresh();
    } finally {
      setBackfilling(false);
    }
  };
  const categorize = async (all = false) => {
    setCategorizing(all ? "all" : "new");
    setCategorizeMsg(null);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (all) qs.set("all", "1");
      if (analysisModel) qs.set("credentialId", analysisModel);
      const r = await fetch(`/api/finance/categorize?${qs.toString()}`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as CategorizeJobResponse;
      if (j.categorizeStatus) setCategorizeStatus(j.categorizeStatus);
      if (!r.ok) {
        setError(j.error ?? "Categorize failed");
        setCategorizing(null);
        return;
      }

      if (!j.jobId) {
        setError("Categorize failed to start");
        setCategorizing(null);
        return;
      }

      setCategorizeJobId(j.jobId);
      setCategorizeMsg(all ? "Re-categorization is running in the background." : "Categorization is running in the background.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Categorize request failed");
      setCategorizing(null);
    }
  };

  useEffect(() => {
    if (!categorizeJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const r = await fetch(`/api/finance/categorize?jobId=${categorizeJobId}`, { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as CategorizeJobResponse;
        if (cancelled) return;
        if (j.categorizeStatus) setCategorizeStatus(j.categorizeStatus);

        if (!r.ok) {
          setError(j.error ?? "Categorize status failed");
          setCategorizing(null);
          setCategorizeJobId(null);
          return;
        }

        if (j.status === "failed") {
          setError(j.error ?? "Categorize failed");
          setCategorizing(null);
          setCategorizeJobId(null);
          return;
        }

        if (j.status === "completed" && j.report) {
          setCategorizeMsg(
            `Categorized ${j.report.classified} row${j.report.classified === 1 ? "" : "s"} (${j.report.failedBatches} batch failures, ${j.report.flippedToTransfer} re-flagged as transfer)`,
          );
          setCategorizing(null);
          setCategorizeJobId(null);
          router.refresh();
          return;
        }

        if (j.status === "running" && j.report) {
          setCategorizeMsg(
            `Categorizing in background — ${j.report.classified} row${j.report.classified === 1 ? "" : "s"} updated so far.`,
          );
        }

        timer = setTimeout(poll, 2500);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Categorize status failed");
        setCategorizing(null);
        setCategorizeJobId(null);
      }
    }

    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [categorizeJobId, router]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-filled">
            <Plus size={18} strokeWidth={2} />
            Connect with SimpleFIN
          </button>
        )}
        {llms.length > 0 && (
          <select
            value={analysisModel}
            onChange={(e) => setAnalysisModel(e.target.value)}
            className="h-10 rounded-full border border-outline bg-surface px-4 text-sm text-on-surface focus:border-primary focus:outline-none"
            title="Which model does the categorization. Defaults to the one marked 'analysis' in /settings/llm."
          >
            {llms.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} · {l.model}
                {l.useForAnalysis ? " ✓" : ""}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => categorize(false)}
          disabled={categorizing !== null || llms.length === 0}
          className="btn btn-outlined"
          title="Run the selected model over any transactions that haven't been classified yet"
        >
          <Sparkles size={16} strokeWidth={2} className={categorizing === "new" ? "animate-pulse" : ""} />
          {categorizing === "new" ? "Categorizing…" : "Categorize new"}
        </button>
        <button
          onClick={() => categorize(true)}
          disabled={categorizing !== null || llms.length === 0}
          className="btn btn-text"
          title="Wipe AI categories and re-run from scratch"
        >
          {categorizing === "all" ? "Re-categorizing…" : "Re-categorize all"}
        </button>
        <button
          onClick={backfill}
          disabled={backfilling}
          className="btn btn-text"
          title="Reconstruct historical net-worth from transaction history (one snapshot per day, last 365 days)."
        >
          <History size={16} strokeWidth={2} className={backfilling ? "animate-pulse" : ""} />
          {backfilling ? "Backfilling…" : "Backfill net-worth history"}
        </button>
        {error && <p className="body-s text-error">{error}</p>}
        {categorizeMsg && <p className="body-s text-on-surface-variant">{categorizeMsg}</p>}
        {categorizeStatus && (
          <p className="body-s text-on-surface-variant">
            Category status: {categorizeStatus.classified} AI-classified, {categorizeStatus.manualOverrides} manual, {categorizeStatus.uncategorized} remaining.
          </p>
        )}
      </div>

      {showForm && (
        <div className="card-elevated space-y-4">
          <div>
            <label className="title-s mb-1 block">Setup token</label>
            <p className="body-s mb-2 text-on-surface-variant">
              From{" "}
              <a
                href="https://bridge.simplefin.org/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                bridge.simplefin.org
              </a>{" "}
              → log in → <em>Manage</em> → <em>Create New Token</em>. Tokens are single-use.
            </p>
            <textarea
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              placeholder="aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS8..."
              className="tf min-h-24 font-mono text-sm"
              rows={4}
              spellCheck={false}
            />
          </div>
          <div>
            <label className="title-s mb-1 block">Label (optional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Personal banks"
              className="tf"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={connect} disabled={busy} className="btn btn-filled">
              {busy ? "Connecting…" : "Connect"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setSetupToken("");
                setLabel("");
                setError(null);
              }}
              className="btn btn-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <DataTable>
        <Thead>
          <Tr>
            <Th>Institution / Label</Th>
            <Th>Status</Th>
            <Th align="right">Accounts</Th>
            <Th>Connected</Th>
            <Th>Last sync</Th>
            <Th align="right"></Th>
          </Tr>
        </Thead>
        <tbody>
          {items.map((it) => (
            <Tr key={it.id}>
              <Td>
                {it.institutions && it.institutions.length > 0 ? (
                  <div className="space-y-0.5">
                    {it.institutions.map((inst, i) => (
                      <div key={i} className="flex items-baseline gap-2">
                        <span className="text-on-surface">{inst.name}</span>
                        <span className="body-s text-on-surface-variant">
                          {inst.domain ? `· ${inst.domain}` : ""}
                          {inst.accounts > 0 ? ` · ${inst.accounts} acct${inst.accounts === 1 ? "" : "s"}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <div>{it.orgName ?? it.label ?? "SimpleFIN"}</div>
                    {it.orgDomain && (
                      <div className="body-s text-on-surface-variant">{it.orgDomain}</div>
                    )}
                  </div>
                )}
              </Td>
              <Td>
                <span
                  className={
                    it.status === "active"
                      ? "badge badge-success"
                      : it.status === "disconnected"
                        ? "badge"
                        : "badge badge-error"
                  }
                >
                  {it.status}
                </span>
                {it.purgeAfterFmt && (
                  <div className="body-s mt-1 text-on-surface-variant">
                    purges {it.purgeAfterFmt}
                  </div>
                )}
              </Td>
              <Td align="right" mono>
                {it.accountCount}
              </Td>
              <Td mono className="text-on-surface-variant">
                {it.createdAtFmt}
              </Td>
              <Td mono className="text-on-surface-variant">
                {it.lastSyncedAtFmt}
              </Td>
              <Td align="right">
                <div className="flex items-center justify-end gap-2">
                  {it.status === "active" && (
                    <button
                      onClick={() => sync(it.id)}
                      disabled={syncingId === it.id}
                      className="btn btn-text"
                      title="Pull latest transactions, balances, holdings"
                    >
                      <RefreshCw
                        size={16}
                        strokeWidth={2}
                        className={syncingId === it.id ? "animate-spin" : ""}
                      />
                      {syncingId === it.id ? "Syncing…" : "Sync now"}
                    </button>
                  )}
                  {it.status !== "disconnected" ? (
                    <button onClick={() => disconnect(it.id)} className="btn btn-text-error">
                      Disconnect
                    </button>
                  ) : (
                    <button onClick={() => disconnect(it.id, true)} className="btn btn-text-error">
                      Delete now
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="body-m px-4 py-16 text-center text-on-surface-variant">
                No connections yet. Paste a setup token above to get started.
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
