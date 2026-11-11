"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { toast } from "sonner";
import { Check, Loader2, ExternalLink, Sparkles } from "lucide-react";
import {
  FIGHTER_LIST,
  MAX_INSTRUCTIONS_CHARS,
  PROVIDER_INFO,
  PROVIDERS,
  getFighter,
  type AgentDTO,
  type FighterSlug,
} from "@clashagent/shared";
import { api } from "@/lib/api";
import { Field, inputCls } from "../ui/Modal";
import { StatBar } from "../ui/bits";
import { PillButton, useRequireAuthPrompt } from "../wallet/WalletButton";

const FighterShowcase = dynamic(() => import("../three/FighterShowcase").then((m) => m.FighterShowcase), { ssr: false });

type Provider = (typeof PROVIDERS)[number];

const TEMPLATES: { name: string; text: string }[] = [
  {
    name: "Aggressive",
    text: "Rush down. Advance until distance 1, then mix strike and heavy. If the opponent blocks twice in a row, use heavy to break the guard. Use the special the moment it's ready. Never retreat.",
  },
  {
    name: "Counter-puncher",
    text: "Stay patient. Block or dodge while the opponent has lots of energy. When they drop below 20 energy or just used a heavy, punish with strike then heavy. Save the special for when they are below 40% HP.",
  },
  {
    name: "Zoner",
    text: "Keep distance 2–3. Blast whenever energy ≥ 20. If they advance to distance 1, retreat. Charge only when distance is 3 and they have no special ready. Win on HP at the time limit if needed.",
  },
  {
    name: "Mind games",
    text: "Track the opponent's last actions and do the counter: strike beats heavy, heavy beats block, dodge beats blast. Use taunts to bait them into wasting energy. Be unpredictable: never repeat the same action 3 times.",
  },
];

export function AgentBuilder({ existing }: { existing?: AgentDTO }) {
  const router = useRouter();
  const { user, prompt, modal } = useRequireAuthPrompt();
  const [fighter, setFighter] = useState<FighterSlug>((existing?.fighter as FighterSlug) ?? "volt");
  const [name, setName] = useState(existing?.name ?? "");
  const [provider, setProvider] = useState<Provider>((existing?.provider as Provider) ?? "anthropic");
  const [model, setModel] = useState(existing?.model ?? PROVIDER_INFO.anthropic.defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [instructions, setInstructions] = useState(existing?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<null | { ok: boolean; message: string }>(null);
  const f = useMemo(() => getFighter(fighter), [fighter]);

  useEffect(() => {
    if (!existing) setModel(PROVIDER_INFO[provider].defaultModel);
    setVerified(null);
  }, [provider, existing]);

  const verify = async () => {
    if (!user) return prompt();
    setVerifying(true);
    try {
      const r = await api<{ ok: boolean; message: string }>("/agents/verify-key", {
        body: { provider, model, apiKey: apiKey || undefined, agentId: !apiKey && existing ? existing.id : undefined },
      });
      setVerified(r);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const save = async () => {
    if (!user) return prompt();
    if (name.trim().length < 2) return toast.error("Give your agent a name");
    if (!existing && apiKey.trim().length < 10) return toast.error("Paste your API key");
    setBusy(true);
    try {
      const body = { name, fighter, provider, model, instructions, ...(apiKey ? { apiKey } : {}) };
      const r = existing
        ? await api<{ agent: AgentDTO }>(`/agents/${existing.id}`, { method: "PATCH", body })
        : await api<{ agent: AgentDTO }>("/agents", { body });
      const colony = !existing && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("colony") : null;
      if (colony) {
        try {
          await api(`/colonies/${colony}/join`, { body: { agentId: r.agent.id } });
          toast.success("Agent created and moved into the colony.");
        } catch (e) {
          toast.error(`Agent created, but it could not move in: ${(e as Error).message}`);
        }
      } else toast.success(existing ? "Agent updated" : "Agent created. Time to spar.");
      router.push(`/agents/${r.agent.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr]">
      {/* Left: fighter preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="relative overflow-hidden rounded-[24px] border border-line bg-[#0b0b0c]">
          <FighterShowcase slug={fighter} className="aspect-[4/4] w-full" />
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 via-black/35 to-transparent p-6 pb-20">
            <div className="text-4xl font-extrabold italic tracking-tight" style={{ color: f.palette.primary, textShadow: `0 0 30px ${f.palette.primary}66` }}>
              {f.name}
            </div>
            <div className="text-muted">{f.title}</div>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pt-16">
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-6">
              <StatBar label="Power" value={f.stats.power} color={f.palette.primary} />
              <StatBar label="Defense" value={f.stats.defense} color={f.palette.primary} />
              <StatBar label="Speed" value={f.stats.speed} color={f.palette.primary} />
              <StatBar label="Focus" value={f.stats.focus} color={f.palette.primary} />
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-dim">Passive · {f.passive.name}</div>
                <div className="text-white/80">{f.passive.description}</div>
              </div>
              <div>
                <div className="text-xs text-dim">Special · {f.special.name}</div>
                <div className="text-white/80">{f.special.description}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-dim">Signature chain · {f.combo.name}</div>
                <div className="font-mono text-xs uppercase text-white/80">{f.combo.moves.join(" → ")}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {FIGHTER_LIST.map((x) => (
            <button
              key={x.slug}
              onClick={() => setFighter(x.slug)}
              className={clsx(
                "rounded-xl border px-1 py-2.5 text-[11px] font-bold italic tracking-tight transition",
                fighter === x.slug ? "border-white/50 bg-white/[0.07]" : "border-line hover:border-line-strong"
              )}
              style={{ color: x.palette.primary }}
            >
              {x.name}
            </button>
          ))}
        </div>
      </div>

      {/* Right: config */}
      <div className="space-y-7">
        <Field label="Agent name" hint="Shown on the leaderboard and in battles.">
          <input className={inputCls} maxLength={32} placeholder="e.g. Prompt Puncher" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Brain">
          <div className="grid gap-2 sm:grid-cols-3">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={clsx(
                  "rounded-xl border px-3 py-3 text-left transition",
                  provider === p ? "border-white/50 bg-white/[0.06]" : "border-line hover:border-line-strong"
                )}
              >
                <div className="font-medium">{PROVIDER_INFO[p].label.split(" (")[0]}</div>
                <div className="text-xs text-dim">{PROVIDER_INFO[p].label.match(/\((.*)\)/)?.[1]}</div>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Model" hint="Any model id your key can access.">
            <input className={clsx(inputCls, "font-mono text-sm")} list="models" value={model} onChange={(e) => setModel(e.target.value.trim())} />
            <datalist id="models">
              {PROVIDER_INFO[provider].models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field
            label="API key"
            hint={
              <span className="flex items-center gap-1">
                {existing?.keyLast4 ? `Saved key ends in …${existing.keyLast4}. Leave blank to keep it.` : "Encrypted (AES-256-GCM). Never shown again."}{" "}
                <a href={PROVIDER_INFO[provider].docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-fg underline-offset-2 hover:underline">
                  Get one <ExternalLink size={10} />
                </a>
              </span>
            }
          >
            <div className="flex gap-2">
              <input
                className={clsx(inputCls, "font-mono text-sm")}
                type="password"
                autoComplete="off"
                placeholder={PROVIDER_INFO[provider].keyHint}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value.trim());
                  setVerified(null);
                }}
              />
              <button
                type="button"
                onClick={verify}
                disabled={verifying || (!apiKey && !existing)}
                className="shrink-0 rounded-xl border border-line px-3 text-sm text-muted hover:text-fg disabled:opacity-40"
              >
                {verifying ? <Loader2 size={14} className="animate-spin" /> : verified?.ok ? <Check size={16} className="text-win" /> : "Test"}
              </button>
            </div>
          </Field>
        </div>

        <Field
          label="Strategy instructions"
          hint={`${instructions.length}/${MAX_INSTRUCTIONS_CHARS} · Your agent reads this every turn alongside the game state and rules.`}
        >
          <textarea
            className={clsx(inputCls, "min-h-[220px] resize-y leading-relaxed")}
            maxLength={MAX_INSTRUCTIONS_CHARS}
            placeholder={`How should ${f.name} fight? e.g. ${f.playstyle[0]}`}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-1 text-xs text-dim">
            <Sparkles size={12} /> Templates:
          </span>
          {TEMPLATES.map((t) => (
            <button key={t.name} type="button" onClick={() => setInstructions(t.text)} className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-fg">
              {t.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setInstructions(`Playing ${f.name}. ${f.playstyle.join(" ")}`)}
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-fg"
          >
            {f.name} tips
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <PillButton onClick={save} disabled={busy}>
            {busy ? "Saving…" : existing ? "Save changes" : user ? "Create agent" : "Connect wallet to create"}
          </PillButton>
          <p className="text-xs text-dim">You can spar against house bots for free right after.</p>
        </div>
      </div>
      {modal}
    </div>
  );
}
