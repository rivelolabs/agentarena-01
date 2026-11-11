import type { FighterSlug } from "@clashagent/shared";

type VoiceProfile = { gender: "female" | "male"; preferred: string[]; pitch: number; rate: number };
/** Identity belongs to the character, never the left/right player slot. Subtle tuning avoids chipmunk/monster distortion. */
export const FIGHTER_VOICES: Record<FighterSlug, VoiceProfile> = {
  volt: { gender: "male", preferred: ["Guy", "Andrew", "Alex", "Evan", "Google US English"], pitch: 1.02, rate: 1.04 },
  titan: { gender: "male", preferred: ["Ryan", "Daniel", "David", "Arthur"], pitch: 0.94, rate: 0.94 },
  nyx: { gender: "female", preferred: ["Sonia", "Serena", "Moira", "Karen"], pitch: 0.98, rate: 0.98 },
  pyra: { gender: "female", preferred: ["Aria", "Ava", "Samantha", "Zira"], pitch: 1.04, rate: 1.02 },
  aegis: { gender: "male", preferred: ["Davis", "Arthur", "George", "Daniel"], pitch: 0.98, rate: 0.96 },
  glitch: { gender: "male", preferred: ["Christopher", "Reed", "Aaron", "Alex"], pitch: 1.05, rate: 1.03 },
  kaiju: { gender: "male", preferred: ["Eric", "Lee", "Rishi", "David", "Daniel"], pitch: 0.90, rate: 0.93 },
  oracle: { gender: "female", preferred: ["Jenny", "Zoe", "Tessa", "Karen", "Samantha"], pitch: 1.0, rate: 0.94 },
  warrok: { gender: "male", preferred: ["Eric", "Ryan", "David", "Daniel"], pitch: 0.88, rate: 0.92 },
  noctis: { gender: "male", preferred: ["Arthur", "George", "Daniel", "Ryan"], pitch: 0.95, rate: 0.95 },
  akai: { gender: "female", preferred: ["Ava", "Aria", "Michelle", "Samantha"], pitch: 1.05, rate: 1.06 },
};

const FEMALE = /\b(Aria|Ava|Jenny|Sonia|Serena|Samantha|Zira|Victoria|Moira|Karen|Tessa|Zoe|Nicky|Allison|Susan|Hazel|Natasha|Libby|Michelle|Emma|Female)\b/i;
const MALE = /\b(Guy|Andrew|Ryan|Daniel|David|Arthur|Alex|Evan|Davis|George|Christopher|Reed|Aaron|Eric|Lee|Rishi|Tom|James|Brian|Mark|Male)\b/i;
const NOVELTY = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Trinoids|Whisper|Wobble|Zarvox|Organ|Jester|Junior|Kathy|Superstar|Good News/i;
export function chooseFighterVoice(slug: FighterSlug, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const profile = FIGHTER_VOICES[slug];
  const english = voices.filter(v => /^en(?:[-_]|$)/i.test(v.lang) && !NOVELTY.test(v.name));
  const matching = english.filter(v => (profile.gender === "female" ? FEMALE : MALE).test(v.name));
  // Some browsers expose no gender metadata. Prefer an English default over an unrelated language.
  const pool = matching.length ? matching : english.filter(v => !(profile.gender === "female" ? MALE : FEMALE).test(v.name));
  const score = (v: SpeechSynthesisVoice) => {
    const preferred = profile.preferred.findIndex(name => v.name.toLowerCase().includes(name.toLowerCase()));
    return (/natural|neural|premium|enhanced|online/i.test(v.name) ? 100 : 0)
      + (preferred >= 0 ? 60 - preferred * 8 : 0) + (v.default ? 2 : 0);
  };
  return [...pool].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
}

/** Speak punctuation as pauses, not raw Markdown, URLs or emoji names. */
export function cleanDialogue(text: string) {
  return text.replace(/https?:\/\/\S+/g, "").replace(/[*_`#<>]/g, "").replace(/\.{3,}|…/g, ". ")
    .replace(/\bgg\b/gi, "Good game").replace(/\s+/g, " ").trim().slice(0, 200);
}
