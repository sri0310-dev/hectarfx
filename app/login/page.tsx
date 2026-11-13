"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Sign in failed");
        setLoading(false);
        return;
      }
      const next = searchParams.get("next");
      // Only allow same-site relative redirects
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.href = dest;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          Email
        </label>
        <input
          id="username"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input-field text-sm"
          placeholder="name@hectar.global"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field text-sm"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="text-xs px-3 py-2 rounded-md border border-red-500/30 bg-red-500/10"
          style={{ color: "var(--accent-red)" }}
        >
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full text-sm disabled:opacity-60 disabled:cursor-not-allowed">
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <img src="/hectar-logo.svg" alt="Hectar" className="w-9 h-9 rounded-lg" />
          <div>
            <div className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>HectarFX</div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Treasury · Internal</div>
          </div>
        </div>

        <div className="rounded-lg p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h1 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Sign in</h1>
          <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
            Authorised Hectar personnel only.
          </p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-[10px] mt-4 text-center" style={{ color: "var(--text-muted)" }}>
          Access is restricted and activity may be logged.
        </p>
      </div>
    </div>
  );
}
