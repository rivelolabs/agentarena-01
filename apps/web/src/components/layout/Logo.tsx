import Link from "next/link";
import clsx from "clsx";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="AgentsWar home" className={clsx("text-[19px] sm:text-[22px] font-extrabold tracking-[-0.04em] text-white", className)}>
      agentswar<span className="text-accent">.si</span>
    </Link>
  );
}
