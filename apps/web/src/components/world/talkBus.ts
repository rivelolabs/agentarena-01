"use client";
/** Tiny event bus: the 3D town reports what residents say, the page shows it as a chat log. */
import { useEffect, useState } from "react";

export interface TalkLine {
  id: number;
  who: string;
  text: string;
  color: string;
}

let uid = 1;
const listeners = new Set<(l: TalkLine) => void>();

export function emitTalk(who: string, text: string, color: string) {
  const line = { id: uid++, who, text, color };
  listeners.forEach((fn) => fn(line));
}

/** The last few things said in the town (cleared when `scope` changes, e.g. another colony). */
export function useTalkLog(scope: string, keep = 4) {
  const [log, setLog] = useState<TalkLine[]>([]);
  useEffect(() => {
    setLog([]);
    const fn = (l: TalkLine) => setLog((prev) => [...prev.slice(-(keep - 1)), l]);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [scope, keep]);
  return log;
}
