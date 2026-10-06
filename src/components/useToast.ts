"use client";

import { useCallback, useEffect, useState } from "react";

export interface Toast {
  message: string;
  type: "success" | "error";
}

export function useToast(timeoutMs = 5000) {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), timeoutMs);
    return () => clearTimeout(timer);
  }, [toast, timeoutMs]);

  const showToast = useCallback((message: string, type: Toast["type"]) => {
    setToast({ message, type });
  }, []);

  return { toast, showToast };
}
