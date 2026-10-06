"use client";

import { useEffect } from "react";

export function useOutsideClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    // Defer listener so the opening click does not immediately close.
    const handler = () => onClose();
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [open, onClose]);
}
