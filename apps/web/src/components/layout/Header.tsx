"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { Logo } from "./Logo";
import { WalletButton } from "../wallet/WalletButton";

const NAV = [
  { href: "/arena", label: "Arena" },
  { href: "/world", label: "World" },
  { href: "/agents", label: "My agents" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/fighters", label: "Fighters" },
  { href: "/docs", label: "How it works" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="relative z-30">
      <div className="mx-auto grid h-[88px] max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center px-5 md:px-10">
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "text-[15px] transition-colors",
                path === n.href || path.startsWith(n.href + "/") ? "text-white" : "text-[#cfcfd2] hover:text-white"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button className="lg:hidden -ml-2 p-2 text-muted" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <Logo />
        <div className="flex justify-end">
          <WalletButton />
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-bg/95 backdrop-blur lg:hidden">
          <div className="flex h-[88px] items-center justify-between px-5">
            <Logo />
            <button onClick={() => setOpen(false)} className="p-2 text-muted" aria-label="Close menu">
              <X size={22} />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-5" aria-label="Mobile">
            {[{ href: "/", label: "Home" }, ...NAV, { href: "/wallet", label: "Wallet" }].map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-line py-4 text-2xl font-medium">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
