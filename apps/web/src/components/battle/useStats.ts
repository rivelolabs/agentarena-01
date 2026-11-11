"use client";
import { useEffect, useState } from "react";

/** Re-render every 30s so relative times stay fresh. */
export function useStatsTicker() {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);
}
