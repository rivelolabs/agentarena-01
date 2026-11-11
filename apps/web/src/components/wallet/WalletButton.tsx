"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { ChevronRight, LogOut, Wallet, Bot, X, Loader2, ExternalLink, Swords } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/providers/AuthProvider";
import { shortAddr, sol } from "@/lib/format";
import { useConfig } from "@/lib/hooks";

const FEATURED = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Backpack", url: "https://backpack.app/downloads" },
];

/** Pill CTA with the dark arrow block, as in the header reference. */
export function PillButton({
  children,
  onClick,
  href,
  className,
  disabled,
  variant = "light",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  disabled?: boolean;
  variant?: "light" | "dark" | "accent";
  type?: "button" | "submit";
}) {
  const cls = clsx(
    "group inline-flex items-center gap-3 whitespace-nowrap rounded-[10px] pl-4 pr-1 py-1 text-[15px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none",
    variant === "light" && "bg-[#f2f2f2] text-[#111] hover:bg-white",
    variant === "accent" && "bg-accent text-accent-ink hover:brightness-110",
    variant === "dark" && "bg-surface-2 text-fg border border-line hover:border-line-strong",
    className
  );
  const arrow = (
    <span
      className={clsx(
        "grid h-8 w-8 place-items-center rounded-[8px] transition-transform group-hover:translate-x-0.5",
        variant === "dark" ? "bg-white/10" : "bg-[#111] text-white"
      )}
    >
      <ChevronRight size={16} />
    </span>
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        <span>{children}</span>
        {arrow}
      </Link>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      <span>{children}</span>
      {arrow}
    </button>
  );
}

export function WalletButton() {
  const { publicKey, connecting } = useWallet();
  const { user, signingIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  if (user && publicKey && user.wallet === publicKey.toBase58()) {
    return (
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex items-center gap-3 rounded-[10px] border border-line bg-surface/80 py-1 pl-3 pr-1 text-sm backdrop-blur hover:border-line-strong"
        >
          <span className="hidden font-mono tabular text-[13px] text-muted sm:inline">{sol(user.credits)} SOL</span>
          <span className="rounded-[8px] bg-white/8 px-2.5 py-1.5 font-mono text-[13px]">{user.handle ?? shortAddr(user.wallet)}</span>
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <AccountMenu onClose={() => setMenu(false)} />
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <PillButton onClick={() => setOpen(true)} disabled={connecting || signingIn}>
        {connecting ? (
          "Connecting…"
        ) : signingIn ? (
          "Signing…"
        ) : publicKey ? (
          "Sign in"
        ) : (
          <>
            <span className="sm:hidden">Connect</span>
            <span className="hidden sm:inline">Connect wallet</span>
          </>
        )}
      </PillButton>
      {open && <WalletModal onClose={() => setOpen(false)} />}
    </>
  );
}

function AccountMenu({ onClose }: { onClose: () => void }) {
  const { signOut, user } = useAuth();
  const item = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-white/5 hover:text-fg";
  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-2xl border border-line bg-surface p-2 shadow-2xl shadow-black/60">
      <div className="px-3 py-2 text-xs text-dim">Signed in as</div>
      <div className="px-3 pb-2 font-mono text-xs text-fg">{shortAddr(user?.wallet, 6)}</div>
      <div className="my-1 h-px bg-line" />
      <Link href="/agents" onClick={onClose} className={item}>
        <Bot size={16} /> My agents
      </Link>
      <Link href="/arena" onClick={onClose} className={item}>
        <Swords size={16} /> Arena lobby
      </Link>
      <Link href="/wallet" onClick={onClose} className={item}>
        <Wallet size={16} /> Wallet & credits
      </Link>
      <div className="my-1 h-px bg-line" />
      <button
        onClick={() => {
          signOut();
          onClose();
        }}
        className={clsx(item, "w-full")}
      >
        <LogOut size={16} /> Sign out
      </button>
    </div>
  );
}

export function WalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, select, connect, wallet, publicKey, connecting } = useWallet();
  const { signIn, signingIn, user } = useAuth();
  const { config } = useConfig();
  const [accepted, setAccepted] = useState(false);
  const pendingConnect = useRef(false);

  useEffect(() => {
    if (pendingConnect.current && wallet && !publicKey && !connecting) {
      pendingConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet, publicKey, connecting, connect]);

  useEffect(() => {
    if (user && publicKey && user.wallet === publicKey.toBase58()) onClose();
  }, [user, publicKey, onClose]);

  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  const featured = FEATURED.map((f) => ({ ...f, wallet: wallets.find((w) => w.adapter.name === f.name) }));
  const others = installed.filter((w) => !FEATURED.some((f) => f.name === w.adapter.name));

  const choose = (name: string) => {
    pendingConnect.current = true;
    select(name as WalletName);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="grain w-full max-w-md rounded-3xl border border-line bg-[#141415] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{publicKey ? "Sign in to the arena" : "Connect a wallet"}</h2>
            <p className="mt-1 text-sm text-muted">
              {publicKey
                ? "Sign a free message to prove you own this wallet. No transaction, no fees."
                : `Solana ${config?.cluster === "mainnet-beta" ? "mainnet" : config?.cluster ?? "devnet"}. Phantom and Backpack recommended.`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!publicKey ? (
          <div className="space-y-2">
            {featured.map((f) => {
              const ready = f.wallet && (f.wallet.readyState === WalletReadyState.Installed || f.wallet.readyState === WalletReadyState.Loadable);
              return ready ? (
                <button
                  key={f.name}
                  onClick={() => choose(f.name)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition hover:border-line-strong hover:bg-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.wallet!.adapter.icon} alt="" className="h-8 w-8 rounded-lg" />
                  <span className="flex-1 font-medium">{f.name}</span>
                  <span className="text-xs text-win">Detected</span>
                </button>
              ) : (
                <a
                  key={f.name}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3.5 text-muted transition hover:border-line-strong hover:text-fg"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-sm font-semibold">{f.name[0]}</span>
                  <span className="flex-1 font-medium">{f.name}</span>
                  <span className="flex items-center gap-1 text-xs">
                    Install <ExternalLink size={12} />
                  </span>
                </a>
              );
            })}
            {others.map((w) => (
              <button
                key={w.adapter.name}
                onClick={() => choose(w.adapter.name)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left hover:border-line-strong"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.adapter.icon} alt="" className="h-7 w-7 rounded-lg" />
                <span className="flex-1">{w.adapter.name}</span>
              </button>
            ))}
            {connecting && (
              <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted">
                <Loader2 className="animate-spin" size={14} /> Approve the connection in your wallet…
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              {wallet && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallet.adapter.icon} alt="" className="h-7 w-7 rounded-lg" />
              )}
              <span className="font-mono text-sm">{shortAddr(publicKey.toBase58(), 6)}</span>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 accent-[#d4ff3a]" />
              <span>
                I am 18 or older, I accept the{" "}
                <Link href="/terms" className="text-fg underline underline-offset-2" target="_blank">
                  Terms
                </Link>{" "}
                and confirm that skill-based wagering is legal where I live.
              </span>
            </label>
            <PillButton onClick={() => signIn(true)} disabled={!accepted || signingIn} className="w-full justify-between">
              {signingIn ? "Check your wallet…" : "Sign message & enter"}
            </PillButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small guard used by pages that need a signed-in user. */
export function useRequireAuthPrompt() {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  return {
    user,
    ready,
    prompt: () => setOpen(true),
    modal: open ? <WalletModal onClose={() => setOpen(false)} /> : null,
  };
}
