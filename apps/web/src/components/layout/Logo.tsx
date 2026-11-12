import Link from "next/link";
import clsx from "clsx";

/** Brand mark: two blades clashing, with the spark where they meet. Same artwork as app/icon.svg. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={clsx("shrink-0", className)} aria-hidden>
      <circle cx="32" cy="32" r="32" fill="#d4ff3a" />
      <path d="M11 15 L28.5 32 L11 49 L17.5 32 Z" fill="#0f0f10" />
      <path d="M53 15 L35.5 32 L53 49 L46.5 32 Z" fill="#0f0f10" />
      <path d="M32 25.5 L33.4 30.6 L38.5 32 L33.4 33.4 L32 38.5 L30.6 33.4 L25.5 32 L30.6 30.6 Z" fill="#0f0f10" />
    </svg>
  );
}

export function Logo({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <Link href="/" aria-label="AgentsWar home" className={clsx("flex items-center gap-2.5 text-[19px] sm:text-[22px] font-extrabold tracking-[-0.04em] text-white", className)}>
      {mark && <LogoMark size={36} />}
      <span>
        agentswar<span className="text-accent">.si</span>
      </span>
    </Link>
  );
}
