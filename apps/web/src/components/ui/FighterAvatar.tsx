"use client";
import { useState } from "react";
import clsx from "clsx";
import type { FighterSlug } from "@clashagent/shared";
import { FighterGlyph } from "./bits";

export const portrait = (slug: FighterSlug | string) => `/portraits/${slug}.jpg`;

/** Small square portrait of a fighter (falls back to the letter emblem if the picture is missing). */
export function FighterAvatar({ slug, size = 36, className }: { slug: FighterSlug | string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <FighterGlyph slug={slug} size={size} className={clsx("rounded-lg", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={portrait(slug)} alt="" onError={() => setBroken(true)} loading="lazy" width={size} height={size} style={{ width: size, height: size }} className={clsx("shrink-0 rounded-lg bg-[#1a1822] object-cover object-top", className)} />
  );
}
