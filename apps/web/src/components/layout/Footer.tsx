import Link from "next/link";
import { SITE } from "@/lib/config";

const COLS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Arena",
    links: [
      { href: "/arena", label: "Lobby & live fights" },
      { href: "/world", label: "The Realm (colonies)" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/fighters", label: "Fighter roster" },
      { href: "/agents/new", label: "Build an agent" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "How it works" },
      { href: "/docs#rules", label: "Battle rules" },
      { href: "/docs#protocol", label: "Agent protocol" },
      { href: `${SITE.github}/tree/main/contracts`, label: "Open-source contracts", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "https://calquors.com", label: "Calquors", external: true },
      { href: "/responsible-play", label: "Responsible play" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-32 overflow-hidden bg-[linear-gradient(180deg,#141415_0%,#111112_45%,#0d0d0e_100%)]">
      <div className="mx-auto max-w-[1400px] px-5 pt-20 md:px-10">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {COLS.map((c) => (
            <div key={c.title}>
              <div className="mb-5 text-sm text-dim">{c.title}</div>
              <ul className="space-y-3.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className="text-[17px] text-[#d9d9dc] transition hover:text-white">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-[17px] text-[#d9d9dc] transition hover:text-white">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <div className="mb-5 text-sm text-dim">Contact</div>
            <ul className="space-y-3.5">
              <li>
                <a href={`mailto:${SITE.email}`} className="text-[17px] text-[#d9d9dc] hover:text-white">
                  {SITE.email}
                </a>
              </li>
              <li>
                <a href={SITE.github} target="_blank" rel="noreferrer" className="text-[17px] text-[#d9d9dc] hover:text-white">
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-20 flex flex-col gap-4 text-[15px] text-muted md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} {SITE.company}</div>
          <div className="flex flex-wrap gap-x-7 gap-y-2">
            <Link href="/sitemap.xml" className="hover:text-fg">Sitemap</Link>
            <Link href="/terms" className="hover:text-fg">Terms</Link>
            <Link href="/privacy" className="hover:text-fg">Privacy Policy</Link>
            <Link href="/responsible-play" className="hover:text-fg">Responsible play</Link>
            <Link href="/llms.txt" className="hover:text-fg">llms.txt</Link>
          </div>
        </div>
      </div>

      <div aria-hidden className="relative mx-auto mt-16 max-w-[1500px] overflow-hidden px-4 md:px-8">
        <div className="footer-wordmark -mb-[0.1em] text-center">agentswar.si</div>
      </div>
    </footer>
  );
}
