/**
 * Identity Texture — field-print plates, now in output-space print material.
 *
 * Lineage: e9e49f92ff0590ab3ba780bd64ba019a6be0b005 (879230d).
 * That engine stamped hard orthogonal cells and blit them nearest-neighbour.
 * On photographs — especially 1080 export at dpr 1 — those cells read as
 * digital speckle, not ink. Occupancy, two plates, tonal impressions,
 * persistent 0.1 and reactive 0.4 are unchanged. Only the mark body and
 * sampling space changed.
 *
 * Authored order: Bloom compose → plates → Type.
 * Product material is print-identity: fine AM screen + registration + Bloom
 * reactive disagreement. Eval may still bind historical mark fields.
 */

import { hash2, markCellPx, markPeriodCss } from "../sources/field";
import {
  invalidatePrintImpressions,
  isPrintImpressionMaterial,
  paintPrintImpressions,
  preparePrintImpressions,
  lastPrintImpressionMs,
  lastPrintAudit,
  type PrintImpressionMaterial,
} from "./identityPrintMaterial";

export const IDENTITY_TEXTURE_COMMIT = "e9e49f92ff0590ab3ba780bd64ba019a6be0b005";
export const IDENTITY_TEXTURE_PERSISTENT = 0.1;
export const IDENTITY_TEXTURE_REACTIVE = 0.4;

export type IdentityTextureMaterial =
  | "current"
  | "print"
  | "registration"
  | "print-reactive"
  | PrintImpressionMaterial;

/** Product Texture. One print language: screen + registration + reactive. */
export const PRODUCT_TEXTURE_MATERIAL: IdentityTextureMaterial = "print-identity";

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
const BOUNDARY_SMALL_W = 200;
const PRINT_REFERENCE_SHORT = 420;
const PRINT_OFFSET_REF = 1080;

let lumaCanvas: HTMLCanvasElement | null = null;
let plateA: HTMLCanvasElement | null = null;
let plateB: HTMLCanvasElement | null = null;
let colorA: HTMLCanvasElement | null = null;
let colorB: HTMLCanvasElement | null = null;
let inkScratch: HTMLCanvasElement | null = null;
let toneScratch: HTMLCanvasElement | null = null;
let boundarySmall: HTMLCanvasElement | null = null;
let spreadScratch: HTMLCanvasElement | null = null;
let stampData: ImageData | null = null;
let colorDataA: ImageData | null = null;
let colorDataB: ImageData | null = null;
let smoothRgb: Float32Array | null = null;
let prepared = false;
let preparedW = 0;
let preparedH = 0;
let preparedMaterial: IdentityTextureMaterial = PRODUCT_TEXTURE_MATERIAL;
export let lastIdentityTextureMs = 0;
export let lastTextureAudit = {
  material: PRODUCT_TEXTURE_MATERIAL as IdentityTextureMaterial,
  width: 0,
  height: 0,
  dpr: 1,
  cellA: 0,
  cellB: 0,
  colsA: 0,
  rowsA: 0,
  screenPeriod: 0,
};

let productPrintOn = true;
let evalTexture: boolean | null = null;
const evalByOwner = new WeakMap<object, boolean | null>();
let evalMaterial: IdentityTextureMaterial | null = null;
const materialByOwner = new WeakMap<object, IdentityTextureMaterial | null>();

export function setEvalIdentityTexture(on: boolean | null): void {
  evalTexture = on;
}

export function bindEvalIdentityTexture(owner: object, on: boolean | null): void {
  evalByOwner.set(owner, on);
}

export function setEvalTextureMaterial(material: IdentityTextureMaterial | null): void {
  evalMaterial = material;
  invalidateIdentityTexture();
}

export function bindEvalTextureMaterial(owner: object, material: IdentityTextureMaterial | null): void {
  materialByOwner.set(owner, material);
  invalidateIdentityTexture();
}

/** Product Print is ON. Eval may bind OFF for comparison. */
export function setProductPrintEnabled(on: boolean): void {
  productPrintOn = on;
  invalidateIdentityTexture();
}

export function isProductPrintEnabled(): boolean {
  return productPrintOn;
}

export function resolveEvalIdentityTexture(owner?: object): boolean {
  if (owner && evalByOwner.has(owner)) {
    const bound = evalByOwner.get(owner);
    if (bound === false) return false;
    if (bound === true) return true;
  }
  if (evalTexture === false) return false;
  return productPrintOn;
}

export function resolveTextureMaterial(owner?: object): IdentityTextureMaterial {
  if (owner && materialByOwner.has(owner)) {
    const bound = materialByOwner.get(owner);
    if (bound) return bound;
  }
  if (evalMaterial) return evalMaterial;
  return PRODUCT_TEXTURE_MATERIAL;
}

export function identityTexturePrepared(): boolean {
  return prepared;
}

export function invalidateIdentityTexture(): void {
  prepared = false;
  preparedW = 0;
  preparedH = 0;
  invalidatePrintImpressions();
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

/** Eval A CURRENT only. Product never stamps hard cells. */
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

function stampSoftDot(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + ry + 1));
  const invRx = 1 / Math.max(0.35, rx);
  const invRy = 1 / Math.max(0.35, ry);
  for (let y = y0; y <= y1; y++) {
    const ny = (y + 0.5 - cy) * invRy;
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) * invRx;
      const r2 = nx * nx + ny * ny;
      if (r2 >= 1) continue;
      const fall = 1 - r2;
      const a = (alpha * fall * fall) | 0;
      const o = (y * w + x) * 4;
      if (a > d[o + 3]!) {
        d[o] = 0;
        d[o + 1] = 0;
        d[o + 2] = 0;
        d[o + 3] = a;
      }
    }
  }
}

function stampPrintMarks(
  canvas: HTMLCanvasElement,
  on: Uint8Array,
  cols: number,
  rows: number,
  cell: number,
  seed: number,
  jitter: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  if (!stampData || stampData.width !== w || stampData.height !== h) {
    stampData = ctx.createImageData(w, h);
  } else {
    stampData.data.fill(0);
  }
  const d = stampData.data;
  const rxBase = cell * 0.54;
  const ryBase = cell * 0.47;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (!on[cy * cols + cx]) continue;
      const jx = (hash2(cx, cy, seed) - 0.5) * cell * jitter;
      const jy = (hash2(cx, cy, seed + 9) - 0.5) * cell * jitter;
      const rx = rxBase * (0.8 + hash2(cx, cy, seed + 21) * 0.4);
      const ry = ryBase * (0.8 + hash2(cx, cy, seed + 27) * 0.4);
      const mx = cx * cell + cell * 0.5 + jx;
      const my = cy * cell + cell * 0.5 + jy;
      const aMark = 168 + Math.round(hash2(cx, cy, seed + 33) * 78);
      stampSoftDot(d, w, h, mx, my, rx, ry, aMark);
    }
  }
  ctx.putImageData(stampData, 0, 0);
}

function inkSpread(canvas: HTMLCanvasElement, radius: number): void {
  if (radius < 0.28) return;
  if (!spreadScratch) spreadScratch = makeCanvas();
  sizeCanvas(spreadScratch, canvas.width, canvas.height);
  const sctx = spreadScratch.getContext("2d")!;
  sctx.clearRect(0, 0, canvas.width, canvas.height);
  sctx.filter = `blur(${radius.toFixed(2)}px)`;
  sctx.drawImage(canvas, 0, 0);
  sctx.filter = "none";
  const pctx = canvas.getContext("2d")!;
  pctx.clearRect(0, 0, canvas.width, canvas.height);
  pctx.drawImage(spreadScratch, 0, 0);
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

function occupancyFromLocal(
  local: { data: Uint8ClampedArray; w: number; h: number },
  cols: number,
  rows: number,
  scale: number,
  quantize: boolean,
): Float32Array {
  const occ = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(local.h - 1, Math.floor(((y + 0.5) / rows) * local.h));
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(local.w - 1, Math.floor(((x + 0.5) / cols) * local.w));
      const i = (sy * local.w + sx) * 4;
      const yv = (local.data[i]! * 0.2126 + local.data[i + 1]! * 0.7152 + local.data[i + 2]! * 0.0722) / 255;
      const dark = 1 - yv;
      const raw = Math.min(0.62, 0.018 + dark * scale);
      occ[y * cols + x] = quantize ? Math.round(raw * 40) / 40 : raw;
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

function imageRelativeCell(width: number, height: number, freq: number): number {
  const short = Math.min(width, height);
  return Math.max(1.35, short * (markPeriodCss(freq) / PRINT_REFERENCE_SHORT));
}

function printOffset(baseAt1080: number, width: number, height: number): number {
  return baseAt1080 * (Math.min(width, height) / PRINT_OFFSET_REF);
}

function isPrintMaterial(material: IdentityTextureMaterial): boolean {
  return material !== "current";
}

export function prepareIdentityTexture(
  composed: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
  live = false,
  bw = false,
  material: IdentityTextureMaterial = PRODUCT_TEXTURE_MATERIAL,
): void {
  if (isPrintImpressionMaterial(material)) {
    preparePrintImpressions(composed, width, height);
    prepared = true;
    preparedW = width;
    preparedH = height;
    preparedMaterial = material;
    lastTextureAudit = {
      material,
      width,
      height,
      dpr,
      cellA: 0,
      cellB: 0,
      colsA: 0,
      rowsA: 0,
      screenPeriod: lastPrintAudit.period,
    };
    return;
  }
  if (!plateA) plateA = makeCanvas();
  if (!plateB) plateB = makeCanvas();
  sizeCanvas(plateA, width, height);
  sizeCanvas(plateB, width, height);

  const print = isPrintMaterial(material);
  const cellA = print ? imageRelativeCell(width, height, REG_FREQ_A) : markCellPx(REG_FREQ_A, dpr);
  const cellB = print ? imageRelativeCell(width, height, REG_FREQ_B) : markCellPx(REG_FREQ_B, dpr);
  const colsA = Math.ceil(width / cellA);
  const rowsA = Math.ceil(height / cellA);
  const colsB = Math.ceil(width / cellB);
  const rowsB = Math.ceil(height / cellB);

  const local = readLocal(composed);
  const occA = occupancyFromLocal(local, colsA, rowsA, 0.2, !print);
  const occB = occupancyFromLocal(local, colsB, rowsB, 0.12, !print);
  const marksA = buildMarks(colsA, rowsA, occA, SEED_A);
  const marksB = buildMarks(colsB, rowsB, occB, SEED_B);

  if (print) {
    const jitter = material === "registration" ? 0.34 : 0.22;
    stampPrintMarks(plateA, marksA, colsA, rowsA, cellA, SEED_A, jitter);
    stampPrintMarks(plateB, marksB, colsB, rowsB, cellB, SEED_B, jitter);
    const spread = (material === "registration" ? 0.82 : 0.48) * (cellA / 3.2);
    inkSpread(plateA, spread);
    inkSpread(plateB, spread * 0.86);
  } else {
    stampMarks(plateA, marksA, colsA, rowsA, cellA);
    stampMarks(plateB, marksB, colsB, rowsB, cellB);
  }

  writeToneMaps(local, live, bw);
  prepared = true;
  preparedW = width;
  preparedH = height;
  preparedMaterial = material;
  lastTextureAudit = { material, width, height, dpr, cellA, cellB, colsA, rowsA, screenPeriod: 0 };
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
  smoothPlate: boolean,
): void {
  if (!toneScratch) toneScratch = makeCanvas();
  sizeCanvas(toneScratch, width, height);
  const tctx = toneScratch.getContext("2d")!;
  tctx.clearRect(0, 0, width, height);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(color, 0, 0, width, height);
  tctx.globalCompositeOperation = "destination-in";
  tctx.imageSmoothingEnabled = smoothPlate;
  tctx.drawImage(plate, dx, dy);
  tctx.globalCompositeOperation = "source-over";
  dest.save();
  dest.globalAlpha = mix;
  dest.globalCompositeOperation = "source-over";
  dest.drawImage(toneScratch, 0, 0);
  dest.restore();
}

function blitTonalPlates(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  off: number,
  mixA: number,
  mixB: number,
): void {
  if (!prepared || !plateA || !plateB || !colorA || !colorB || preparedW !== width || preparedH !== height) return;
  const smooth = isPrintMaterial(preparedMaterial);
  blitTonalPlate(ctx, plateA, colorA, width, height, off, -off * 0.35, mixA, smooth);
  blitTonalPlate(ctx, plateB, colorB, width, height, -off, off * 0.35, mixB, smooth);
}

function persistMix(material: IdentityTextureMaterial): { off: number; mixA: number; mixB: number } {
  if (material === "registration") return { off: 2.35, mixA: 0.4, mixB: 0.26 };
  if (material === "print-reactive") return { off: 1.45, mixA: 0.28, mixB: 0.16 };
  if (material === "print") return { off: 1.55, mixA: 0.34, mixB: 0.2 };
  return { off: 0.7 + IDENTITY_TEXTURE_PERSISTENT * 3, mixA: 0.34, mixB: 0.2 };
}

function reactiveMix(material: IdentityTextureMaterial): { off: number; mixA: number; mixB: number } {
  if (material === "current") return { off: 1.8 + IDENTITY_TEXTURE_REACTIVE * 5, mixA: 0.72, mixB: 0.48 };
  return { off: 3.8, mixA: 0.72, mixB: 0.48 };
}

export function paintIdentityTexturePersistent(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount = IDENTITY_TEXTURE_PERSISTENT,
): void {
  if (amount <= 0.001) return;
  if (!inkScratch) inkScratch = makeCanvas();
  sizeCanvas(inkScratch, width, height);
  const ictx = inkScratch.getContext("2d")!;
  ictx.clearRect(0, 0, width, height);
  const mix = persistMix(preparedMaterial);
  const off = isPrintMaterial(preparedMaterial)
    ? printOffset(mix.off, width, height)
    : mix.off;
  blitTonalPlates(ictx, width, height, off, mix.mixA, mix.mixB);
  ctx.drawImage(inkScratch, 0, 0);
}

function buildBoundaryAlpha(maskLayer: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (!boundarySmall) boundarySmall = makeCanvas();
  const smallW = BOUNDARY_SMALL_W;
  const smallH = Math.max(1, Math.round(smallW * (height / width)));
  sizeCanvas(boundarySmall, smallW, smallH);
  const sctx = boundarySmall.getContext("2d", { willReadFrequently: true })!;
  sctx.clearRect(0, 0, smallW, smallH);
  sctx.drawImage(maskLayer, 0, 0, smallW, smallH);
  const img = sctx.getImageData(0, 0, smallW, smallH);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    const tent = 4 * a * (1 - a);
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = Math.round(tent * 255);
  }
  sctx.putImageData(img, 0, 0);
  return boundarySmall;
}

export function paintIdentityTextureReactive(
  ctx: CanvasRenderingContext2D,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
  amount = IDENTITY_TEXTURE_REACTIVE,
): void {
  if (amount <= 0.001) return;
  if (!inkScratch) inkScratch = makeCanvas();
  sizeCanvas(inkScratch, width, height);
  const ictx = inkScratch.getContext("2d")!;
  ictx.clearRect(0, 0, width, height);
  const mix = reactiveMix(preparedMaterial);
  const off = isPrintMaterial(preparedMaterial)
    ? printOffset(mix.off, width, height)
    : mix.off;
  blitTonalPlates(ictx, width, height, off, mix.mixA, mix.mixB);

  const boundary = buildBoundaryAlpha(maskLayer, width, height);
  ictx.save();
  ictx.globalCompositeOperation = "destination-in";
  ictx.globalAlpha = Math.min(1, amount * 1.35);
  ictx.drawImage(boundary, 0, 0, boundary.width, boundary.height, 0, 0, width, height);
  ictx.globalCompositeOperation = "source-over";
  ictx.globalAlpha = 1;
  ictx.restore();
  ctx.drawImage(inkScratch, 0, 0);
}

/** Persistent + reactive. Matches e9 finalizeOutput amounts. */
export function paintIdentityTexture(
  dest: CanvasRenderingContext2D,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const t0 = performance.now();
  if (isPrintImpressionMaterial(preparedMaterial)) {
    paintPrintImpressions(
      dest,
      maskLayer,
      width,
      height,
      preparedMaterial,
      IDENTITY_TEXTURE_PERSISTENT,
      IDENTITY_TEXTURE_REACTIVE,
      buildBoundaryAlpha,
    );
    lastIdentityTextureMs = lastPrintImpressionMs;
    lastTextureAudit.screenPeriod = lastPrintAudit.period;
    return;
  }
  paintIdentityTexturePersistent(dest, width, height, IDENTITY_TEXTURE_PERSISTENT);
  paintIdentityTextureReactive(dest, maskLayer, width, height, IDENTITY_TEXTURE_REACTIVE);
  lastIdentityTextureMs = performance.now() - t0;
}
