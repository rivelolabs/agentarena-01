"use client";
import dynamic from "next/dynamic";

const Portal = dynamic(() => import("./HeroPortal").then((m) => m.HeroPortal), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[radial-gradient(60%_90%_at_28%_50%,#3a1a8a_0%,#170d4a_50%,#0d0830_100%)]" />,
});

export function HeroPortalClient({ className, align }: { className?: string; align?: "left" | "right" }) {
  return (
    <div className={className}>
      <Portal className="h-full w-full" align={align} />
    </div>
  );
}
