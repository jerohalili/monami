"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconLogo } from "@/components/icons";

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const handleGuest = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      if (!res.ok) throw new Error("Guest login failed");

      const { email: guestEmail, password: guestPassword } = await res.json();

      const signInRes = await signIn("credentials", {
        email: guestEmail,
        password: guestPassword,
        redirect: false,
      });

      setLoading(false);

      if (signInRes?.error) {
        setError("Guest login failed. Please try again.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Guest login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl p-6 shadow-2xl" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div className="flex flex-col items-center gap-2">
          <IconLogo width={32} height={32} className="text-violet-400" />
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            Sign in to Mon<span className="text-violet-400">Ami</span>
          </h1>
        </div>

        <button
          type="button"
          className="btn w-full"
          onClick={() => signIn("github", { callbackUrl: "/" })}
          disabled={loading}
        >
          <GitHubIcon />
          Sign in with GitHub
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: "var(--border)" }} />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2" style={{ background: "var(--bg-card)", color: "var(--text-dim)" }}>or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5" }}>
              {error}
            </p>
          )}

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: "var(--border)" }} />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2" style={{ background: "var(--bg-card)", color: "var(--text-dim)" }}>or</span>
          </div>
        </div>

        <button type="button" className="btn w-full" onClick={handleGuest} disabled={loading}>
          Continue as guest
        </button>

        <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-violet-400 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
