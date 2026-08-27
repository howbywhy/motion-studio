import { mulberry32 } from "./rng";
import type { ParamValues } from "./types";

/**
 * Curated Bloom still randomisation — restrained-to-medium only.
 *
 *   fieldCount 3–5 (weighted 3/4), fieldSize 32–48, softness 70–88,
 *   drift 4–14, overlap 40–64, reveal 50–72, resolve 38–58, speed 0.65–1.05.
 *   Overlap+reveal sum capped so the photograph cannot vanish into a blob.
 *   resolveLimit is left unchanged (art-directed terminal coverage).
 *
 * Phase (local to the current pair):
 *   ~50% 0.18–0.40, 30% 0.40–0.55, 10% 0.12–0.18, 10% 0.55–0.68
 *
 * Does not touch media, sequence, Registration (including Amount), End
 * Behaviour, Typography (including Position Rhythm), B&W, background, audio,
 * export, or aspect. Does not randomise FIELD or Shift.
 */

export interface RandomiseInput {
  seed: number;
  params: ParamValues;
  loopSeconds: number;
  pairIndex: number;
  pairCount: number;
}

export interface RandomiseResult {
  seed: number;
  params: ParamValues;
  holdPhase: number;
  graphicElapsed: number;
}

interface Band {
  w: number;
  lo: number;
  hi: number;
}

function stepped(rng: () => number, min: number, max: number, step: number): number {
  const span = Math.max(0, max - min);
  const raw = min + rng() * span;
  const n = Math.round(raw / step) * step;
  const clamped = Math.min(max, Math.max(min, n));
  const decimals = step < 1 ? String(step).split(".")[1]?.length ?? 2 : 0;
  return Number(clamped.toFixed(decimals));
}

function intInc(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function sampleBand(rng: () => number, bands: Band[]): number {
  const total = bands.reduce((s, b) => s + b.w, 0);
  let x = rng() * total;
  for (const b of bands) {
    x -= b.w;
    if (x <= 0) return b.lo + rng() * (b.hi - b.lo);
  }
  const last = bands[bands.length - 1]!;
  return last.lo + rng() * (last.hi - last.lo);
}

function loopPhaseFromLocal(pairIndex: number, pairCount: number, local: number): number {
  if (pairCount <= 1) return Math.min(1, Math.max(0, local));
  const idx = Math.min(pairCount - 1, Math.max(0, pairIndex));
  return Math.min(1, Math.max(0, (idx + Math.min(1, Math.max(0, local))) / pairCount));
}

function bloomParams(rng: () => number, current: ParamValues): ParamValues {
  const roll = rng();
  const fieldCount = roll < 0.4 ? 3 : roll < 0.85 ? 4 : 5;
  let overlap = intInc(rng, 40, 64);
  let revealAmount = intInc(rng, 50, 72);
  if (overlap + revealAmount > 128) {
    revealAmount = Math.max(50, 128 - overlap);
  }
  return {
    ...current,
    fieldCount,
    fieldSize: intInc(rng, 32, 48),
    softness: intInc(rng, 70, 88),
    drift: intInc(rng, 4, 14),
    overlap,
    revealAmount,
    resolveAmount: intInc(rng, 38, 58),
    speed: stepped(rng, 0.65, 1.05, 0.05),
    // Terminal coverage stays art-directed — do not randomise resolveLimit.
  };
}

const BLOOM_PHASE: Band[] = [
  { w: 50, lo: 0.18, hi: 0.4 },
  { w: 30, lo: 0.4, hi: 0.55 },
  { w: 10, lo: 0.12, hi: 0.18 },
  { w: 10, lo: 0.55, hi: 0.68 },
];

export function generateRandomisation(input: RandomiseInput): RandomiseResult {
  const rng = mulberry32(input.seed >>> 0);
  const params = bloomParams(rng, input.params);
  const local = sampleBand(rng, BLOOM_PHASE);
  const holdPhase = loopPhaseFromLocal(input.pairIndex, Math.max(1, input.pairCount), local);
  const graphicElapsed = holdPhase * Math.max(0.001, input.loopSeconds);
  return { seed: input.seed >>> 0, params, holdPhase, graphicElapsed };
}

export function newRandomisationSeed(): number {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0]!;
  }
  return (Math.random() * 0x100000000) >>> 0;
}
