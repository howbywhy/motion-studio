import type { MaskBehavior, ParamDef, ParamValues } from "../../core/types";
import { buildShiftState, resolveShiftRegions, type ResolvedRegion, type ShiftState } from "./regions";
import { renderShiftComposite, renderShiftMask } from "./render";

const params: ParamDef[] = [
  { type: "range", key: "regions", label: "Regions", min: 2, max: 6, step: 1, default: 3 },
  { type: "range", key: "displacement", label: "Displacement", min: 0, max: 100, step: 1, default: 35, unit: "%" },
  { type: "range", key: "asymmetry", label: "Asymmetry", min: 0, max: 100, step: 1, default: 65, unit: "%" },
  { type: "range", key: "hold", label: "Hold", min: 0, max: 4, step: 0.1, default: 1.6, unit: "s" },
  { type: "range", key: "edge", label: "Edge", min: 0, max: 100, step: 1, default: 16, unit: "%" },
  { type: "range", key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, default: 0.7, unit: "×" },
];

interface ShiftBehaviorState {
  regionCount: number;
  built: ShiftState | null; // lazily built on first renderMask call, once aLayer is available
}

// Resolved per-frame region values, cached the same way Bloom caches its
// fields: computed once in renderMask (which the renderer always calls
// first each frame) and reused by renderComposite, so both stay in sync
// and geometry/envelope math never runs twice in one frame.
let cachedResolved: ResolvedRegion[] = [];

export const shiftBehavior: MaskBehavior<ShiftBehaviorState> = {
  id: "shift",
  name: "Shift",
  index: "01",
  description: "A photograph experiencing spatial instability — large regions momentarily slip out of register, glimpsing a second image, before settling back to whole.",
  params,
  createState(p: ParamValues): ShiftBehaviorState {
    return { regionCount: Math.round(p.regions as number), built: null };
  },
  needsNewState(prev: ParamValues, next: ParamValues): boolean {
    return prev.regions !== next.regions;
  },
  renderMask(ctx, width, height, time, p, state, _bLayer, aLayer): void {
    if (!state.built) {
      state.built = buildShiftState(state.regionCount, aLayer);
    }
    cachedResolved = resolveShiftRegions(state.built, time, p);
    renderShiftMask(ctx, width, height, state.built, cachedResolved);
  },
  renderComposite(ctx, aLayer, bLayer, _maskLayer, _boundaryLayer, width, height, _time, p, state): void {
    if (!state.built) return; // renderMask always runs first each frame and builds this
    const edgeFrac = (p.edge as number) / 100;
    renderShiftComposite(ctx, aLayer, bLayer, width, height, state.built, cachedResolved, edgeFrac);
  },
};
