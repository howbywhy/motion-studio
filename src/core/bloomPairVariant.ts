import type { BloomFieldBias } from "../behaviors/bloom/fields";
import type { PlaybackMode } from "./sequence";

/**
 * Prevent perceptual repetition in Loop Bloom by assigning deterministic
 * spatial field variation to sequence positions while preserving the shared
 * Bloom temporal envelope.
 *
 * Production uses MEDIUM only. Pulse and non-Bloom behaviours receive no bias.
 * Variation belongs to sequence position, not asset identity.
 */

export const VARIANT_IDS = ["A", "C", "B", "D"] as const;
export type VariantId = (typeof VARIANT_IDS)[number];
export type VariantStrength = "current" | "low" | "medium" | "high";

/** Production Loop strength. Not a user control. */
export const LOOP_BLOOM_VARIANT_STRENGTH: VariantStrength = "medium";

const UNIT: Record<VariantId, BloomFieldBias> = {
  A: { phase: 0.4, originX: 0.022, originY: -0.012, coalesce: 0.055, direction: 0.12 },
  C: { phase: -0.48, originX: -0.016, originY: 0.024, coalesce: -0.07, direction: -0.14 },
  B: { phase: 0.62, originX: -0.024, originY: -0.02, coalesce: 0.09, direction: 0.18 },
  D: { phase: -0.32, originX: 0.02, originY: 0.018, coalesce: -0.045, direction: -0.16 },
};

const STRENGTH_SCALE: Record<VariantStrength, number> = {
  current: 0,
  low: 0.4,
  medium: 1,
  high: 1.75,
};

/** Eval-only override. `null` means production MEDIUM. */
let evalStrengthOverride: VariantStrength | null = null;

export function setEvalLoopBloomVariantStrength(strength: VariantStrength | null): void {
  evalStrengthOverride = strength;
}

export function getEvalLoopBloomVariantStrength(): VariantStrength | null {
  return evalStrengthOverride;
}

function minSameDistance(ids: readonly VariantId[]): number {
  const n = ids.length;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (ids[i] !== ids[j]) continue;
      const d = Math.min(j - i, n - (j - i));
      if (d < min) min = d;
    }
  }
  return min === Infinity ? n : min;
}

function hasCycleAdjacentDuplicate(ids: readonly VariantId[]): boolean {
  const n = ids.length;
  if (n < 2) return false;
  for (let i = 0; i < n; i++) {
    if (ids[i] === ids[(i + 1) % n]) return true;
  }
  return false;
}

/**
 * Authored A C B D, then a deterministic last-slot repair when the wrap
 * would repeat the first variant. Repeats are spaced as evenly as the
 * four-gesture bank allows. No randomness.
 */
export function variantSequence(pairCount: number): VariantId[] {
  const n = Math.max(0, Math.floor(pairCount));
  const bank = VARIANT_IDS;
  const out: VariantId[] = [];
  for (let i = 0; i < n; i++) out.push(bank[i % bank.length]!);
  if (n <= 1 || !hasCycleAdjacentDuplicate(out)) return out;

  const prev = out[n - 2]!;
  const first = out[0]!;
  let best = out[n - 1]!;
  let bestScore = -1;
  for (const cand of bank) {
    if (cand === first || cand === prev) continue;
    const trial = out.slice();
    trial[n - 1] = cand;
    if (hasCycleAdjacentDuplicate(trial)) continue;
    const score = minSameDistance(trial);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  out[n - 1] = best;
  return out;
}

export function variantIdForPair(pairIndex: number, pairCount = 0): VariantId {
  const seq = variantSequence(pairCount > 0 ? pairCount : pairIndex + 1);
  if (seq.length === 0) return VARIANT_IDS[0]!;
  const i = ((pairIndex % seq.length) + seq.length) % seq.length;
  return seq[i]!;
}

export function variantScale(strength: VariantStrength): number {
  return STRENGTH_SCALE[strength];
}

export function bloomFieldBiasForVariant(
  id: VariantId,
  strength: VariantStrength,
): BloomFieldBias | null {
  const scale = STRENGTH_SCALE[strength];
  if (scale <= 0) return null;
  const unit = UNIT[id];
  return {
    phase: unit.phase * scale,
    originX: unit.originX * scale,
    originY: unit.originY * scale,
    coalesce: unit.coalesce * scale,
    direction: unit.direction * scale,
  };
}

export function bloomFieldBiasForPair(
  pairIndex: number,
  strength: VariantStrength,
  pairCount = 0,
): BloomFieldBias | null {
  return bloomFieldBiasForVariant(variantIdForPair(pairIndex, pairCount), strength);
}

/**
 * Canonical ownership field. Currently identical to variant A.
 * Not "whatever occupies sequence position 01".
 */
export const CANONICAL_OWNERSHIP_VARIANT: VariantId = "A";

/**
 * Visible Bloom still uses the pair variant. Type ownership samples the
 * canonical field so semantic rhythm does not follow A/C/B/D coverage.
 */
export function loopBloomOwnershipBias(): BloomFieldBias | null {
  const strength = evalStrengthOverride ?? LOOP_BLOOM_VARIANT_STRENGTH;
  return bloomFieldBiasForVariant(CANONICAL_OWNERSHIP_VARIANT, strength);
}

/** Loop Bloom only. Pulse / other behaviours always identity. */
export function loopBloomRenderBias(
  behaviorId: string | undefined,
  playbackMode: PlaybackMode,
  pairIndex: number,
  pairCount: number,
): BloomFieldBias | null {
  if (behaviorId !== "bloom") return null;
  if (playbackMode !== "loop") return null;
  const strength = evalStrengthOverride ?? LOOP_BLOOM_VARIANT_STRENGTH;
  return bloomFieldBiasForPair(pairIndex, strength, pairCount);
}

export function formatBias(bias: BloomFieldBias | null): string {
  if (!bias) return "phase 0  origin 0,0  coal 0  dir 0";
  return `phase ${bias.phase.toFixed(3)}  origin ${bias.originX.toFixed(3)},${bias.originY.toFixed(3)}  coal ${bias.coalesce.toFixed(3)}  dir ${bias.direction.toFixed(3)}`;
}

export function sequenceMap(pairCount: number): string {
  const seq = variantSequence(pairCount);
  const parts = seq.map((id, i) => `p${i}→${id}`);
  if (seq.length > 0) parts.push(`wrap ${seq[seq.length - 1]}→${seq[0]}`);
  return parts.join("  ");
}

export const VARIANT_STRENGTHS: VariantStrength[] = ["current", "low", "medium", "high"];
