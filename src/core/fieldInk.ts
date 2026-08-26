/** Photograph-derived two-tone ink for FIELD in a mixed pair.
 *
 * FIELD itself stays binary (occupancy, marks, frequency). This module
 * only remaps the already-painted plate: former black → dark ink, former
 * white → light ink. Both inks share the photograph's chromatic centre
 * and differ in luminance, so the result is not a shadow/highlight
 * duotone and not a black overlay.
 *
 * FIELD × FIELD is left to the caller (skip this remap).
 */
import type { RGB } from "./media";

export interface FieldInk {
  dark: RGB;
  light: RGB;
}

const SAMPLE_W = 96;
const FOLLOW = 0.18;
const SAT_KEEP = 0.68;
const DARK_LUMA_MIN = 0.17;
const DARK_LUMA_MAX = 0.36;
const LIGHT_LUMA_MIN = 0.74;
const LIGHT_LUMA_MAX = 0.91;
const MIN_SEP = 0.38;

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

function luma(r: number, g: number, b: number): number {
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function inkAtLuma(rgb: RGB, targetY: number): RGB {
  const y = luma(rgb.r, rgb.g, rgb.b);
  if (targetY >= y) {
    const t = (targetY - y) / Math.max(1e-4, 1 - y);
    return mixRgb(rgb, { r: 248, g: 248, b: 248 }, t);
  }
  const t = (y - targetY) / Math.max(1e-4, y);
  return mixRgb(rgb, { r: 18, g: 18, b: 18 }, t);
}

let sampleCanvas: HTMLCanvasElement | null = null;
let cachedKey = "";
let cachedInk: FieldInk | null = null;
let smoothDark: RGB | null = null;
let smoothLight: RGB | null = null;
let lastInk: FieldInk | null = null;

export function lastFieldInk(): FieldInk | null {
  return lastInk ? { dark: { ...lastInk.dark }, light: { ...lastInk.light } } : null;
}

function sampleCentre(photo: HTMLCanvasElement, bw: boolean): RGB {
  if (!sampleCanvas) sampleCanvas = makeCanvas();
  const h = Math.max(1, Math.round(SAMPLE_W * (photo.height / Math.max(1, photo.width))));
  sizeCanvas(sampleCanvas, SAMPLE_W, h);
  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(photo, 0, 0, SAMPLE_W, h);
  const { data } = ctx.getImageData(0, 0, SAMPLE_W, h);
  let r = 0;
  let g = 0;
  let b = 0;
  let wsum = 0;
  let n = 0;
  let tr = 0;
  let tg = 0;
  let tb = 0;
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i]!;
    const pg = data[i + 1]!;
    const pb = data[i + 2]!;
    const y = luma(pr, pg, pb);
    n++;
    tr += pr;
    tg += pg;
    tb += pb;
    if (y < 0.18 || y > 0.94) continue;
    const chroma = (Math.abs(pr - pg) + Math.abs(pg - pb) + Math.abs(pb - pr)) / 3;
    const lightBias = y < 0.38 ? 0.15 : y > 0.82 ? 0.45 : 0.35 + y;
    const w = (0.12 + chroma / 80) * lightBias;
    r += pr * w;
    g += pg * w;
    b += pb * w;
    wsum += w;
  }
  if (wsum < 1e-3) {
    r = tr / Math.max(1, n);
    g = tg / Math.max(1, n);
    b = tb / Math.max(1, n);
  } else {
    r /= wsum;
    g /= wsum;
    b /= wsum;
  }
  if (bw) {
    const y = luma(r, g, b) * 255;
    return { r: y, g: y, b: y };
  }
  const y = luma(r, g, b) * 255;
  return {
    r: y + (r - y) * SAT_KEEP,
    g: y + (g - y) * SAT_KEEP,
    b: y + (b - y) * SAT_KEEP,
  };
}

function tonesFromCentre(centre: RGB): FieldInk {
  const y = luma(centre.r, centre.g, centre.b);
  let darkY = DARK_LUMA_MIN + (DARK_LUMA_MAX - DARK_LUMA_MIN) * Math.min(1, y / 0.55);
  let lightY = LIGHT_LUMA_MAX - (LIGHT_LUMA_MAX - LIGHT_LUMA_MIN) * Math.min(1, (1 - y) / 0.55);
  if (lightY - darkY < MIN_SEP) {
    const mid = (lightY + darkY) * 0.5;
    darkY = Math.max(DARK_LUMA_MIN, mid - MIN_SEP * 0.5);
    lightY = Math.min(LIGHT_LUMA_MAX, darkY + MIN_SEP);
  }
  const gray = y * 255;
  const paper = {
    r: gray + (centre.r - gray) * 0.38,
    g: gray + (centre.g - gray) * 0.38,
    b: gray + (centre.b - gray) * 0.38,
  };
  return { dark: inkAtLuma(centre, darkY), light: inkAtLuma(paper, lightY) };
}

export function deriveFieldInk(
  photo: HTMLCanvasElement,
  key: string,
  live: boolean,
  bw: boolean,
): FieldInk {
  if (!live && cachedInk && cachedKey === key) {
    lastInk = cachedInk;
    return cachedInk;
  }

  const next = tonesFromCentre(sampleCentre(photo, bw));
  if (live) {
    if (!smoothDark || !smoothLight || cachedKey !== key) {
      smoothDark = next.dark;
      smoothLight = next.light;
    } else {
      smoothDark = mixRgb(smoothDark, next.dark, FOLLOW);
      smoothLight = mixRgb(smoothLight, next.light, FOLLOW);
    }
    cachedKey = key;
    cachedInk = { dark: { ...smoothDark }, light: { ...smoothLight } };
    lastInk = cachedInk;
    return cachedInk;
  }

  cachedKey = key;
  cachedInk = next;
  smoothDark = next.dark;
  smoothLight = next.light;
  lastInk = next;
  return next;
}

function pack(rgb: RGB): number {
  return (255 << 24) | (clampByte(rgb.b) << 16) | (clampByte(rgb.g) << 8) | clampByte(rgb.r);
}

/** Remap a binary black/white plate in place. Structure is unchanged. */
export function applyFieldInk(fieldLayer: HTMLCanvasElement, ink: FieldInk): void {
  const ctx = fieldLayer.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, fieldLayer.width, fieldLayer.height);
  const px = new Uint32Array(img.data.buffer);
  const dark = pack(ink.dark);
  const light = pack(ink.light);
  for (let i = 0; i < px.length; i++) {
    px[i] = (px[i]! & 0xff) < 128 ? dark : light;
  }
  ctx.putImageData(img, 0, 0);
}
