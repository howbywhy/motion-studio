/** FIELD-informed global Print.
 *
 * Related to FIELD as a source, not a duplicate of it:
 * occupancy is sampled from a heavily downsampled luminance of the
 * composed photograph (FIELD micro-structure averages out). Marks use a
 * neighbouring seed/domain and a finer internal frequency than the
 * default FIELD territory. Two plates disagree by offset, density and
 * a 1-cell period. The photograph stays put; only the graphic impressions
 * misalign.
 */
import { hash2, markCellPx } from "../sources/field";

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

const LUMA_W = 140;
/** Fine end of the FIELD frequency curve (~1.4 CSS px). */
const REG_FREQ_A = 82;
/** Neighbouring period — slight frequency disagreement, not a duplicate. */
const REG_FREQ_B = 74;
const SEED_A = 71;
const SEED_B = 88;

let lumaCanvas: HTMLCanvasElement | null = null;
let plateA: HTMLCanvasElement | null = null;
let plateB: HTMLCanvasElement | null = null;
let inkScratch: HTMLCanvasElement | null = null;
let stampData: ImageData | null = null;
let prepared = false;
let preparedW = 0;
let preparedH = 0;

function neighbor4(on: Uint8Array, cols: number, rows: number, x: number, y: number): number {
  let n = 0;
  if (x > 0 && on[y * cols + x - 1]) n++;
  if (x < cols - 1 && on[y * cols + x + 1]) n++;
  if (y > 0 && on[(y - 1) * cols + x]) n++;
  if (y < rows - 1 && on[(y + 1) * cols + x]) n++;
  return n;
}

function buildMarks(cols: number, rows: number, occ: Float32Array, seed: number): Uint8Array {
  const n = cols * rows;
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (hash2(i % cols, (i / cols) | 0, seed) < occ[i]!) on[i] = 1;
  }
  const next = new Uint8Array(n);
  next.set(on);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (on[i]) continue;
      if (neighbor4(on, cols, rows, x, y) !== 1) continue;
      if (hash2(x, y, seed + 17) < occ[i]! * 0.5) next[i] = 1;
    }
  }
  return next;
}

function stampMarks(canvas: HTMLCanvasElement, on: Uint8Array, cols: number, rows: number, cell: number): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  if (!stampData || stampData.width !== w || stampData.height !== h) {
    stampData = ctx.createImageData(w, h);
  } else {
    stampData.data.fill(0);
  }
  const d = stampData.data;
  for (let cy = 0; cy < rows; cy++) {
    const y0 = cy * cell;
    const y1 = Math.min(h, y0 + cell);
    for (let cx = 0; cx < cols; cx++) {
      if (!on[cy * cols + cx]) continue;
      const x0 = cx * cell;
      const x1 = Math.min(w, x0 + cell);
      for (let y = y0; y < y1; y++) {
        let o = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++) {
          d[o] = 0;
          d[o + 1] = 0;
          d[o + 2] = 0;
          d[o + 3] = 255;
          o += 4;
        }
      }
    }
  }
  ctx.putImageData(stampData, 0, 0);
}

function readLuma(source: HTMLCanvasElement): { data: Uint8ClampedArray; w: number; h: number } {
  if (!lumaCanvas) lumaCanvas = makeCanvas();
  const smallH = Math.max(1, Math.round(LUMA_W * (source.height / Math.max(1, source.width))));
  sizeCanvas(lumaCanvas, LUMA_W, smallH);
  const lctx = lumaCanvas.getContext("2d", { willReadFrequently: true })!;
  lctx.imageSmoothingEnabled = true;
  lctx.drawImage(source, 0, 0, LUMA_W, smallH);
  return { data: lctx.getImageData(0, 0, LUMA_W, smallH).data, w: LUMA_W, h: smallH };
}

function occupancyFromLuma(
  luma: { data: Uint8ClampedArray; w: number; h: number },
  cols: number,
  rows: number,
  scale: number,
): Float32Array {
  const occ = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(luma.h - 1, Math.floor(((y + 0.5) / rows) * luma.h));
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(luma.w - 1, Math.floor(((x + 0.5) / cols) * luma.w));
      const i = (sy * luma.w + sx) * 4;
      const yv = (luma.data[i]! * 0.2126 + luma.data[i + 1]! * 0.7152 + luma.data[i + 2]! * 0.0722) / 255;
      const dark = 1 - yv;
      // Quantize so video compression grain cannot reseed marks every frame.
      const raw = Math.min(0.62, 0.018 + dark * scale);
      occ[y * cols + x] = Math.round(raw * 40) / 40;
    }
  }
  return occ;
}

export function prepareFieldPrintInk(
  composed: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
): void {
  if (!plateA) plateA = makeCanvas();
  if (!plateB) plateB = makeCanvas();
  sizeCanvas(plateA, width, height);
  sizeCanvas(plateB, width, height);

  const cellA = markCellPx(REG_FREQ_A, dpr);
  const cellB = markCellPx(REG_FREQ_B, dpr);
  const colsA = Math.ceil(width / cellA);
  const rowsA = Math.ceil(height / cellA);
  const colsB = Math.ceil(width / cellB);
  const rowsB = Math.ceil(height / cellB);

  const luma = readLuma(composed);
  const occA = occupancyFromLuma(luma, colsA, rowsA, 0.2);
  const occB = occupancyFromLuma(luma, colsB, rowsB, 0.12);
  stampMarks(plateA, buildMarks(colsA, rowsA, occA, SEED_A), colsA, rowsA, cellA);
  stampMarks(plateB, buildMarks(colsB, rowsB, occB, SEED_B), colsB, rowsB, cellB);
  prepared = true;
  preparedW = width;
  preparedH = height;
}

function blitPlates(ctx: CanvasRenderingContext2D, width: number, height: number, off: number): void {
  if (!prepared || !plateA || !plateB || preparedW !== width || preparedH !== height) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(plateA, off, -off * 0.35);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(plateB, -off, off * 0.35);
  ctx.restore();
}

export function paintFieldPersistent(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0.001) return;
  if (!inkScratch) inkScratch = makeCanvas();
  sizeCanvas(inkScratch, width, height);
  const ictx = inkScratch.getContext("2d")!;
  ictx.clearRect(0, 0, width, height);
  blitPlates(ictx, width, height, 1 + amount * 4);
  ctx.save();
  ctx.globalAlpha = Math.min(0.26, amount * 2.4);
  ctx.drawImage(inkScratch, 0, 0);
  ctx.restore();
}

export function paintFieldReactive(
  ctx: CanvasRenderingContext2D,
  _maskLayer: HTMLCanvasElement,
  boundarySmall: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0.001) return;
  if (!inkScratch) inkScratch = makeCanvas();
  sizeCanvas(inkScratch, width, height);
  const ictx = inkScratch.getContext("2d")!;
  ictx.clearRect(0, 0, width, height);
  blitPlates(ictx, width, height, 2.2 + amount * 6);
  ictx.save();
  ictx.globalCompositeOperation = "destination-in";
  ictx.globalAlpha = amount;
  ictx.drawImage(boundarySmall, 0, 0, boundarySmall.width, boundarySmall.height, 0, 0, width, height);
  ictx.globalCompositeOperation = "source-over";
  ictx.globalAlpha = 1;
  ictx.restore();
  ctx.drawImage(inkScratch, 0, 0);
}
