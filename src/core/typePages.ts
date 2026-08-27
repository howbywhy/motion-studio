import type { TypeBlock, TypeState } from "./typeState";

export const TYPE_PAGE_MAX = 3;

export type TypePage = [TypeBlock, TypeBlock];

export function cloneTypePage(page: TypePage): TypePage {
  return [{ ...page[0] }, { ...page[1] }];
}

export function typePageCount(state: TypeState): number {
  const n = Array.isArray(state.pages) ? state.pages.length : 1;
  return Math.min(TYPE_PAGE_MAX, Math.max(1, n));
}

/** Hard cuts. Final page holds through Flicker. Phase 0 / wrap → page 01. */
export function typePageIndexAtPhase(phase: number, count: number): number {
  const n = Math.min(TYPE_PAGE_MAX, Math.max(1, Math.round(count)));
  if (n <= 1) return 0;
  const p = !(phase > 0) || phase >= 1 ? 0 : phase;
  if (n === 2) return p < 0.42 ? 0 : 1;
  if (p < 0.3) return 0;
  if (p < 0.58) return 1;
  return 2;
}

/**
 * One-page documents return the same object — production bypass.
 * Multi-page documents swap `blocks` to the page for this phase.
 */
export function typeStateAtPhase(state: TypeState, phase: number): TypeState {
  const n = typePageCount(state);
  if (n <= 1) return state;
  const i = typePageIndexAtPhase(phase, n);
  const page = state.pages[i] ?? state.blocks;
  return { ...state, blocks: page };
}
