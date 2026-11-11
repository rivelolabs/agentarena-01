import type { FighterSlug } from "@clashagent/shared";

/** Server-side neural speech; API credentials never reach the browser. */
class NeuralVoice {
  private status: Promise<Set<string>> | null = null;
  private current: HTMLAudioElement | null = null;
  private controller: AbortController | null = null;
  private sequence = 0;
  private objectUrl: string | null = null;
  private finish: (() => void) | null = null;

  async supports(slug: FighterSlug) {
    this.status ??= fetch("/api/voice", { cache: "no-store" }).then(async r => {
      if (!r.ok) return new Set<string>();
      const data = await r.json();
      return new Set<string>(data.enabled ? data.fighters : []);
    }).catch(() => new Set<string>());
    return (await this.status).has(slug);
  }

  stop() {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
    if (this.current) { this.current.pause(); this.current.src = ""; }
    this.current = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.finish?.();
    this.finish = null;
  }

  async play(text: string, slug: FighterSlug) {
    this.stop();
    const sequence = this.sequence;
    this.controller = new AbortController();
    try {
      const response = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, slug }), signal: this.controller.signal });
      if (!response.ok || sequence !== this.sequence) return;
      const blob = await response.blob();
      if (sequence !== this.sequence) return;
      this.objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(this.objectUrl);
      this.current = audio;
      audio.volume = 0.9;
      // Keep the actor's actual pitch and delivery intact.
      audio.playbackRate = 1;
      await new Promise<void>(resolve => {
        this.finish = resolve;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
    } catch { /* Keep the text bubble if the service is unavailable; don't substitute a robot voice. */ }
    finally { if (sequence === this.sequence) this.stop(); }
  }
}
export const neuralVoice = new NeuralVoice();
