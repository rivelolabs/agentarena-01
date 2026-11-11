"use client";
/**
 * Pre-recorded voices and sounds, saved once in /public/audio and played from there,
 * so normal fights never call the voice service (and never spend voice credits).
 *
 * /public/audio/voice/manifest.json maps each known line to its recorded takes:
 *   fighters[slug][key]  -> ["/audio/voice/pyra/pyra-01a.mp3", "/audio/voice/pyra/pyra-01b.mp3"]
 *   announcer[key]       -> ["/audio/voice/announcer/announcer-02a.mp3", ...]
 *   sfx[name]            -> ["/audio/sfx/power-fire-1.mp3", ...]
 * `key` is the line lower-cased with everything but letters and digits removed,
 * so punctuation or spacing differences still find the recording.
 */
import type { FighterSlug } from "@clashagent/shared";

interface Manifest {
  fighters: Record<string, Record<string, string[]>>;
  announcer: Record<string, string[]>;
  sfx: Record<string, string[]>;
}

export const lineKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

class VoiceBank {
  private manifest: Manifest | null = null;
  private loading: Promise<Manifest | null> | null = null;
  private lastTake = new Map<string, string>();
  private current: HTMLAudioElement | null = null;
  private finish: (() => void) | null = null;
  private cache = new Map<string, HTMLAudioElement>();

  /** Loads the list of recordings (once). Resolves to null if there is none. */
  load() {
    this.loading ??= fetch("/audio/voice/manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .then((m) => (this.manifest = m))
      .catch(() => null);
    return this.loading;
  }

  /** The recording for this line, picking a different take from last time when there are several. */
  private pick(list: string[] | undefined, id: string) {
    if (!list?.length) return null;
    const last = this.lastTake.get(id);
    const options = list.length > 1 ? list.filter((u) => u !== last) : list;
    const url = options[Math.floor(Math.random() * options.length)];
    this.lastTake.set(id, url);
    return url;
  }

  async fighterLine(slug: FighterSlug, text: string) {
    const m = await this.load();
    return this.pick(m?.fighters[slug]?.[lineKey(text)], `${slug}:${lineKey(text)}`);
  }

  async announcerLine(text: string) {
    const m = await this.load();
    return this.pick(m?.announcer[lineKey(text)], `ann:${lineKey(text)}`);
  }

  async sfx(name: string) {
    const m = await this.load();
    return this.pick(m?.sfx[name], `sfx:${name}`);
  }

  /** Warm the browser cache for one fighter's lines (call when a fight starts). */
  async preload(slugs: string[]) {
    const m = await this.load();
    if (!m) return;
    for (const slug of slugs)
      for (const takes of Object.values(m.fighters[slug] ?? {}))
        for (const url of takes.slice(0, 1)) if (!this.cache.has(url)) {
          const a = new Audio();
          a.preload = "auto";
          a.src = url;
          this.cache.set(url, a);
        }
  }

  stop() {
    if (this.current) {
      this.current.pause();
      this.current.currentTime = 0;
    }
    this.current = null;
    this.finish?.();
    this.finish = null;
  }

  /** Plays a dialogue clip; resolves when it ends (or fails). Only one dialogue clip plays at a time. */
  play(url: string, volume = 0.95) {
    this.stop();
    const audio = this.cache.get(url) ?? new Audio(url);
    this.cache.set(url, audio);
    audio.currentTime = 0;
    audio.volume = volume;
    this.current = audio;
    return new Promise<void>((resolve) => {
      this.finish = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play().catch(() => resolve());
    });
  }

  /** Fire-and-forget clip that can overlap other sounds (announcer, power effects). */
  oneShot(url: string, volume = 1) {
    const a = new Audio(url);
    a.volume = volume;
    void a.play().catch(() => {});
    return a;
  }
}

export const voiceBank = new VoiceBank();
