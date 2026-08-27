import { switzerFont, switzerReady } from "./typeFont";
import { opticalFramePx, type TypeLayout } from "./typeLayout";

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

/** PRODUCT: one clean Switzer silhouette. No motion, stroke, shadow, or bevel.
 * Typography paints after Registration and must not alter the photographic
 * Registration algorithm (golden master 728ff08). */
export function paintTypeLayer(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
): void {
  if (layout.lines.length === 0) return;
  if (!switzerReady()) return;
  const w = dest.canvas.width;
  const h = dest.canvas.height;
  const key = [
    w,
    h,
    color,
    opacity,
    layout.fontSize,
    layout.tracking,
    layout.offsetX,
    layout.offsetY,
    layout.weight,
    layout.lines.map((l) => `${l.text}:${l.x}:${l.y}:${l.width}`).join("|"),
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
  overlayCtx.save();
  const frame = opticalFramePx(w);
  const clipL = Math.ceil(frame);
  const clipT = Math.ceil(frame);
  const clipR = Math.floor(w - frame);
  const clipB = Math.floor(h - frame);
  overlayCtx.beginPath();
  overlayCtx.rect(clipL, clipT, Math.max(0, clipR - clipL), Math.max(0, clipB - clipT));
  overlayCtx.clip();
  overlayCtx.translate(layout.offsetX, layout.offsetY);
  overlayCtx.fillStyle = color;
  overlayCtx.textBaseline = "alphabetic";
  overlayCtx.textAlign = "left";
  overlayCtx.globalAlpha = Math.min(1, Math.max(0, opacity));
  overlayCtx.font = switzerFont(layout.weight, layout.fontSize);
  const spaced = overlayCtx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof spaced.letterSpacing === "string") {
    spaced.letterSpacing = `${layout.tracking}px`;
  }
  for (const line of layout.lines) {
    if (layout.tracking !== 0 && typeof spaced.letterSpacing !== "string") {
      let x = line.x;
      for (const ch of line.text) {
        overlayCtx.fillText(ch, x, line.y);
        x += overlayCtx.measureText(ch).width + layout.tracking;
      }
    } else {
      overlayCtx.fillText(line.text, line.x, line.y);
    }
  }
  overlayCtx.restore();
  overlayKey = key;
  dest.drawImage(overlayCanvas, 0, 0);
}

export function disposeTypeScratch(): void {
  overlayKey = "";
  if (overlayCanvas) {
    overlayCanvas.width = 1;
    overlayCanvas.height = 1;
  }
}
