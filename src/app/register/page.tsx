"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/Logo";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      setErr((await res.json()).error ?? "Registration failed.");
      setLoading(false);
      return;
    }
    await signIn("credentials", { email, password, redirect: false });
    router.push("/dashboard");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-6">
      <div className="card-elevated mfade mfade-1 w-full max-w-[440px]">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={36} withWordmark priority />
        </Link>
        <h1 className="headline-m mt-8">Create account</h1>
        <p className="body-m mt-1 text-on-surface-variant">
          The first user becomes admin. Add more later in settings.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <Field label="Name" value={name} onChange={setName} autoComplete="name" />
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          <Field
            label="Password (8+ characters)"
            type="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="new-password"
            minLength={8}
          />
          {err && <p className="tf-helper error">{err}</p>}
          <button type="submit" disabled={loading} className="btn btn-filled w-full">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="body-m mt-8 text-on-surface-variant">
          Already have an account?{" "}
          <Link href="/login" className="text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  required,
  autoComplete,
  minLength,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <div className="tf">
      <input
        id={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder=" "
        className="tf-input"
      />
      <label htmlFor={label} className="tf-label">
        {label}
      </label>
    </div>
  );
}
