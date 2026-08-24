/** Deterministic seeded PRNG (mulberry32) so behaviors look stable across re-renders
 *  and only reshuffle when a seed-affecting param (e.g. count) actually changes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededSeries(seed: number, count: number): number[][] {
  const rand = mulberry32(seed);
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    out.push([rand(), rand(), rand(), rand(), rand(), rand()]);
  }
  return out;
}
