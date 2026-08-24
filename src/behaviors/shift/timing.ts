import type { ParamValues } from "../../core/types";

/** The shared choreography engine for every Shift expression: a photograph
 * is WHOLE, then FRACTUREs apart into fragments that each independently
 * TRANSFORM (their own A<->B blend and, for some expressions, their own
 * spatial drift), then REASSEMBLE back to WHOLE. Concretely this is one
 * continuous "transform span" during which every fragment rises and falls
 * through its own bump of activity — early in the span only a few
 * fragments are active (fracture), the middle is where the most fragments
 * overlap in activity at once (maximum transformation), and the tail has
 * only a few stragglers left (reassembly) — WHOLE/FRACTURE/TRANSFORM/
 * REASSEMBLE are not separate hard-coded phases, they're what the
 * distributed fragment timings look like from a distance. */

export interface FragmentTiming {
  center: number; // 0..1, where in the transform span this fragment peaks
  width: number; // 0..1, how wide its own rise/fall bump is
}

export interface GlobalPhase {
  inTransform: boolean;
  localPhase: number; // 0..1 across the transform span; 0 while resting at WHOLE
}

const TRANSFORM_SPAN_SECONDS = 6.5; // base fracture->transform->reassemble duration at speed=1

export function computeGlobalPhase(time: number, params: ParamValues): GlobalPhase {
  const speed = Math.max(0.01, params.speed as number);
  const rhythm = Math.min(1, Math.max(0, (params.rhythm as number) / 100));
  // Rhythm also shapes how long the photograph rests, fully WHOLE, between
  // transformations: restful/spaced at low rhythm, almost continuously
  // unsettled at high rhythm.
  const holdSeconds = 2.4 * (1 - rhythm) + 0.2;
  const holdSpan = holdSeconds / speed;
  const transformSpan = TRANSFORM_SPAN_SECONDS / speed;
  const cycle = holdSpan + transformSpan;
  let t = time % cycle;
  if (t < 0) t += cycle;
  const inTransform = t >= holdSpan;
  const localPhase = inTransform ? (t - holdSpan) / transformSpan : 0;
  return { inTransform, localPhase };
}

function shuffledOrder(count: number, rand: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Spreads each fragment's peak moment across the transform span.
 * `spreadFrac` (0..1): 0 clusters every fragment's peak together (a single
 * unified beat — the whole photograph turns at once); 1 staggers them across
 * the full span (a genuine time-slice, fragments visibly out of sync with
 * each other). `rhythmFrac` (0..1) adds uneven, bursty clustering on top of
 * an otherwise even stagger — 0 is a smooth, evenly-paced sweep; 1 reads as
 * syncopated pulses. Fragment index i is normally assigned a SHUFFLED slot
 * (not independently random per fragment, so a handful never accidentally
 * clump into a dead zone with nothing active — see the earlier Shift's
 * post-mortem on this) so which piece moves first has no relation to its
 * position. `coherent` skips the shuffle, so index order IS slot order —
 * for a caller whose fragments are already laid out in a meaningful spatial
 * sequence (Slice's bands, stacked edge to edge), this turns the stagger
 * into a genuine directional sweep — one photographic moment unfolding
 * across space, like a strobe exposure — rather than scattered pieces
 * turning in a spatially arbitrary order. */
export function distributeFragmentTimings(
  count: number,
  spreadFrac: number,
  rhythmFrac: number,
  rand: () => number,
  coherent = false
): FragmentTiming[] {
  const order = coherent ? Array.from({ length: count }, (_, i) => i) : shuffledOrder(count, rand);
  const evenSlot = 1 / count;
  const timings: FragmentTiming[] = [];
  for (let i = 0; i < count; i++) {
    const slotIndex = order[i];
    const evenCenter = (slotIndex + 0.5) * evenSlot;
    const spreadCenter = 0.5 + (evenCenter - 0.5) * spreadFrac;
    const jitterMag = evenSlot * (0.2 + rhythmFrac * 1.3) * (0.35 + spreadFrac * 0.65);
    const jitter = (rand() - 0.5) * jitterMag;
    const center = Math.min(0.97, Math.max(0.03, spreadCenter + jitter));
    // Width is deliberately kept BELOW the actual spacing between adjacent
    // centers (evenSlot * spreadFrac) whenever spread is meaningfully above
    // zero — otherwise every fragment's bump overlaps every other one
    // almost entirely and the whole population reads as one synchronized
    // block instead of a staggered wave (this is what made an early SLICE
    // pass look like a single diagonal wipe instead of a time-slice).
    // At low spread the centers collapse toward each other anyway, so width
    // blends toward a fixed, moderate value instead of collapsing to zero.
    const spacing = evenSlot * spreadFrac;
    const spacingWidth = spacing * (0.3 + rand() * 0.22);
    const clusterWidth = evenSlot * (1.1 + rand() * 0.5);
    const width = Math.min(0.4, Math.max(0.045, (spacingWidth * spreadFrac + clusterWidth * (1 - spreadFrac)) * (1 - rhythmFrac * 0.3)));
    timings.push({ center, width });
  }
  return timings;
}

export function bumpEnvelope(localPhase: number, center: number, width: number): number {
  const u = (localPhase - center) / width;
  if (u <= -1 || u >= 1) return 0;
  return (Math.cos(u * Math.PI) + 1) / 2;
}

/** The envelope every expression should actually call: while resting at
 * WHOLE (outside the transform span), a fragment's phase is exactly zero
 * no matter where its own bump center happens to fall — without this
 * guard, a fragment whose center sits near the very start of the span
 * (localPhase 0, which is also what resting reports) reads as active while
 * "resting," so the photograph never actually settles. */
export function fragmentPhase(globalPhase: GlobalPhase, timing: FragmentTiming): number {
  if (!globalPhase.inTransform) return 0;
  return bumpEnvelope(globalPhase.localPhase, timing.center, timing.width);
}

/** Maps the single "Fragment" control (0..100) onto a continuum: few large
 * structural pieces at the low end, through band-like divisions, to fine
 * slices at the high end — deliberately not exposed as a flat "region
 * count" so the character, not just the quantity, changes across the
 * range. */
export function fragmentContinuum(fragment: number): { count: number; f: number } {
  const f = Math.min(1, Math.max(0, fragment / 100));
  const count = Math.round(2 + Math.pow(f, 1.3) * 22);
  return { count: Math.max(2, Math.min(24, count)), f };
}
