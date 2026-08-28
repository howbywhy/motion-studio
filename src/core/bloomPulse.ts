import { sequencePairs, type PairMapping } from "./sequence";

/**
 * Bloom Ping-pong samples a section of the existing pair-local Bloom
 * evolution. Loop mapping is untouched. This file is a pure function:
 * master phase → pair-local Bloom phase. No per-frame state.
 *
 * One pulse = Start → End → Start. Integer cycle counts land on Start
 * at both master 0 and master 1, so the loop seam is continuous.
 */

export const PULSE_RANGE_MIN = 0.03;
export const PULSE_START_DEFAULT = 0.35;
export const PULSE_END_DEFAULT = 0.6;
export const PULSE_CYCLES_DEFAULT = 1;
export const PULSE_CYCLES = [1, 2, 3, 4] as const;

export type PulseCycles = (typeof PULSE_CYCLES)[number];
export type PulseTurnaround = "linear" | "cosine";

/** Production turnaround: cosine eases the reverse so field velocity
 * does not hitch at Pulse Start. No Ease control. */
export const PULSE_TURNAROUND: PulseTurnaround = "cosine";

export interface BloomPulseSettings {
  start: number;
  end: number;
  cycles: PulseCycles;
}

export const DEFAULT_BLOOM_PULSE: BloomPulseSettings = {
  start: PULSE_START_DEFAULT,
  end: PULSE_END_DEFAULT,
  cycles: PULSE_CYCLES_DEFAULT,
};

function clamp01(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/** Master 1 wraps to 0 so integer cycle counts seam cleanly. */
export function wrap01(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  let x = phase % 1;
  if (x < 0) x += 1;
  if (x >= 1) return 0;
  return x;
}

export function clampPulseCycles(raw: unknown): PulseCycles {
  const n = Math.round(Number(raw));
  if (n === 2 || n === 3 || n === 4) return n;
  return 1;
}

export function clampPulseRange(start: unknown, end: unknown): { start: number; end: number } {
  let s = typeof start === "number" && Number.isFinite(start) ? start : PULSE_START_DEFAULT;
  let e = typeof end === "number" && Number.isFinite(end) ? end : PULSE_END_DEFAULT;
  s = Math.min(1 - PULSE_RANGE_MIN, Math.max(0, s));
  e = Math.min(1, Math.max(s + PULSE_RANGE_MIN, e));
  if (e > 1) {
    e = 1;
    s = Math.min(s, 1 - PULSE_RANGE_MIN);
  }
  return { start: s, end: e };
}

export function clampBloomPulse(
  raw: { start?: unknown; end?: unknown; cycles?: unknown } | null | undefined,
): BloomPulseSettings {
  const range = clampPulseRange(raw?.start, raw?.end);
  return { start: range.start, end: range.end, cycles: clampPulseCycles(raw?.cycles) };
}

/** Linear triangle 0 → 1 → 0 over one cycle. */
export function triangle01(masterPhase: number, cycles: number): number {
  const saw = wrap01(wrap01(masterPhase) * Math.max(1, cycles));
  return saw <= 0.5 ? saw * 2 : 2 - saw * 2;
}

function turnaroundUnit(tri: number, kind: PulseTurnaround): number {
  const t = clamp01(tri);
  if (kind === "linear") return t;
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/**
 * Derived Bloom pair-local phase. Boundaries equal existing Bloom at
 * those pair-local phases — same envelope, same fields, same seeds.
 */
export function bloomPulsePhase(
  masterPhase: number,
  start: number,
  end: number,
  cycles: number,
  turnaround: PulseTurnaround = PULSE_TURNAROUND,
): number {
  const range = clampPulseRange(start, end);
  const u = turnaroundUnit(triangle01(masterPhase, clampPulseCycles(cycles)), turnaround);
  return range.start + (range.end - range.start) * u;
}

/**
 * Ping-pong freezes on LOOP pair 0 (01→02) so the pulse stays inside
 * one Bloom event. Gallery order is never reversed.
 */
export function bloomPulsePairMapping(
  n: number,
  masterPhase: number,
  pulse: BloomPulseSettings,
  turnaround: PulseTurnaround = PULSE_TURNAROUND,
): PairMapping {
  if (n <= 0) {
    return { untreated: true, aIndex: 0, bIndex: 0, localPhase: 0, pairIndex: 0, pairCount: 0 };
  }
  if (n === 1) {
    return { untreated: true, aIndex: 0, bIndex: 0, localPhase: 0, pairIndex: 0, pairCount: 1 };
  }
  const pairs = sequencePairs(n, "loop");
  const [aIndex, bIndex] = pairs[0]!;
  const localPhase = bloomPulsePhase(masterPhase, pulse.start, pulse.end, pulse.cycles, turnaround);
  return {
    untreated: false,
    aIndex,
    bIndex,
    localPhase,
    pairIndex: 0,
    pairCount: pairs.length,
  };
}
