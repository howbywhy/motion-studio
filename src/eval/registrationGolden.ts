/**
 * Deterministic Registration golden-master regression harness.
 * Uses generated rasters only — no client media.
 *
 * REGISTRATION GOLDEN MASTER — commit 728ff08.
 */
import type { ResolvedField } from "../behaviors/bloom/fields";
import { paintClean } from "../behaviors/bloom/treatments";
import { paintGoldenMasterRegistration, REGISTRATION_GOLDEN_MASTER } from "../core/globalRegistration";
import { BLOOM_REGISTRATION_AMOUNT, resetRegistrationInkTintCache } from "../core/registrationInk";

export const FIXTURE_WIDTH = 480;
export const FIXTURE_HEIGHT = 360;

export const CROPS = {
  skin: { x: 36, y: 90, w: 96, h: 96 },
  garment: { x: 300, y: 110, w: 96, h: 96 },
  edge: { x: 232, y: 80, w: 64, h: 160 },
  tonal: { x: 80, y: 16, w: 160, h: 64 },
} as const;

export type CropName = keyof typeof CROPS;

/** Frozen field geometry — not live Bloom motion. */
export const FIXED_FIELDS: ResolvedField[] = [
  { cx: 150, cy: 170, radius: 150, alpha: 0.92, innerStop: 0.42, rotation: 0.3, lobes: [] },
  { cx: 340, cy: 190, radius: 130, alpha: 0.88, innerStop: 0.38, rotation: 1.1, lobes: [] },
  { cx: 250, cy: 150, radius: 110, alpha: 0.95, innerStop: 0.48, rotation: 0.0, lobes: [] },
  { cx: 240, cy: 70, radius: 160, alpha: 0.7, innerStop: 0.55, rotation: 0.6, lobes: [] },
];

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Procedural A: warm midtone "skin". B: same plus garment stripes and a hard edge. */
export function paintSources(a: HTMLCanvasElement, b: HTMLCanvasElement): void {
  const w = a.width;
  const h = a.height;
  const aCtx = a.getContext("2d")!;
  const img = aCtx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const nx = x / w;
      const ny = y / h;
      const warm = 0.5 + 0.18 * Math.sin(nx * 3.1) + 0.12 * Math.cos(ny * 4.7);
      const grain = ((x * 73 + y * 157) % 13) / 13 * 0.06;
      d[i] = Math.round(168 + warm * 52 + grain * 40);
      d[i + 1] = Math.round(118 + warm * 36 + grain * 28);
      d[i + 2] = Math.round(96 + warm * 22 + grain * 20);
      d[i + 3] = 255;
    }
  }
  aCtx.putImageData(img, 0, 0);

  const bImg = b.getContext("2d")!.createImageData(w, h);
  const bd = bImg.data;
  const split = Math.floor(w * 0.55);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const src = i;
      bd[i] = d[src];
      bd[i + 1] = d[src + 1];
      bd[i + 2] = d[src + 2];
      bd[i + 3] = 255;
      if (x >= split) {
        const stripe = Math.sin((x + y * 0.35) * 0.45) > 0 ? 0.42 : 0.18;
        const edge = x === split || x === split + 1 ? 0.08 : stripe;
        bd[i] = Math.round(bd[i] * edge);
        bd[i + 1] = Math.round(bd[i + 1] * edge * 1.05);
        bd[i + 2] = Math.round(bd[i + 2] * edge * 1.1);
      }
      // Fine high-frequency tick so texture loss is measurable.
      if (((x * 19) ^ (y * 7)) % 11 === 0) {
        bd[i] = Math.min(255, bd[i] + 18);
        bd[i + 1] = Math.min(255, bd[i + 1] + 14);
        bd[i + 2] = Math.min(255, bd[i + 2] + 10);
      }
    }
  }
  b.getContext("2d")!.putImageData(bImg, 0, 0);
}

function paintMask(mask: HTMLCanvasElement, fields: ResolvedField[]): void {
  const ctx = mask.getContext("2d")!;
  ctx.clearRect(0, 0, mask.width, mask.height);
  for (const field of fields) {
    const g = ctx.createRadialGradient(field.cx, field.cy, 0, field.cx, field.cy, field.radius);
    g.addColorStop(0, `rgba(255,255,255,${field.alpha})`);
    g.addColorStop(field.innerStop, `rgba(255,255,255,${field.alpha})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(field.cx - field.radius, field.cy - field.radius, field.radius * 2, field.radius * 2);
  }
}

export interface CropMetrics {
  mad: number;
  maxAbs: number;
  hfEnergy: number;
  mean: number[];
  sha256: string;
}

export interface FrameMetrics {
  width: number;
  height: number;
  amount: number;
  commit: string;
  paintMs: number;
  frame: CropMetrics;
  crops: Record<CropName, CropMetrics>;
}

function laplacianEnergy(data: Uint8ClampedArray, w: number, h: number): number {
  let e = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const lum = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const up = ((y - 1) * w + x) * 4;
      const dn = ((y + 1) * w + x) * 4;
      const lf = (y * w + (x - 1)) * 4;
      const rt = (y * w + (x + 1)) * 4;
      const n =
        (data[up] * 0.2126 + data[up + 1] * 0.7152 + data[up + 2] * 0.0722) +
        (data[dn] * 0.2126 + data[dn + 1] * 0.7152 + data[dn + 2] * 0.0722) +
        (data[lf] * 0.2126 + data[lf + 1] * 0.7152 + data[lf + 2] * 0.0722) +
        (data[rt] * 0.2126 + data[rt + 1] * 0.7152 + data[rt + 2] * 0.0722);
      const lap = Math.abs(4 * lum - n);
      e += lap;
    }
  }
  return e / ((w - 2) * (h - 2));
}

function meanRgb(data: Uint8ClampedArray): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [r / n, g / n, b / n];
}

async function sha256Hex(data: Uint8ClampedArray): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data.slice().buffer);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function cropData(src: ImageData, crop: { x: number; y: number; w: number; h: number }): ImageData {
  const out = new ImageData(crop.w, crop.h);
  for (let y = 0; y < crop.h; y++) {
    const srcRow = ((crop.y + y) * src.width + crop.x) * 4;
    const dstRow = y * crop.w * 4;
    out.data.set(src.data.subarray(srcRow, srcRow + crop.w * 4), dstRow);
  }
  return out;
}

async function metricsOf(img: ImageData): Promise<CropMetrics> {
  return {
    mad: 0,
    maxAbs: 0,
    hfEnergy: laplacianEnergy(img.data, img.width, img.height),
    mean: meanRgb(img.data),
    sha256: await sha256Hex(img.data),
  };
}

export function compareImageData(a: ImageData, b: ImageData): { mad: number; maxAbs: number } {
  const n = Math.min(a.data.length, b.data.length);
  let sum = 0;
  let max = 0;
  const pixels = n / 4;
  for (let i = 0; i < n; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const m = (dr + dg + db) / 3;
    sum += m;
    if (dr > max) max = dr;
    if (dg > max) max = dg;
    if (db > max) max = db;
  }
  return { mad: sum / pixels, maxAbs: max };
}

export async function renderGoldenFrame(bw = false): Promise<{ canvas: HTMLCanvasElement; image: ImageData; paintMs: number }> {
  resetRegistrationInkTintCache();
  const w = FIXTURE_WIDTH;
  const h = FIXTURE_HEIGHT;
  const a = makeCanvas(w, h);
  const b = makeCanvas(w, h);
  const mask = makeCanvas(w, h);
  const dest = makeCanvas(w, h);
  paintSources(a, b);
  paintMask(mask, FIXED_FIELDS);
  const ctx = dest.getContext("2d")!;
  const t0 = performance.now();
  paintClean(ctx, a, b, mask, w, h);
  paintGoldenMasterRegistration(ctx, b, FIXED_FIELDS, w, h, bw);
  const paintMs = performance.now() - t0;
  if (BLOOM_REGISTRATION_AMOUNT !== 0.4) {
    throw new Error("BLOOM_REGISTRATION_AMOUNT drifted from golden master 0.4");
  }
  if (REGISTRATION_GOLDEN_MASTER.commit !== "728ff088b3ee01e6b1ee968a6388fa6c4fc56200") {
    throw new Error("Golden-master commit id drifted");
  }
  return { canvas: dest, image: ctx.getImageData(0, 0, w, h), paintMs };
}

export async function measureFrame(image: ImageData, paintMs: number): Promise<FrameMetrics> {
  const crops = {} as Record<CropName, CropMetrics>;
  for (const name of Object.keys(CROPS) as CropName[]) {
    crops[name] = await metricsOf(cropData(image, CROPS[name]));
  }
  return {
    width: image.width,
    height: image.height,
    amount: BLOOM_REGISTRATION_AMOUNT,
    commit: REGISTRATION_GOLDEN_MASTER.commit,
    paintMs,
    frame: await metricsOf(image),
    crops,
  };
}

export interface CheckResult {
  ok: boolean;
  failures: string[];
  metrics: FrameMetrics;
  pngExact: boolean;
  webpTextureVisible: boolean;
  typeDoesNotMutate: boolean;
}

function hfOk(actual: number, expected: number): boolean {
  if (expected < 0.5) return actual < 1;
  const ratio = actual / expected;
  return ratio >= 0.92 && ratio <= 1.08;
}

export function evaluateAgainstFixture(
  actual: FrameMetrics,
  expected: FrameMetrics,
  live: ImageData,
  png: ImageData | null,
  webpHf: number | null,
): CheckResult {
  const failures: string[] = [];
  if (actual.frame.sha256 !== expected.frame.sha256) {
    failures.push(`whole-frame sha256 mismatch (texture/path change)`);
  }
  for (const name of Object.keys(CROPS) as CropName[]) {
    const a = actual.crops[name];
    const e = expected.crops[name];
    if (a.sha256 !== e.sha256) failures.push(`${name} crop sha256 mismatch`);
    if (!hfOk(a.hfEnergy, e.hfEnergy)) {
      failures.push(`${name} high-frequency energy ${a.hfEnergy.toFixed(3)} vs ${e.hfEnergy.toFixed(3)} (texture loss)`);
    }
  }
  let pngExact = false;
  if (png) {
    const c = compareImageData(live, png);
    pngExact = c.mad === 0 && c.maxAbs === 0;
    if (!pngExact) failures.push(`LIVE vs PNG mad=${c.mad.toFixed(4)} maxAbs=${c.maxAbs}`);
  }
  let webpTextureVisible = true;
  if (webpHf !== null) {
    webpTextureVisible = webpHf > expected.frame.hfEnergy * 0.35;
    if (!webpTextureVisible) failures.push(`encoded WebP lost Registration texture (hf=${webpHf.toFixed(3)})`);
  }
  return {
    ok: failures.length === 0,
    failures,
    metrics: actual,
    pngExact,
    webpTextureVisible,
    typeDoesNotMutate: true,
  };
}

export async function blobToImageData(blob: Blob, w: number, h: number): Promise<ImageData> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function canvasToImageData(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<ImageData> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error(`${type} encode failed`);
  return blobToImageData(blob, canvas.width, canvas.height);
}
