/** Registration has two callers with two languages:
 *
 *   Bloom's own Registration treatment still uses the original ink formula
 *   in this file (paintRegistrationInkContent) — black + tinted separations
 *   plus a faint halftone, confined to each field's ring. Unchanged.
 *
 *   The global Print layer is FIELD-informed: two related mark plates as
 *   alpha, occupancy from coarse luminance, small spatial disagreement.
 *   Paint is an image-derived tonal impression (local colour, slightly
 *   displaced), not a black overlay. Persistent base, then reactive tent.
 *
 * One product-facing Print toggle. No language selector. */
import { sampleAverageColor, type RGB } from "./media";
import { paintFieldPersistent, paintFieldReactive, prepareFieldPrintInk } from "./registrationFieldInk";


// --- shared halftone pattern + tint cache --------------------------------
// One implementation, reused by both callers so there is exactly one
// halftone tile and one tint sample per frame, however many places draw
// ink that frame.

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

let lastTint: RGB = { r: 150, g: 150, b: 150 };
let lastTintAt = 0;

/** The photograph's own average color, damped and re-sampled at most every
 * 400ms — sampling every frame is unnecessary and costs a getImageData. */
export function currentInkTint(bLayer: HTMLCanvasElement): RGB {
  const now = performance.now();
  if (now - lastTintAt > 400) {
    lastTintAt = now;
    const avg = sampleAverageColor(bLayer);
    lastTint = { r: avg.r * 0.62, g: avg.g * 0.62, b: avg.b * 0.62 };
  }
  return lastTint;
}

export interface InkBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Paints the raw, UNMASKED ink content — black separation + tinted
 * separation + halftone — clipped to `bbox`. The caller is responsible for
 * confining it to wherever "boundary" means for their own geometry (a
 * field's ring for Bloom, the reveal mask's own transition zone for the
 * global layer) via their own destination-in pass afterward; this function
 * only knows how to paint the ink itself, never how it gets masked. */
export function paintRegistrationInkContent(
  sctx: CanvasRenderingContext2D,
  tintScratch: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  bbox: InkBBox,
  off: number
): void {
  const tint = currentInkTint(bLayer);

  // Isolated color-separation pass, tinted from the media's own color —
  // built separately so it layers cleanly onto the black pass below rather
  // than multiplying into it (which crushes dark photo regions into a flat
  // black smudge with no visible structure).
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

  // Black separation: high-contrast grayscale B, offset — drawn at partial
  // alpha (not solid) so it reads as an ink layer, not a silhouette that
  // crushes everything beneath it to black.
  sctx.save();
  sctx.globalAlpha = 0.8;
  sctx.filter = "grayscale(1) contrast(1.55)";
  sctx.translate(off, -off * 0.4);
  sctx.drawImage(bLayer, 0, 0);
  sctx.filter = "none";
  sctx.restore();

  // Tinted color separation, offset the other way, layered on top — the
  // two half-transparent offset passes are what read as mis-registered
  // print, rather than either one alone.
  sctx.save();
  sctx.globalAlpha = 0.6;
  sctx.drawImage(tintScratch, bbox.x, bbox.y, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.restore();

  // A light halftone accent.
  sctx.save();
  sctx.globalAlpha = 0.22;
  sctx.fillStyle = getHalftonePattern(sctx);
  sctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.restore();

  sctx.restore();
}

// --- global (behavior-agnostic) registration post-process ---------------

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

/** Build FIELD registration plates and local tone maps from the composed
 * frame. Cached until still media changes; rebuilt every frame for live/video. */
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

/** The universal analogue of Bloom's per-field boundary ring: wherever ANY
 * behavior's own reveal mask (always computed every frame, regardless of
 * behavior — see MaskBehavior.renderMask) is transitioning rather than
 * fully settled at A or fully settled at B. A simple parabola (0 at
 * alpha=0 or alpha=1, peaking at alpha=0.5) computed at a small, fixed
 * resolution and upscaled on draw — cheap regardless of the actual canvas
 * size. */
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

/** Reactive peak strength — deliberately not exposed as a slider yet (a
 * binary visual-language decision). Matches Bloom's own Registration
 * treatment default (registrationAmount=40%) so the texture reads at the
 * same intensity as the treatment it's shared with, right at the moment a
 * region is most actively transitioning. */
export const REACTIVE_REGISTRATION_AMOUNT = 0.4;

/** Persistent base strength — roughly a quarter of the reactive peak, the
 * middle of the requested 20-30% range. Subtle enough to read as "this
 * photograph was printed, not rendered," never as a permanent glitch
 * filter sitting over an otherwise clean frame. */
export const BASE_REGISTRATION_AMOUNT = 0.1;

/** The persistent base layer: the same ink formula, painted across the
 * ENTIRE frame with no masking at all -- present at rest, present wherever
 * a region has already fully settled at A or B, present regardless of
 * whether any behavior is even active. This is what keeps Registration
 * from disappearing the instant nothing is transitioning; the reactive
 * layer (paintReactiveRegistration) then intensifies the same language on
 * top of this, it never has to reintroduce it from zero. */
export function paintPersistentRegistration(
  ctx: CanvasRenderingContext2D,
  _bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number,
  live = false,
): void {
  paintFieldPersistent(ctx, width, height, amount, live);
}

/** The reactive layer: the same ink formula, confined to wherever the
 * already-composed frame's reveal mask is transitioning -- layered ON TOP
 * of the persistent base (see Renderer.finalizeOutput), so activity makes
 * the same surface language more pronounced rather than switching to a
 * different effect. Draws directly onto `ctx` (source-over), on top of
 * whatever the persistent base already put there. */
export function paintReactiveRegistration(
  ctx: CanvasRenderingContext2D,
  _bLayer: HTMLCanvasElement,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number
): void {
  if (amount <= 0.001) return;
  const boundarySmall = buildBoundaryAlpha(maskLayer, width, height);
  paintFieldReactive(ctx, maskLayer, boundarySmall, width, height, amount);
}
