"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconLogo, IconSettings, IconTrash } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmDialog";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  // Email form
  const [emailCurrentPw, setEmailCurrentPw] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // Password form
  const [pwCurrentPw, setPwCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  // GitHub
  const [ghLoading, setGhLoading] = useState(false);
  const [ghMsg, setGhMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const user = session?.user;
  const githubLinked = !!(user as { githubId?: string })?.githubId;
  const hasPassword = !!(user as { hasPassword?: boolean })?.hasPassword;

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(null);
    setEmailLoading(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: emailCurrentPw, newEmail }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setEmailMsg({ type: "success", text: "Email updated. Please sign in again." });
        setEmailCurrentPw("");
        setNewEmail("");
        setTimeout(() => signOut({ callbackUrl: "/login" }), 2000);
      } else {
        setEmailMsg({ type: "error", text: body?.error ?? "Failed to update email" });
      }
    } catch {
      setEmailMsg({ type: "error", text: "Failed to update email" });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== newPwConfirm) {
      setPwMsg({ type: "error", text: "Passwords do not match" });
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrentPw, newPassword: newPw }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setPwMsg({ type: "success", text: "Password updated." });
        setPwCurrentPw("");
        setNewPw("");
        setNewPwConfirm("");
      } else {
        setPwMsg({ type: "error", text: body?.error ?? "Failed to update password" });
      }
    } catch {
      setPwMsg({ type: "error", text: "Failed to update password" });
    } finally {
      setPwLoading(false);
    }
  };

  const handleUnlinkGitHub = async () => {
    const ok = await confirm(
      "Unlink GitHub? You'll need a password to sign in afterward."
    );
    if (!ok) return;

    setGhLoading(true);
    setGhMsg(null);
    try {
      const res = await fetch("/api/account/github", { method: "DELETE" });
      if (res.ok) {
        setGhMsg({ type: "success", text: "GitHub unlinked." });
        await update();
      } else {
        const body = await res.json().catch(() => null);
        setGhMsg({ type: "error", text: body?.error ?? "Failed to unlink GitHub" });
      }
    } catch {
      setGhMsg({ type: "error", text: "Failed to unlink GitHub" });
    } finally {
      setGhLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await confirm(
      "This will permanently delete your account and all data (people, connections, graph). This cannot be undone."
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (res.ok) {
        await signOut({ callbackUrl: "/login" });
      } else {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? "Failed to delete account");
      }
    } catch {
      alert("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-start justify-center p-6 pt-20">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            className="btn"
            onClick={() => router.push("/")}
            title="Back to app"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex items-center gap-2">
            <IconSettings width={20} height={20} className="text-violet-400" />
            <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Settings</h1>
          </div>
        </div>

        {/* Account overview */}
        <div className="rounded-2xl p-5 space-y-3" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>Account</h2>
          <div>
            <label className="text-xs" style={{ color: "var(--text-dim)" }}>Name</label>
            <p className="text-sm" style={{ color: "var(--text)" }}>{user?.name ?? "—"}</p>
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--text-dim)" }}>Email</label>
            <p className="text-sm" style={{ color: "var(--text)" }}>{user?.email ?? "—"}</p>
          </div>
        </div>

        {/* Change email */}
        <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>Change email</h2>
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <div>
              <label className="label" htmlFor="email-current-pw">Current password</label>
              <input
                id="email-current-pw"
                type="password"
                className="field"
                value={emailCurrentPw}
                onChange={(e) => setEmailCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-email">New email</label>
              <input
                id="new-email"
                type="email"
                className="field"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {emailMsg && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{
                background: emailMsg.type === "error" ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                color: emailMsg.type === "error" ? "#fca5a5" : "#86efac",
              }}>
                {emailMsg.text}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={emailLoading}>
              {emailLoading ? "Saving..." : "Update email"}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>Change password</h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="label" htmlFor="pw-current-pw">Current password</label>
              <input
                id="pw-current-pw"
                type="password"
                className="field"
                value={pwCurrentPw}
                onChange={(e) => setPwCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-pw">New password</label>
              <input
                id="new-pw"
                type="password"
                className="field"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-pw-confirm">Confirm new password</label>
              <input
                id="new-pw-confirm"
                type="password"
                className="field"
                value={newPwConfirm}
                onChange={(e) => setNewPwConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {pwMsg && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{
                background: pwMsg.type === "error" ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                color: pwMsg.type === "error" ? "#fca5a5" : "#86efac",
              }}>
                {pwMsg.text}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={pwLoading}>
              {pwLoading ? "Saving..." : "Update password"}
            </button>
          </form>
        </div>

        {/* GitHub */}
        <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>GitHub</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: "var(--text)" }}>
                {githubLinked ? "Linked to GitHub" : "Not linked"}
              </p>
              {!githubLinked && !hasPassword && (
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Sign in with GitHub to link your account.
                </p>
              )}
            </div>
            {githubLinked && (
              <button
                className="btn"
                onClick={handleUnlinkGitHub}
                disabled={ghLoading || !hasPassword}
                title={!hasPassword ? "Set a password first" : "Unlink GitHub"}
              >
                {ghLoading ? "Unlinking..." : "Unlink"}
              </button>
            )}
          </div>
          {githubLinked && !hasPassword && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Set a password in the section above before unlinking GitHub.
            </p>
          )}
          {ghMsg && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{
              background: ghMsg.type === "error" ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
              color: ghMsg.type === "error" ? "#fca5a5" : "#86efac",
            }}>
              {ghMsg.text}
            </p>
          )}
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid rgba(239, 68, 68, 0.3)", background: "var(--bg-card)" }}>
          <h2 className="text-sm font-medium" style={{ color: "#fca5a5" }}>Danger zone</h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Permanently delete your account and all associated data including your network graph, people, and connections. This action cannot be undone.
          </p>
          <button
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            <IconTrash width={14} height={14} />
            {deleting ? "Deleting..." : "Delete account"}
          </button>
        </div>

        {/* Sign out */}
        <button
          className="btn w-full justify-center"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
