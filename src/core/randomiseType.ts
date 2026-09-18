import { mulberry32 } from "./rng";
import { TYPE_ANCHORS, type TypeAnchor } from "./typeState";

/**
 * Curated Type block treatment randomisation — restrained, matching Bloom's
 * own randomise philosophy (core/randomise.ts). Reshuffles Type Size,
 * Weight, Tracking, and Position (anchor + fine offset) within tasteful
 * bounds. Never touches Copy, Style, Padding, Colour, or Blend — those are
 * authored decisions, not variations to shuffle, and Bloom's own
 * randomise.ts already documents that Typography stays untouched by that
 * button specifically; this is a separate, Type-scoped action.
 */
export interface TypeRandomiseResult {
  scale: number;
  weight: number;
  tracking: number;
  anchor: TypeAnchor;
  offsetX: number;
  offsetY: number;
}

function intInc(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function randomiseTypeBlock(seed: number): TypeRandomiseResult {
  const rng = mulberry32(seed >>> 0);
  const anchor = TYPE_ANCHORS[intInc(rng, 0, TYPE_ANCHORS.length - 1)]!;
  return {
    scale: intInc(rng, 52, 88),
    weight: Math.round(intInc(rng, 400, 700) / 10) * 10,
    tracking: intInc(rng, 8, 38),
    anchor,
    offsetX: intInc(rng, -12, 12),
    offsetY: intInc(rng, -12, 12),
  };
}
