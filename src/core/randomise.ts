import { mulberry32 } from "./rng";
import type { ParamValues } from "./types";

/**
 * Curated still randomisation — not full-slider noise.
 *
 * Bloom (restrained → medium, below Expressive):
 *   fieldCount 3–5 (weighted 3/4), fieldSize 32–48, softness 70–88,
 *   drift 4–14, overlap 40–64, reveal 50–72, resolve 38–58, speed 0.65–1.05.
 *   Overlap+reveal sum capped so the photograph cannot vanish into a blob.
 *
 * Diffuse (medium material, readable subject):
 *   fragment 28–50, spread 55–80, overlap 28–52, rhythm 16–36,
 *   speed 0.55–0.95, direction biased to shallow editorial angles.
 *
 * Slice (early/medium structured intervals, not HOLD ~0.50 glitch):
 *   fragment 32–44, spread 48–78, overlap 16–45, rhythm 12–32,
 *   speed 0.50–0.95.
 *
 * FIELD (editorial fine-to-medium Frequency; keep Static/Live):
 *   density 38–62, frequency 55–88, scale 40–70, complexity 28–58,
 *   bias 28–72, new integer seed. Distinct from the randomisation seed.
 *
 * Phase (local to the current pair — does not jump materials):
 *   Bloom  ~50% 0.18–0.40, 30% 0.40–0.55, 10% 0.12–0.18, 10% 0.55–0.68
 *   Diffuse ~60% 0.28–0.52, 25% 0.18–0.28, 15% 0.52–0.62
 *   Slice  ~55% 0.12–0.32, 30% 0.32–0.46, 15% 0.08–0.12  (avoids 0.48–0.55)
 */

export interface FieldExploreState {
  id: string;
  field: {
    density: number;
    scale: number;
    complexity: number;
    biasX: number;
    biasY: number;
    seed: number;
    motion: "static" | "live";
    frequency: number;
  };
}

export interface RandomiseInput {
  seed: number;
  behaviorId: string;
  treatment: string;
  params: ParamValues;
  loopSeconds: number;
  pairIndex: number;
  pairCount: number;
  fields: FieldExploreState[];
}

export interface RandomiseResult {
  seed: number;
  params: ParamValues;
  fields: FieldExploreState[];
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
  };
}

function diffuseDirection(rng: () => number): number {
  const x = rng();
  if (x < 0.42) return intInc(rng, 0, 34);
  if (x < 0.68) return intInc(rng, 150, 210);
  if (x < 0.84) return intInc(rng, 330, 360);
  return intInc(rng, 0, 360);
}

function sliceDirection(rng: () => number): number {
  const x = rng();
  if (x < 0.5) return intInc(rng, 0, 40);
  if (x < 0.8) return intInc(rng, 150, 210);
  return intInc(rng, 0, 360);
}

function diffuseParams(rng: () => number, current: ParamValues): ParamValues {
  return {
    ...current,
    fragment: intInc(rng, 28, 50),
    spread: intInc(rng, 55, 80),
    overlap: intInc(rng, 28, 52),
    rhythm: intInc(rng, 16, 36),
    speed: stepped(rng, 0.55, 0.95, 0.05),
    direction: diffuseDirection(rng),
  };
}

function sliceParams(rng: () => number, current: ParamValues): ParamValues {
  return {
    ...current,
    fragment: intInc(rng, 32, 44),
    spread: intInc(rng, 48, 78),
    overlap: intInc(rng, 16, 45),
    rhythm: intInc(rng, 12, 32),
    speed: stepped(rng, 0.5, 0.95, 0.05),
    direction: sliceDirection(rng),
  };
}

function randomiseFields(rng: () => number, fields: FieldExploreState[]): FieldExploreState[] {
  return fields.map((entry) => ({
    id: entry.id,
    field: {
      ...entry.field,
      density: intInc(rng, 38, 62),
      frequency: intInc(rng, 55, 88),
      scale: intInc(rng, 40, 70),
      complexity: intInc(rng, 28, 58),
      biasX: intInc(rng, 28, 72),
      biasY: intInc(rng, 28, 72),
      seed: intInc(rng, 1, 999),
    },
  }));
}

function phaseBands(behaviorId: string, treatment: string): Band[] {
  if (behaviorId === "bloom") {
    return [
      { w: 50, lo: 0.18, hi: 0.4 },
      { w: 30, lo: 0.4, hi: 0.55 },
      { w: 10, lo: 0.12, hi: 0.18 },
      { w: 10, lo: 0.55, hi: 0.68 },
    ];
  }
  if (treatment === "slice" || treatment === "drift") {
    return [
      { w: 55, lo: 0.12, hi: 0.32 },
      { w: 30, lo: 0.32, hi: 0.46 },
      { w: 15, lo: 0.08, hi: 0.12 },
    ];
  }
  return [
    { w: 60, lo: 0.28, hi: 0.52 },
    { w: 25, lo: 0.18, hi: 0.28 },
    { w: 15, lo: 0.52, hi: 0.62 },
  ];
}

function varyParams(rng: () => number, behaviorId: string, treatment: string, current: ParamValues): ParamValues {
  if (behaviorId === "bloom") return bloomParams(rng, current);
  if (treatment === "slice" || treatment === "drift") return sliceParams(rng, current);
  if (behaviorId === "shift") return diffuseParams(rng, current);
  return { ...current };
}

export function generateRandomisation(input: RandomiseInput): RandomiseResult {
  const rng = mulberry32(input.seed >>> 0);
  const treatment = input.treatment;
  const params = varyParams(rng, input.behaviorId, treatment, input.params);
  const fields = randomiseFields(rng, input.fields);
  const local = sampleBand(rng, phaseBands(input.behaviorId, treatment));
  const holdPhase = loopPhaseFromLocal(input.pairIndex, Math.max(1, input.pairCount), local);
  const graphicElapsed = holdPhase * Math.max(0.001, input.loopSeconds);
  return { seed: input.seed >>> 0, params, fields, holdPhase, graphicElapsed };
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
