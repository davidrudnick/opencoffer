"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const accept = async () => {
    const r = await fetch("/api/household/invite", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = await r.json();
    if (r.ok) {
      setStatus("ok");
      setMsg("You're in. Refreshing…");
      setTimeout(() => router.push("/dashboard"), 800);
    } else {
      setStatus("err");
      setMsg(j.error ?? "Failed");
    }
  };

  return (
    <div className="card-elevated text-center space-y-4">
      <h2 className="title-l">You&apos;ve been invited to a household</h2>
      <p className="body-m text-on-surface-variant">
        Joining will merge your view with everyone in that household. You can leave at any time
        from /settings/household.
      </p>
      {status === "idle" && (
        <button onClick={accept} className="btn btn-filled">
          Accept invite
        </button>
      )}
      {status === "ok" && <p className="body-m text-success">{msg}</p>}
      {status === "err" && <p className="body-m text-error">{msg}</p>}
    </div>
  );
}
