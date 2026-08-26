/** FIELD-informed global Registration.
 *
 * Structure: two related binary mark plates, neighbouring seeds/frequencies,
 * occupancy from coarse luminance (and, in the production strategy, edges)
 * of the composed frame.
 *
 * Paint: a small spatial slip of the photograph itself through those plates —
 * neighbouring impressions, not a colour filter and not black ink.
 * The tonal-map path is retained only as debug strategy "tonal".
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const LUMA_W = 140;
const REG_FREQ_A = 82;
const REG_FREQ_B = 74;
const SEED_A = 71;
const SEED_B = 88;
const COLOR_FOLLOW = 0.2;

let lumaCanvas: HTMLCanvasElement | null = null;
let plateA: HTMLCanvasElement | null = null;
let plateB: HTMLCanvasElement | null = null;
let colorA: HTMLCanvasElement | null = null;
let colorB: HTMLCanvasElement | null = null;
let inkScratch: HTMLCanvasElement | null = null;
let toneScratch: HTMLCanvasElement | null = null;
let stampData: ImageData | null = null;
let colorDataA: ImageData | null = null;
let colorDataB: ImageData | null = null;
let smoothRgb: Float32Array | null = null;
let prepared = false;
let preparedW = 0;
let preparedH = 0;
let lastLivePrep = 0;

export type RegistrationStrategy = "tonal" | "offset" | "edge";
let strategy: RegistrationStrategy = "edge";

export function setRegistrationStrategy(next: RegistrationStrategy): void {
  if (next !== "tonal" && next !== "offset" && next !== "edge") return;
  if (next === strategy) return;
  strategy = next;
  prepared = false;
}

export function getRegistrationStrategy(): RegistrationStrategy {
  return strategy;
}

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

function readLocal(source: HTMLCanvasElement): { data: Uint8ClampedArray; w: number; h: number } {
  if (!lumaCanvas) lumaCanvas = makeCanvas();
  const smallH = Math.max(1, Math.round(LUMA_W * (source.height / Math.max(1, source.width))));
  sizeCanvas(lumaCanvas, LUMA_W, smallH);
  const lctx = lumaCanvas.getContext("2d", { willReadFrequently: true })!;
  lctx.imageSmoothingEnabled = true;
  lctx.drawImage(source, 0, 0, LUMA_W, smallH);
  return { data: lctx.getImageData(0, 0, LUMA_W, smallH).data, w: LUMA_W, h: smallH };
}

function luma(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722;
}

function occupancyFromLocal(
  local: { data: Uint8ClampedArray; w: number; h: number },
  cols: number,
  rows: number,
  scale: number,
  edgeBias: boolean,
): Float32Array {
  const occ = new Float32Array(cols * rows);
  const { data, w, h } = local;
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) / rows) * h));
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) / cols) * w));
      const yv = luma(data, w, sx, sy) / 255;
      const dark = 1 - yv;
      let edge = 0;
      if (edgeBias) {
        const x0 = Math.max(0, sx - 1);
        const x1 = Math.min(w - 1, sx + 1);
        const y0 = Math.max(0, sy - 1);
        const y1 = Math.min(h - 1, sy + 1);
        edge =
          (Math.abs(luma(data, w, x1, sy) - luma(data, w, x0, sy)) +
            Math.abs(luma(data, w, sx, y1) - luma(data, w, sx, y0))) /
          510;
      }
      const raw = Math.min(0.66, 0.014 + dark * scale + edge * (edgeBias ? 0.38 : 0));
      occ[y * cols + x] = Math.round(raw * 40) / 40;
    }
  }
  return occ;
}

function protectMid(y: number): number {
  const mid = 4 * y * (1 - y);
  const shadow = y < 0.12 ? y / 0.12 : 1;
  const highlight = y > 0.88 ? (1 - y) / 0.12 : 1;
  return mid * shadow * highlight;
}

function writeToneMaps(
  local: { data: Uint8ClampedArray; w: number; h: number },
  live: boolean,
  bw: boolean,
): void {
  const { w, h, data } = local;
  const n = w * h;
  if (!colorA) colorA = makeCanvas();
  if (!colorB) colorB = makeCanvas();
  sizeCanvas(colorA, w, h);
  sizeCanvas(colorB, w, h);
  const actx = colorA.getContext("2d")!;
  const bctx = colorB.getContext("2d")!;
  if (!colorDataA || colorDataA.width !== w || colorDataA.height !== h) {
    colorDataA = actx.createImageData(w, h);
    colorDataB = bctx.createImageData(w, h);
    smoothRgb = new Float32Array(n * 3);
    live = false;
  }
  const da = colorDataA.data;
  const db = colorDataB!.data;
  const sm = smoothRgb!;
  const follow = live ? COLOR_FOLLOW : 1;
  const keep = 1 - follow;

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;
    const s = p * 3;
    sm[s] = sm[s]! * keep + r * follow;
    sm[s + 1] = sm[s + 1]! * keep + g * follow;
    sm[s + 2] = sm[s + 2]! * keep + b * follow;
    r = sm[s]!;
    g = sm[s + 1]!;
    b = sm[s + 2]!;

    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    const protect = protectMid(y);
    const gray = y * 255;
    const sat = bw ? 0 : 0.78;
    const cr = gray + (r - gray) * sat;
    const cg = gray + (g - gray) * sat;
    const cb = gray + (b - gray) * sat;
    const chroma = (Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r)) / 3;
    const chromaGate = bw ? 0 : Math.min(1, chroma / 36) * protect;

    const dA = -15.5 * protect;
    const dB = 8.5 * protect;
    const warm = 2.2 * chromaGate;
    const cool = 1.6 * chromaGate;

    da[i] = clamp(cr + dA + warm, 10, 245);
    da[i + 1] = clamp(cg + dA + warm * 0.35, 10, 245);
    da[i + 2] = clamp(cb + dA - cool, 10, 245);
    da[i + 3] = 255;

    db[i] = clamp(cr + dB - cool * 0.6, 10, 245);
    db[i + 1] = clamp(cg + dB, 10, 245);
    db[i + 2] = clamp(cb + dB + cool, 10, 245);
    db[i + 3] = 255;
  }
  actx.putImageData(colorDataA, 0, 0);
  bctx.putImageData(colorDataB!, 0, 0);
}

export function prepareFieldPrintInk(
  composed: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
  live = false,
  bw = false,
): void {
  if (live && prepared && preparedW === width && preparedH === height && performance.now() - lastLivePrep < 90) {
    return;
  }
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

  const local = readLocal(composed);
  const edgeBias = strategy === "edge";
  const occA = occupancyFromLocal(local, colsA, rowsA, 0.2, edgeBias);
  const occB = occupancyFromLocal(local, colsB, rowsB, 0.12, edgeBias);
  stampMarks(plateA, buildMarks(colsA, rowsA, occA, SEED_A), colsA, rowsA, cellA);
  stampMarks(plateB, buildMarks(colsB, rowsB, occB, SEED_B), colsB, rowsB, cellB);
  if (strategy === "tonal") writeToneMaps(local, live, bw);
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
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(plate, dx, dy);
  tctx.globalCompositeOperation = "source-over";
  dest.save();
  dest.globalAlpha = mix;
  dest.globalCompositeOperation = "source-over";
  dest.drawImage(toneScratch, 0, 0);
  dest.restore();
}

function blitTonalPlate(
  dest: CanvasRenderingContext2D,
  plate: HTMLCanvasElement,
  color: HTMLCanvasElement,
  width: number,
  height: number,
  dx: number,
  dy: number,
  mix: number,
): void {
  if (!toneScratch) toneScratch = makeCanvas();
  sizeCanvas(toneScratch, width, height);
  const tctx = toneScratch.getContext("2d")!;
  tctx.clearRect(0, 0, width, height);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(color, 0, 0, width, height);
  tctx.globalCompositeOperation = "destination-in";
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(plate, dx, dy);
  tctx.globalCompositeOperation = "source-over";
  dest.save();
  dest.globalAlpha = mix;
  dest.globalCompositeOperation = "source-over";
  dest.drawImage(toneScratch, 0, 0);
  dest.restore();
}

function offsetPx(amount: number, dpr: number, reactive: boolean): number {
  const css = reactive ? 2.2 + amount * 2.2 : 1.5 + amount * 5;
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
  if (strategy === "tonal") {
    if (!colorA || !colorB) return;
    const off = reactive ? 1.8 + amount * 5 : 0.7 + amount * 3;
    const mixA = reactive ? 0.72 : 0.34;
    const mixB = reactive ? 0.48 : 0.2;
    blitTonalPlate(ctx, plateA, colorA, width, height, off, -off * 0.35, mixA);
    blitTonalPlate(ctx, plateB, colorB, width, height, -off, off * 0.35, mixB);
    return;
  }
  const off = offsetPx(amount, dpr, reactive);
  const mixA = reactive ? 0.42 : 0.26;
  const mixB = reactive ? 0.28 : 0.16;
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
  ictx.drawImage(boundarySmall, 0, 0, boundarySmall.width, boundarySmall.height, 0, 0, width, height);
  ictx.globalCompositeOperation = "source-over";
  ictx.globalAlpha = 1;
  ictx.restore();
  ctx.drawImage(inkScratch, 0, 0);
}
