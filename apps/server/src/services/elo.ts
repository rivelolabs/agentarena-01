/** Standard Elo with K=32. `scoreA` is 1 (A wins), 0 (B wins) or 0.5 (draw). */
export function eloUpdate(ra: number, rb: number, scoreA: number, k = 32): [number, number] {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const eb = 1 - ea;
  return [Math.round(ra + k * (scoreA - ea)), Math.round(rb + k * (1 - scoreA - eb))];
}
