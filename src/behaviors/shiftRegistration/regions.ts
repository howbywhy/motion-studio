import { mulberry32 } from "../../core/rng";
import type { ParamValues } from "../../core/types";
import { biasFractionTowardEdge, computeGradientProfiles } from "./imageAnalysis";

/** A single edge-to-edge division of the frame. Position and jog are all
 * normalized (0..1) so the geometry survives a resize untouched — the
 * pixel polygon is rebuilt fresh from these each frame. Regions are
 * defined purely by which side of each cut they fall on (see resolveCuts
 * in render.ts) — there is no separate "region rectangle" to desync from
 * the cuts, which is what guarantees full tiling with zero gaps. */
export interface Cut {
  orientation: "vertical" | "horizontal";
  pos: number; // 0..1 along the split axis
  hasJog: boolean;
  jogOffset: number; // 0..1, small
  jogAt: number; // 0..1 along the cross axis where the jog happens
  jogSpan: number; // 0..1, width of the jog transition
}

export interface ShiftRegion {
  dirAxis: "x" | "y"; // which axis this region's own content drifts along
  dirSign: 1 | -1;
  activeCenter: number; // 0..1 — where in the disruption window this region peaks
  activeWidth: number; // 0..1 — how wide its own rise/fall bump is
  peakMagnitude: number; // 0..1 — ceiling on both its offset and its B-reveal
  timeOffset: number; // 0..1 seeded jitter so repeat cycles don't feel mechanical
}

export interface ShiftState {
  cuts: Cut[];
  regions: ShiftRegion[];
}

/** Sequential BSP-style split — each cut divides whatever's left, always
 * along its longer side, at an asymmetric ratio. Positions are biased (not
 * dictated) toward wherever the source image already has a strong
 * luminance edge nearby, so a cut prefers to fall along a real
 * background/subject transition when there is one nearby. */
function buildCuts(count: number, rand: () => number, aLayer: CanvasImageSource | undefined): Cut[] {
  const profiles = aLayer ? computeGradientProfiles(aLayer) : null;
  const cuts: Cut[] = [];
  let bx0 = 0;
  let by0 = 0;
  let bx1 = 1;
  let by1 = 1;

  for (let i = 0; i < count - 1; i++) {
    const w = bx1 - bx0;
    const h = by1 - by0;
    // Mostly split the longer remaining side (keeps regions large and
    // roughly balanced), with occasional variety so it doesn't read as a
    // mechanical alternation.
    const orientation: Cut["orientation"] = rand() < 0.78 ? (w >= h ? "vertical" : "horizontal") : rand() < 0.5 ? "vertical" : "horizontal";

    const ratio = 0.34 + rand() * 0.32; // 0.34..0.66 of the remaining span — asymmetric, never a near-50/50 grid line
    let pos = orientation === "vertical" ? bx0 + w * ratio : by0 + h * ratio;

    if (profiles) {
      pos =
        orientation === "vertical"
          ? biasFractionTowardEdge(profiles.colScore, pos, bx0 + w * 0.15, bx1 - w * 0.15)
          : biasFractionTowardEdge(profiles.rowScore, pos, by0 + h * 0.15, by1 - h * 0.15);
    }

    const hasJog = rand() < 0.3;
    cuts.push({
      orientation,
      pos,
      hasJog,
      jogOffset: hasJog ? (0.03 + rand() * 0.05) * (rand() < 0.5 ? 1 : -1) : 0,
      jogAt: 0.32 + rand() * 0.36,
      jogSpan: 0.1 + rand() * 0.12,
    });

    if (orientation === "vertical") bx0 = pos;
    else by0 = pos;
  }

  return cuts;
}

/** A temporal order for the regions' beats: which region disturbs first,
 * second, and so on, independent of their spatial index. Shuffled per seed
 * so the "which one goes first" varies with region count without needing a
 * second RNG stream. */
function shuffledOrder(count: number, rand: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function buildRegions(count: number, rand: () => number): ShiftRegion[] {
  // Regions get a distinct time slot each, rather than independently random
  // centers — with only a handful of regions, fully independent placement
  // tends to cluster and produces one smooth swell instead of the brief's
  // "one region slips, second responds, first settles" propagating beats.
  // Slot width is exaggerated slightly beyond the bump width so consecutive
  // beats overlap only a little at their shoulders.
  const order = shuffledOrder(count, rand);
  const slot = 1 / count;
  const regions: ShiftRegion[] = [];
  for (let i = 0; i < count; i++) {
    const slotIndex = order[i];
    const jitter = (rand() - 0.5) * slot * 0.4;
    const activeCenter = Math.min(0.97, Math.max(0.03, (slotIndex + 0.5) * slot + jitter));
    const activeWidth = Math.min(0.3, Math.max(0.12, slot * (0.8 + rand() * 0.35)));
    regions.push({
      dirAxis: rand() < 0.5 ? "x" : "y",
      dirSign: rand() < 0.5 ? 1 : -1,
      activeCenter,
      activeWidth,
      peakMagnitude: 0.3 + rand() * 0.55,
      timeOffset: rand(),
    });
  }

  // Force the asymmetry the brief asks for explicitly, rather than leaving
  // it entirely to chance: one region stays essentially put, one moves
  // noticeably further than the rest.
  if (count >= 3) {
    const anchorIdx = Math.floor(rand() * count);
    let leadIdx = Math.floor(rand() * count);
    if (leadIdx === anchorIdx) leadIdx = (leadIdx + 1) % count;
    regions[anchorIdx].peakMagnitude *= 0.12;
    regions[leadIdx].peakMagnitude = Math.min(1, regions[leadIdx].peakMagnitude * 1.5 + 0.15);
  }

  return regions;
}

export function buildShiftState(regionCount: number, aLayer: CanvasImageSource | undefined): ShiftState {
  const count = Math.max(2, Math.min(6, Math.round(regionCount)));
  const seed = count * 2654435761 + 97;
  const cutsRand = mulberry32(seed);
  const regionsRand = mulberry32(seed + 104729);
  return {
    cuts: buildCuts(count, cutsRand, aLayer),
    regions: buildRegions(count, regionsRand),
  };
}

export interface ResolvedRegion {
  envelope: number; // 0..1 current activity — drives both offset and B-reveal
  offsetFrac: number; // signed, along region.dirAxis, as a fraction of that axis's dimension
}

const DISRUPTION_SPAN_SECONDS = 5.5;

/** The shared rhythm: a long WHOLE hold, then a single pass of staggered,
 * asymmetric activity across regions (never all at once), then back to
 * WHOLE. Every region reads this same clock, offset by its own seeded
 * timing so the disruption reads as propagating rather than synchronized. */
export function resolveShiftRegions(state: ShiftState, time: number, params: ParamValues): ResolvedRegion[] {
  const holdSeconds = params.hold as number;
  const speed = Math.max(0.01, params.speed as number);
  const displacementFrac = 0.03 + ((params.displacement as number) / 100) * 0.22;
  const asymmetryFrac = (params.asymmetry as number) / 100;

  const holdSpan = holdSeconds / speed;
  const disruptionSpan = DISRUPTION_SPAN_SECONDS / speed;
  const cycle = holdSpan + disruptionSpan;

  let t = time % cycle;
  if (t < 0) t += cycle;
  const inDisruption = t >= holdSpan;
  const localPhase = inDisruption ? (t - holdSpan) / disruptionSpan : 0;

  return state.regions.map((region) => {
    if (!inDisruption) return { envelope: 0, offsetFrac: 0 };

    const center = (region.activeCenter + region.timeOffset * 0.04) % 1;
    const u = (localPhase - center) / region.activeWidth;
    let bump = 0;
    if (u > -1 && u < 1) bump = (Math.cos(u * Math.PI) + 1) / 2;

    // Asymmetry sharpens the spread between a region's own magnitude and
    // the population average — at 0 every region behaves closer to
    // equally; at 100 the anchor/lead roles (and general seeded variance)
    // dominate.
    const magnitude = Math.pow(region.peakMagnitude, 1 + asymmetryFrac * 2.2);
    const envelope = bump * magnitude;

    return { envelope, offsetFrac: displacementFrac * envelope * region.dirSign };
  });
}
