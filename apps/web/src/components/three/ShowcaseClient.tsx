"use client";
import dynamic from "next/dynamic";
import type { FighterSlug } from "@clashagent/shared";

const FighterShowcase = dynamic(() => import("./FighterShowcase").then((m) => m.FighterShowcase), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center bg-[#0b0b0c] text-sm text-dim">Loading 3D…</div>,
});

export function ShowcaseClient({ slug, className }: { slug: FighterSlug; className?: string }) {
  return <FighterShowcase slug={slug} className={className} />;
}
