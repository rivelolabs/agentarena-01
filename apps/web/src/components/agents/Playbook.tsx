"use client";
import { useEffect, useRef, useState } from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Download, Upload, Save, Eraser, BrainCircuit } from "lucide-react";
import clsx from "clsx";
import { MAX_MEMORY_CHARS, parseMemory, renderMemory, type AgentDTO } from "@clashagent/shared";
import { api } from "@/lib/api";

/** The agent's MEMORY.md: lessons it wrote after past fights plus an automatic match log. */
export function Playbook({ agent }: { agent: AgentDTO }) {
  const initial = agent.memory || renderMemory(parseMemory(""), agent.name);
  const [text, setText] = useState(initial);
  const [learn, setLearn] = useState(agent.learn ?? true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"read" | "edit">("read");
  const file = useRef<HTMLInputElement>(null);
  const dirty = text !== initial;

  // Pick up lessons written by the server after a fight (unless the owner is mid-edit).
  useEffect(() => {
    if (!dirty) setText(agent.memory || renderMemory(parseMemory(""), agent.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.memory]);

  const save = async (patch: { memory?: string; learn?: boolean }) => {
    setBusy(true);
    try {
      await api(`/agents/${agent.id}`, { method: "PATCH", body: patch });
      await mutate(`/agents/${agent.id}`);
      toast.success("Playbook saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name.replace(/[^\w-]+/g, "_")}.MEMORY.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const m = parseMemory(text);
  const real = (l: string) => !l.startsWith("(");
  const btn = "flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-1.5 text-sm text-muted transition hover:text-fg disabled:opacity-40";

  return (
    <div className="card mb-10 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-medium">
            <BrainCircuit size={18} /> Playbook <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-muted">MEMORY.md</span>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">
            After every fight {agent.name} logs the result here and rewrites its lessons. It reads this file before each new fight, so it improves
            the more it plays. You can edit it, download it, or load your own.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="accent-[#d4ff3a]"
            checked={learn}
            onChange={(e) => {
              setLearn(e.target.checked);
              save({ learn: e.target.checked });
            }}
          />
          Learn after each fight
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="mr-auto flex rounded-xl border border-line bg-surface p-1">
          {(["read", "edit"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx("rounded-lg px-3.5 py-1 text-sm", tab === t ? "bg-white text-[#111]" : "text-muted hover:text-fg")}>
              {t === "read" ? "Read" : "Edit .md"}
            </button>
          ))}
        </div>
        <button className={btn} onClick={download}>
          <Download size={14} /> Download
        </button>
        <button className={btn} onClick={() => file.current?.click()}>
          <Upload size={14} /> Load .md
        </button>
        <input
          ref={file}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setText((await f.text()).slice(0, MAX_MEMORY_CHARS));
            setTab("edit");
            e.target.value = "";
          }}
        />
        <button
          className={btn}
          onClick={() => {
            setText(renderMemory({ title: "", lessons: [], log: [], extra: [] }, agent.name));
            setTab("edit");
          }}
        >
          <Eraser size={14} /> Reset
        </button>
        <button className={clsx(btn, dirty && "border-white/40 text-fg")} disabled={!dirty || busy} onClick={() => save({ memory: text })}>
          <Save size={14} /> {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {tab === "edit" ? (
        <>
          <textarea
            className="mt-4 min-h-[320px] w-full resize-y rounded-xl border border-line bg-[#0f0f10] p-4 font-mono text-[13px] leading-relaxed text-[#d6d6da] outline-none focus:border-white/30"
            value={text}
            maxLength={MAX_MEMORY_CHARS}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-1.5 text-xs text-dim">
            {text.length}/{MAX_MEMORY_CHARS} · Keep the “## Lessons” and “## Match log” headings. Any other “## Section” you add is also shown to the agent.
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-[#0f0f10] p-4">
            <div className="mb-3 font-mono text-xs text-dim">## Lessons</div>
            {m.lessons.filter(real).length ? (
              <ul className="space-y-2 text-sm">
                {m.lessons.filter(real).map((l, i) => (
                  <li key={i} className="flex gap-2 text-[#d6d6da]">
                    <span className="text-accent">›</span> {l}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">No lessons yet. Spar once and {agent.name} will write its first notes.</p>
            )}
            {m.extra.map((e) => (
              <div key={e.heading} className="mt-4 border-t border-line pt-3">
                <div className="mb-2 font-mono text-xs text-dim">## {e.heading}</div>
                <p className="whitespace-pre-wrap text-sm text-muted">{e.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-[#0f0f10] p-4">
            <div className="mb-3 font-mono text-xs text-dim">## Match log</div>
            {m.log.filter(real).length ? (
              <ul className="space-y-2">
                {m.log.filter(real).map((l, i) => {
                  const res = l.match(/^\S+\s+([WLD])\b/)?.[1];
                  return (
                    <li key={i} className="flex gap-2 font-mono text-[12px] leading-relaxed text-muted">
                      <span className={clsx("mt-0.5 h-fit rounded px-1.5 text-[10px] font-bold", res === "W" ? "bg-win/15 text-win" : res === "L" ? "bg-loss/15 text-loss" : "bg-white/10 text-fg")}>{res ?? "·"}</span>
                      <span>{l}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-dim">No fights logged yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
