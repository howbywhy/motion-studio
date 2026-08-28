import type { TypeBlock, TypeState } from "./typeState";

export const TYPE_PAGE_MAX = 6;
export const SEQUENCE_SPEED_DEFAULT = 50;
/** Default Type presence occupies 20–70 of the master phase. */
export const SEQUENCE_START_DEFAULT = 0.2;
export const SEQUENCE_STOP_DEFAULT = 0.7;
export const SEQUENCE_WINDOW_MIN = 0.1;
/** Minimum local share of the presence window for one beat. Not exposed. */
export const SEQUENCE_MIN_BEAT_LOCAL = 0.10;
/** Minimum local remainder for the final frame before Stop. */
export const SEQUENCE_MIN_FINAL_LOCAL = 0.08;

export type TypePage = [TypeBlock, TypeBlock];

export function cloneTypePage(page: TypePage): TypePage {
  return [{ ...page[0] }, { ...page[1] }];
}

export function typePageCount(state: TypeState): number {
  const n = Array.isArray(state.pages) ? state.pages.length : 1;
  return Math.min(TYPE_PAGE_MAX, Math.max(1, n));
}

export function cloneFrameHolds(holds: boolean[] | undefined, count: number): boolean[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, count));
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) out.push(i < n - 1 && Array.isArray(holds) ? holds[i] === true : false);
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampSpeed(speed: number | undefined): number {
  if (typeof speed !== "number" || !Number.isFinite(speed)) return SEQUENCE_SPEED_DEFAULT;
  return Math.min(100, Math.max(0, speed));
}

/** Speed 50 is the default editorial pace. 0 = slow, 100 = fast. */
export function mapSequenceSpeed(speed: number, slow: number, mid: number, fast: number): number {
  const s = clampSpeed(speed) / 100;
  if (s <= 0.5) return lerp(slow, mid, s / 0.5);
  return lerp(mid, fast, (s - 0.5) / 0.5);
}

export function clampSequenceWindow(startRaw: unknown, stopRaw: unknown): { start: number; stop: number } {
  const hasStart = typeof startRaw === "number" && Number.isFinite(startRaw);
  const hasStop = typeof stopRaw === "number" && Number.isFinite(stopRaw);
  let start = hasStart ? startRaw : SEQUENCE_START_DEFAULT;
  let stop = hasStop ? stopRaw : SEQUENCE_STOP_DEFAULT;
  start = Math.min(1, Math.max(0, start));
  stop = Math.min(1, Math.max(0, stop));
  if (stop < start) {
    const swap = start;
    start = stop;
    stop = swap;
  }
  if (stop - start < SEQUENCE_WINDOW_MIN) {
    const mid = (start + stop) / 2;
    start = mid - SEQUENCE_WINDOW_MIN / 2;
    stop = mid + SEQUENCE_WINDOW_MIN / 2;
    if (start < 0) {
      start = 0;
      stop = SEQUENCE_WINDOW_MIN;
    }
    if (stop > 1) {
      stop = 1;
      start = 1 - SEQUENCE_WINDOW_MIN;
    }
  }
  return { start, stop };
}

/** Loop seam and invalid phase map to 0. */
export function masterPhase(phase: number): number {
  return !(phase > 0) || phase >= 1 ? 0 : phase;
}

/**
 * Local 0–1 inside the Type presence window.
 * Negative = before Start. >= 1 = at / after Stop.
 */
export function typeLocalPhase(
  phase: number,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
): number {
  const p = masterPhase(phase);
  const win = clampSequenceWindow(start, stop);
  const span = win.stop - win.start;
  if (!(span > 0)) return -1;
  return (p - win.start) / span;
}

/** Start inclusive, Stop exclusive. Master Off is handled by the caller. */
export function typeVisibleAtPhase(
  phase: number,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
): boolean {
  const local = typeLocalPhase(phase, start, stop);
  return local >= 0 && local < 1;
}

export function typeVisibleForState(state: TypeState, phase: number): boolean {
  if (!state.enabled) return false;
  return typeVisibleAtPhase(phase, state.sequenceStart, state.sequenceStop);
}

/** Local 0–1 inside the window when the final page is reached. Slow ≈ 0.90, default 0.60, fast 0.30. */
function sequenceDone(speed: number): number {
  return mapSequenceSpeed(speed, 0.9, 0.6, 0.3);
}

/** Beat weights for pre-final frames. Final frame is always 1 and is not in this list. */
export function preFinalBeatWeights(count: number, holds?: boolean[]): number[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return [];
  const w: number[] = [];
  for (let i = 0; i < n - 1; i++) w.push(holds?.[i] === true ? 2 : 1);
  return w;
}

/**
 * Local phase at which the final frame is reached.
 * Extra Frame Hold beats extend into the residual after Speed's `done`.
 * A hidden floor keeps six-frame sequences from flashing.
 */
export function sequenceLastCutLocal(
  count: number,
  speed: number = SEQUENCE_SPEED_DEFAULT,
  holds?: boolean[],
): number {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return 1;
  const weights = preFinalBeatWeights(n, holds);
  const nPre = weights.length;
  let W = 0;
  for (const b of weights) W += b;
  const extra = W - nPre;
  const base = sequenceDone(speed);
  let last = base + (1 - base) * (extra / (extra + 1));
  last = Math.max(last, W * SEQUENCE_MIN_BEAT_LOCAL);
  return Math.min(1 - SEQUENCE_MIN_FINAL_LOCAL, Math.max(SEQUENCE_MIN_BEAT_LOCAL, last));
}

/**
 * Absolute master-phase cuts inside the presence window.
 * Last cut is when the final page is reached — at or before Stop.
 */
export function typePageCuts(
  count: number,
  speed: number = SEQUENCE_SPEED_DEFAULT,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
  holds?: boolean[],
): number[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return [];
  const win = clampSequenceWindow(start, stop);
  const span = win.stop - win.start;
  const weights = preFinalBeatWeights(n, holds);
  let W = 0;
  for (const b of weights) W += b;
  const last = sequenceLastCutLocal(n, speed, holds);
  const cuts: number[] = [];
  let cum = 0;
  for (const b of weights) {
    cum += b;
    cuts.push(win.start + span * last * (cum / W));
  }
  return cuts;
}

/** Hard cuts from local phase + Speed + Frame Hold. Meaningful while Type is present. */
export function typePageIndexAtPhase(
  phase: number,
  count: number,
  speed: number = SEQUENCE_SPEED_DEFAULT,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
  holds?: boolean[],
): number {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return 0;
  const local = typeLocalPhase(phase, start, stop);
  const weights = preFinalBeatWeights(n, holds);
  let W = 0;
  for (const b of weights) W += b;
  const last = sequenceLastCutLocal(n, speed, holds);
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i]!;
    if (local < last * (cum / W)) return i;
  }
  return n - 1;
}

export function typePageIndexForState(state: TypeState, phase: number): number {
  return typePageIndexAtPhase(
    phase,
    typePageCount(state),
    state.sequenceSpeed,
    state.sequenceStart,
    state.sequenceStop,
    state.frameHolds,
  );
}

/**
 * Resolve Type for this master phase.
 * Master Off, or outside Start/Stop → enabled false (no paint).
 * One-page inside the window returns the same object.
 */
export function typeStateAtPhase(state: TypeState, phase: number): TypeState {
  if (!state.enabled) return state;
  if (!typeVisibleAtPhase(phase, state.sequenceStart, state.sequenceStop)) {
    return { ...state, enabled: false };
  }
  const n = typePageCount(state);
  if (n <= 1) return state;
  const i = typePageIndexForState(state, phase);
  const page = state.pages[i] ?? state.blocks;
  return { ...state, blocks: page };
}
