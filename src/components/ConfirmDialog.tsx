// Custom confirm dialog replacing window.confirm with styled modal.

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ConfirmFn = (message: string) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(Ctx);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const resolveRef = useRef<(v: boolean) => void>(() => {});

  const confirm: ConfirmFn = useCallback((message) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setMsg(message);
    });
  }, []);

  const close = (value: boolean) => {
    setMsg(null);
    resolveRef.current(value);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {msg && (
        <div className="fixed inset-0 z-100 flex items-end justify-center sm:items-center sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => close(false)} />
          <div className="relative w-full max-w-sm rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{msg}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={() => close(false)}>Cancel</button>
              <button className="btn bg-red-600 text-white hover:bg-red-500" onClick={() => close(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
