import { paintFlickerGrammar } from "./endBehaviour";
import { MARK_EMBLEM, MARK_FILL_WHITE, MARK_LATERAL_DX, MARK_STACKED, markPaths } from "./markAssets";
import { diagnosticsFrom, emptyMarkDiagnostics, planMark, type MarkDiagnostics, type MarkPlan } from "./markPlan";
import { clampMarkState, type MarkState } from "./markState";

const GAP_PX = 36;

function fillPaths(ctx: CanvasRenderingContext2D, paths: Path2D[], fill: string): void {
  ctx.fillStyle = fill;
  for (const path of paths) ctx.fill(path);
}

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
  if (plan.kind === "emblem") {
    const fit = MARK_STACKED.width / MARK_EMBLEM.width;
    const emblemH = MARK_EMBLEM.height * fit;
    ctx.translate(0, (MARK_STACKED.height - emblemH) * 0.5);
    ctx.scale(fit, fit);
    fillPaths(ctx, paths.emblem, fill);
    ctx.restore();
    return;
  }
  const gap = plan.gap * GAP_PX;
  ctx.save();
  ctx.translate(0, -gap * 0.45);
  fillPaths(ctx, paths.madeBy, fill);
  ctx.restore();
  ctx.save();
  ctx.translate((1 - plan.travel) * MARK_LATERAL_DX, gap * 0.55);
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
