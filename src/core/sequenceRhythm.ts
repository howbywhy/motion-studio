/**
 * Weighted sequence timing — one resolver for event-attached systems.
 *
 * MASTER TIME (do not route here):
 *   Global Type, MARK, Registration, End Behaviour, Pulse, master Duration.
 *
 * SEQUENCE TIME (this resolver):
 *   active source, Bloom pair-local phase, Loop Bloom variant,
 *   Sequence Type, Transition Flicker cuts, slot-local video,
 *   active sequence tile, Sequence Type active row.
 *
 * Equal weights are identical to floor(master * pairCount).
 * Duration belongs to the authored sequence state. Reorder moves it
 * with media and Sequence Type. Replace media leaves duration in place.
 */

import type { PairMapping, PlaybackMode } from "./sequence";

function clampMasterPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  return Math.min(1, Math.max(0, phase));
}

export const SEQUENCE_WEIGHT_DEFAULT = 1;
/** Technical floor when the loop can afford it. Shorter only if equal share is already tighter. */
export const SEQUENCE_SLOT_MIN_SECONDS = 0.5;
/** Product: every authored state shows its duration on the rhythm strip. */
export const SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE = true;
/** Sequence Type starts getting tight. Documented only — not a hard clamp. */
export const SEQUENCE_TYPE_READABILITY_SECONDS = 2;

export interface SequenceTiming {
  index: number;
  localPhase: number;
  startPhase: number;
  endPhase: number;
  normalizedDuration: number;
  durationSeconds: number;
  pairCount: number;
  untreated: boolean;
}

export interface SequenceSpan {
  start: number;
  end: number;
  share: number;
}

export type SequenceWeightChange =
  | { kind: "add" }
  | { kind: "remove"; index: number }
  | { kind: "resize" };

export function equalSequenceWeights(count: number): number[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  return Array.from({ length: n }, () => SEQUENCE_WEIGHT_DEFAULT);
}

export function clampSequenceWeights(raw: unknown, count: number): number[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (n <= 0) return [];
  const src = Array.isArray(raw) ? raw : [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const value = Number(src[i]);
    out.push(Number.isFinite(value) && value > 0 ? value : SEQUENCE_WEIGHT_DEFAULT);
  }
  return out;
}

export function sequenceWeightsEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function sequenceWeightsAreUniform(weights: readonly number[]): boolean {
  if (weights.length === 0) return true;
  const first = weights[0];
  return weights.every((w) => w === first);
}

export function sequenceWeightTotal(weights: readonly number[]): number {
  let sum = 0;
  for (const w of weights) sum += w;
  return sum;
}

export function minSlotSeconds(loopSeconds: number, count: number): number {
  const n = Math.max(1, count);
  const loop = Math.max(0.001, loopSeconds);
  const equal = loop / n;
  return Math.max(1 / 30, Math.min(SEQUENCE_SLOT_MIN_SECONDS, equal * 0.4));
}

export function minSequenceWeight(weights: readonly number[], loopSeconds: number): number {
  const n = Math.max(1, weights.length);
  const total = sequenceWeightTotal(weights);
  if (!(total > 0)) return SEQUENCE_WEIGHT_DEFAULT;
  return (minSlotSeconds(loopSeconds, n) / Math.max(0.001, loopSeconds)) * total;
}

export function sequenceSpans(weights: readonly number[]): SequenceSpan[] {
  const total = sequenceWeightTotal(weights);
  if (!(total > 0) || weights.length === 0) return [];
  let acc = 0;
  return weights.map((w, i) => {
    const share = w / total;
    const start = acc;
    acc += share;
    const end = i === weights.length - 1 ? 1 : acc;
    return { start, end, share };
  });
}

export function resolveSequenceTiming(
  masterPhase: number,
  weights: readonly number[],
  loopSeconds: number,
): SequenceTiming {
  const n = weights.length;
  const loop = Math.max(0.001, loopSeconds);
  if (n <= 0) {
    return {
      index: 0,
      localPhase: 0,
      startPhase: 0,
      endPhase: 1,
      normalizedDuration: 1,
      durationSeconds: loop,
      pairCount: 0,
      untreated: true,
    };
  }
  if (n === 1) {
    return {
      index: 0,
      localPhase: 0,
      startPhase: 0,
      endPhase: 1,
      normalizedDuration: 1,
      durationSeconds: loop,
      pairCount: 1,
      untreated: true,
    };
  }

  const p = clampMasterPhase(masterPhase);
  const spans = sequenceSpans(weights);
  if (p >= 1) {
    const last = spans[n - 1]!;
    return {
      index: n - 1,
      localPhase: 1,
      startPhase: last.start,
      endPhase: 1,
      normalizedDuration: last.share,
      durationSeconds: last.share * loop,
      pairCount: n,
      untreated: false,
    };
  }

  let index = 0;
  for (let i = 0; i < n; i++) {
    if (p < spans[i]!.end || i === n - 1) {
      index = i;
      break;
    }
  }
  const span = spans[index]!;
  const width = Math.max(1e-9, span.end - span.start);
  const localPhase = Math.min(1, Math.max(0, (p - span.start) / width));
  return {
    index,
    localPhase,
    startPhase: span.start,
    endPhase: span.end,
    normalizedDuration: span.share,
    durationSeconds: span.share * loop,
    pairCount: n,
    untreated: false,
  };
}

export function weightedPairMapping(
  sourceCount: number,
  masterPhase: number,
  _mode: PlaybackMode,
  weights: readonly number[],
  loopSeconds: number,
): PairMapping {
  const n = Math.max(0, sourceCount);
  const clamped = clampSequenceWeights(weights, n);
  const timing = resolveSequenceTiming(masterPhase, clamped, loopSeconds);
  if (timing.untreated || n < 2) {
    return {
      untreated: true,
      aIndex: 0,
      bIndex: 0,
      localPhase: 0,
      pairIndex: 0,
      pairCount: timing.pairCount,
      eventSeconds: timing.durationSeconds,
    };
  }
  const index = Math.min(n - 1, timing.index);
  return {
    untreated: false,
    aIndex: index,
    bIndex: (index + 1) % n,
    localPhase: timing.localPhase,
    pairIndex: index,
    pairCount: n,
    eventSeconds: timing.durationSeconds,
  };
}

export function applySequenceWeightChange(
  weights: readonly number[],
  count: number,
  change?: SequenceWeightChange,
): number[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  const next = weights.filter((w) => Number.isFinite(w) && w > 0);
  if (change?.kind === "remove") {
    const index = Math.round(change.index);
    if (index >= 0 && index < next.length) next.splice(index, 1);
  }
  if (change?.kind === "add" && next.length < n) {
    const mean = next.length ? sequenceWeightTotal(next) / next.length : SEQUENCE_WEIGHT_DEFAULT;
    while (next.length < n) next.push(mean);
  }
  while (next.length < n) next.push(SEQUENCE_WEIGHT_DEFAULT);
  if (next.length > n) next.length = n;
  return next.length ? next : equalSequenceWeights(n);
}

/** Transfer weight across the boundary between `left` and `left + 1`. Total is unchanged. */
export function transferSequenceWeight(
  weights: readonly number[],
  leftIndex: number,
  delta: number,
  loopSeconds: number,
): number[] {
  const next = weights.slice();
  const left = Math.round(leftIndex);
  const right = left + 1;
  if (left < 0 || right >= next.length) return next;
  const min = minSequenceWeight(next, loopSeconds);
  const pair = next[left]! + next[right]!;
  const maxLeft = pair - min;
  const nextLeft = Math.min(maxLeft, Math.max(min, next[left]! + delta));
  next[left] = nextLeft;
  next[right] = pair - nextLeft;
  return next;
}

export function resetSequenceWeights(count: number): number[] {
  return equalSequenceWeights(count);
}

/** Inverse of resolveSequenceTiming — local phase inside a slot → master phase. */
export function masterPhaseFromSlotLocal(
  pairIndex: number,
  local: number,
  weights: readonly number[],
): number {
  const n = weights.length;
  const t = Math.min(1, Math.max(0, local));
  if (n <= 1) return t;
  const spans = sequenceSpans(clampSequenceWeights(weights, n));
  const idx = Math.min(n - 1, Math.max(0, Math.round(pairIndex)));
  const span = spans[idx];
  if (!span) return t;
  const width = Math.max(1e-9, span.end - span.start);
  return Math.min(1, Math.max(0, span.start + t * width));
}

/** Slot-local video time. Shorter video holds the last frame. Never internally loops. */
export function sequenceVideoTime(
  localPhase: number,
  slotSeconds: number,
  videoDuration: number,
): number {
  const elapsed = Math.max(0, localPhase) * Math.max(0, slotSeconds);
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) return elapsed;
  const last = Math.max(0, videoDuration - 1 / 120);
  if (elapsed >= videoDuration) return last;
  return elapsed;
}

export function transitionCutsFromWeights(weights: readonly number[]): number[] {
  const spans = sequenceSpans(weights);
  if (spans.length < 2) return [];
  const cuts: number[] = [];
  for (let i = 0; i < spans.length - 1; i++) cuts.push(spans[i]!.end);
  return cuts;
}

let evalWeights: number[] | null = null;
const evalByOwner = new WeakMap<object, number[] | null>();

export function setEvalSequenceWeights(weights: number[] | null): void {
  evalWeights = weights ? weights.slice() : null;
}

export function bindEvalSequenceWeights(owner: object, weights: number[] | null): void {
  evalByOwner.set(owner, weights ? weights.slice() : null);
}

export function resolveEvalSequenceWeights(owner?: object): number[] | null {
  if (owner && evalByOwner.has(owner)) return evalByOwner.get(owner) ?? null;
  return evalWeights;
}
