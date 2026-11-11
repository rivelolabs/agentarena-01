"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { MessagesSquare } from "lucide-react";
import { getFighter, type FighterSlug, type Side } from "@clashagent/shared";
import { sfx } from "@/lib/sfx";
import { FighterAvatar } from "../ui/FighterAvatar";

/** The second fighter answers a beat after the first, so it reads as a conversation. */
const REPLY_DELAY_MS = 750;
const KEEP = 5;

interface Msg {
  id: number;
  side: Side;
  text: string;
}

/**
 * The fighters' conversation as a chat box in the corner of the arena: each agent's line
 * appears as a message (left for one fighter, right for the other) and is spoken aloud when sound is on.
 */
export function FightChat({ lines, turn, fighters }: { lines: [string | null, string | null]; turn: number; fighters: [{ slug: FighterSlug; name: string }, { slug: FighterSlug; name: string }] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const uid = useRef(1);

  useEffect(() => () => sfx.clearDialogue(), [fighters[0].slug, fighters[1].slug]);

  // a new fight (or a replay) starts with an empty chat
  useEffect(() => {
    if (turn <= 1) { setMsgs([]); sfx.clearDialogue(); }
  }, [turn, fighters[0].slug, fighters[1].slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let order = 0;
    ([0, 1] as Side[]).forEach((side) => {
      const text = lines[side];
      if (!text) return;
      const id = uid.current++;
      timers.push(
        setTimeout(() => {
          setMsgs((m) => [...m.slice(-(KEEP - 1)), { id, side, text }]);
          sfx.speak(text, fighters[side].slug);
        }, 60 + order * REPLY_DELAY_MS)
      );
      order++;
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, lines[0], lines[1]]);

  if (!msgs.length) return null;
  return (
    <div className="pointer-events-none absolute bottom-32 left-2 w-[220px] sm:bottom-16 sm:left-5 sm:w-[290px]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/55">
          <MessagesSquare size={12} /> Fighter chat
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          {msgs.map((m, i) => {
            const f = getFighter(fighters[m.side].slug);
            const mine = m.side === 0;
            return (
              <div
                key={m.id}
                className={clsx("flex items-end gap-1.5", !mine && "flex-row-reverse", i < msgs.length - 3 && "hidden sm:flex")}
                style={{ animation: "speech-in .28s cubic-bezier(.2,.9,.2,1.2) both", transformOrigin: mine ? "bottom left" : "bottom right" }}
              >
                <FighterAvatar slug={f.slug} size={24} className="rounded-full" />
                <div className={clsx("max-w-[78%]", !mine && "text-right")}>
                  <div className="px-1 text-[10px] font-semibold" style={{ color: f.palette.primary }}>
                    {fighters[m.side].name}
                  </div>
                  <div
                    className={clsx("inline-block rounded-2xl px-2.5 py-1.5 text-left text-[12px] leading-snug text-white sm:text-[13px]", mine ? "rounded-bl-sm" : "rounded-br-sm")}
                    style={{ background: `${f.palette.primary}2e`, boxShadow: `inset 0 0 0 1px ${f.palette.primary}55` }}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
