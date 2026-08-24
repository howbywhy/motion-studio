/** Shared low-level compositing helpers used by every Shift expression:
 * reusable scratch canvases (so nothing allocates per-frame), a single
 * blur pass to feather a field in one draw call rather than blurring per
 * fragment, and an overscan-safe translate so shifting a full-frame layer
 * never exposes a transparent edge (the layer is magnified by exactly
 * enough to cover the offset, anchored at frame center — at zero offset
 * the scale is exactly 1, so this is free when nothing is moving). */

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function sizeCanvas(c: HTMLCanvasElement, width: number, height: number): void {
  if (c.width !== width || c.height !== height) {
    c.width = width;
    c.height = height;
  }
}

const scratchPool: Record<string, HTMLCanvasElement> = {};

/** Named scratch canvases so different expressions (or two roles within
 * one expression, e.g. "content" vs "mask") never clobber each other
 * mid-frame, while still avoiding per-frame allocation. */
export function getScratch(name: string, width: number, height: number): HTMLCanvasElement {
  let c = scratchPool[name];
  if (!c) {
    c = makeCanvas();
    scratchPool[name] = c;
  }
  sizeCanvas(c, width, height);
  return c;
}

export function drawOverscanTranslated(
  ctx: CanvasRenderingContext2D,
  layer: CanvasImageSource,
  width: number,
  height: number,
  dx: number,
  dy: number,
  alpha: number
): void {
  if (alpha <= 0.003) return;
  const scale = 1 + 2 * Math.max(Math.abs(dx) / width, Math.abs(dy) / height) * 1.08;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (scale > 1.0005) {
    ctx.translate(width / 2 + dx, height / 2 + dy);
    ctx.scale(scale, scale);
    ctx.drawImage(layer, -width / 2, -height / 2);
  } else {
    ctx.drawImage(layer, dx, dy);
  }
  ctx.restore();
}

/** Draws `source` into `targetCtx` with a single blur pass — the one place
 * every expression softens its fragment/field edges, so there is exactly
 * one feathering knob (blur radius) shared across all three rather than
 * each reinventing its own softening. */
export function blurInto(targetCtx: CanvasRenderingContext2D, source: CanvasImageSource, blurPx: number): void {
  targetCtx.save();
  targetCtx.filter = blurPx > 0.4 ? `blur(${blurPx}px)` : "none";
  targetCtx.drawImage(source, 0, 0);
  targetCtx.filter = "none";
  targetCtx.restore();
}
