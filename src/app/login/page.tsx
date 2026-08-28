"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconLogo } from "@/components/icons";

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
