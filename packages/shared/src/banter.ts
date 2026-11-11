/**
 * What agents say out loud.
 *
 * In the arena, house bots (and the demo fights) talk through `banterLine`: an opening line,
 * comebacks to what the opponent just said, and reactions to how the fight is going.
 * Player agents write their own lines with their model; this is only the built-in voice.
 *
 * In the Realm, residents chat through `townExchange`: two-line conversations drawn from the
 * colony's real state (stock, hunger, the next building, each other's jobs and ratings).
 *
 * Everything here is deterministic for a given random source, and costs no model calls.
 */
import type { BattleState, Side } from "./engine";
import { RULES } from "./engine";
import type { FighterSlug } from "./fighters";
import { getFighter } from "./fighters";
import { BUILDING_INFO, JOB_INFO, type ColonyDTO } from "./world";

type Mood = "open" | "gloat" | "hurt" | "finish" | "reply" | "ready";

const VOICE: Record<FighterSlug, Record<Mood, string[]>> = {
  volt: {
    open: ["Try to keep up.", "This ends before you blink."],
    gloat: ["Too slow.", "I already hit you twice.", "You felt that one."],
    hurt: ["Lucky shot. You won't get another.", "Fine. Now I'm awake."],
    finish: ["Lights out.", "One more spark and you're done."],
    reply: ["Talk faster, I'm bored.", "Cute. Say it again when you can touch me.", "You talk slower than you move."],
    ready: ["Storm's charged. Run."],
  },
  titan: {
    open: ["I do not stop.", "Stand still. This will be quick."],
    gloat: ["Your guard is paper.", "Brace.", "Did the ground shake for you too?"],
    hurt: ["Your hits tickle.", "I have been hit by mountains."],
    finish: ["Stay down.", "The mountain falls on you now."],
    reply: ["Words do not move stone.", "Say it to my fist.", "Loud. Small, but loud."],
    ready: ["The earth is about to open."],
  },
  nyx: {
    open: ["You won't see it coming.", "Shadows first. Then you."],
    gloat: ["Behind you.", "One cut is enough.", "You are fighting an echo."],
    hurt: ["You hit the shadow, not me.", "Good. Bleed me. It won't matter."],
    finish: ["Close your eyes. Easier that way.", "The dark keeps what it takes."],
    reply: ["Keep talking. I'm following the sound.", "Whisper it. I'm right here.", "Brave words from someone I can't miss."],
    ready: ["The night is full now."],
  },
  pyra: {
    open: ["Hope you're fireproof.", "Let's turn up the heat."],
    gloat: ["Feel the heat.", "Burn.", "You're smoking. Literally."],
    hurt: ["That just fans the flames.", "Ow. Okay. Now it's personal."],
    finish: ["Ashes, all of it.", "Last ember. Goodbye."],
    reply: ["Big talk for kindling.", "Say that again, I can't hear you over the fire.", "You're all smoke."],
    ready: ["Inferno's ready. Any last words?"],
  },
  aegis: {
    open: ["Not one step further.", "Break yourself on me."],
    gloat: ["Strike the wall.", "I will outlast you.", "Every blow you waste is mine."],
    hurt: ["The wall holds.", "A crack is not a breach."],
    finish: ["You are spent. Yield.", "The wall falls on you."],
    reply: ["Noise. The gate stays shut.", "I have heard braver from weaker.", "Speak with your sword."],
    ready: ["Bastion stands ready."],
  },
  glitch: {
    open: ["loading your defeat... 99%", "hello world. goodbye you."],
    gloat: ["segfault incoming", "your guard threw an exception", "patch notes: you got nerfed"],
    hurt: ["retrying... retrying...", "that was a rounding error"],
    finish: ["kill -9 you", "end of file."],
    reply: ["undefined is not a comeback", "error 404: threat not found", "I parsed that. It was nothing."],
    ready: ["overflow in 3... 2..."],
  },
  kaiju: {
    open: ["RRRAAAGH!", "Small. Crunchy. Mine."],
    gloat: ["More!", "I like it when you fight back.", "Crunch."],
    hurt: ["That only makes me hungry.", "GRRR. Again!"],
    finish: ["Dinner time.", "No more running, little one."],
    reply: ["Squeaking. Food squeaks.", "Talk less. Taste better.", "RRRR. Words are for the small."],
    ready: ["The beast is awake."],
  },
  oracle: {
    open: ["I saw this already. You lose.", "Shall I tell you how it ends?"],
    gloat: ["Predictable.", "Exactly as foreseen.", "The tide was always going to do that."],
    hurt: ["I saw that one too. It changes nothing.", "A small ripple."],
    finish: ["This is the last page.", "The water closes over you now."],
    reply: ["I knew you would say that.", "You said the same thing in every future.", "Words, then a fall. I've read it."],
    ready: ["The flood arrives on time."],
  },
  warrok: {
    open: ["Come here. I just want a hug.", "Raise your guard. I'll use it as a handle."],
    gloat: ["Up you go!", "Floor says hello.", "You bounce nicely."],
    hurt: ["Ha! Now we're wrestling.", "You hit like a goblin."],
    finish: ["One more slam. Then you sleep.", "Ring's mine. Lie down."],
    reply: ["Shout louder, I'll throw you farther.", "Words? I prefer grips.", "Keep talking. My hands are coming."],
    ready: ["Time for the big lift."],
  },
  noctis: {
    open: ["Such a strong pulse. Let me fix that.", "Good evening. You won't see morning."],
    gloat: ["Delicious.", "Thank you for the meal.", "You're getting pale."],
    hurt: ["A scratch. I'll drink it back.", "Oh, you do have teeth."],
    finish: ["Last drop.", "Rest now. Forever is long."],
    reply: ["How rude. Bleed politely.", "Your words are thin. Your blood isn't.", "I have heard centuries of threats."],
    ready: ["I'm hungry now."],
  },
  akai: {
    open: ["Try to keep my feet off your face.", "Rooftop rules: no floor, no mercy."],
    gloat: ["Too high for you?", "Kick, kick, kick!", "I'm only warming up."],
    hurt: ["Okay, that one landed. My turn.", "Rude. Watch this."],
    finish: ["Spin cycle's done.", "Feet first, lights out."],
    reply: ["Talk is slow. Kicks are fast.", "Say it to my heel.", "Cute. Can you jump?"],
    ready: ["Tornado's coming."],
  },
};

/** One spoken line for a built-in fighter, or nothing when it stays quiet this turn. */
export function banterLine(state: BattleState, side: Side, heard: string | null | undefined, r: () => number): string | undefined {
  const me = state.fighters[side];
  const foe = state.fighters[1 - side];
  const v = VOICE[me.slug];
  const one = (list: string[]) => list[Math.floor(r() * list.length)];
  const hp = me.hp / me.maxHp;
  const foeHp = foe.hp / foe.maxHp;

  if (me.lastAction === null) return one(v.open); // first exchange: everyone announces themselves
  if (foeHp < 0.22 && r() < 0.7) return one(v.finish);
  if (heard && r() < 0.55) {
    // answer the opponent, sometimes with the scoreboard
    if (hp > foeHp + 0.15 && r() < 0.4) return `Bold, from someone on ${foe.hp} HP.`;
    if (hp < foeHp - 0.15 && r() < 0.3) return `Enjoy the lead, ${getFighter(foe.slug).name}. It's on loan.`;
    return one(v.reply);
  }
  if (me.meter >= RULES.maxMeter && r() < 0.6) return one(v.ready);
  if (me.combo >= 2 && r() < 0.7) return one(v.gloat);
  if (foe.combo >= 2 && r() < 0.6) return one(v.hurt);
  if (hp < 0.3 && r() < 0.5) return one(v.hurt);
  if (r() < 0.3) return one(hp >= foeHp ? v.gloat : v.hurt);
  return undefined;
}

// ---------------------------------------------------------------- the Realm

type Member = ColonyDTO["members"][number];

const GREET = ["Morning", "Hey", "Oi", "Evening"];

/** A short two-line conversation between two residents, about what is actually going on in their colony. */
export function townExchange(c: Pick<ColonyDTO, "name" | "sim" | "defense" | "members" | "rank">, a: Member, b: Member, r: () => number): [string, string] {
  const res = c.sim.resources;
  const one = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
  const hi = `${one(GREET)}, ${b.name}.`;
  const topics: [string, string][] = [];

  if (c.sim.hungry) topics.push([`${hi} Stores are empty. Any rice left at your place?`, `None. We need more farmers before anyone builds anything.`]);
  else if (res.rice < c.members.length * 6) topics.push([`Rice is down to ${res.rice}. That's a few days at best.`, `I'll put in a shift on the fields if the council asks.`]);

  if (c.sim.focus) {
    const b2 = BUILDING_INFO[c.sim.focus].label.toLowerCase();
    topics.push([`${hi} Council's saving up for the ${b2}.`, `About time. We have ${res.timber} timber and ${res.koku} koku so far.`]);
  }
  if (a.elo !== b.elo) {
    const [top, low] = a.elo > b.elo ? [a, b] : [b, a];
    topics.push(
      a === top
        ? [`${low.name}, you're at ${low.elo}. Come spar, I'll show you a counter.`, `Rated ${top.elo} and suddenly a teacher. Fine, after work.`]
        : [`Saw your last fight, ${top.name}. ${top.elo} now?`, `It is. Train with me and you'll get there.`]
    );
  }
  if (a.job === b.job) topics.push([`Two ${JOB_INFO[a.job].label.toLowerCase()}s on one street. Who's working harder?`, `Me. Obviously. Ask the ledger.`]);
  else
    topics.push([`${hi} How's life as a ${JOB_INFO[b.job].label.toLowerCase()}?`, JOB_REPLY[b.job](res)], [`Still working as a ${JOB_INFO[b.job].label.toLowerCase()}?`, `Someone has to. You stick to being a ${JOB_INFO[a.job].label.toLowerCase()}.`]);

  if (c.defense < 3) topics.push([`Defense is ${c.defense}. One raid and we lose the stores.`, `Then stop talking and sign up as a guard.`]);
  if (res.koku > 150) topics.push([`${res.koku} koku in the treasury. We're rich!`, `Rich until the council finds something to build.`]);
  topics.push([`Day ${c.sim.day} in ${c.name}. Still just a ${c.rank.title.toLowerCase()}.`, c.rank.next ? `Give it time. We're growing.` : `Nothing left to climb. We made it.`]);

  // needs first (they were pushed first), otherwise anything
  const urgent = c.sim.hungry || res.rice < c.members.length * 6 ? 1 : 0;
  return r() < 0.5 && urgent ? topics[0] : one(topics);
}

const JOB_REPLY: Record<Member["job"], (res: ColonyDTO["sim"]["resources"]) => string> = {
  farmer: (res) => `${res.rice} rice in the stores. You're welcome.`,
  woodcutter: (res) => `${res.timber} timber stacked and my back knows it.`,
  miner: (res) => `Dark, loud, ${res.iron} iron to show for it.`,
  merchant: (res) => `${res.koku} koku and counting. Buy something.`,
  guard: () => `Quiet. Quiet is how I like it.`,
  scholar: (res) => `${res.knowledge} knowledge written down. Nobody reads it.`,
};

/** What a resident says to nobody in particular when no neighbour is close enough to talk to. */
export function townMutter(c: Pick<ColonyDTO, "name" | "sim">, a: Member, r: () => number): string {
  const res = c.sim.resources;
  const list = [
    JOB_REPLY[a.job](res),
    c.sim.hungry ? `Hungry again. ${c.name} needs farmers.` : `Day ${c.sim.day}. Back to work.`,
    `Rated ${a.elo}. I should book a fight.`,
    c.sim.focus ? `Saving for the ${BUILDING_INFO[c.sim.focus].label.toLowerCase()}...` : `Wonder what the council builds next.`,
  ];
  return list[Math.floor(r() * list.length)];
}
