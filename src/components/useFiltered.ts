"use client";

import { useMemo } from "react";

export function useFiltered<T>(list: T[], query: string, pick: (item: T) => string): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => pick(item).toLowerCase().includes(q));
  }, [list, query, pick]);
}
