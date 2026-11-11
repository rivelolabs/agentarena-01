"use client";
/**
 * AgentsWar sound engine. Everything is synthesised live with the Web Audio API
 * (no audio files to download or license): impacts, whooshes, energy blasts,
 * shield clangs, combo blips, super stings, K.O. booms, a living crowd and
 * per-stage ambience. Fighter lines and the announcer play saved recordings
 * from /public/audio/voice when there is one (see voiceBank.ts), so fights cost
 * no voice credits; anything without a recording falls back to the browser voice.
 *
 * Browsers only allow audio after a user gesture, so the engine starts muted
 * and is enabled from the sound toggle (the choice is remembered).
 */

import type { FighterSlug } from "@clashagent/shared";
import { chooseFighterVoice, cleanDialogue, FIGHTER_VOICES } from "./fighterVoices";
import { neuralVoice } from "./neuralVoice";
import { voiceBank } from "./voiceBank";

type Theme = "ink" | "citadel" | "neon";

const PREF_KEY = "clashagent:sound";
/**
 * The browser's built-in speech sounds robotic, so it is off: lines without a recording
 * (or an on-demand voice) show as speech bubbles only. Set to true to bring it back.
 */
const BROWSER_VOICE_FALLBACK = false;

class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private crowdGain: GainNode | null = null;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private ambienceNodes: AudioNode[] = [];
  private ambienceTimers: number[] = [];
  private theme: Theme | null = null;
  private listeners = new Set<(on: boolean) => void>();
  private dialogue: { text: string; slug: FighterSlug; at: number }[] = [];
  private voiceBusy = false;
  private speechGeneration = 0;
  private voiceWait: ReturnType<typeof setTimeout> | null = null;
  private lastLine = new Map<FighterSlug, { text: string; at: number }>();
  enabled = false;

  // ------------------------------------------------------------ lifecycle

  /** Was sound turned on in a previous visit? */
  wantsSound(): boolean {
    try {
      return localStorage.getItem(PREF_KEY) === "1";
    } catch {
      return false;
    }
  }

  subscribe(fn: (on: boolean) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((f) => f(this.enabled));
  }

  async enable() {
    if (typeof window === "undefined") return;
    if (!this.ctx) this.build();
    await this.ctx!.resume().catch(() => {});
    this.enabled = true;
    try {
      localStorage.setItem(PREF_KEY, "1");
    } catch {}
    this.master.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.2);
    if (this.theme) this.startAmbience(this.theme);
    this.emit();
  }

  disable() {
    this.enabled = false;
    this.clearDialogue();
    try {
      localStorage.setItem(PREF_KEY, "0");
    } catch {}
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.stopAmbience();
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    this.emit();
  }

  toggle() {
    return this.enabled ? this.disable() : this.enable();
  }

  setTheme(theme: Theme | null) {
    this.theme = theme;
    this.stopAmbience();
    if (theme && this.enabled) this.startAmbience(theme);
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.55;
    this.ambBus.connect(this.master);

    // Reverb from a generated impulse (big stone courtyard).
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.4;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.loadSamples();
  }

  // ------------------------------------------------------------ recorded samples
  // Optional: real fight recordings in /public/audio/sfx (made with `npm run sfx:generate -w @clashagent/web`,
  // ElevenLabs sound effects). Each sound below plays a sample when one exists, else the synth version.

  private samples = new Map<string, AudioBuffer[]>();

  private loadSamples() {
    const ctx = this.ctx;
    if (!ctx || typeof fetch === "undefined") return;
    fetch("/audio/sfx/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (m: Record<string, string[]> | null) => {
        if (!m) return;
        for (const [name, files] of Object.entries(m)) {
          const bufs: AudioBuffer[] = [];
          for (const f of files) {
            try {
              const ab = await (await fetch(`/audio/sfx/${f}`)).arrayBuffer();
              bufs.push(await ctx.decodeAudioData(ab));
            } catch {
              /* skip a bad file */
            }
          }
          if (bufs.length) this.samples.set(name, bufs);
        }
      })
      .catch(() => {});
  }

  /** Play a recorded sample for `name` if there is one. Returns false when the synth should play instead. */
  private sample(name: string, gain = 1, wet = 0.15): boolean {
    const list = this.samples.get(name);
    if (!list?.length || !this.ok()) return false;
    const src = this.ctx!.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx!.createGain();
    g.gain.value = gain;
    src.connect(g);
    this.out(g, wet);
    src.start();
    return true;
  }

  // ------------------------------------------------------------ primitives

  private get t() {
    return this.ctx!.currentTime;
  }

  private ok() {
    return this.enabled && this.ctx && this.ctx.state === "running";
  }

  private out(node: AudioNode, wet = 0.25) {
    node.connect(this.sfxBus);
    if (wet > 0) {
      const g = this.ctx!.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.reverbSend);
    }
  }

  private env(gain: GainNode, peak: number, attack: number, decay: number, at = this.t) {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  private noiseBurst(opts: { type: BiquadFilterType; freq: number; q?: number; peak: number; attack?: number; decay: number; sweepTo?: number; wet?: number; at?: number }) {
    const ctx = this.ctx!;
    const at = opts.at ?? this.t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type;
    f.frequency.setValueAtTime(opts.freq, at);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, at + (opts.attack ?? 0.005) + opts.decay);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    this.env(g, opts.peak, opts.attack ?? 0.005, opts.decay, at);
    src.connect(f).connect(g);
    this.out(g, opts.wet ?? 0.2);
    src.start(at, Math.random());
    src.stop(at + (opts.attack ?? 0.005) + opts.decay + 0.05);
  }

  private tone(opts: { type: OscillatorType; from: number; to?: number; peak: number; attack?: number; decay: number; wet?: number; at?: number; detune?: number }) {
    const ctx = this.ctx!;
    const at = opts.at ?? this.t;
    const o = ctx.createOscillator();
    o.type = opts.type;
    o.frequency.setValueAtTime(opts.from, at);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + (opts.attack ?? 0.005) + opts.decay);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    this.env(g, opts.peak, opts.attack ?? 0.005, opts.decay, at);
    o.connect(g);
    this.out(g, opts.wet ?? 0.2);
    o.start(at);
    o.stop(at + (opts.attack ?? 0.005) + opts.decay + 0.05);
  }

  // ------------------------------------------------------------ combat sounds

  whoosh(big = false) {
    if (!this.ok()) return;
    if (this.sample(big ? "whooshBig" : "whoosh", big ? 0.9 : 0.7)) return;
    this.noiseBurst({ type: "bandpass", freq: big ? 300 : 500, sweepTo: big ? 1800 : 2800, q: 1.4, peak: big ? 0.35 : 0.22, attack: 0.06, decay: big ? 0.28 : 0.16, wet: 0.1 });
  }

  hit(power = 0.5) {
    if (!this.ok()) return;
    if (this.sample("hit", 0.55 + power * 0.45)) return;
    this.tone({ type: "sine", from: 140 + power * 40, to: 42, peak: 0.55 + power * 0.4, decay: 0.16 + power * 0.12 });
    this.noiseBurst({ type: "bandpass", freq: 1400 - power * 500, q: 0.9, peak: 0.4 + power * 0.3, decay: 0.09 + power * 0.06 });
    this.noiseBurst({ type: "highpass", freq: 3500, peak: 0.12, decay: 0.04, wet: 0 });
  }

  heavy() {
    if (!this.ok()) return;
    if (this.sample("heavy", 1)) return;
    this.hit(1);
    this.tone({ type: "triangle", from: 90, to: 28, peak: 0.7, decay: 0.45, wet: 0.35 });
    this.noiseBurst({ type: "lowpass", freq: 900, peak: 0.45, decay: 0.35, wet: 0.3 });
  }

  block() {
    if (!this.ok()) return;
    if (this.sample("block", 0.85)) return;
    [523, 1347, 2210, 3120].forEach((f, i) =>
      this.tone({ type: i % 2 ? "square" : "triangle", from: f * (0.98 + Math.random() * 0.04), peak: 0.12 / (i + 1), decay: 0.35 - i * 0.05, wet: 0.35 })
    );
    this.noiseBurst({ type: "highpass", freq: 2500, peak: 0.25, decay: 0.05 });
    this.tone({ type: "sine", from: 120, to: 60, peak: 0.25, decay: 0.12 });
  }

  dodge() {
    if (!this.ok()) return;
    if (this.sample("dodge", 0.7)) return;
    this.noiseBurst({ type: "bandpass", freq: 2200, sweepTo: 600, q: 2, peak: 0.25, attack: 0.03, decay: 0.2, wet: 0.15 });
  }

  /** Steel cutting air: a bright, fast swish with a metallic ring. */
  slash() {
    if (!this.ok()) return;
    if (this.sample("slash", 0.85)) return;
    this.noiseBurst({ type: "highpass", freq: 2600, sweepTo: 7000, peak: 0.3, attack: 0.02, decay: 0.14, wet: 0.15 });
    this.tone({ type: "triangle", from: 3300, to: 2500, peak: 0.05, decay: 0.3, wet: 0.4 });
  }

  /** A blade going in: wet, short and nasty. */
  stab() {
    if (!this.ok()) return;
    if (this.sample("stab", 0.9)) return;
    this.noiseBurst({ type: "bandpass", freq: 900, sweepTo: 300, q: 2.2, peak: 0.45, attack: 0.004, decay: 0.12, wet: 0.1 });
    this.tone({ type: "sine", from: 180, to: 60, peak: 0.45, decay: 0.12 });
    this.noiseBurst({ type: "lowpass", freq: 700, peak: 0.25, decay: 0.2, wet: 0.1, at: this.t + 0.05 });
  }

  /** Bone breaking. */
  crack() {
    if (!this.ok()) return;
    if (this.sample("crack", 1)) return;
    for (let i = 0; i < 4; i++) this.noiseBurst({ type: "highpass", freq: 1800 + i * 600, peak: 0.5 - i * 0.08, attack: 0.001, decay: 0.025, wet: 0.2, at: this.t + i * 0.018 });
    this.tone({ type: "square", from: 220, to: 70, peak: 0.25, decay: 0.08, wet: 0.2 });
  }

  /** A body hitting the floor. */
  thud(power = 1) {
    if (!this.ok()) return;
    if (this.sample("thud", Math.min(1.2, 0.6 + power * 0.4), 0.3)) return;
    this.tone({ type: "sine", from: 85, to: 30, peak: 0.6 * power, decay: 0.4, wet: 0.35 });
    this.noiseBurst({ type: "lowpass", freq: 500, sweepTo: 120, peak: 0.4 * power, decay: 0.3, wet: 0.3 });
  }

  /** Blood hitting the ground. */
  splat() {
    if (!this.ok()) return;
    if (this.sample("splat", 0.8)) return;
    for (let i = 0; i < 5; i++) this.noiseBurst({ type: "bandpass", freq: 600 + Math.random() * 500, q: 1.5, peak: 0.18, decay: 0.06, wet: 0.1, at: this.t + i * 0.04 + Math.random() * 0.03 });
  }

  /** An energy shield breaking like glass. */
  shatter() {
    if (!this.ok()) return;
    if (this.sample("shatter", 0.9, 0.4)) return;
    this.noiseBurst({ type: "highpass", freq: 3500, peak: 0.4, decay: 0.5, wet: 0.5 });
    for (let i = 0; i < 9; i++) this.tone({ type: "sine", from: 2400 + Math.random() * 3200, peak: 0.06, decay: 0.15 + Math.random() * 0.2, wet: 0.5, at: this.t + Math.random() * 0.25 });
  }

  /** A thrown chain rattling out. */
  chainRattle() {
    if (!this.ok()) return;
    if (this.sample("chain", 0.8)) return;
    for (let i = 0; i < 9; i++) this.noiseBurst({ type: "bandpass", freq: 3000 + Math.random() * 2500, q: 6, peak: 0.12, decay: 0.03, wet: 0.2, at: this.t + i * 0.035 });
  }

  /** Roaring incineration. */
  burn() {
    if (!this.ok()) return;
    if (this.sample("burn", 1, 0.35)) return;
    this.noiseBurst({ type: "bandpass", freq: 300, sweepTo: 1600, q: 0.7, peak: 0.5, attack: 0.15, decay: 1.6, wet: 0.4 });
    this.tone({ type: "sawtooth", from: 70, to: 40, peak: 0.25, attack: 0.1, decay: 1.6, wet: 0.4 });
    for (let i = 0; i < 14; i++) this.noiseBurst({ type: "highpass", freq: 4000, peak: 0.08, decay: 0.02, wet: 0, at: this.t + 0.1 + i * 0.09 + Math.random() * 0.04 });
  }

  /** A thrown blast. Each element has its own voice, so you can hear who is attacking. */
  blast(big = false, element = "") {
    if (!this.ok()) return;
    const g = big ? 1.35 : 1;
    switch (element) {
      case "Fire": // roaring whoosh with crackle
        this.noiseBurst({ type: "bandpass", freq: 500, sweepTo: 2200, q: 0.8, peak: 0.34 * g, attack: 0.04, decay: 0.42, wet: 0.25 });
        this.tone({ type: "sawtooth", from: 120, to: 60, peak: 0.16 * g, decay: 0.4, wet: 0.2 });
        for (let i = 0; i < 6; i++) this.noiseBurst({ type: "highpass", freq: 4200, peak: 0.1, decay: 0.02, wet: 0, at: this.t + 0.04 + i * 0.045 + Math.random() * 0.02 });
        break;
      case "Water": // deep splash that falls away
        this.noiseBurst({ type: "lowpass", freq: 2600, sweepTo: 320, peak: 0.36 * g, attack: 0.01, decay: 0.5, wet: 0.35 });
        this.tone({ type: "sine", from: 520, to: 140, peak: 0.2 * g, decay: 0.3, wet: 0.3 });
        [0.08, 0.15, 0.21].forEach((d, i) => this.tone({ type: "sine", from: 700 + i * 260, to: 1300 + i * 300, peak: 0.07, decay: 0.06, at: this.t + d }));
        break;
      case "Wind": // airy slicing gust
        this.noiseBurst({ type: "highpass", freq: 1800, sweepTo: 5200, peak: 0.26 * g, attack: 0.09, decay: 0.34, wet: 0.3 });
        this.noiseBurst({ type: "bandpass", freq: 900, sweepTo: 2600, q: 5, peak: 0.16 * g, attack: 0.05, decay: 0.3, wet: 0.3 });
        break;
      case "Lightning": // sharp crack, buzzing tail
        this.noiseBurst({ type: "highpass", freq: 3000, peak: 0.42 * g, decay: 0.06, wet: 0.1 });
        this.tone({ type: "square", from: 1900, to: 140, peak: 0.16 * g, decay: 0.2, wet: 0.2 });
        for (let i = 0; i < 5; i++) this.tone({ type: "sawtooth", from: 90 + Math.random() * 60, peak: 0.1, decay: 0.035, at: this.t + 0.07 + i * 0.05, detune: Math.random() * 400 });
        break;
      case "Earth": // heavy grinding thud
        this.tone({ type: "triangle", from: 110, to: 34, peak: 0.6 * g, decay: 0.5, wet: 0.3 });
        this.noiseBurst({ type: "lowpass", freq: 600, sweepTo: 160, peak: 0.42 * g, decay: 0.45, wet: 0.3 });
        break;
      case "Shadow": // hollow swell
        this.tone({ type: "sine", from: 70, to: 220, peak: 0.3 * g, attack: 0.12, decay: 0.4, wet: 0.5 });
        this.tone({ type: "sine", from: 74, to: 231, peak: 0.22 * g, attack: 0.12, decay: 0.4, wet: 0.5, detune: 30 });
        this.noiseBurst({ type: "bandpass", freq: 300, sweepTo: 1200, q: 6, peak: 0.12, attack: 0.15, decay: 0.3, wet: 0.5 });
        break;
      case "Poison": // wet bubbling spit
        this.noiseBurst({ type: "bandpass", freq: 700, sweepTo: 300, q: 3, peak: 0.24 * g, decay: 0.3, wet: 0.2 });
        for (let i = 0; i < 6; i++) this.tone({ type: "sine", from: 260 + Math.random() * 500, to: 520 + Math.random() * 700, peak: 0.1, decay: 0.05, at: this.t + i * 0.05 });
        break;
      default: // plasma / energy bolt
        this.tone({ type: "sawtooth", from: big ? 1400 : 950, to: big ? 90 : 160, peak: 0.18, attack: 0.01, decay: big ? 0.6 : 0.32, wet: 0.3 });
        this.tone({ type: "square", from: big ? 700 : 480, to: 120, peak: 0.08, decay: 0.3, detune: 12, wet: 0.2 });
        this.noiseBurst({ type: "bandpass", freq: 3000, sweepTo: 500, q: 0.7, peak: 0.2, decay: 0.3 });
    }
  }

  /** Short rising hum while a fighter gathers a blast in their hands. */
  gather() {
    if (!this.ok()) return;
    this.tone({ type: "sine", from: 220, to: 880, peak: 0.1, attack: 0.1, decay: 0.12, wet: 0.3 });
  }

  charge() {
    if (!this.ok()) return;
    this.tone({ type: "sine", from: 140, to: 620, peak: 0.16, attack: 0.25, decay: 0.45, wet: 0.4 });
    this.noiseBurst({ type: "bandpass", freq: 400, sweepTo: 2400, q: 3, peak: 0.08, attack: 0.3, decay: 0.3, wet: 0.3 });
  }

  heal() {
    if (!this.ok()) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: "sine", from: f, peak: 0.12, attack: 0.02, decay: 0.8, at: this.t + i * 0.07, wet: 0.6 }));
  }

  combo(hits: number) {
    if (!this.ok()) return;
    const base = 520 * Math.pow(1.122, Math.min(8, hits));
    this.tone({ type: "square", from: base, peak: 0.1, decay: 0.08, wet: 0.15 });
    this.tone({ type: "square", from: base * 1.5, peak: 0.08, decay: 0.12, at: this.t + 0.07, wet: 0.2 });
  }

  chain() {
    if (!this.ok()) return;
    [220, 277, 330, 440].forEach((f) => this.tone({ type: "sawtooth", from: f, peak: 0.09, attack: 0.01, decay: 0.7, wet: 0.5 }));
    this.heavy();
    this.cheer(1);
  }

  superStart() {
    if (!this.ok()) return;
    this.tone({ type: "sawtooth", from: 80, to: 900, peak: 0.16, attack: 0.5, decay: 0.3, wet: 0.5 });
    this.tone({ type: "sine", from: 55, peak: 0.5, attack: 0.3, decay: 1.4, wet: 0.4 });
    this.noiseBurst({ type: "bandpass", freq: 200, sweepTo: 5000, q: 2, peak: 0.18, attack: 0.6, decay: 0.2, wet: 0.5 });
  }

  ko() {
    if (!this.ok()) return;
    if (this.sample("ko", 1, 0.5)) {
      this.cheer(1.4);
      return;
    }
    this.tone({ type: "sine", from: 95, to: 24, peak: 1, attack: 0.005, decay: 1.6, wet: 0.6 });
    this.noiseBurst({ type: "lowpass", freq: 1200, sweepTo: 120, peak: 0.6, decay: 1.4, wet: 0.7 });
    this.block();
    this.cheer(1.4);
  }

  gong() {
    if (!this.ok()) return;
    [110, 247.5, 391, 523, 761].forEach((f, i) =>
      this.tone({ type: "sine", from: f * (1 + (Math.random() - 0.5) * 0.004), peak: 0.28 / (i + 1), attack: 0.01, decay: 3.2 - i * 0.4, wet: 0.7 })
    );
    this.noiseBurst({ type: "bandpass", freq: 800, q: 0.5, peak: 0.2, decay: 0.15 });
  }

  victory() {
    if (!this.ok()) return;
    const notes = [392, 523, 659, 784];
    notes.forEach((f, i) => {
      this.tone({ type: "sawtooth", from: f, peak: 0.07, attack: 0.02, decay: i === 3 ? 1.4 : 0.22, at: this.t + i * 0.16, wet: 0.5 });
      this.tone({ type: "triangle", from: f / 2, peak: 0.12, attack: 0.02, decay: i === 3 ? 1.4 : 0.22, at: this.t + i * 0.16, wet: 0.3 });
    });
    this.cheer(1.2);
  }

  /** Crowd roar swell, 0..1.5 */
  cheer(intensity = 0.6) {
    if (!this.ok() || !this.crowdGain) return;
    const g = this.crowdGain.gain;
    const t = this.t;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.05 + intensity * 0.32, t, 0.08);
    g.setTargetAtTime(0.05, t + 0.4 + intensity * 0.6, 0.6);
  }

  // ------------------------------------------------------------ announcer

  announce(text: string, opts: { pitch?: number; rate?: number } = {}) {
    if (!this.enabled || typeof window === "undefined") return;
    // the recorded announcer first; the browser voice only for calls that were never recorded
    void voiceBank.announcerLine(text).then((url) => {
      if (!this.enabled) return;
      if (url) voiceBank.oneShot(url, 1);
      else if (BROWSER_VOICE_FALLBACK) this.announceWithBrowserVoice(text, opts);
    });
  }

  private announceWithBrowserVoice(text: string, opts: { pitch?: number; rate?: number }) {
    if (!window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const pick =
        voices.find((v) => /Daniel|Google UK English Male|Alex|Fred|Arthur|Male/i.test(v.name) && v.lang.startsWith("en")) ??
        voices.find((v) => v.lang.startsWith("en"));
      if (pick) u.voice = pick;
      u.pitch = Math.max(0.9, Math.min(1.1, opts.pitch ?? 1));
      u.rate = Math.max(0.95, Math.min(1.08, opts.rate ?? 1));
      u.volume = 0.8;
      if (window.speechSynthesis.speaking || this.voiceBusy || this.dialogue.length) return;
      window.speechSynthesis.speak(u);
    } catch {
      /* speech not available */
    }
  }

  /** Clear old lines when leaving a fight, replaying or muting. */
  clearDialogue() {
    this.speechGeneration++;
    neuralVoice.stop();
    voiceBank.stop();
    this.dialogue = [];
    this.voiceBusy = false;
    this.lastLine.clear();
    if (this.voiceWait) clearTimeout(this.voiceWait);
    this.voiceWait = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }

  speak(text: string, slug: FighterSlug) {
    if (!this.enabled || typeof window === "undefined" || !window.speechSynthesis) return;
    const line = cleanDialogue(text);
    if (!/[a-z]{3}/i.test(line)) return;
    const previous = this.lastLine.get(slug);
    if (previous?.text === line && Date.now() - previous.at < 6000) return;
    this.lastLine.set(slug, { text: line, at: Date.now() });
    // A single reply can wait; never accumulate a commentary backlog.
    this.dialogue = [...this.dialogue.slice(-1), { text: line, slug, at: Date.now() }];
    this.drainDialogue();
  }

  private drainDialogue() {
    if (!this.enabled || this.voiceBusy || !this.dialogue.length) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      if (!this.voiceWait) this.voiceWait = setTimeout(() => { this.voiceWait = null; this.drainDialogue(); }, 150);
      return;
    }
    const line = this.dialogue.shift()!;
    if (Date.now() - line.at > 4500) { this.drainDialogue(); return; }
    const generation = this.speechGeneration;
    this.voiceBusy = true;
    const play = async () => {
      if (generation !== this.speechGeneration || !this.enabled) return;
      // 1. a saved recording of this exact line (free, instant)
      const recorded = await voiceBank.fighterLine(line.slug, line.text);
      if (generation !== this.speechGeneration || !this.enabled) return;
      if (recorded) {
        await voiceBank.play(recorded);
        if (generation !== this.speechGeneration) return;
        this.voiceBusy = false;
        this.voiceWait = setTimeout(() => { this.voiceWait = null; this.drainDialogue(); }, 220);
        return;
      }
      // 2. a voice generated on demand (only when the voice service is configured)
      const hasNeuralVoice = await neuralVoice.supports(line.slug);
      if (generation !== this.speechGeneration || !this.enabled) return;
      if (hasNeuralVoice) {
        await neuralVoice.play(line.text, line.slug);
        if (generation !== this.speechGeneration) return;
        this.voiceBusy = false;
        this.voiceWait = setTimeout(() => { this.voiceWait = null; this.drainDialogue(); }, 220);
        return;
      }
      if (!BROWSER_VOICE_FALLBACK) {
        // no recording for this line: the speech bubble carries it
        this.voiceBusy = false;
        this.voiceWait = setTimeout(() => { this.voiceWait = null; this.drainDialogue(); }, 220);
        return;
      }
      const voice = chooseFighterVoice(line.slug, synth.getVoices());
      const profile = FIGHTER_VOICES[line.slug];
      const utterance = new SpeechSynthesisUtterance(line.text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "en-US";
      utterance.pitch = profile.pitch;
      utterance.rate = profile.rate;
      utterance.volume = 0.9;
      const finish = () => {
        if (generation !== this.speechGeneration) return;
        this.voiceBusy = false;
        this.voiceWait = setTimeout(() => { this.voiceWait = null; this.drainDialogue(); }, 220);
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      try { synth.speak(utterance); } catch { finish(); }
    };
    if (synth.getVoices().length) play();
    else {
      // Voice lists often arrive asynchronously on the first user gesture.
      let started = false;
      const ready = () => {
        if (started) return;
        started = true;
        synth.removeEventListener("voiceschanged", ready);
        clearTimeout(timeout);
        play();
      };
      synth.addEventListener("voiceschanged", ready);
      const timeout = setTimeout(ready, 1000);
    }
  }

  // ------------------------------------------------------------ ambience

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    this.ambienceNodes.push(src);
    return src;
  }

  private lfo(target: AudioParam, rate: number, depth: number) {
    const o = this.ctx!.createOscillator();
    o.frequency.value = rate;
    const g = this.ctx!.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    this.ambienceNodes.push(o);
  }

  private startAmbience(theme: Theme) {
    const ctx = this.ctx;
    if (!ctx || this.ambienceNodes.length) return;

    // Crowd: band-limited noise shaped by formant filters so it reads as many voices.
    const crowdIn = this.loopNoise();
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    [480, 1150, 2300].forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = [0.9, 0.5, 0.2][i];
      this.lfo(g.gain, 0.13 + i * 0.07, 0.25);
      crowdIn.connect(bp).connect(g).connect(this.crowdGain!);
    });
    this.crowdGain.connect(this.ambBus);
    this.ambienceNodes.push(this.crowdGain);

    if (theme === "citadel") {
      // Desert wind
      const wind = this.loopNoise();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      lp.Q.value = 3;
      this.lfo(lp.frequency, 0.07, 220);
      const g = ctx.createGain();
      g.gain.value = 0.16;
      this.lfo(g.gain, 0.05, 0.08);
      wind.connect(lp).connect(g).connect(this.ambBus);
      this.ambienceNodes.push(g);
      // Brazier crackles
      const crackle = () => {
        if (!this.ok()) return;
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++)
          this.noiseBurst({ type: "highpass", freq: 2500 + Math.random() * 3000, peak: 0.03 + Math.random() * 0.05, attack: 0.001, decay: 0.01 + Math.random() * 0.03, at: this.t + i * 0.03, wet: 0.05 });
      };
      this.ambienceTimers.push(window.setInterval(crackle, 260));
      // Distant drums every few bars
      const drum = () => {
        if (!this.ok()) return;
        [0, 0.42, 0.63].forEach((d, i) => this.tone({ type: "sine", from: i === 0 ? 70 : 95, to: 40, peak: 0.12, decay: 0.35, at: this.t + d, wet: 0.6 }));
      };
      this.ambienceTimers.push(window.setInterval(drum, 3400));
    } else if (theme === "ink") {
      // Mountain wind, a distant temple bell and slow taiko
      const wind = this.loopNoise();
      const lp = ctx.createBiquadFilter();
      lp.type = "bandpass";
      lp.frequency.value = 520;
      lp.Q.value = 1.6;
      this.lfo(lp.frequency, 0.06, 260);
      const g = ctx.createGain();
      g.gain.value = 0.11;
      this.lfo(g.gain, 0.04, 0.06);
      wind.connect(lp).connect(g).connect(this.ambBus);
      this.ambienceNodes.push(g);
      const bell = () => {
        if (!this.ok()) return;
        [196, 392.5, 588, 791].forEach((f, i) => this.tone({ type: "sine", from: f, peak: 0.07 / (i + 1), attack: 0.01, decay: 4.5 - i * 0.7, wet: 0.9 }));
      };
      this.ambienceTimers.push(window.setInterval(bell, 9000));
      const taiko = () => {
        if (!this.ok()) return;
        [0, 0.9, 1.35, 1.8].forEach((d, i) => this.tone({ type: "sine", from: i === 0 ? 82 : 64, to: 38, peak: i === 0 ? 0.16 : 0.1, decay: 0.5, at: this.t + d, wet: 0.6 }));
      };
      this.ambienceTimers.push(window.setInterval(taiko, 5200));
    } else {
      // Neon: low synth drone + electrical hum
      [55, 55.4, 82.4].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 240;
        this.lfo(lp.frequency, 0.05, 90);
        const g = ctx.createGain();
        g.gain.value = 0.035;
        o.connect(lp).connect(g).connect(this.ambBus);
        o.start();
        this.ambienceNodes.push(o, g);
      });
    }
  }

  stopAmbience() {
    this.ambienceTimers.forEach((t) => clearInterval(t));
    this.ambienceTimers = [];
    for (const n of this.ambienceNodes) {
      try {
        if (n instanceof AudioScheduledSourceNode) n.stop();
        n.disconnect();
      } catch {}
    }
    this.ambienceNodes = [];
    this.crowdGain = null;
  }
}

export const sfx = new Sfx();
