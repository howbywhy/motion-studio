import type { ResolvedField } from "./fields";

function applyLobes(
  ctx: CanvasRenderingContext2D,
  field: ResolvedField,
  gradientFor: (lx: number, ly: number, lr: number) => CanvasGradient
): void {
  for (const lobe of field.lobes) {
    const lobeAngle = lobe.angle + field.rotation;
    const lobeDist = lobe.distFrac * field.radius;
    const lx = field.cx + Math.cos(lobeAngle) * lobeDist;
    const ly = field.cy + Math.sin(lobeAngle) * lobeDist;
    const lr = field.radius * lobe.radiusMul;

    ctx.fillStyle = gradientFor(lx, ly, lr);
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The reveal field: solid near each lobe's center out to `innerStop`, then
 * fading to transparent — exactly what CLEAN composites through. */
export function renderMaskFromFields(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fields: ResolvedField[],
  softnessFrac: number
): void {
  const minDim = Math.min(width, height);
  const extraBlur = (0.06 + softnessFrac * 0.5) * minDim * 0.028;
  ctx.filter = extraBlur > 0.5 ? `blur(${extraBlur}px)` : "none";
  ctx.globalCompositeOperation = "lighten";

  for (const field of fields) {
    if (field.radius <= 0 || field.alpha <= 0.002) continue;
    applyLobes(ctx, field, (lx, ly, lr) => {
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      const core = Math.min(0.97, field.innerStop);
      const mid = Math.min(0.99, core + (1 - core) * 0.48);
      g.addColorStop(0, `rgba(255,255,255,${field.alpha})`);
      g.addColorStop(core, `rgba(255,255,255,${field.alpha})`);
      g.addColorStop(mid, `rgba(255,255,255,${field.alpha * 0.34})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      return g;
    });
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
}

/** The boundary field: zero at each lobe's solid center AND zero past its
 * outer edge, peaking exactly midway through the same falloff zone the
 * mask itself fades through — so "boundary" means precisely "where the
 * reveal gradient is transitioning," derived from the identical geometry,
 * not a separately invented shape. Intensity tracks the field's own alpha,
 * so a dim/trough field has a dim/inactive boundary too. */
export function renderBoundaryFromFields(ctx: CanvasRenderingContext2D, fields: ResolvedField[]): void {
  ctx.globalCompositeOperation = "lighten";

  for (const field of fields) {
    if (field.radius <= 0 || field.alpha <= 0.002) continue;
    const ringPeak = field.innerStop + (1 - field.innerStop) * 0.5;
    applyLobes(ctx, field, (lx, ly, lr) => {
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(field.innerStop, "rgba(255,255,255,0)");
      g.addColorStop(ringPeak, `rgba(255,255,255,${field.alpha})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      return g;
    });
  }

  ctx.globalCompositeOperation = "source-over";
}
