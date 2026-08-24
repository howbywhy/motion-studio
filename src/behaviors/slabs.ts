// PRESERVED, UNREGISTERED: this was the original "01" behavior — visible
// rectangular regions that travel and reassemble. It read as tiles/
// venetian-blinds/a transition preset rather than a photographic effect,
// so it's been replaced in the registry (src/behaviors/index.ts) by
// "Shift" (./shift/), which keeps the same fragment -> displace -> reveal
// -> reconstruct idea but expresses it as spatial registration shift
// instead of moving boxes. Kept here, intact and importable, in case
// Shift doesn't hold up and this needs to come back — re-add
// `slabsBehavior` to the BEHAVIORS array in index.ts to restore it.
import { EASINGS, EASING_OPTIONS, type EasingId } from "../core/easing";
import { mulberry32 } from "../core/rng";
import type { MaskBehavior, ParamDef, ParamValues } from "../core/types";

const params: ParamDef[] = [
  { type: "range", key: "slabCount", label: "Slab Count", min: 4, max: 14, step: 1, default: 7 },
  { type: "range", key: "slabCoverage", label: "Slab Coverage", min: 40, max: 100, step: 1, default: 92, unit: "%" },
  { type: "range", key: "travelRange", label: "Travel Range", min: 0, max: 140, step: 1, default: 55, unit: "%" },
  { type: "range", key: "stagger", label: "Stagger", min: 0, max: 2.5, step: 0.01, default: 0.4, unit: "s" },
  { type: "range", key: "holdDuration", label: "Hold Duration", min: 0, max: 3, step: 0.05, default: 0.8, unit: "s" },
  {
    type: "select",
    key: "easing",
    label: "Easing",
    default: "easeInOutCubic",
    options: EASING_OPTIONS,
  },
  { type: "range", key: "edgeSoftness", label: "Edge Softness", min: 0, max: 100, step: 1, default: 10, unit: "%" },
  { type: "range", key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, default: 1, unit: "×" },
];

interface SlabRegion {
  rx: number; // rest rect, normalized 0..1 — a leaf of a recursive asymmetric
  ry: number; // partition of the frame, so at full coverage/rest every
  rw: number; // region's edges meet exactly with no gap: the "reconstructed"
  rh: number; // image.
  anchored: boolean;
  travelAxis: "x" | "y";
  travelSign: 1 | -1;
  travelMul: number; // per-region travel scale — this is what makes some
  // regions barely move and others overshoot well past the frame edge.
  delayFrac: number; // 0..1 — how long this region waits before it starts
  // leaving the reconstructed state, relative to the others. Departures are
  // staggered by this; returns are always synchronized (see renderMask).
}

interface SlabsState {
  count: number;
  regions: SlabRegion[];
}

/** Recursively splits the unit square into `count` asymmetric rectangles
 * (always splitting the current largest cell, along its longer side, at a
 * randomized off-center ratio). This is what gives Slabs varied widths and
 * asymmetric placement instead of an evenly spaced grid — closer to a
 * Mondrian-style architectural partition than a set of columns. */
function partition(count: number, rand: () => number): { x: number; y: number; w: number; h: number }[] {
  let cells = [{ x: 0, y: 0, w: 1, h: 1 }];
  while (cells.length < count) {
    let idx = 0;
    let bestArea = -1;
    for (let i = 0; i < cells.length; i++) {
      const area = cells[i].w * cells[i].h;
      if (area > bestArea) {
        bestArea = area;
        idx = i;
      }
    }
    const c = cells[idx];
    const ratio = 0.28 + rand() * 0.44; // 0.28..0.72 — asymmetric, never a plain half-split
    const splitVertical = c.w >= c.h;
    let a: { x: number; y: number; w: number; h: number };
    let b: { x: number; y: number; w: number; h: number };
    if (splitVertical) {
      const w1 = c.w * ratio;
      a = { x: c.x, y: c.y, w: w1, h: c.h };
      b = { x: c.x + w1, y: c.y, w: c.w - w1, h: c.h };
    } else {
      const h1 = c.h * ratio;
      a = { x: c.x, y: c.y, w: c.w, h: h1 };
      b = { x: c.x, y: c.y + h1, w: c.w, h: c.h - h1 };
    }
    cells.splice(idx, 1, a, b);
  }
  return cells;
}

function buildRegions(count: number): SlabRegion[] {
  const rand = mulberry32(count * 2654435761 + 12345);
  return partition(count, rand).map((c) => {
    const anchored = rand() < 0.26;
    const travelAxis: "x" | "y" = rand() < 0.5 ? "x" : "y";
    const travelSign: 1 | -1 = rand() < 0.5 ? 1 : -1;
    const overshoot = rand() < 0.22;
    const travelMul = (0.35 + rand() * 0.65) * (overshoot ? 1.35 + rand() * 0.55 : 1);
    const delayFrac = rand();
    return { rx: c.x, ry: c.y, rw: c.w, rh: c.h, anchored, travelAxis, travelSign, travelMul, delayFrac };
  });
}

export const slabsBehavior: MaskBehavior<SlabsState> = {
  id: "slabs",
  name: "Slabs",
  index: "01",
  description: "Independent image planes fragment, displace, and reassemble — fragment, displacement, hold, reconstruction.",
  params,
  createState(p: ParamValues): SlabsState {
    const count = Math.round(p.slabCount as number);
    return { count, regions: buildRegions(count) };
  },
  needsNewState(prev: ParamValues, next: ParamValues): boolean {
    return prev.slabCount !== next.slabCount;
  },
  renderMask(ctx, width, height, time, p, state): void {
    const coverage = (p.slabCoverage as number) / 100;
    const travelRangeFrac = (p.travelRange as number) / 100;
    const staggerSpread = p.stagger as number;
    const hold = p.holdDuration as number;
    const easeFn = EASINGS[(p.easing as EasingId) ?? "linear"] ?? EASINGS.linear;
    const edgeSoftnessFrac = (p.edgeSoftness as number) / 100;
    const speed = Math.max(0.01, p.speed as number);

    const travelTime = 0.9 / speed;
    const holdRest = hold / speed; // shared hold — every region is home at once here
    const holdDisplaced = hold / speed; // base pause budget once fully displaced
    const awaySegment = 2 * travelTime + holdDisplaced; // out + pause + back
    const cycleDuration = holdRest + awaySegment;
    // Departures are staggered by up to this much (clamped so travel-out and
    // travel-back always keep a real duration) — but every region's return
    // trip lands exactly at the end of awaySegment regardless of its delay,
    // so the reconstructed moment is always a single shared beat, not a
    // fuzzy window.
    const maxDelay = Math.min(staggerSpread, holdDisplaced * 0.9);
    // Travel scales with each region's OWN extent along its travel axis,
    // not a flat pixel budget — a large region needs to move several times
    // its own width/height to visibly clear its slot, while a small region
    // needs far less. Without this, big regions barely read as moving.
    const travelOwnSizeMul = 0.6 + travelRangeFrac * 1.8;

    const blurPx = edgeSoftnessFrac * Math.min(width, height) * 0.05;
    ctx.filter = blurPx > 0.5 ? `blur(${blurPx}px)` : "none";
    ctx.fillStyle = "#ffffff";

    for (const region of state.regions) {
      const rx = region.rx * width;
      const ry = region.ry * height;
      const rw = region.rw * width;
      const rh = region.rh * height;
      const insetW = (rw * (1 - coverage)) / 2;
      const insetH = (rh * (1 - coverage)) / 2;
      const restX = rx + insetW;
      const restY = ry + insetH;
      const restW = rw - 2 * insetW;
      const restH = rh - 2 * insetH;

      let travelPhase = 0;
      if (!region.anchored && cycleDuration > 0) {
        let t = time % cycleDuration;
        if (t < 0) t += cycleDuration;

        if (t >= holdRest) {
          const localT = t - holdRest; // 0..awaySegment
          const delay = region.delayFrac * maxDelay;
          const returnStart = awaySegment - travelTime;

          if (localT < delay) {
            travelPhase = 0; // hasn't left yet
          } else if (localT < delay + travelTime) {
            travelPhase = easeFn((localT - delay) / travelTime);
          } else if (localT < returnStart) {
            travelPhase = 1; // held out, pause length shrinks with delay
          } else {
            travelPhase = 1 - easeFn((localT - returnStart) / travelTime);
          }
        }
      }

      const axisSize = region.travelAxis === "x" ? restW : restH;
      const travelAmt = axisSize * travelOwnSizeMul * region.travelMul * travelPhase;
      const dx = region.travelAxis === "x" ? region.travelSign * travelAmt : 0;
      const dy = region.travelAxis === "y" ? region.travelSign * travelAmt : 0;

      ctx.fillRect(restX + dx, restY + dy, restW, restH);
    }

    ctx.filter = "none";
  },
};
