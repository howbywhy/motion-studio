/** FIELD-informed global Registration.
 *
 * Coverage is derived from the photograph at low resolution: luminance,
 * edges, and a stable two-scale irregular grain — not a regular screen,
 * not per-frame noise, not black FIELD marks.
 *
 * Paint is a micro spatial slip of the photograph through that coverage,
 * so the impression is photographic information with imperfect ink, not a
 * clean displaced copy and not a colour filter.
 */
import { hash2 } from "../sources/field";

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
const SEED_A = 71;
const SEED_B = 88;

let lumaCanvas: HTMLCanvasElement | null = null;
let coverA: HTMLCanvasElement | null = null;
let coverB: HTMLCanvasElement | null = null;
let plateA: HTMLCanvasElement | null = null;
let plateB: HTMLCanvasElement | null = null;
let inkScratch: HTMLCanvasElement | null = null;
let toneScratch: HTMLCanvasElement | null = null;
let coverDataA: ImageData | null = null;
let coverDataB: ImageData | null = null;
let prepared = false;
let preparedW = 0;
let preparedH = 0;
let lastLivePrep = 0;

/** Retained so older eval hooks do not throw. Production has one surface. */
export type RegistrationStrategy = "tonal" | "offset" | "edge";
export function setRegistrationStrategy(_next: RegistrationStrategy): void {
  prepared = false;
}
export function getRegistrationStrategy(): RegistrationStrategy {
  return "edge";
}

function grain(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (d - b - c + a) * u * v;
}

function luma(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722;
}

function readLocal(source: HTMLCanvasElement): { data: Uint8ClampedArray; w: number; h: number } {
  if (!lumaCanvas) lumaCanvas = makeCanvas();
  const smallH = Math.max(1, Math.round(LUMA_W * (source.height / Math.max(1, source.width))));
  sizeCanvas(lumaCanvas, LUMA_W, smallH);
  const lctx = lumaCanvas.getContext("2d", { willReadFrequently: true })!;
  lctx.imageSmoothingEnabled = true;
  lctx.drawImage(source, 0, 0, LUMA_W, smallH);
  return { data: lctx.getImageData(0, 0, LUMA_W, smallH).data, w: LUMA_W, h: smallH };
}

function writeCoverage(
  local: { data: Uint8ClampedArray; w: number; h: number },
  canvas: HTMLCanvasElement,
  cache: ImageData | null,
  seed: number,
  mass: number,
): ImageData {
  const { data, w, h } = local;
  sizeCanvas(canvas, w, h);
  const ctx = canvas.getContext("2d")!;
  let img = cache;
  if (!img || img.width !== w || img.height !== h) img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const yv = luma(data, w, x, y) / 255;
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      const edge =
        (Math.abs(luma(data, w, x1, y) - luma(data, w, x0, y)) + Math.abs(luma(data, w, x, y1) - luma(data, w, x, y0))) /
        510;
      const mid = 4 * yv * (1 - yv);
      const shadow = yv < 0.07 ? yv / 0.07 : 1;
      const highlight = yv > 0.9 ? (1 - yv) / 0.1 : 1;
      const structure = Math.min(1, (1 - yv) * 0.38 + edge * 0.82 + mid * 0.2);
      const g1 = grain(x * 0.68, y * 0.68, seed);
      const g2 = grain(x * 2.05, y * 2.05, seed + 17);
      const irregular = 0.38 + 0.62 * (g1 * 0.58 + g2 * 0.42);
      const a = Math.min(0.8, (0.035 + structure * mass * irregular) * shadow * highlight);
      const i = (y * w + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return img;
}

function upscalePlate(src: HTMLCanvasElement, dest: HTMLCanvasElement, width: number, height: number): void {
  sizeCanvas(dest, width, height);
  const ctx = dest.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(src, 0, 0, width, height);
}

export function prepareFieldPrintInk(
  composed: HTMLCanvasElement,
  width: number,
  height: number,
  _dpr: number,
  live = false,
  _bw = false,
): void {
  if (live && prepared && preparedW === width && preparedH === height && performance.now() - lastLivePrep < 90) {
    return;
  }
  if (!coverA) coverA = makeCanvas();
  if (!coverB) coverB = makeCanvas();
  if (!plateA) plateA = makeCanvas();
  if (!plateB) plateB = makeCanvas();

  const local = readLocal(composed);
  coverDataA = writeCoverage(local, coverA, coverDataA, SEED_A, 0.92);
  coverDataB = writeCoverage(local, coverB, coverDataB, SEED_B, 0.62);
  upscalePlate(coverA, plateA, width, height);
  upscalePlate(coverB, plateB, width, height);
  prepared = true;
  preparedW = width;
  preparedH = height;
  lastLivePrep = live ? performance.now() : 0;
}

function blitPhotoPlate(
  dest: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  plate: HTMLCanvasElement,
  width: number,
  height: number,
  dx: number,
  dy: number,
  mix: number,
): void {
  if (mix <= 0.001) return;
  if (!toneScratch) toneScratch = makeCanvas();
  sizeCanvas(toneScratch, width, height);
  const tctx = toneScratch.getContext("2d")!;
  tctx.clearRect(0, 0, width, height);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(source, dx, dy);
  tctx.globalCompositeOperation = "destination-in";
  tctx.drawImage(plate, dx, dy);
  tctx.globalCompositeOperation = "source-over";
  dest.save();
  dest.globalAlpha = mix;
  dest.globalCompositeOperation = "source-over";
  dest.drawImage(toneScratch, 0, 0);
  dest.restore();
}

function offsetPx(amount: number, dpr: number, reactive: boolean): number {
  const css = reactive ? 1.8 + amount * 2.0 : 1.4 + amount * 4.2;
  return css * Math.max(1, dpr);
}

function blitPlates(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number,
  dpr: number,
  reactive: boolean,
): void {
  if (!prepared || !plateA || !plateB || preparedW !== width || preparedH !== height) return;
  const off = offsetPx(amount, dpr, reactive);
  const mixA = reactive ? 0.55 : 0.42;
  const mixB = reactive ? 0.38 : 0.26;
  blitPhotoPlate(ctx, source, plateA, width, height, off, -off * 0.35, mixA);
  blitPhotoPlate(ctx, source, plateB, width, height, -off, off * 0.35, mixB);
}

export function paintFieldPersistent(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number,
  dpr = 1,
): void {
  if (amount <= 0.001) return;
  if (!inkScratch) inkScratch = makeCanvas();
  sizeCanvas(inkScratch, width, height);
  const ictx = inkScratch.getContext("2d")!;
  ictx.clearRect(0, 0, width, height);
  blitPlates(ictx, source, width, height, amount, dpr, false);
  ctx.drawImage(inkScratch, 0, 0);
}

export function paintFieldReactive(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  boundarySmall: HTMLCanvasElement,
  width: number,
  height: number,
  amount: number,
  dpr = 1,
): void {
  if (amount <= 0.001) return;
  if (!inkScratch) inkScratch = makeCanvas();
  sizeCanvas(inkScratch, width, height);
  const ictx = inkScratch.getContext("2d")!;
  ictx.clearRect(0, 0, width, height);
  blitPlates(ictx, source, width, height, amount, dpr, true);

  ictx.save();
  ictx.globalCompositeOperation = "destination-in";
  ictx.globalAlpha = Math.min(1, amount * 1.35);
  ictx.imageSmoothingEnabled = true;
  ictx.drawImage(boundarySmall, 0, 0, boundarySmall.width, boundarySmall.height, 0, 0, width, height);
  ictx.globalCompositeOperation = "source-over";
  ictx.globalAlpha = 1;
  ictx.restore();
  ctx.drawImage(inkScratch, 0, 0);
}
