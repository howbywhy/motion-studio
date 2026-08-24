import { EASINGS, EASING_OPTIONS, type EasingId } from "../core/easing";
import type { MaskBehavior, ParamDef, ParamValues } from "../core/types";

const params: ParamDef[] = [
  { type: "range", key: "slabCount", label: "Slab Count", min: 2, max: 12, step: 1, default: 5 },
  { type: "range", key: "slabWidth", label: "Slab Width", min: 20, max: 100, step: 1, default: 70, unit: "%" },
  { type: "range", key: "travelDistance", label: "Travel Distance", min: 0, max: 120, step: 1, default: 45, unit: "%" },
  { type: "range", key: "stagger", label: "Stagger", min: 0, max: 1.5, step: 0.01, default: 0.14, unit: "s" },
  { type: "range", key: "holdDuration", label: "Hold Duration", min: 0, max: 3, step: 0.05, default: 0.6, unit: "s" },
  {
    type: "select",
    key: "direction",
    label: "Direction",
    default: "vertical",
    options: [
      { value: "vertical", label: "Vertical columns" },
      { value: "horizontal", label: "Horizontal rows" },
    ],
  },
  {
    type: "select",
    key: "easing",
    label: "Easing",
    default: "easeInOutCubic",
    options: EASING_OPTIONS,
  },
  { type: "range", key: "edgeSoftness", label: "Edge Softness", min: 0, max: 100, step: 1, default: 8, unit: "%" },
  { type: "range", key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, default: 1, unit: "×" },
];

interface SlabsState {
  count: number;
}

/** Every third slab (by index) stays put as a compositional anchor; the
 * rest travel out, hold, and reassemble. Deterministic (index-driven, not
 * randomized) — this is meant to read as composed/architectural, not
 * glitchy or organic. */
function isAnchored(index: number): boolean {
  return index % 3 === 0;
}

function travelDirectionSign(index: number): number {
  return index % 2 === 0 ? 1 : -1;
}

export const slabsBehavior: MaskBehavior<SlabsState> = {
  id: "slabs",
  name: "Slabs",
  index: "01",
  description: "Hard geometric fragmentation — large rectangular regions travel, pause, and reassemble.",
  params,
  createState(p: ParamValues): SlabsState {
    return { count: Math.round(p.slabCount as number) };
  },
  needsNewState(prev: ParamValues, next: ParamValues): boolean {
    return prev.slabCount !== next.slabCount;
  },
  renderMask(ctx, width, height, time, p): void {
    const count = Math.max(1, Math.round(p.slabCount as number));
    const slabWidthFrac = (p.slabWidth as number) / 100;
    const travelFrac = (p.travelDistance as number) / 100;
    const stagger = p.stagger as number;
    const hold = p.holdDuration as number;
    const direction = p.direction as "vertical" | "horizontal";
    const easeFn = EASINGS[(p.easing as EasingId) ?? "linear"] ?? EASINGS.linear;
    const edgeSoftnessFrac = (p.edgeSoftness as number) / 100;
    const speed = Math.max(0.01, p.speed as number);

    const axisLen = direction === "vertical" ? width : height;
    const crossLen = direction === "vertical" ? height : width;

    const slot = axisLen / count;
    const slabSize = slot * slabWidthFrac;
    const travelAmount = axisLen * travelFrac;

    const travelTime = 0.9 / speed;
    const holdTime = hold / speed;
    const cycleDuration = 2 * travelTime + 2 * holdTime;

    const blurPx = edgeSoftnessFrac * Math.min(width, height) * 0.08;
    ctx.filter = blurPx > 0.5 ? `blur(${blurPx}px)` : "none";
    ctx.fillStyle = "#ffffff";

    for (let i = 0; i < count; i++) {
      const anchored = isAnchored(i);
      let travelPhase = 0;

      if (!anchored && cycleDuration > 0) {
        const delay = (i * stagger) / speed;
        let t = (time - delay) % cycleDuration;
        if (t < 0) t += cycleDuration;

        if (t < travelTime) {
          travelPhase = easeFn(t / travelTime);
        } else if (t < travelTime + holdTime) {
          travelPhase = 1;
        } else if (t < 2 * travelTime + holdTime) {
          travelPhase = 1 - easeFn((t - travelTime - holdTime) / travelTime);
        } else {
          travelPhase = 0;
        }
      }

      const offset = anchored ? 0 : travelDirectionSign(i) * travelAmount * travelPhase;
      const baseAxisPos = slot * i + (slot - slabSize) / 2;
      const axisPos = baseAxisPos + offset;

      if (direction === "vertical") {
        ctx.fillRect(axisPos, 0, slabSize, crossLen);
      } else {
        ctx.fillRect(0, axisPos, crossLen, slabSize);
      }
    }

    ctx.filter = "none";
  },
};
