/**
 * Identity print material — one print language.
 *
 * identityPrintMaterial
 *   halftone
 *   printRegistration (photographic plate disagreement)
 *   reactiveResponse
 *
 * Distinct from Registration (golden-master Bloom rings).
 *
 * HALFTONE: coherent AM screen in composition space (not hashed marks).
 * printRegistration: slight disagreement between impressions of that photograph.
 * REACTIVE: Bloom tent increases disagreement amount only.
 *
 * Screen geometry is static (canvas size, period, angle, softness).
 * Image tone and Bloom change every frame; the lattice does not.
 * No per-frame random, no occupancy field.
 */

export const PRINT_IMPRESSION_MATERIALS = [
  "clean-registration",
  "ink-registration",
  "reactive-registration",
  "halftone-dot",
  "halftone-elliptical",
  "halftone-soft",
  "halftone-registration",
  "halftone-registration-strong",
  "print-identity",
  "print-floor-00",
  "print-floor-10",
  "print-floor-15",
  "print-floor-20",
] as const;

export type PrintImpressionMaterial = (typeof PRINT_IMPRESSION_MATERIALS)[number];

export function isPrintImpressionMaterial(material: string): material is PrintImpressionMaterial {
  return (PRINT_IMPRESSION_MATERIALS as readonly string[]).includes(material);
}

/** Period in px at a 1080 short side. Image-relative; never 1 export pixel. */
export const PRINT_SCREEN_PERIOD_AT_1080 = 3.65;
/** Soft AM only. Lowest highlight floor that still prints pale areas. */
export const PRINT_HIGHLIGHT_FLOOR = 0.1;
const OFFSET_REF = 1080;
const EDGE_W = 220;
const SOFT_ANGLE = 0.2617993878;
const SOFT_ASPECT = 1.2;
const SOFT_SOFTNESS = 0.4;
const SOFT_AMOUNT = 0.5;

type HalftoneKind = "none" | "dot" | "elliptical" | "soft";
type RegistrationKind = "off" | "subtle" | "ink" | "strong";

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

function recipeFor(material: PrintImpressionMaterial): {
  halftone: HalftoneKind;
  registration: RegistrationKind;
  reactive: boolean;
} {
  if (material === "halftone-dot") return { halftone: "dot", registration: "off", reactive: false };
  if (material === "halftone-elliptical") return { halftone: "elliptical", registration: "off", reactive: false };
  if (material === "halftone-soft") return { halftone: "soft", registration: "off", reactive: false };
  if (material === "halftone-registration") return { halftone: "soft", registration: "subtle", reactive: false };
  if (material === "halftone-registration-strong") return { halftone: "soft", registration: "strong", reactive: false };
  if (material === "print-identity" || material.startsWith("print-floor-")) {
    return { halftone: "soft", registration: "subtle", reactive: true };
  }
  if (material === "clean-registration") return { halftone: "none", registration: "subtle", reactive: false };
  if (material === "ink-registration") return { halftone: "none", registration: "ink", reactive: false };
  return { halftone: "none", registration: "subtle", reactive: true };
}

let edgeSmall: HTMLCanvasElement | null = null;
let photoScratch: HTMLCanvasElement | null = null;
let impressionScratch: HTMLCanvasElement | null = null;
let pairScratch: HTMLCanvasElement | null = null;
let screenDist: Float32Array | null = null;
let screenCacheW = 0;
let screenCacheH = 0;
let screenCacheKind: HalftoneKind = "none";
let prepared = false;
let preparedW = 0;
let preparedH = 0;
export let lastPrintImpressionMs = 0;
export let lastPrintTiming = { cacheMs: 0, toneMs: 0, regMs: 0, totalMs: 0 };
export let lastPrintAudit = {
  material: "print-identity" as PrintImpressionMaterial,
  period: 0,
  cols: 0,
  rows: 0,
  kind: "none" as HalftoneKind,
  width: 0,
  height: 0,
  highlightFloor: PRINT_HIGHLIGHT_FLOOR,
};

export function printScreenPeriod(width: number, height: number): number {
  return PRINT_SCREEN_PERIOD_AT_1080 * (Math.min(width, height) / OFFSET_REF);
}

export function invalidatePrintImpressions(): void {
  prepared = false;
  preparedW = 0;
  preparedH = 0;
}

export function printImpressionsPrepared(): boolean {
  return prepared;
}

function printOffset(baseAt1080: number, width: number, height: number): number {
  return baseAt1080 * (Math.min(width, height) / OFFSET_REF);
}

function buildEdgeMap(source: HTMLCanvasElement, width: number, height: number): void {
  if (!edgeSmall) edgeSmall = makeCanvas();
  const smallW = EDGE_W;
  const smallH = Math.max(1, Math.round(smallW * (height / Math.max(1, width))));
  sizeCanvas(edgeSmall, smallW, smallH);
  const ctx = edgeSmall.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, smallW, smallH);
  ctx.filter = "blur(0.7px)";
  ctx.drawImage(source, 0, 0, smallW, smallH);
  ctx.filter = "none";
  const img = ctx.getImageData(0, 0, smallW, smallH);
  const d = img.data;
  const luma = new Float32Array(smallW * smallH);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    luma[p] = d[i]! * 0.2126 + d[i + 1]! * 0.7152 + d[i + 2]! * 0.0722;
  }
  for (let y = 0; y < smallH; y++) {
    const y0 = y === 0 ? y : y - 1;
    const y1 = y === smallH - 1 ? y : y + 1;
    for (let x = 0; x < smallW; x++) {
      const x0 = x === 0 ? x : x - 1;
      const x1 = x === smallW - 1 ? x : x + 1;
      const gx = luma[y * smallW + x1]! - luma[y * smallW + x0]!;
      const gy = luma[y1 * smallW + x]! - luma[y0 * smallW + x]!;
      const mag = Math.hypot(gx, gy) / 255;
      let t = (mag - 0.055) / 0.22;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const edge = t * t * (3 - 2 * t);
      const o = (y * smallW + x) * 4;
      d[o] = 255;
      d[o + 1] = 255;
      d[o + 2] = 255;
      d[o + 3] = Math.round(edge * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function preparePrintImpressions(
  composed: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  buildEdgeMap(composed, width, height);
  prepared = true;
  preparedW = width;
  preparedH = height;
}

interface ImpressionRecipe {
  off: number;
  mixA: number;
  mixB: number;
  blurA: number;
  blurB: number;
  darkA: number;
  lightB: number;
}

function persistRecipe(kind: RegistrationKind): ImpressionRecipe {
  if (kind === "ink") return { off: 1.05, mixA: 0.13, mixB: 0.08, blurA: 0.55, blurB: 0, darkA: 0.045, lightB: 0.028 };
  if (kind === "strong") return { off: 1.45, mixA: 0.16, mixB: 0.1, blurA: 0.5, blurB: 0.12, darkA: 0.05, lightB: 0.03 };
  return { off: 0.85, mixA: 0.1, mixB: 0.065, blurA: 0.4, blurB: 0, darkA: 0.038, lightB: 0.022 };
}

function reactRecipe(): ImpressionRecipe {
  return { off: 1.7, mixA: 0.2, mixB: 0.12, blurA: 0.7, blurB: 0.15, darkA: 0.055, lightB: 0.032 };
}

function blitImpression(
  dest: CanvasRenderingContext2D,
  photo: HTMLCanvasElement,
  width: number,
  height: number,
  dx: number,
  dy: number,
  mix: number,
  blur: number,
  density: number,
  darken: boolean,
): void {
  if (mix <= 0.001 || !edgeSmall) return;
  if (!impressionScratch) impressionScratch = makeCanvas();
  sizeCanvas(impressionScratch, width, height);
  const ictx = impressionScratch.getContext("2d")!;
  ictx.clearRect(0, 0, width, height);
  ictx.imageSmoothingEnabled = true;
  if (blur > 0.2) {
    ictx.filter = `blur(${blur.toFixed(2)}px)`;
    ictx.drawImage(photo, dx, dy);
    ictx.filter = "none";
  } else {
    ictx.drawImage(photo, dx, dy);
  }
  if (density > 0.001) {
    ictx.globalCompositeOperation = "source-atop";
    ictx.fillStyle = darken
      ? `rgba(12,10,8,${density.toFixed(3)})`
      : `rgba(248,246,242,${density.toFixed(3)})`;
    ictx.fillRect(0, 0, width, height);
    ictx.globalCompositeOperation = "source-over";
  }
  ictx.globalCompositeOperation = "destination-in";
  ictx.drawImage(edgeSmall, 0, 0, edgeSmall.width, edgeSmall.height, 0, 0, width, height);
  ictx.globalCompositeOperation = "source-over";
  dest.save();
  dest.globalAlpha = mix;
  dest.globalCompositeOperation = "source-over";
  dest.drawImage(impressionScratch, 0, 0);
  dest.restore();
}

function blitPair(
  dest: CanvasRenderingContext2D,
  photo: HTMLCanvasElement,
  width: number,
  height: number,
  recipe: ImpressionRecipe,
): void {
  const off = printOffset(recipe.off, width, height);
  const blurScale = Math.min(width, height) / OFFSET_REF;
  blitImpression(dest, photo, width, height, off, -off * 0.35, recipe.mixA, recipe.blurA * blurScale, recipe.darkA, true);
  blitImpression(dest, photo, width, height, -off, off * 0.35, recipe.mixB, recipe.blurB * blurScale, recipe.lightB, false);
}

function highlightFloorFor(material: PrintImpressionMaterial): number {
  if (material === "print-floor-00") return 0;
  if (material === "print-floor-10") return 0.1;
  if (material === "print-floor-15") return 0.15;
  if (material === "print-floor-20") return 0.2;
  if (material === "print-identity") return PRINT_HIGHLIGHT_FLOOR;
  return 0;
}

function ensureScreenDist(width: number, height: number, kind: Exclude<HalftoneKind, "none">): number {
  if (screenDist && screenCacheW === width && screenCacheH === height && screenCacheKind === kind) {
    lastPrintTiming.cacheMs = 0;
    return 0;
  }
  const t0 = performance.now();
  const period = printScreenPeriod(width, height);
  const angle = kind === "dot" ? 0 : SOFT_ANGLE;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const aspect = kind === "dot" ? 1 : SOFT_ASPECT;
  const invX = 1 / period;
  const invY = 1 / (period * aspect);
  const dist = new Float32Array(width * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const sy = y + 0.5;
    for (let x = 0; x < width; x++, p++) {
      const sx = x + 0.5;
      const rx = (sx * ca + sy * sa) * invX;
      const ry = (-sx * sa + sy * ca) * invY;
      const fx = rx - Math.floor(rx) - 0.5;
      const fy = ry - Math.floor(ry) - 0.5;
      dist[p] = Math.hypot(fx, fy) * 2;
    }
  }
  screenDist = dist;
  screenCacheW = width;
  screenCacheH = height;
  screenCacheKind = kind;
  lastPrintTiming.cacheMs = performance.now() - t0;
  return lastPrintTiming.cacheMs;
}

function applyHalftone(
  dest: CanvasRenderingContext2D,
  width: number,
  height: number,
  kind: Exclude<HalftoneKind, "none">,
  highlightFloor: number,
): void {
  const period = printScreenPeriod(width, height);
  lastPrintAudit.period = period;
  lastPrintAudit.cols = Math.ceil(width / period);
  lastPrintAudit.rows = Math.ceil(height / period);
  lastPrintAudit.kind = kind;
  lastPrintAudit.width = width;
  lastPrintAudit.height = height;
  lastPrintAudit.highlightFloor = highlightFloor;

  ensureScreenDist(width, height, kind);
  const distField = screenDist!;
  const tTone = performance.now();
  const img = dest.getImageData(0, 0, width, height);
  const d = img.data;
  const soft = kind === "soft" ? SOFT_SOFTNESS : kind === "elliptical" ? 0.2 : 0.13;
  const amount = kind === "soft" ? SOFT_AMOUNT : 0.44;
  const invSoft = 1 / (soft * 2);
  const n = width * height;

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (d[i + 3]! < 8) continue;
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const luma = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 0.00392156862745098;
    let ink = (1 - luma - 0.055) / 0.83;
    if (ink < 0) ink = 0;
    else if (ink > 1) ink = 1;
    ink = ink * ink * (3 - 2 * ink);
    if (highlightFloor > 0) {
      const pale = luma > 0.76 ? (luma - 0.76) * 4.166666666666667 : 0;
      const minInk = highlightFloor * pale * pale;
      if (ink < minInk) ink = minInk;
    }
    const radius = 0.065 + ink * 0.56;
    let cov = (radius + soft - distField[p]!) * invSoft;
    if (cov <= 0) continue;
    if (cov > 1) cov = 1;
    else cov = cov * cov * (3 - 2 * cov);

    const t = cov * amount;
    const lift = 1 - cov;
    d[i] = r + ((r * 0.91 + (250 - r) * 0.05 * lift) - r) * t;
    d[i + 1] = g + ((g * 0.915 + (248 - g) * 0.05 * lift) - g) * t;
    d[i + 2] = b + ((b * 0.92 + (244 - b) * 0.045 * lift) - b) * t;
  }
  dest.putImageData(img, 0, 0);
  lastPrintTiming.toneMs = performance.now() - tTone;
}

export function paintPrintImpressions(
  dest: CanvasRenderingContext2D,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
  material: PrintImpressionMaterial,
  persistAmount: number,
  reactAmount: number,
  buildBoundary: (mask: HTMLCanvasElement, w: number, h: number) => HTMLCanvasElement,
): void {
  if (!prepared || preparedW !== width || preparedH !== height) return;
  const t0 = performance.now();
  const recipe = recipeFor(material);
  lastPrintAudit.material = material;
  lastPrintAudit.kind = recipe.halftone;
  lastPrintAudit.width = width;
  lastPrintAudit.height = height;
  lastPrintAudit.period = recipe.halftone === "none" ? 0 : printScreenPeriod(width, height);
  lastPrintAudit.highlightFloor = highlightFloorFor(material);
  lastPrintTiming.cacheMs = 0;
  lastPrintTiming.toneMs = 0;

  if (!photoScratch) photoScratch = makeCanvas();
  sizeCanvas(photoScratch, width, height);
  const pctx = photoScratch.getContext("2d")!;
  pctx.drawImage(dest.canvas, 0, 0);
  if (recipe.registration !== "off" || recipe.reactive) {
    buildEdgeMap(photoScratch, width, height);
  }

  if (recipe.registration !== "off") {
    const persist = persistRecipe(recipe.registration);
    persist.mixA *= persistAmount / 0.1;
    persist.mixB *= persistAmount / 0.1;
    blitPair(dest, photoScratch, width, height, persist);
  }

  if (recipe.reactive && reactAmount > 0.001) {
    if (!pairScratch) pairScratch = makeCanvas();
    sizeCanvas(pairScratch, width, height);
    const rctx = pairScratch.getContext("2d")!;
    rctx.clearRect(0, 0, width, height);
    const react = reactRecipe();
    react.mixA *= reactAmount / 0.4;
    react.mixB *= reactAmount / 0.4;
    blitPair(rctx, photoScratch, width, height, react);
    const boundary = buildBoundary(maskLayer, width, height);
    rctx.save();
    rctx.globalCompositeOperation = "destination-in";
    rctx.globalAlpha = Math.min(1, reactAmount * 1.35);
    rctx.drawImage(boundary, 0, 0, boundary.width, boundary.height, 0, 0, width, height);
    rctx.globalCompositeOperation = "source-over";
    rctx.globalAlpha = 1;
    rctx.restore();
    dest.drawImage(pairScratch, 0, 0);
  }

  const tReg = performance.now();
  lastPrintTiming.regMs = tReg - t0;
  if (recipe.halftone !== "none") {
    applyHalftone(dest, width, height, recipe.halftone, highlightFloorFor(material));
  }
  lastPrintImpressionMs = performance.now() - t0;
  lastPrintTiming.totalMs = lastPrintImpressionMs;
}
