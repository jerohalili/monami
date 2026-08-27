// Generic modal wrapper with backdrop, escape-to-close, and mobile bottom-sheet layout.

"use client";

import { useEffect } from "react";
import { IconX } from "./icons";

export default function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:max-w-lg sm:rounded-2xl" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold tracking-wide" style={{ color: "var(--text)" }}>{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-80" style={{ color: "var(--text-dim)" }} aria-label="Close">
            <IconX width={18} height={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
