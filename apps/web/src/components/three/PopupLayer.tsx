"use client";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { Side } from "@clashagent/shared";
import type { Popup, VisStore } from "./store";

const STYLE: Record<Popup["kind"], string> = {
  crit: "text-[34px] text-[#ffe14d] [text-shadow:0_0_18px_rgba(255,200,0,0.7)]",
  big: "text-[34px] text-white [text-shadow:0_0_24px_rgba(255,255,255,0.6)]",
  dmg: "text-[28px] text-white [text-shadow:0_2px_14px_rgba(255,60,60,0.95)]",
  heal: "text-[26px] text-[#4dffa6] [text-shadow:0_0_14px_rgba(77,255,166,0.7)]",
  miss: "text-[17px] text-[#c9c9cf] tracking-[0.2em]",
  info: "text-[14px] text-[#e8e8ea] tracking-[0.18em]",
};

/** DOM overlay for floating combat text, anchored to the fighters' projected screen positions. */
export function PopupLayer({ store }: { store: VisStore }) {
  const popups = useStore(store, (s) => s.popups);
  const anchors = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const sc = store.getState().screen;
      anchors.forEach((a, i) => {
        if (a.current) a.current.style.transform = `translate(${sc[i].x}px, ${sc[i].y}px)`;
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {([0, 1] as Side[]).map((side) => (
        <div key={side} ref={anchors[side]} className="absolute left-0 top-0 h-0 w-0 will-change-transform">
          {popups
            .filter((p) => p.side === side)
            .slice(-4)
            .map((p, i) => (
              <div
                key={p.id}
                className={`absolute left-0 whitespace-nowrap font-extrabold uppercase italic ${STYLE[p.kind]}`}
                style={{ top: -i * 28, animation: "popup-rise 1.4s cubic-bezier(.2,.8,.2,1) forwards" }}
              >
                {p.text}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
