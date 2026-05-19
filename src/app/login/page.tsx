"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/Logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setErr("Invalid email or password.");
    else router.push(next);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-6">
      <div className="card-elevated mfade mfade-1 w-full max-w-[440px]">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={36} withWordmark priority />
        </Link>
        <h1 className="headline-m mt-8">Sign in</h1>
        <p className="body-m mt-1 text-on-surface-variant">
          Local, multi-user, no SSO required.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
            error={err ?? undefined}
          />
          <button
            type="submit"
            disabled={loading}
            className="btn btn-filled w-full"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="body-m mt-8 text-on-surface-variant">
          New here?{" "}
          <Link href="/register" className="text-primary underline-offset-2 hover:underline">
            Create an account
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
  error,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <div className="tf">
        <input
          id={label}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          placeholder=" "
          className={`tf-input ${error ? "error" : ""}`}
        />
        <label htmlFor={label} className="tf-label">
          {label}
        </label>
      </div>
      {error && <div className="tf-helper error">{error}</div>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
