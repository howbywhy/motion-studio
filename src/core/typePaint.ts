import { currentInkTint, paintRegistrationInkContent, type InkBBox } from "./registrationInk";
import { switzerFont, switzerReady } from "./typeFont";
import type { TypeLayout } from "./typeLayout";
import type { TypeMotionState } from "./typeMotion";

let glyphCanvas: HTMLCanvasElement | null = null;
let glyphCtx: CanvasRenderingContext2D | null = null;
let inkCanvas: HTMLCanvasElement | null = null;
let inkCtx: CanvasRenderingContext2D | null = null;
let tintCanvas: HTMLCanvasElement | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let overlayKey = "";

function layer(existing: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const c = existing ?? document.createElement("canvas");
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement, prev: CanvasRenderingContext2D | null): CanvasRenderingContext2D {
  if (prev && prev.canvas === c) return prev;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  return ctx;
}

function paintLines(
  ctx: CanvasRenderingContext2D,
  layout: TypeLayout,
  motion: TypeMotionState,
  color: string,
): void {
  ctx.save();
  ctx.translate(layout.offsetX, layout.offsetY);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const m = motion.lines[i] ?? { dx: 0, dy: 0, opacity: 1, clipT: 1, weight: motion.weight };
    if (m.opacity <= 0.01 || m.clipT <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = m.opacity;
    ctx.font = switzerFont(m.weight, layout.fontSize);
    const x = line.x + m.dx;
    const y = line.y + m.dy;
    if (m.clipT < 0.999) {
      ctx.beginPath();
      ctx.rect(x - 2, y - line.height * 0.88, line.width + 4, line.height * m.clipT);
      ctx.clip();
    }
    ctx.fillText(line.text, x, y);
    ctx.restore();
  }
  ctx.restore();
}

export function paintTypography(
  ctx: CanvasRenderingContext2D,
  layout: TypeLayout,
  motion: TypeMotionState,
  color: string,
): void {
  if (!motion.visible || layout.lines.length === 0) return;
  if (!switzerReady()) return;
  paintLines(ctx, layout, motion, color);
}

function typeBBox(layout: TypeLayout, motion: TypeMotionState, pad: number, w: number, h: number): InkBBox | null {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const m = motion.lines[i] ?? { dx: 0, dy: 0, opacity: 1, clipT: 1, weight: motion.weight };
    if (m.opacity <= 0.01) continue;
    const x = line.x + m.dx + layout.offsetX;
    const y = line.y + m.dy + layout.offsetY - line.height * 0.92;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + line.width);
    maxY = Math.max(maxY, y + line.height);
  }
  if (maxX <= minX || maxY <= minY) return null;
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  return {
    x,
    y,
    w: Math.min(w - x, Math.ceil(maxX - minX + pad * 2)),
    h: Math.min(h - y, Math.ceil(maxY - minY + pad * 2)),
  };
}

/** Same Bloom Registration ink, sourced from the type raster and confined
 *  to glyphs. Photo Registration is unchanged; this is a type-only plate. */
export function paintTypeRegistration(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  motion: TypeMotionState,
  photoLayer: HTMLCanvasElement,
  amount: number,
): void {
  if (!motion.visible || layout.lines.length === 0 || amount <= 0.001) return;
  if (!switzerReady()) return;
  const w = dest.canvas.width;
  const h = dest.canvas.height;
  const bbox = typeBBox(layout, motion, 8, w, h);
  if (!bbox) return;

  glyphCanvas = layer(glyphCanvas, w, h);
  inkCanvas = layer(inkCanvas, w, h);
  tintCanvas = layer(tintCanvas, w, h);
  glyphCtx = ctx2d(glyphCanvas, glyphCtx);
  inkCtx = ctx2d(inkCanvas, inkCtx);

  glyphCtx.setTransform(1, 0, 0, 1, 0, 0);
  glyphCtx.globalCompositeOperation = "source-over";
  glyphCtx.globalAlpha = 1;
  glyphCtx.clearRect(0, 0, w, h);
  paintLines(glyphCtx, layout, motion, "#ffffff");

  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.globalCompositeOperation = "source-over";
  inkCtx.globalAlpha = 1;
  inkCtx.clearRect(0, 0, w, h);

  currentInkTint(photoLayer);
  const off = Math.max(0.7, (2 + amount * 5) * 0.48);
  paintRegistrationInkContent(inkCtx, tintCanvas, glyphCanvas, bbox, off, false);

  inkCtx.globalCompositeOperation = "destination-in";
  inkCtx.drawImage(glyphCanvas, 0, 0);
  inkCtx.globalCompositeOperation = "source-over";

  dest.save();
  dest.globalAlpha = 0.42;
  dest.globalCompositeOperation = "source-over";
  dest.drawImage(inkCanvas, bbox.x, bbox.y, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
  dest.restore();
}

export function paintTypeLayer(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  motion: TypeMotionState,
  color: string,
  photoLayer: HTMLCanvasElement,
  registrationOn: boolean,
  amount: number,
): void {
  if (!motion.visible || layout.lines.length === 0) return;
  if (!switzerReady()) return;
  const w = dest.canvas.width;
  const h = dest.canvas.height;
  const key = [
    w,
    h,
    color,
    registrationOn ? 1 : 0,
    amount,
    layout.fontSize,
    layout.offsetX,
    layout.offsetY,
    layout.weight,
    layout.lines.map((l) => `${l.text}:${l.x}:${l.y}:${l.width}`).join("|"),
    motion.lines.map((l) => `${l.dx.toFixed(1)},${l.dy.toFixed(1)},${l.opacity.toFixed(2)},${l.clipT.toFixed(2)},${l.weight.toFixed(0)}`).join("|"),
  ].join("\t");
  if (overlayCanvas && overlayKey === key && overlayCanvas.width === w && overlayCanvas.height === h) {
    dest.drawImage(overlayCanvas, 0, 0);
    return;
  }
  overlayCanvas = layer(overlayCanvas, w, h);
  overlayCtx = ctx2d(overlayCanvas, overlayCtx);
  overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  overlayCtx.globalAlpha = 1;
  overlayCtx.globalCompositeOperation = "source-over";
  overlayCtx.clearRect(0, 0, w, h);
  paintLines(overlayCtx, layout, motion, color);
  if (registrationOn) paintTypeRegistration(overlayCtx, layout, motion, photoLayer, amount);
  overlayKey = key;
  dest.drawImage(overlayCanvas, 0, 0);
}

export function disposeTypeScratch(): void {
  overlayKey = "";
  for (const c of [glyphCanvas, inkCanvas, tintCanvas, overlayCanvas]) {
    if (c) {
      c.width = 1;
      c.height = 1;
    }
  }
}
