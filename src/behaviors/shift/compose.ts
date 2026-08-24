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

/** Like drawOverscanTranslated, but elongates the layer along the travel
 * direction (dx,dy) instead of scaling it isotropically — a piece that's
 * deforming between where it was and where it's going, not just sliding.
 * `stretchAmount` (>=0) is extra scale ADDED along the travel axis on top
 * of the overscan-safety scale (0 = plain translate); the perpendicular
 * axis only ever gets the safety scale, so this still never exposes a
 * transparent edge — it can only ever magnify existing pixels further. */
export function drawOverscanStretched(
  ctx: CanvasRenderingContext2D,
  layer: CanvasImageSource,
  width: number,
  height: number,
  dx: number,
  dy: number,
  stretchAmount: number,
  alpha: number
): void {
  if (alpha <= 0.003) return;
  const mag = Math.hypot(dx, dy);
  const angle = mag > 0.001 ? Math.atan2(dy, dx) : 0;
  const baseScale = 1 + 2 * Math.max(Math.abs(dx) / width, Math.abs(dy) / height) * 1.08;
  const alongScale = baseScale * (1 + Math.max(0, stretchAmount));
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(width / 2 + dx, height / 2 + dy);
  ctx.rotate(angle);
  ctx.scale(alongScale, baseScale);
  ctx.rotate(-angle);
  ctx.drawImage(layer, -width / 2, -height / 2);
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

const GRAIN_TILE = 220;
let grainTile: HTMLCanvasElement | null = null;

/** A small tileable field of per-pixel alpha noise (RGB is irrelevant —
 * this is only ever composited with destination-in, which multiplies the
 * *existing* alpha by this alpha and discards the color entirely). Built
 * once, reused forever: this is texture, not animation, so it doesn't need
 * to change frame to frame — it reads as grain because it's riding on top
 * of shapes that ARE moving every frame. */
function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = makeCanvas();
  c.width = GRAIN_TILE;
  c.height = GRAIN_TILE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = 150 + Math.floor(Math.random() * 105); // 150..255 -- never fully erases coverage
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Textures an already-painted alpha field (a mask, or any canvas whose
 * alpha channel matters more than its color) with photographic grain,
 * without touching a single pixel outside what's already covered — this
 * is what keeps a soft blurred edge from reading as a clean digital
 * gradient. Multiplies the existing alpha down by the grain tile's own
 * alpha (150-255 of 255), so it can only ever subtly roughen an edge, never
 * uniformly dim it — there's deliberately no intensity knob here: this is
 * texture, not a creative parameter. */
export function applyGrain(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const tile = getGrainTile();
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const pattern = ctx.createPattern(tile, "repeat")!;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
