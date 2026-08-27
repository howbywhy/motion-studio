import { switzerFont, switzerReady } from "./typeFont";
import { opticalFramePx, type TypeLayout } from "./typeLayout";
import type { TypeSequenceState } from "./typeMotion";

let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let overlayKey = "";

let unitCanvases: HTMLCanvasElement[] = [];
let unitKey = "";

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

function staticKey(layout: TypeLayout, color: string, opacity: number): string {
  return [
    layout.canvasW,
    layout.canvasH,
    color,
    opacity,
    layout.fontSize,
    layout.tracking,
    layout.offsetX,
    layout.offsetY,
    layout.weight,
    layout.lines.map((l) => `${l.unit}:${l.text}:${l.x}:${l.y}:${l.width}`).join("|"),
  ].join("\t");
}

function clipOptical(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const frame = opticalFramePx(w);
  const clipL = Math.ceil(frame);
  const clipT = Math.ceil(frame);
  const clipR = Math.floor(w - frame);
  const clipB = Math.floor(h - frame);
  ctx.beginPath();
  ctx.rect(clipL, clipT, Math.max(0, clipR - clipL), Math.max(0, clipB - clipT));
  ctx.clip();
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  unit: number | null,
): void {
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
  ctx.font = switzerFont(layout.weight, layout.fontSize);
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof spaced.letterSpacing === "string") {
    spaced.letterSpacing = `${layout.tracking}px`;
  }
  for (const line of layout.lines) {
    if (unit !== null && line.unit !== unit) continue;
    if (layout.tracking !== 0 && typeof spaced.letterSpacing !== "string") {
      let x = line.x;
      for (const ch of line.text) {
        ctx.fillText(ch, x, line.y);
        x += ctx.measureText(ch).width + layout.tracking;
      }
    } else {
      ctx.fillText(line.text, line.x, line.y);
    }
  }
}

function rasterUnits(layout: TypeLayout, color: string): HTMLCanvasElement[] {
  const w = Math.max(1, Math.round(layout.canvasW));
  const h = Math.max(1, Math.round(layout.canvasH));
  const key = staticKey(layout, color, 1);
  if (unitKey === key && unitCanvases.length > 0 && unitCanvases[0]?.width === w) return unitCanvases;
  let n = 0;
  for (const line of layout.lines) n = Math.max(n, line.unit + 1);
  n = Math.max(1, n);
  const next: HTMLCanvasElement[] = [];
  for (let i = 0; i < n; i++) {
    const c = layer(unitCanvases[i] ?? null, w, h);
    const ctx = ctx2d(c, null);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(layout.offsetX, layout.offsetY);
    drawLines(ctx, layout, color, 1, i);
    ctx.restore();
    next.push(c);
  }
  unitCanvases = next;
  unitKey = key;
  return next;
}

function paintStatic(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
): void {
  const w = dest.canvas.width;
  const h = dest.canvas.height;
  const key = staticKey(layout, color, opacity);
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
  overlayCtx.save();
  clipOptical(overlayCtx, w, h);
  overlayCtx.translate(layout.offsetX, layout.offsetY);
  drawLines(overlayCtx, layout, color, opacity, null);
  overlayCtx.restore();
  overlayKey = key;
  dest.drawImage(overlayCanvas, 0, 0);
}

function paintSequenced(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  sequence: TypeSequenceState,
): void {
  const w = dest.canvas.width;
  const h = dest.canvas.height;
  const layers = rasterUnits(layout, color);
  dest.save();
  clipOptical(dest, w, h);
  for (let i = 0; i < sequence.units.length; i++) {
    const u = sequence.units[i]!;
    if (u.opacity < 0.004) continue;
    const src = layers[i];
    if (!src) continue;
    dest.globalAlpha = Math.min(1, Math.max(0, opacity * u.opacity));
    dest.drawImage(src, u.dx, u.dy);
  }
  dest.restore();
}

/** PRODUCT: one clean Switzer silhouette. Sequencing may fade / nudge authored
 * units. No scale, blur, tracking, or weight animation.
 * Typography paints after Registration and must not alter the photographic
 * Registration algorithm (golden master 728ff08). */
export function paintTypeLayer(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  sequence?: TypeSequenceState | null,
): void {
  if (layout.lines.length === 0) return;
  if (!switzerReady()) return;
  if (!sequence || sequence.identity) {
    paintStatic(dest, layout, color, opacity);
    return;
  }
  paintSequenced(dest, layout, color, opacity, sequence);
}

export function disposeTypeScratch(): void {
  overlayKey = "";
  unitKey = "";
  if (overlayCanvas) {
    overlayCanvas.width = 1;
    overlayCanvas.height = 1;
  }
  for (const c of unitCanvases) {
    c.width = 1;
    c.height = 1;
  }
  unitCanvases = [];
}
