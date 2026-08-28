import type { TypeBlock, TypeState } from "./typeState";

export const TYPE_PAGE_MAX = 6;
/** Default Type presence occupies 20–70 of the master phase. */
export const SEQUENCE_START_DEFAULT = 0.2;
export const SEQUENCE_STOP_DEFAULT = 0.7;
export const SEQUENCE_WINDOW_MIN = 0.1;

export type TypeBeat = 1 | 2 | 3;
export const TYPE_BEATS = [1, 2, 3] as const;
export const TYPE_BEAT_DEFAULT: TypeBeat = 1;

export type TypePage = [TypeBlock, TypeBlock, TypeBlock];

export function cloneTypePage(page: TypePage): TypePage {
  return [{ ...page[0] }, { ...page[1] }, { ...page[2] }];
}

export function typePageCount(state: TypeState): number {
  const n = Array.isArray(state.pages) ? state.pages.length : 1;
  return Math.min(TYPE_PAGE_MAX, Math.max(1, n));
}

export function clampBeat(raw: unknown): TypeBeat {
  const n = Math.round(Number(raw));
  if (n === 2 || n === 3) return n;
  return 1;
}

/** Legacy Frame Hold → Beat. Off = 1×. On + ≤1.5 = 2×. On + >1.5 = 3×. */
export function migrateLegacyBeat(holdOn: unknown, holdLength: unknown): TypeBeat {
  if (holdOn !== true) return 1;
  const n = typeof holdLength === "number" && Number.isFinite(holdLength) ? holdLength : 2;
  if (n > 1.5) return 3;
  return 2;
}

export function clonePageBeats(beats: unknown, count: number): TypeBeat[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, count));
  const src = Array.isArray(beats) ? beats : [];
  const out: TypeBeat[] = [];
  for (let i = 0; i < n; i++) out.push(clampBeat(src[i]));
  return out;
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

function sum(xs: number[]): number {
  let n = 0;
  for (const x of xs) n += x;
  return n;
}

/** Relative Beat weights for every State. One State is a single 1× page. */
export function sequenceWeights(count: number, beats?: Array<number | TypeBeat>): number[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return [1];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(clampBeat(beats?.[i]));
  return out;
}

/**
 * Absolute master-phase cuts inside the presence window.
 * n States → n−1 cuts. The window is divided by Beat weights, then Stop.
 */
export function typePageCuts(
  count: number,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
  beats?: Array<number | TypeBeat>,
): number[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return [];
  const win = clampSequenceWindow(start, stop);
  const span = win.stop - win.start;
  const weights = sequenceWeights(n, beats);
  const W = sum(weights);
  const cuts: number[] = [];
  let cum = 0;
  for (let i = 0; i < n - 1; i++) {
    cum += weights[i]!;
    cuts.push(win.start + span * (cum / W));
  }
  return cuts;
}

/** Hard cuts from local phase + Beat. Meaningful while Type is present. */
export function typePageIndexAtPhase(
  phase: number,
  count: number,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
  beats?: Array<number | TypeBeat>,
): number {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return 0;
  const local = typeLocalPhase(phase, start, stop);
  const weights = sequenceWeights(n, beats);
  const W = sum(weights);
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += weights[i]!;
    if (local < cum / W) return i;
  }
  return n - 1;
}

export function typePageIndexForState(state: TypeState, phase: number): number {
  return typePageIndexAtPhase(
    phase,
    typePageCount(state),
    state.sequenceStart,
    state.sequenceStop,
    state.pageBeats,
  );
}

/**
 * Local 0–1 inside the currently active Type State's Beat duration.
 * Used by Subtitle cue sequencing. One-page documents use the full
 * Type Start→Stop window.
 */
export function typePageBeatLocal(state: TypeState, phase: number): number {
  const local = typeLocalPhase(phase, state.sequenceStart, state.sequenceStop);
  if (local < 0 || local >= 1) return 0;
  const n = typePageCount(state);
  if (n <= 1) return local;
  const weights = sequenceWeights(n, state.pageBeats);
  const i = typePageIndexForState(state, phase);
  const W = sum(weights);
  let startL = 0;
  for (let k = 0; k < i; k++) startL += weights[k]! / W;
  const endL = startL + weights[i]! / W;
  const span = endL - startL;
  if (!(span > 0)) return 0;
  const t = (local - startL) / span;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
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
