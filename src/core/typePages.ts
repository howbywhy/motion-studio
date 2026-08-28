import type { TypeBlock, TypeState } from "./typeState";

export const TYPE_PAGE_MAX = 3;
export const SEQUENCE_SPEED_DEFAULT = 50;

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

/** Speed 50 matches the approved Type States cadence. 0 = slow, 100 = fast. */
export function mapSequenceSpeed(speed: number, slow: number, mid: number, fast: number): number {
  const s = clampSpeed(speed) / 100;
  if (s <= 0.5) return lerp(slow, mid, s / 0.5);
  return lerp(mid, fast, (s - 0.5) / 0.5);
}

/** Cut phases; final page is the remainder through Flicker. */
export function typePageCuts(count: number, speed: number = SEQUENCE_SPEED_DEFAULT): number[] {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return [];
  if (n === 2) return [mapSequenceSpeed(speed, 0.58, 0.42, 0.24)];
  return [
    mapSequenceSpeed(speed, 0.42, 0.3, 0.16),
    mapSequenceSpeed(speed, 0.7, 0.58, 0.34),
  ];
}

/** Hard cuts. Final page holds through Flicker. Phase 0 / wrap → page 01. */
export function typePageIndexAtPhase(
  phase: number,
  count: number,
  speed: number = SEQUENCE_SPEED_DEFAULT,
): number {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return 0;
  const p = !(phase > 0) || phase >= 1 ? 0 : phase;
  const cuts = typePageCuts(n, speed);
  for (let i = 0; i < cuts.length; i++) {
    if (p < cuts[i]!) return i;
  }
  return n - 1;
}

/**
 * One-page documents return the same object — production bypass.
 * Multi-page documents swap `blocks` to the page for this phase.
 */
export function typeStateAtPhase(state: TypeState, phase: number): TypeState {
  const n = typePageCount(state);
  if (n <= 1) return state;
  const i = typePageIndexAtPhase(phase, n, state.sequenceSpeed);
  const page = state.pages[i] ?? state.blocks;
  return { ...state, blocks: page };
}
