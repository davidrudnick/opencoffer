"use client";

import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/utils";
import { setAccountGroup } from "./actions";
import { Check, RotateCcw, Loader2 } from "lucide-react";

const GROUPS = ["cash", "credit", "retirement", "brokerage", "hsa", "loan", "other"] as const;
type Group = (typeof GROUPS)[number];

type Account = {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  systemGroup: string;
  userOverride: string | null;
  currentBalance: number;
  currency: string | null;
};

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  return (
    <div className="card-elevated p-0">
      <div className="divide-y divide-outline-variant">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
        {accounts.length === 0 && (
          <div className="p-6 body-m text-center text-on-surface-variant">
            No accounts connected yet.
          </div>
        )}
      </div>
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  const effective = (account.userOverride ?? account.systemGroup) as Group;
  const [group, setGroup] = useState<Group>(effective);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const overridden = account.userOverride != null;

  function save(next: Group | "default") {
    setStatus("idle");
    startTransition(async () => {
      try {
        await setAccountGroup(account.id, next);
        if (next !== "default") setGroup(next);
        else setGroup(account.systemGroup as Group);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
      <div className="min-w-0 flex-1">
        <div className="body-m truncate text-on-surface">
          {account.name}
          {account.mask && (
            <span className="ml-2 font-mono text-xs text-on-surface-variant">
              ··{account.mask}
            </span>
          )}
        </div>
        <div className="body-s text-on-surface-variant">
          {account.type}
          {account.subtype ? ` · ${account.subtype}` : ""}
          <span className="mx-1.5">·</span>
          <span className="font-mono tabular-nums">
            {formatCurrency(account.currentBalance, account.currency ?? "USD")}
          </span>
          {overridden && (
            <span className="ml-2 rounded-full bg-secondary-container px-2 py-0.5 text-[10px] uppercase tracking-wide text-on-secondary-container">
              custom
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={group}
          disabled={pending}
          onChange={(e) => save(e.target.value as Group)}
          className="h-10 rounded-full border border-outline bg-surface px-3 text-sm capitalize text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
        >
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        {overridden && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save("default")}
            className="btn-icon"
            title={`Reset to system-assigned (${account.systemGroup})`}
            aria-label="Reset to system-assigned group"
          >
            <RotateCcw size={16} strokeWidth={1.75} />
          </button>
        )}
        <span className="w-6">
          {pending ? (
            <Loader2 size={16} className="animate-spin text-on-surface-variant" />
          ) : status === "saved" ? (
            <Check size={16} className="text-success" />
          ) : status === "error" ? (
            <span className="text-xs text-error">!</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
