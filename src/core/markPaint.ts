import { paintFlickerGrammar } from "./endBehaviour";
import { MARK_EMBLEM, MARK_FILL_WHITE, MARK_STACKED, markPaths } from "./markAssets";
import { diagnosticsFrom, emptyMarkDiagnostics, markAligned, planMark, type MarkDiagnostics, type MarkPlan } from "./markPlan";
import { clampMarkState, type MarkState } from "./markState";

function fillPaths(ctx: CanvasRenderingContext2D, paths: Path2D[], fill: string): void {
  ctx.fillStyle = fill;
  for (const path of paths) ctx.fill(path);
}

/**
 * MADE BY stays at stacked origin. MADELEN translates in X only.
 * When madeLenX === 0 the two rows are the stacked SVG paths, unshifted.
 */
export function paintMarkLayer(ctx: CanvasRenderingContext2D, plan: MarkPlan, fill = MARK_FILL_WHITE): void {
  if (!plan.visible) return;
  const { layout } = plan;
  const paths = markPaths();
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.translate(layout.x, layout.y);
  ctx.scale(layout.s, layout.s);
  ctx.translate(layout.originX, 0);
  if (plan.kind === "emblem") {
    const fit = MARK_STACKED.width / MARK_EMBLEM.width;
    const emblemH = MARK_EMBLEM.height * fit;
    ctx.translate(0, (MARK_STACKED.height - emblemH) * 0.5);
    ctx.scale(fit, fit);
    fillPaths(ctx, paths.emblem, fill);
    ctx.restore();
    return;
  }
  fillPaths(ctx, paths.madeBy, fill);
  ctx.save();
  if (!markAligned(plan.madeLenX)) ctx.translate(plan.madeLenX, 0);
  fillPaths(ctx, paths.madeLen, fill);
  ctx.restore();
  ctx.restore();
}

export function paintMarkPlan(dest: CanvasRenderingContext2D, layer: HTMLCanvasElement, plan: MarkPlan): void {
  if (plan.visible) paintMarkLayer(dest, plan);
  if (plan.flicker > 0.02 && plan.bands.length > 0) {
    paintFlickerGrammar(dest, layer, plan.bands, "mark");
  }
}

export function applyMark(
  dest: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  state: MarkState | Partial<MarkState>,
  phase: number,
  loopSeconds: number,
): MarkDiagnostics {
  const clamped = clampMarkState(state);
  const plan = planMark(clamped, phase, layer.width, layer.height, loopSeconds);
  if (!plan.visible && plan.flicker <= 0.02) return emptyMarkDiagnostics();
  paintMarkLayer(dest, plan);
  if (plan.flicker > 0.02 && plan.bands.length > 0) {
    paintFlickerGrammar(dest, layer, plan.bands, "mark");
  }
  return diagnosticsFrom(plan);
}

export function markHidesType(state: MarkState | Partial<MarkState>, phase: number, width: number, height: number, loopSeconds: number): boolean {
  return planMark(state, phase, width, height, loopSeconds).hideType;
}

export function markYieldsEnd(state: MarkState | Partial<MarkState>, phase: number, width: number, height: number, loopSeconds: number): boolean {
  const plan = planMark(state, phase, width, height, loopSeconds);
  return plan.yieldEnd && (plan.visible || plan.flicker > 0.02);
}
