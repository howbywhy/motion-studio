import { sampleAverageColor, type RGB } from "../../core/media";
import type { ResolvedField } from "./fields";

// --- pooled scratch canvases -------------------------------------------
// Reused across frames/fields instead of allocated fresh — canvas backing
// stores are relatively expensive to create, and a treatment can touch a
// handful of fields every single frame.

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

let contentScratch: HTMLCanvasElement | null = null;
let tintScratch: HTMLCanvasElement | null = null;
let cleanScratch: HTMLCanvasElement | null = null;

function ensureSize(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

function getScratches(width: number, height: number) {
  if (!contentScratch) contentScratch = makeCanvas();
  if (!tintScratch) tintScratch = makeCanvas();
  if (!cleanScratch) cleanScratch = makeCanvas();
  ensureSize(contentScratch, width, height);
  ensureSize(tintScratch, width, height);
  ensureSize(cleanScratch, width, height);
  return { contentScratch, tintScratch, cleanScratch };
}

// --- shared geometry ------------------------------------------------------

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fieldBBox(field: ResolvedField, pad: number, width: number, height: number): BBox {
  const x0 = Math.max(0, Math.floor(field.cx - field.radius * pad));
  const y0 = Math.max(0, Math.floor(field.cy - field.radius * pad));
  const x1 = Math.min(width, Math.ceil(field.cx + field.radius * pad));
  const y1 = Math.min(height, Math.ceil(field.cy + field.radius * pad));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function ringStencil(
  sctx: CanvasRenderingContext2D,
  field: ResolvedField,
  bbox: BBox,
  amount: number,
  sharp: boolean
): void {
  sctx.save();
  sctx.globalCompositeOperation = "destination-in";
  const a = field.alpha * amount;
  const g = sctx.createRadialGradient(field.cx, field.cy, 0, field.cx, field.cy, field.radius);
  if (sharp) {
    // A narrower, more defined band right at the mask's own edge — this is
    // what keeps Registration reading as graphic/precise rather than
    // inheriting Bloom's atmospheric falloff.
    const ringStart = field.innerStop * 1.05;
    const ringPeak = field.innerStop + (1 - field.innerStop) * 0.4;
    const ringEnd = field.innerStop + (1 - field.innerStop) * 0.8;
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(Math.min(0.999, ringStart), "rgba(255,255,255,0)");
    g.addColorStop(ringPeak, `rgba(255,255,255,${a})`);
    g.addColorStop(Math.min(1, ringEnd), "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    const ringPeak = field.innerStop + (1 - field.innerStop) * 0.5;
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(field.innerStop, "rgba(255,255,255,0)");
    g.addColorStop(ringPeak, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  sctx.fillStyle = g;
  sctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.restore();
}

/** Draws `content` into a scratch canvas, confines it to the field's own
 * boundary ring (via the same gradient shape the boundary layer paints, or
 * a narrower/more graphic band when `sharp`), and composites the result
 * onto `main` — clipped to the field's bounding box throughout, so cost
 * scales with field size, not canvas size. */
function paintRingClipped(
  main: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  field: ResolvedField,
  width: number,
  height: number,
  amount: number,
  content: (sctx: CanvasRenderingContext2D, bbox: BBox) => void,
  sharp = false
): void {
  const bbox = fieldBBox(field, 1.35, width, height);
  if (bbox.w <= 1 || bbox.h <= 1 || field.alpha <= 0.002) return;

  const sctx = scratch.getContext("2d")!;
  sctx.clearRect(bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.save();
  sctx.beginPath();
  sctx.rect(bbox.x, bbox.y, bbox.w, bbox.h);
  sctx.clip();
  content(sctx, bbox);
  sctx.restore();

  ringStencil(sctx, field, bbox, amount, sharp);

  main.drawImage(scratch, bbox.x, bbox.y, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
}

// --- CLEAN ------------------------------------------------------------

/** The reference treatment: A everywhere, B revealed strictly through the
 * mask already computed this frame. Reimplements the renderer's old
 * generic destination-in path locally so all three treatments share one
 * code path in the renderer (`renderComposite`), not a special case. */
export function paintClean(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number
): void {
  const { cleanScratch: scratch } = getScratches(width, height);
  const sctx = scratch.getContext("2d")!;
  sctx.clearRect(0, 0, width, height);
  sctx.globalCompositeOperation = "source-over";
  sctx.drawImage(bLayer, 0, 0);
  sctx.globalCompositeOperation = "destination-in";
  sctx.drawImage(maskLayer, 0, 0);
  sctx.globalCompositeOperation = "source-over";

  ctx.drawImage(aLayer, 0, 0);
  ctx.drawImage(scratch, 0, 0);
}

// --- REFRACTION ---------------------------------------------------------

/** Physical/optical: right at each field's boundary ring, a scaled copy of
 * A (bulging outward, "pulled toward" the field) sits under a scaled copy
 * of B (pulled slightly in, "displaced before resolving"). Both are
 * centered on the field itself, so the bend is strongest exactly at the
 * transition and fades to nothing at the field's mature center and past
 * its outer edge — never a whole-image distortion. */
export function paintRefraction(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  maskLayer: HTMLCanvasElement,
  fields: ResolvedField[],
  width: number,
  height: number,
  amount: number
): void {
  paintClean(ctx, aLayer, bLayer, maskLayer, width, height);
  if (amount <= 0.001) return;

  const { contentScratch: scratch } = getScratches(width, height);
  const bend = 0.02 + amount * 0.05;

  for (const field of fields) {
    paintRingClipped(ctx, scratch, field, width, height, amount, (sctx) => {
      sctx.save();
      sctx.translate(field.cx, field.cy);
      sctx.scale(1 + bend, 1 + bend);
      sctx.translate(-field.cx, -field.cy);
      sctx.drawImage(aLayer, 0, 0);
      sctx.restore();

      sctx.save();
      sctx.globalAlpha = 0.6;
      sctx.translate(field.cx, field.cy);
      sctx.scale(1 - bend * 0.7, 1 - bend * 0.7);
      sctx.translate(-field.cx, -field.cy);
      sctx.drawImage(bLayer, 0, 0);
      sctx.restore();
    });
  }
}

// --- REGISTRATION ---------------------------------------------------------

let halftonePattern: CanvasPattern | null = null;
function getHalftonePattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (halftonePattern) return halftonePattern;
  const tile = makeCanvas();
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

/** Print/graphic: right at each field's boundary ring, the emerging photo
 * momentarily separates into two mis-registered "inks" — a hard black
 * contrast pass and a pass tinted from the photograph's own average color
 * — plus a faint halftone screen, all confined to the ring and fading out
 * as the field matures, so it reads as a transitional print-reproduction
 * state rather than a permanent filter. */
export function paintRegistration(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  maskLayer: HTMLCanvasElement,
  fields: ResolvedField[],
  width: number,
  height: number,
  amount: number
): void {
  paintClean(ctx, aLayer, bLayer, maskLayer, width, height);
  if (amount <= 0.001) return;

  const now = performance.now();
  if (now - lastTintAt > 400) {
    lastTintAt = now;
    const avg = sampleAverageColor(bLayer);
    lastTint = { r: avg.r * 0.62, g: avg.g * 0.62, b: avg.b * 0.62 };
  }

  const { contentScratch: scratch, tintScratch } = getScratches(width, height);
  const off = 2 + amount * 5;
  const tctx = tintScratch.getContext("2d")!;

  for (const field of fields) {
    const bbox = fieldBBox(field, 1.35, width, height);
    if (bbox.w <= 1 || bbox.h <= 1) continue;

    // Isolated color-separation pass, tinted from the media's own color —
    // built separately so it layers cleanly onto the black pass below
    // rather than multiplying into it (which was crushing dark photo
    // regions into a flat black smudge with no visible structure).
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
    tctx.fillStyle = `rgb(${lastTint.r | 0},${lastTint.g | 0},${lastTint.b | 0})`;
    tctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    tctx.restore();

    paintRingClipped(
      ctx,
      scratch,
      field,
      width,
      height,
      amount,
      (sctx) => {
        // Black separation: high-contrast grayscale B, offset — drawn at
        // partial alpha (not solid) so it reads as an ink layer, not a
        // silhouette that crushes everything beneath it to black.
        sctx.save();
        sctx.globalAlpha = 0.8;
        sctx.filter = "grayscale(1) contrast(1.55)";
        sctx.translate(off, -off * 0.4);
        sctx.drawImage(bLayer, 0, 0);
        sctx.filter = "none";
        sctx.restore();

        // Tinted color separation, offset the other way, layered on top —
        // the two half-transparent offset passes are what read as
        // mis-registered print, rather than either one alone.
        sctx.save();
        sctx.globalAlpha = 0.6;
        sctx.drawImage(tintScratch, bbox.x, bbox.y, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
        sctx.restore();

        // A light halftone accent
        sctx.save();
        sctx.globalAlpha = 0.22;
        sctx.fillStyle = getHalftonePattern(sctx);
        sctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
        sctx.restore();
      },
      true
    );
  }
}
