"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  ChevronDown,
  Compass,
  FileText,
  Github,
  Home,
  Layers,
  Lock,
  Menu,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { FIGHTER_LIST, type AgentDTO } from "@clashagent/shared";
import { SITE } from "@/lib/config";
import { useConfig } from "@/lib/hooks";
import { FighterGlyph } from "../ui/bits";
import { WalletButton } from "../wallet/WalletButton";
import { LogoMark } from "./Logo";

type Item = { href: string; label: string; icon: React.ReactNode; desc?: string; external?: boolean };

const EXPLORE: Item[] = [
  { href: "/world", label: "The Realm", icon: <Layers size={17} />, desc: "Colonies where agents live and build" },
  { href: "/leaderboard", label: "Leaderboard", icon: <Trophy size={17} />, desc: "Top agents by Elo and winnings" },
  { href: "/fighters", label: "Fighters", icon: <Users size={17} />, desc: "The roster, moves and combos" },
];
const MORE: Item[] = [
  { href: "/docs", label: "How it works", icon: <BookOpen size={17} /> },
  { href: "/responsible-play", label: "Responsible play", icon: <ShieldCheck size={17} /> },
  { href: "/terms", label: "Terms", icon: <FileText size={17} /> },
  { href: "/privacy", label: "Privacy", icon: <Lock size={17} /> },
  { href: SITE.github, label: "GitHub", icon: <Github size={17} />, external: true },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/* ---------------------------------------------------------------- announcement */

const BANNER_KEY = "agentswar:banner-dismissed:v1";

function Announcement() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(BANNER_KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {}
  };
  return (
    <div className="relative flex min-h-11 items-center justify-center gap-3 border-b border-line bg-[#0b0b0c] px-10 py-2 text-[13px] sm:text-sm">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-accent-ink">
        <Swords size={14} strokeWidth={2.5} />
      </span>
      <p className="min-w-0 truncate">
        <span className="font-semibold text-fg">AgentsWar is live on Solana:</span>{" "}
        <span className="text-muted">build an agent, wager SOL, watch it fight.</span>
      </p>
      <Link
        href="/agents/new"
        className="hidden shrink-0 items-center gap-1 rounded-full border border-line-strong px-3 py-1 text-[13px] font-medium text-fg hover:bg-white/5 sm:inline-flex"
      >
        Build an agent <ArrowUpRight size={13} />
      </Link>
      <button onClick={close} className="absolute right-3 p-1.5 text-muted hover:text-fg" aria-label="Dismiss announcement">
        <X size={16} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- dropdown */

function Dropdown({ label, icon, items, active, wide }: { label: string; icon: React.ReactNode; items: Item[]; active: boolean; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const hoveredAt = useRef(0);
  const enter = () => {
    clearTimeout(timer.current);
    if (!open) hoveredAt.current = Date.now();
    setOpen(true);
  };
  // A click right after hover opened the menu should keep it open (mouse), otherwise toggle (touch, keyboard).
  const click = () => setOpen((o) => (o && Date.now() - hoveredAt.current < 400 ? true : !o));
  const leave = () => (timer.current = setTimeout(() => setOpen(false), 120));
  return (
    <div ref={ref} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        onClick={click}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(navItem, active || open ? "bg-white/[0.07] text-white" : "text-[#cfcfd2] hover:bg-white/[0.04] hover:text-white")}
      >
        {icon}
        {label}
        <ChevronDown size={15} className={clsx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className={clsx("absolute left-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-line bg-surface p-2 shadow-2xl shadow-black/60", wide ? "w-80" : "w-56")}>
          {items.map((it) => {
            const body = (
              <>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-bg text-fg">{it.icon}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-medium text-fg">
                    {it.label}
                    {it.external && <ArrowUpRight size={13} className="text-dim" />}
                  </span>
                  {it.desc && <span className="block truncate text-xs text-dim">{it.desc}</span>}
                </span>
              </>
            );
            const cls = "flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-white/5";
            return it.external ? (
              <a key={it.href} href={it.href} target="_blank" rel="noreferrer" className={cls} role="menuitem">
                {body}
              </a>
            ) : (
              <Link key={it.href} href={it.href} className={cls} role="menuitem" onClick={() => setOpen(false)}>
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const navItem = "flex h-10 items-center gap-2 rounded-xl px-3.5 text-[15px] font-medium transition-colors";

/* ---------------------------------------------------------------- search */

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/arena", label: "Arena lobby & live fights" },
  { href: "/agents/new", label: "Build an agent" },
  { href: "/agents", label: "My agents" },
  ...EXPLORE,
  ...MORE.filter((m) => !m.external),
  { href: "/wallet", label: "Wallet & credits" },
];

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const { data } = useSWR<{ agents: AgentDTO[] }>("/leaderboard?limit=100");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (t: string) => !s || t.toLowerCase().includes(s);
    const pages = PAGES.filter((p) => match(p.label)).map((p) => ({ key: "p" + p.href, href: p.href, label: p.label, kind: "Page", slug: null as string | null }));
    const fighters = FIGHTER_LIST.filter((f) => match(f.name) || match(f.title) || match(f.archetype)).map((f) => ({
      key: "f" + f.slug,
      href: `/fighters/${f.slug}`,
      label: `${f.name} · ${f.title}`,
      kind: "Fighter",
      slug: f.slug as string | null,
    }));
    const agents = s
      ? (data?.agents ?? []).filter((a) => match(a.name)).map((a) => ({ key: "a" + a.id, href: `/agents/${a.id}`, label: a.name, kind: "Agent", slug: a.fighter as string | null }))
      : [];
    return [...agents.slice(0, 6), ...fighters.slice(0, 6), ...pages.slice(0, 8)];
  }, [q, data]);
  useEffect(() => setSel(0), [q]);
  const go = (href: string) => (router.push(href), onClose());
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/70" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-dim" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((i) => Math.min(i + 1, results.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setSel((i) => Math.max(i - 1, 0)));
              if (e.key === "Enter" && results[sel]) go(results[sel].href);
            }}
            placeholder="Search agents, fighters and pages"
            className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-dim"
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-dim">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((r, i) => (
            <button
              key={r.key}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(r.href)}
              className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === sel && "bg-white/[0.06]")}
            >
              {r.slug ? <FighterGlyph slug={r.slug} size={30} /> : <span className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-line text-dim"><Compass size={15} /></span>}
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.label}</span>
              <span className="text-[11px] uppercase tracking-wider text-dim">{r.kind}</span>
            </button>
          ))}
          {!results.length && <div className="px-3 py-8 text-center text-sm text-dim">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- header */

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { config } = useConfig();
  const testNet = config && config.cluster !== "mainnet-beta" ? config.cluster : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") (e.preventDefault(), setSearch((s) => !s));
      if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "")) (e.preventDefault(), setSearch(true));
    };
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  useEffect(() => setOpen(false), [path]);

  const link = (href: string, label: string, icon: React.ReactNode) => (
    <Link
      href={href}
      className={clsx(navItem, isActive(path, href) ? "bg-white/[0.07] text-white" : "text-[#cfcfd2] hover:bg-white/[0.04] hover:text-white")}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <>
      <Announcement />
      <header
        className={clsx(
          "sticky top-0 z-40 border-b transition-colors",
          scrolled ? "border-line bg-bg/85 backdrop-blur-xl" : "border-line/60 bg-transparent"
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-2 px-4 md:px-8">
          <Link href="/" aria-label={`${SITE.name} home`} className="mr-2 flex items-center gap-2.5">
            <LogoMark size={40} className="drop-shadow-[0_0_14px_rgba(212,255,58,0.35)] transition-transform hover:rotate-[-8deg]" />
            <span className="hidden text-[19px] font-extrabold tracking-[-0.04em] text-white 2xl:inline">
              agentswar<span className="text-accent">.si</span>
            </span>
          </Link>
          {testNet && (
            <span title="Test network: balances are test SOL with no real value" className="mr-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
              {testNet}
            </span>
          )}

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {link("/", "Home", <Home size={18} />)}
            {link("/arena", "Arena", <Swords size={18} />)}
            <Dropdown label="Explore" icon={<Compass size={18} />} items={EXPLORE} wide active={EXPLORE.some((i) => isActive(path, i.href))} />
            {link("/agents", "My agents", <Bot size={18} />)}
            <Dropdown label="More" icon={null} items={MORE} active={MORE.some((i) => !i.external && isActive(path, i.href))} />
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setSearch(true)}
              className="flex h-10 items-center gap-2 rounded-xl px-3 text-[15px] font-medium text-[#cfcfd2] hover:bg-white/[0.04] hover:text-white"
              aria-label="Search"
            >
              <Search size={18} />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-dim xl:inline">⌘K</kbd>
            </button>
            <WalletButton />
            <Link
              href="/wallet"
              aria-label="Account"
              className="hidden h-10 w-10 place-items-center rounded-full border border-line text-[#cfcfd2] hover:border-line-strong hover:text-white sm:grid"
            >
              <UserRound size={19} />
            </Link>
            <button className="-mr-1 p-2 text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {search && <SearchDialog onClose={() => setSearch(false)} />}

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-bg/97 backdrop-blur lg:hidden">
          <div className="flex h-[72px] items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[19px] font-extrabold tracking-[-0.04em] text-white">
                agentswar<span className="text-accent">.si</span>
              </span>
            </Link>
            <button onClick={() => setOpen(false)} className="p-2 text-muted" aria-label="Close menu">
              <X size={22} />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-4 pb-10" aria-label="Mobile">
            {[
              { href: "/", label: "Home", icon: <Home size={20} /> },
              { href: "/arena", label: "Arena", icon: <Swords size={20} /> },
              { href: "/agents", label: "My agents", icon: <Bot size={20} /> },
              ...EXPLORE,
              { href: "/wallet", label: "Wallet", icon: <UserRound size={20} /> },
              ...MORE.filter((m) => !m.external),
            ].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={clsx("flex items-center gap-3 rounded-xl px-3 py-3.5 text-lg font-medium", isActive(path, n.href) ? "bg-white/[0.07] text-white" : "text-fg")}
              >
                <span className="text-muted">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
