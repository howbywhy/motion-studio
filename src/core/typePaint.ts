import { switzerFont, switzerReady } from "./typeFont";
import { opticalFramePx, typeInkBox, type TypeLayout } from "./typeLayout";
import { canvasBlendOp } from "./typeState";

const overlays: [HTMLCanvasElement | null, HTMLCanvasElement | null] = [null, null];
const overlayCtxs: [CanvasRenderingContext2D | null, CanvasRenderingContext2D | null] = [null, null];
const overlayKeys: [string, string] = ["", ""];

const stamps: [HTMLCanvasElement | null, HTMLCanvasElement | null] = [null, null];
const stampCtxs: [CanvasRenderingContext2D | null, CanvasRenderingContext2D | null] = [null, null];
const stampKeys: [string, string] = ["", ""];
const stampOrigin: [{ x: number; y: number } | null, { x: number; y: number } | null] = [null, null];

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
    layout.textAlign,
    layout.lines.map((l) => `${l.text}:${l.x}:${l.y}:${l.width}`).join("|"),
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

function drawLine(
  ctx: CanvasRenderingContext2D,
  layout: TypeLayout,
  line: TypeLayout["lines"][number],
): void {
  if (layout.tracking !== 0 && typeof (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing !== "string") {
    let x = line.x;
    for (const ch of line.text) {
      ctx.fillText(ch, x, line.y);
      x += ctx.measureText(ch).width + layout.tracking;
    }
    return;
  }
  ctx.fillText(line.text, line.x, line.y);
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
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
  for (const line of layout.lines) drawLine(ctx, layout, line);
}

function ensureOverlay(
  layout: TypeLayout,
  color: string,
  opacity: number,
  slot: 0 | 1,
  w: number,
  h: number,
): HTMLCanvasElement {
  const key = staticKey(layout, color, opacity);
  if (overlays[slot] && overlayKeys[slot] === key && overlays[slot]!.width === w && overlays[slot]!.height === h) {
    return overlays[slot]!;
  }
  overlays[slot] = layer(overlays[slot], w, h);
  overlayCtxs[slot] = ctx2d(overlays[slot]!, overlayCtxs[slot]);
  const ctx = overlayCtxs[slot]!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  clipOptical(ctx, w, h);
  ctx.translate(layout.offsetX, layout.offsetY);
  drawLines(ctx, layout, color, opacity);
  ctx.restore();
  overlayKeys[slot] = key;
  return overlays[slot]!;
}

/** Unclipped raster of one composed type block. Duplicates reuse this stamp;
 * they are graphic instances, not re-laid type. */
function ensureStamp(
  layout: TypeLayout,
  color: string,
  opacity: number,
  slot: 0 | 1,
): { canvas: HTMLCanvasElement; x: number; y: number } {
  const key = staticKey(layout, color, opacity);
  const box = typeInkBox(layout);
  const pad = 2;
  const x = Math.floor(box.l + layout.offsetX - pad);
  const y = Math.floor(box.t + layout.offsetY - pad);
  const w = Math.max(1, Math.ceil(box.r + layout.offsetX + pad) - x);
  const h = Math.max(1, Math.ceil(box.b + layout.offsetY + pad) - y);
  if (
    stamps[slot] &&
    stampKeys[slot] === key &&
    stampOrigin[slot] &&
    stampOrigin[slot]!.x === x &&
    stampOrigin[slot]!.y === y &&
    stamps[slot]!.width === w &&
    stamps[slot]!.height === h
  ) {
    return { canvas: stamps[slot]!, x, y };
  }
  stamps[slot] = layer(stamps[slot], w, h);
  stampCtxs[slot] = ctx2d(stamps[slot]!, stampCtxs[slot]);
  const ctx = stampCtxs[slot]!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(layout.offsetX - x, layout.offsetY - y);
  drawLines(ctx, layout, color, opacity);
  ctx.restore();
  stampKeys[slot] = key;
  stampOrigin[slot] = { x, y };
  return { canvas: stamps[slot]!, x, y };
}

/** Draw a cached type stamp at a translation. No optical-frame clip — copies
 * may crop at the canvas edge. Does not recompose typography. */
export function paintTypeStamp(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  slot: 0 | 1,
  dx: number,
  dy: number,
): void {
  if (layout.lines.length === 0) return;
  if (!switzerReady()) return;
  const stamp = ensureStamp(layout, color, opacity, slot);
  const prev = dest.globalCompositeOperation;
  dest.globalCompositeOperation = canvasBlendOp(layout.blendMode);
  dest.drawImage(stamp.canvas, Math.round(stamp.x + dx), Math.round(stamp.y + dy));
  dest.globalCompositeOperation = prev;
}

/** PRODUCT: one clean Switzer silhouette per block. Typography is static.
 * Paints after Registration and must not alter the photographic
 * Registration algorithm (golden master 728ff08). */
export function paintTypeLayer(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  _unused?: unknown,
  slot: 0 | 1 = 0,
): void {
  if (layout.lines.length === 0) return;
  if (!switzerReady()) return;
  const overlay = ensureOverlay(layout, color, opacity, slot, dest.canvas.width, dest.canvas.height);
  const prev = dest.globalCompositeOperation;
  dest.globalCompositeOperation = canvasBlendOp(layout.blendMode);
  dest.drawImage(overlay, 0, 0);
  dest.globalCompositeOperation = prev;
}

export function disposeTypeScratch(): void {
  overlayKeys[0] = "";
  overlayKeys[1] = "";
  stampKeys[0] = "";
  stampKeys[1] = "";
  stampOrigin[0] = null;
  stampOrigin[1] = null;
  for (const slot of [0, 1] as const) {
    if (overlays[slot]) {
      overlays[slot]!.width = 1;
      overlays[slot]!.height = 1;
    }
    if (stamps[slot]) {
      stamps[slot]!.width = 1;
      stamps[slot]!.height = 1;
    }
  }
}
