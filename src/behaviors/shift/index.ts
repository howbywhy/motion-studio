import type { MaskBehavior, ParamDef, ParamValues } from "../../core/types";
import { computeGlobalPhase } from "./timing";
import { buildSliceState, renderSliceComposite, renderSlicePhaseField, type SliceState } from "./slice";
import { buildDriftState, renderDriftComposite, renderDriftPhaseField, type DriftState } from "./drift";
import { buildDiffuseState, renderDiffuseComposite, renderDiffusePhaseField, type DiffuseState } from "./diffuse";

const expressionOptions = [
  { value: "slice", label: "Slice" },
  { value: "drift", label: "Drift" },
  { value: "diffuse", label: "Diffuse" },
];

const params: ParamDef[] = [
  { type: "range", key: "fragment", label: "Fragment", min: 0, max: 100, step: 1, default: 40 },
  { type: "range", key: "direction", label: "Direction", min: 0, max: 360, step: 1, default: 18, unit: "°" },
  { type: "range", key: "spread", label: "Spread", min: 0, max: 100, step: 1, default: 72, unit: "%" },
  { type: "range", key: "overlap", label: "Overlap", min: 0, max: 100, step: 1, default: 42, unit: "%" },
  { type: "range", key: "rhythm", label: "Rhythm", min: 0, max: 100, step: 1, default: 28, unit: "%" },
  { type: "range", key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, default: 0.8, unit: "×" },
  // Structural — not rendered in the generic sidebar panel; the UI gives
  // this its own segmented control (see visibleParams below), mirroring
  // how Bloom's own "treatment" select is handled.
  { type: "select", key: "treatment", label: "Expression", default: "slice", options: expressionOptions },
];

interface ShiftBehaviorState {
  mode: string;
  slice: SliceState | null;
  drift: DriftState | null;
  diffuse: DiffuseState | null;
}

function structuralSeed(p: ParamValues): number {
  const fragment = Math.round(p.fragment as number);
  const spread = Math.round(p.spread as number);
  const rhythm = Math.round(p.rhythm as number);
  return (fragment * 97 + spread * 257 + rhythm * 503 + 17) >>> 0;
}

export const shiftBehavior: MaskBehavior<ShiftBehaviorState> = {
  id: "shift",
  name: "Shift",
  index: "01",
  description: "A photograph fractures into fragments that each carry their own moment of A becoming B, then reassembles into one whole — transformation through fragmentation.",
  params,
  createState(p: ParamValues): ShiftBehaviorState {
    const mode = p.treatment as string;
    const fragment = p.fragment as number;
    const spread = p.spread as number;
    const rhythm = p.rhythm as number;
    return {
      mode,
      slice: mode === "slice" ? buildSliceState(fragment, spread, rhythm, structuralSeed(p)) : null,
      drift: mode === "drift" ? buildDriftState(fragment, spread, rhythm, structuralSeed(p)) : null,
      diffuse: mode === "diffuse" ? buildDiffuseState(fragment, structuralSeed(p)) : null,
    };
  },
  needsNewState(prev: ParamValues, next: ParamValues): boolean {
    if (prev.treatment !== next.treatment) return true;
    if (prev.fragment !== next.fragment) return true;
    // Direction/Spread/Rhythm are all applied live at render time for
    // Diffuse now (its density field is a single continuous thing, not N
    // independently-timed cells) — only Slice/Drift's fragment timings
    // need a rebuild when Spread/Rhythm change.
    if (next.treatment !== "diffuse" && (prev.spread !== next.spread || prev.rhythm !== next.rhythm)) return true;
    return false;
  },
  visibleParams(): ParamDef[] {
    return params.filter((d) => d.key !== "treatment");
  },
  renderMask(ctx, width, height, time, p, state): void {
    const globalPhase = computeGlobalPhase(time, p);
    const overlapFrac = Math.min(1, Math.max(0, (p.overlap as number) / 100));
    const spreadFrac = Math.min(1, Math.max(0, (p.spread as number) / 100));
    const rhythmFrac = Math.min(1, Math.max(0, (p.rhythm as number) / 100));
    const blurPx = 2 + overlapFrac * Math.min(width, height) * 0.03;
    const direction = p.direction as number;
    if (state.mode === "slice" && state.slice) {
      renderSlicePhaseField(ctx, width, height, direction, state.slice, globalPhase, blurPx);
    } else if (state.mode === "drift" && state.drift) {
      renderDriftPhaseField(ctx, width, height, state.drift, globalPhase, blurPx);
    } else if (state.mode === "diffuse" && state.diffuse) {
      // Deliberately a much gentler finishing blur than Slice/Drift use --
      // the granular breakup here comes from the noise field's own
      // resolution and contrast; a heavy blur pass would smooth that
      // graininess right back into a soft blob, which is exactly the look
      // this rebuild moved away from.
      renderDiffusePhaseField(ctx, width, height, state.diffuse, globalPhase, direction, spreadFrac, rhythmFrac, overlapFrac, blurPx * 0.25 + 1.5, time);
    }
  },
  renderComposite(ctx, aLayer, bLayer, maskLayer, _boundaryLayer, width, height, time, p, state): void {
    const globalPhase = computeGlobalPhase(time, p);
    const overlapFrac = Math.min(1, Math.max(0, (p.overlap as number) / 100));
    const blurPx = 2 + overlapFrac * Math.min(width, height) * 0.03;
    const direction = p.direction as number;

    if (state.mode === "slice" && state.slice) {
      renderSliceComposite(ctx, aLayer, bLayer, width, height, direction, state.slice, globalPhase, overlapFrac, blurPx);
      return;
    }
    if (state.mode === "drift" && state.drift) {
      renderDriftComposite(ctx, aLayer, bLayer, width, height, state.drift, globalPhase, direction, overlapFrac, blurPx);
      return;
    }
    if (state.mode === "diffuse" && state.diffuse) {
      renderDiffuseComposite(ctx, aLayer, bLayer, maskLayer, width, height, direction);
    }
  },
};
