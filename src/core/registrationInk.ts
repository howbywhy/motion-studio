/**
 * REGISTRATION GOLDEN MASTER
 * Visual behaviour approved against commit 728ff08.
 * Do not modify algorithm, constants, mask behaviour or compositing
 * as part of unrelated feature work.
 *
 * The ink formula is historical Bloom Registration
 * (`paintRegistrationInkContent`): a high-contrast grayscale impression
 * of B, a second impression tinted from B's average colour and offset
 * the other way, plus a faint 8px halftone tile.
 *
 * Product global Registration applies this ink on Bloom's sharp field
 * rings via `paintGoldenMasterRegistration` / `paintRegistrationSurface`.
 * Bloom composite stays Clean.
 *
 * Bloom treatment=registration remains a dormant saved-state path only.
 */
import { sampleAverageColor, type RGB } from "./media";

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
let lastTintKey = "";

/** Test hook only. Does not change the paint algorithm. */
export function resetRegistrationInkTintCache(): void {
  lastAvg = { r: 150, g: 150, b: 150 };
  lastTintKey = "";
  halftonePattern = null;
}

function tintCacheKey(bLayer: HTMLCanvasElement, sample: RGB): string {
  return `${bLayer.width}x${bLayer.height}:${sample.r | 0},${sample.g | 0},${sample.b | 0}`;
}

/**
 * The photograph's own average colour, scaled for the tinted separation.
 *
 * Sampling is deterministic at a given B layer: same pixels → same tint.
 * A previous 400ms `performance.now()` throttle let preview and export
 * disagree when one path reused a stale sample. The 12×12 average is
 * cheap; we still skip a second getImageData when the downsampled
 * average has not changed.
 */
export function currentInkTint(bLayer: HTMLCanvasElement, bw = false): RGB {
  const sample = sampleAverageColor(bLayer);
  const key = tintCacheKey(bLayer, sample);
  if (key !== lastTintKey) {
    lastTintKey = key;
    lastAvg = sample;
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

/** Historical Bloom Registration treatment default (registrationAmount=40%). */
export const BLOOM_REGISTRATION_AMOUNT = 0.4;

/** Retained so older eval hooks do not throw. Production is rings only. */
export type RegistrationStrategy = "tonal" | "offset" | "edge" | "rings" | "tent";
export function setRegistrationStrategy(_next: RegistrationStrategy): void {}
export function getRegistrationStrategy(): RegistrationStrategy {
  return "rings";
}
