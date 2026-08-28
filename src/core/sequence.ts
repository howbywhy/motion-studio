import type { MediaAsset } from "./media";

export type PlaybackMode = "loop" | "pingpong";

/** One piece of material in the sequence. Transform and FIELD params
 * live on the asset itself — items do not share a composition. */
export interface SequenceItem {
  id: string;
  asset: MediaAsset;
}

export const LOOP_SECONDS_MIN = 2;
export const LOOP_SECONDS_MAX = 30;
export const LOOP_SECONDS_DEFAULT = 12;

export function clampLoopSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return LOOP_SECONDS_DEFAULT;
  return Math.min(LOOP_SECONDS_MAX, Math.max(LOOP_SECONDS_MIN, seconds));
}

export function loopPhaseFromElapsed(elapsed: number, loopSeconds: number): number {
  if (!Number.isFinite(elapsed) || !Number.isFinite(loopSeconds)) return 0;
  const period = Math.max(0.001, loopSeconds);
  let t = elapsed % period;
  if (t < 0) t += period;
  if (t >= period) return 0;
  return t / period;
}

export function clampLoopPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  return Math.min(1, Math.max(0, phase));
}

/**
 * Consecutive pairs along the sequence.
 *
 * Loop: 01/02, 02/03, …, n/01
 * Legacy Ping-pong (non-Bloom): walk 01→n then fold back n→01.
 * Bloom Ping-pong does not use this path — it freezes on LOOP pair 0
 * and remaps pair-local phase (see bloomPulse.ts).
 */
export function sequencePairs(n: number, mode: PlaybackMode): [number, number][] {
  if (n < 2) return [];
  if (mode === "loop") {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) pairs.push([i, (i + 1) % n]);
    return pairs;
  }
  const path: number[] = [];
  for (let i = 0; i < n; i++) path.push(i);
  for (let i = n - 2; i >= 1; i--) path.push(i);
  const pairs: [number, number][] = [];
  for (let i = 0; i < path.length; i++) {
    pairs.push([path[i]!, path[(i + 1) % path.length]!]);
  }
  return pairs;
}

export interface PairMapping {
  /** Fewer than two sources: draw untreated, no behaviour pair. */
  untreated: boolean;
  aIndex: number;
  bIndex: number;
  /** Behaviour-local 0..1 inside the current pair segment. */
  localPhase: number;
  pairIndex: number;
  pairCount: number;
}

export function resolveActivePair(
  n: number,
  loopPhase: number,
  mode: PlaybackMode,
): PairMapping {
  if (n <= 0) {
    return { untreated: true, aIndex: 0, bIndex: 0, localPhase: 0, pairIndex: 0, pairCount: 0 };
  }
  if (n === 1) {
    return { untreated: true, aIndex: 0, bIndex: 0, localPhase: 0, pairIndex: 0, pairCount: 1 };
  }
  const pairs = sequencePairs(n, mode);
  const p = clampLoopPhase(loopPhase);
  const pairCount = pairs.length;
  const scaled = p * pairCount;
  let pairIndex = Math.floor(scaled);
  if (pairIndex >= pairCount) pairIndex = pairCount - 1;
  const localPhase = Math.min(1, Math.max(0, scaled - pairIndex));
  const [aIndex, bIndex] = pairs[pairIndex]!;
  return { untreated: false, aIndex, bIndex, localPhase, pairIndex, pairCount };
}

export function moveIndex<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return next;
}
