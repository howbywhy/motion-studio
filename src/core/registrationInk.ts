/** Registration: one product-facing global surface.
 *
 *   PRODUCT (global toggle) is the historical deployment's Registration
 *   layer — the same mechanism the approved preview showed with Bloom
 *   Clean + Registration ON:
 *     prepareFieldPrintInk (occupancy plates + local tone maps)
 *     → paintPersistent (full-frame, ~10%)
 *     → paintReactive (mask-transition tent, ~40%)
 *
 *   That is a continuous printed photographic impression, not Bloom's
 *   per-field ring treatment.
 *
 *   COMPAT: Bloom treatment=registration still uses ring-clipped
 *   `paintRegistrationInkContent` for old saved states.
 *
 *   Typography is a clean silhouette. Global Registration is applied
 *   after type, from plates prepared on the Bloom-only composed frame.
 *   There is no type-only registration path.
 */
import { sampleAverageColor, type RGB } from "./media";
import { paintFieldPersistent, paintFieldReactive, prepareFieldPrintInk } from "./registrationFieldInk";

// --- shared halftone pattern + tint cache --------------------------------
let halftonePattern: CanvasPattern | null = null;

export function getHalftonePattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (halftonePattern) return halftonePattern;
  const tile = document.createElement("canvas");
  tile.width = 8;
  tile.height = 8;
  const tctx = tile.getContext("2d")!;
  tctx.fillStyle = "#000000";
  tctx.beginPath();
  tctx.arc(2, 2, 2.1, 0, Math.PI * 2);
  tctx.arc(6, 6, 2.1, 0, Math.PI * 2);
  tctx.fill();
  halftonePattern = ctx.createPattern(tile, "repeat")!;
  return halftonePattern;
}

let lastAvg: RGB = { r: 150, g: 150, b: 150 };
let lastTintAt = 0;

/** The photograph's own average color, damped and re-sampled at most every
 * 400ms — sampling every frame is unnecessary and costs a getImageData. */
export function currentInkTint(bLayer: HTMLCanvasElement, bw = false): RGB {
  const now = performance.now();
  if (now - lastTintAt > 400) {
    lastTintAt = now;
    lastAvg = sampleAverageColor(bLayer);
  }
  const scaled = { r: lastAvg.r * 0.62, g: lastAvg.g * 0.62, b: lastAvg.b * 0.62 };
  if (!bw) return scaled;
  const y = scaled.r * 0.2126 + scaled.g * 0.7152 + scaled.b * 0.0722;
  return { r: y, g: y, b: y };
}

export interface InkBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Paints the raw, UNMASKED ink content — black separation + tinted
 * separation + halftone — clipped to `bbox`. The caller confines it to
 * Bloom field rings or the mask tent. */
export function paintRegistrationInkContent(
  sctx: CanvasRenderingContext2D,
  tintScratch: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  bbox: InkBBox,
  off: number,
  bw = false,
): void {
  const tint = currentInkTint(bLayer, bw);

  const tctx = tintScratch.getContext("2d")!;
  tctx.clearRect(bbox.x, bbox.y, bbox.w, bbox.h);
  tctx.save();
  tctx.beginPath();
  tctx.rect(bbox.x, bbox.y, bbox.w, bbox.h);
  tctx.clip();
  tctx.filter = "grayscale(1) contrast(1.3)";
  tctx.translate(-off, off * 0.4);
  tctx.drawImage(bLayer, 0, 0);
  tctx.filter = "none";
  tctx.globalCompositeOperation = "source-atop";
  tctx.fillStyle = `rgb(${tint.r | 0},${tint.g | 0},${tint.b | 0})`;
  tctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  tctx.restore();

  sctx.save();
  sctx.beginPath();
  sctx.rect(bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.clip();

  sctx.save();
  sctx.globalAlpha = 0.8;
  sctx.filter = "grayscale(1) contrast(1.55)";
  sctx.translate(off, -off * 0.4);
  sctx.drawImage(bLayer, 0, 0);
  sctx.filter = "none";
  sctx.restore();

  sctx.save();
  sctx.globalAlpha = 0.6;
  sctx.drawImage(tintScratch, bbox.x, bbox.y, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.restore();

  sctx.save();
  sctx.globalAlpha = 0.22;
  sctx.fillStyle = getHalftonePattern(sctx);
  sctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.restore();

  sctx.restore();
}

/** Historical Bloom Registration treatment default (registrationAmount=40%).
 *  Used by the dormant treatment=registration COMPAT path only. */
export const BLOOM_REGISTRATION_AMOUNT = 0.4;

/** Reactive peak — matches historical Bloom Registration treatment default. */
export const REACTIVE_REGISTRATION_AMOUNT = 0.4;

/** Persistent base — full-frame printed impression at rest (~20–30% of peak). */
export const BASE_REGISTRATION_AMOUNT = 0.1;

/** Retained so older eval hooks do not throw. Product global path is the
 *  historical persistent+reactive surface, not a strategy selector. */
export type RegistrationStrategy = "tonal" | "offset" | "edge" | "rings" | "tent";
export function setRegistrationStrategy(_next: RegistrationStrategy): void {}
export function getRegistrationStrategy(): RegistrationStrategy {
  return "rings";
}

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

let globalBoundarySmall: HTMLCanvasElement | null = null;
const BOUNDARY_SMALL_W = 200;

export function prepareGlobalPrintInk(
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  dpr = 1,
  composed?: HTMLCanvasElement,
  live = false,
  bw = false,
): void {
  prepareFieldPrintInk(composed ?? bLayer, width, height, dpr, live, bw);
}

function buildBoundaryAlpha(maskLayer: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (!globalBoundarySmall) globalBoundarySmall = makeCanvas();
  const smallW = BOUNDARY_SMALL_W;
  const smallH = Math.max(1, Math.round(smallW * (height / width)));
  sizeCanvas(globalBoundarySmall, smallW, smallH);
  const sctx = globalBoundarySmall.getContext("2d", { willReadFrequently: true })!;
  sctx.clearRect(0, 0, smallW, smallH);
  sctx.drawImage(maskLayer, 0, 0, smallW, smallH);
  const img = sctx.getImageData(0, 0, smallW, smallH);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const tent = 4 * a * (1 - a);
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = Math.round(tent * 255);
  }
  sctx.putImageData(img, 0, 0);
  return globalBoundarySmall;
}

export function paintPersistentRegistration(
  ctx: CanvasRenderingContext2D,
  _bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number,
): void {
  paintFieldPersistent(ctx, width, height, amount);
}

export function paintReactiveRegistration(
  ctx: CanvasRenderingContext2D,
  _bLayer: HTMLCanvasElement,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0.001) return;
  const boundarySmall = buildBoundaryAlpha(maskLayer, width, height);
  paintFieldReactive(ctx, maskLayer, boundarySmall, width, height, amount);
}

