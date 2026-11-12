"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { ChevronRight, LogOut, Wallet, Bot, X, Loader2, ExternalLink, Swords, Link2 } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/providers/AuthProvider";
import { credits, shortAddr, sol } from "@/lib/format";
import { useConfig } from "@/lib/hooks";
import { GoogleButton } from "./GoogleButton";

type ModalMode = "signin" | "link-wallet" | "link-google";

/** Signed in, and (for wallet sessions) still on the wallet the session belongs to. */
function useSignedIn() {
  const { publicKey } = useWallet();
  const { user, via } = useAuth();
  return !!user && (via === "google" || (!!publicKey && user.wallet === publicKey.toBase58()));
}

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
  const { config } = useConfig();
  const signedIn = useSignedIn();
  const [open, setOpen] = useState<ModalMode | null>(null);
  const [menu, setMenu] = useState(false);

  if (user && signedIn) {
    return (
      <>
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex items-center gap-3 rounded-[10px] border border-line bg-surface/80 py-1 pl-3 pr-1 text-sm backdrop-blur hover:border-line-strong"
        >
          <span className="hidden items-center gap-3 font-mono tabular text-[13px] text-muted sm:flex">
            <span title="Play credits">{credits(user.playCredits ?? 0)} <span className="text-dim">CR</span></span>
            <span title="SOL balance">{sol(user.credits)} <span className="text-dim">SOL</span></span>
          </span>
          <span className="max-w-[10rem] truncate rounded-[8px] bg-white/8 px-2.5 py-1.5 font-mono text-[13px]">{user.handle ?? (shortAddr(user.wallet) || user.email || "Account")}</span>
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <AccountMenu onClose={() => setMenu(false)} onLink={setOpen} />
          </>
        )}
      </div>
      {open && <WalletModal mode={open} onClose={() => setOpen(null)} />}
      </>
    );
  }

  return (
    <>
      <PillButton onClick={() => setOpen("signin")} disabled={connecting || signingIn}>
        {connecting ? (
          "Connecting…"
        ) : signingIn ? (
          "Signing…"
        ) : config?.googleClientId || publicKey ? (
          "Sign in"
        ) : (
          <>
            <span className="sm:hidden">Connect</span>
            <span className="hidden sm:inline">Connect wallet</span>
          </>
        )}
      </PillButton>
      {open && <WalletModal mode={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function AccountMenu({ onClose, onLink }: { onClose: () => void; onLink: (m: ModalMode) => void }) {
  const { signOut, user } = useAuth();
  const { config } = useConfig();
  const item = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-white/5 hover:text-fg";
  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-2xl border border-line bg-surface p-2 shadow-2xl shadow-black/60">
      <div className="px-3 py-2 text-xs text-dim">Signed in as</div>
      {user?.email && <div className="truncate px-3 pb-1 text-xs text-fg">{user.email}</div>}
      {user?.wallet && <div className="px-3 pb-2 font-mono text-xs text-fg">{shortAddr(user.wallet, 6)}</div>}
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
      {user && !user.wallet && (
        <button onClick={() => (onLink("link-wallet"), onClose())} className={clsx(item, "w-full")}>
          <Link2 size={16} /> Link a wallet
        </button>
      )}
      {user && !user.google && config?.googleClientId && (
        <button onClick={() => (onLink("link-google"), onClose())} className={clsx(item, "w-full")}>
          <Link2 size={16} /> Link Google account
        </button>
      )}
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

export function WalletModal({ onClose, mode = "signin" }: { onClose: () => void; mode?: ModalMode }) {
  const { wallets, select, connect, disconnect, wallet, publicKey, connecting } = useWallet();
  const { signIn, signInWithGoogle, linkWallet, linkGoogle, signingIn, user } = useAuth();
  const { config } = useConfig();
  const signedIn = useSignedIn();
  const [accepted, setAccepted] = useState(false);
  const [nudge, setNudge] = useState(false);
  const googleId = config?.googleClientId ?? null;
  const pendingConnect = useRef(false);

  useEffect(() => {
    if (pendingConnect.current && wallet && !publicKey && !connecting) {
      pendingConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet, publicKey, connecting, connect]);

  // Close by itself once the job this window was opened for is done.
  useEffect(() => {
    if (mode === "signin" ? signedIn : mode === "link-wallet" ? !!user?.wallet : !!user?.google) onClose();
  }, [mode, signedIn, user, onClose]);

  useEffect(() => {
    if (accepted) setNudge(false);
  }, [accepted]);

  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  const featured = FEATURED.map((f) => ({ ...f, wallet: wallets.find((w) => w.adapter.name === f.name) }));
  const others = installed.filter((w) => !FEATURED.some((f) => f.name === w.adapter.name));

  const choose = (name: string) => {
    pendingConnect.current = true;
    select(name as WalletName);
  };

  const needsTerms = mode === "signin";
  const blocked = needsTerms && !accepted;

  const title =
    mode === "link-google" ? "Link your Google account" : mode === "link-wallet" ? "Link a wallet" : "Sign in to AgentsWar";
  const subtitle =
    mode === "link-google"
      ? "After this you can sign in with Google or your wallet and land on the same account."
      : mode === "link-wallet"
        ? "Needed for deposits, withdrawals and on-chain stakes. It cannot be changed later, so pick the wallet you want to be paid to."
        : googleId
          ? "Use Google to start playing in seconds, or a Solana wallet if you want to stake SOL."
          : `Solana ${config?.cluster === "mainnet-beta" ? "mainnet" : config?.cluster ?? "devnet"}. Phantom and Backpack recommended.`;

  const terms = (
    <label
      className={clsx(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm text-muted transition",
        nudge ? "border-[#d4ff3a] bg-[#d4ff3a]/10" : "border-transparent"
      )}
    >
      <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 accent-[#d4ff3a]" />
      <span>
        I am 18 or older, I accept the{" "}
        <Link href="/terms" className="text-fg underline underline-offset-2" target="_blank">
          Terms
        </Link>{" "}
        and confirm that skill-based wagering is legal where I live.
      </span>
    </label>
  );

  /** Google's button lives in an iframe, so while it is blocked we lay a catcher over it that explains why. */
  const google = googleId && (
    <div className="relative">
      <GoogleButton
        clientId={googleId}
        disabled={blocked || signingIn}
        label={mode === "link-google" ? "signin_with" : "continue_with"}
        onCredential={mode === "link-google" ? linkGoogle : (c) => signInWithGoogle(c, true)}
      />
      {blocked && (
        <button
          type="button"
          aria-label="Tick the box above to continue with Google"
          className="absolute inset-0 cursor-pointer"
          onClick={() => setNudge(true)}
        />
      )}
      {nudge && blocked && <p className="mt-2 text-center text-xs text-[#d4ff3a]">Tick the box above first, then continue with Google.</p>}
    </div>
  );

  const walletList = (
    <div className="space-y-2">
      {featured.map((f) => {
        const ready = f.wallet && (f.wallet.readyState === WalletReadyState.Installed || f.wallet.readyState === WalletReadyState.Loadable);
        return ready ? (
          <button
            key={f.name}
            onClick={() => (blocked ? setNudge(true) : choose(f.name))}
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
          onClick={() => (blocked ? setNudge(true) : choose(w.adapter.name))}
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
  );

  const connectedWallet = publicKey && (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        {wallet && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="h-7 w-7 rounded-lg" />
        )}
        <span className="flex-1 font-mono text-sm">{shortAddr(publicKey.toBase58(), 6)}</span>
        <button onClick={() => disconnect().catch(() => {})} className="text-xs text-dim hover:text-fg">
          Use another
        </button>
      </div>
      {mode === "link-wallet" ? (
        <PillButton onClick={() => linkWallet()} disabled={signingIn} className="w-full justify-between">
          {signingIn ? "Check your wallet…" : "Sign message & link"}
        </PillButton>
      ) : (
        <PillButton onClick={() => (blocked ? setNudge(true) : signIn(true))} disabled={signingIn} className="w-full justify-between">
          {signingIn ? "Check your wallet…" : "Sign message & enter"}
        </PillButton>
      )}
      <p className="text-center text-xs text-dim">A free signature proves you own this wallet. No transaction, no fees.</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="grain w-full max-w-md rounded-3xl border border-line bg-[#141415] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {mode === "link-google" ? (
          google || <p className="text-sm text-muted">Google sign-in is not switched on for this site.</p>
        ) : mode === "link-wallet" ? (
          publicKey ? connectedWallet : walletList
        ) : (
          <div className="space-y-4">
            {terms}
            {google}
            {googleId && (
              <div className="flex items-center gap-3 text-xs text-dim">
                <span className="h-px flex-1 bg-line" /> or use a Solana wallet <span className="h-px flex-1 bg-line" />
              </div>
            )}
            {publicKey ? connectedWallet : walletList}
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

/** For signed-in people who still need to attach a wallet (accounts created with Google). */
export function useLinkWalletPrompt() {
  const [open, setOpen] = useState(false);
  return {
    prompt: () => setOpen(true),
    modal: open ? <WalletModal mode="link-wallet" onClose={() => setOpen(false)} /> : null,
  };
}
