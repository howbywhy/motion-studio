import type { TypeBlock, TypeState } from "./typeState";

export const TYPE_PAGE_MAX = 3;
export const SEQUENCE_SPEED_DEFAULT = 50;
/** Default Type sequence occupies 20–70 of the master phase. */
export const SEQUENCE_START_DEFAULT = 0.2;
export const SEQUENCE_STOP_DEFAULT = 0.7;
export const SEQUENCE_WINDOW_MIN = 0.1;

export type TypePage = [TypeBlock, TypeBlock];

export function cloneTypePage(page: TypePage): TypePage {
  return [{ ...page[0] }, { ...page[1] }];
}

export function typePageCount(state: TypeState): number {
  const n = Array.isArray(state.pages) ? state.pages.length : 1;
  return Math.min(TYPE_PAGE_MAX, Math.max(1, n));
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

/** Local 0–1 inside the window when the final page is reached. Slow ≈ 0.90, default 0.60, fast 0.30. */
function sequenceDone(speed: number): number {
  return mapSequenceSpeed(speed, 0.9, 0.6, 0.3);
}

/**
 * Absolute master-phase cuts inside the sequence window.
 * Last cut is when the final page is reached — at or before Stop.
 */
export function typePageCuts(
  count: number,
  speed: number = SEQUENCE_SPEED_DEFAULT,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
): number[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return [];
  const win = clampSequenceWindow(start, stop);
  const span = win.stop - win.start;
  const done = sequenceDone(speed);
  const cuts: number[] = [];
  for (let i = 1; i <= n - 1; i++) {
    const local = done * (i / (n - 1));
    cuts.push(win.start + span * local);
  }
  return cuts;
}

/** Hard cuts. Before Start → page 01. After Stop → last page. Phase 0 / wrap → page 01. */
export function typePageIndexAtPhase(
  phase: number,
  count: number,
  speed: number = SEQUENCE_SPEED_DEFAULT,
  start: number = SEQUENCE_START_DEFAULT,
  stop: number = SEQUENCE_STOP_DEFAULT,
): number {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return 0;
  const p = !(phase > 0) || phase >= 1 ? 0 : phase;
  const win = clampSequenceWindow(start, stop);
  if (p < win.start) return 0;
  if (p >= win.stop) return n - 1;
  const cuts = typePageCuts(n, speed, win.start, win.stop);
  for (let i = 0; i < cuts.length; i++) {
    if (p < cuts[i]!) return i;
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
  );
}

/**
 * One-page documents return the same object — production bypass.
 * Multi-page documents swap `blocks` to the page for this phase.
 */
export function typeStateAtPhase(state: TypeState, phase: number): TypeState {
  const n = typePageCount(state);
  if (n <= 1) return state;
  const i = typePageIndexForState(state, phase);
  const page = state.pages[i] ?? state.blocks;
  return { ...state, blocks: page };
}
