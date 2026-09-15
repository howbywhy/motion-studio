/**
 * Sequence state ownership — which slot the composition currently means.
 *
 * Derived from Bloom mask contribution (mean reveal alpha), sampled with
 * the canonical ownership field. Visible Bloom still uses A/C/B/D spatial
 * variation. Type follows the shared semantic mask, not each pair's
 * gesture coverage.
 *
 * Threshold is authored system behaviour. Not a control.
 */

export const BLOOM_OWNERSHIP_THRESHOLD = 0.5;
export const BLOOM_OWNERSHIP_SAMPLE_W = 160;

export type SequenceOwner = "A" | "B";

export interface BloomOwnershipLatch {
  pairIndex: number;
  localPhase: number;
  ownedB: boolean;
}

export interface BloomOwnership {
  owner: SequenceOwner;
  copyIndex: number;
  contribution: number;
  pairIndex: number;
  pairCount: number;
  localPhase: number;
  visibleContribution: number;
}

export function emptyBloomOwnershipLatch(): BloomOwnershipLatch {
  return { pairIndex: -1, localPhase: 0, ownedB: false };
}

export function emptyBloomOwnership(): BloomOwnership {
  return {
    owner: "A",
    copyIndex: 0,
    contribution: 0,
    pairIndex: 0,
    pairCount: 0,
    localPhase: 0,
    visibleContribution: 0,
  };
}

/** Envelope B resolve expansion on a downsampled mask. Same math as the visible settle. */
export function dilateMaskAlpha(data: Uint8ClampedArray, resolve: number): void {
  if (!(resolve >= 0.008)) return;
  const lo = (1 - resolve) * (1 - resolve) * 70;
  const hi = Math.min(255, lo + 52 + (1 - resolve) * 70);
  const span = Math.max(1, hi - lo);
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i]!;
    let t = (a - lo) / span;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    t = t * t * (3 - 2 * t);
    data[i] = Math.round(a + (255 - a) * t * (0.28 + 0.72 * resolve));
  }
}

/** Mean mask alpha in 0..1. Existing Bloom reveal, not luminance. */
export function coverageFromAlpha(data: ArrayLike<number>): number {
  const n = Math.floor(data.length / 4);
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 3; i < data.length; i += 4) sum += data[i] ?? 0;
  return sum / (n * 255);
}

export function sequenceCopyIndexForOwner(
  pairIndex: number,
  pairCount: number,
  owner: SequenceOwner,
): number {
  const n = Math.max(1, pairCount);
  const i = ((pairIndex % n) + n) % n;
  if (owner === "B") return (i + 1) % n;
  return i;
}

/**
 * Once B owns a pair, B stays owner until the pair changes or the
 * clock seeks backward inside the pair (HOLD / scrub / export rebase).
 */
export function advanceBloomOwnership(
  prev: BloomOwnershipLatch,
  pairIndex: number,
  pairCount: number,
  localPhase: number,
  contribution: number,
  threshold = BLOOM_OWNERSHIP_THRESHOLD,
): { latch: BloomOwnershipLatch; ownership: BloomOwnership } {
  const phase = Number.isFinite(localPhase) ? localPhase : 0;
  const cover = Number.isFinite(contribution) ? Math.min(1, Math.max(0, contribution)) : 0;
  const reset = prev.pairIndex !== pairIndex || phase + 1e-6 < prev.localPhase;
  const ownedB = !reset && prev.ownedB || cover >= threshold;
  const latch: BloomOwnershipLatch = { pairIndex, localPhase: phase, ownedB };
  const owner: SequenceOwner = ownedB ? "B" : "A";
  return {
    latch,
    ownership: {
      owner,
      copyIndex: sequenceCopyIndexForOwner(pairIndex, pairCount, owner),
      contribution: cover,
      pairIndex,
      pairCount,
      localPhase: phase,
      visibleContribution: 0,
    },
  };
}
