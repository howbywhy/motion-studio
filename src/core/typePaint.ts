import { switzerFont, switzerReady } from "./typeFont";
import type { TypeLayout } from "./typeLayout";

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

/** PRODUCT: one clean Switzer silhouette. No motion, stroke, shadow, or bevel. */
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
  overlayCtx.translate(layout.offsetX, layout.offsetY);
  overlayCtx.fillStyle = color;
  overlayCtx.textBaseline = "alphabetic";
  overlayCtx.textAlign = "left";
  overlayCtx.globalAlpha = Math.min(1, Math.max(0, opacity));
  overlayCtx.font = switzerFont(layout.weight, layout.fontSize);
  for (const line of layout.lines) {
    overlayCtx.fillText(line.text, line.x, line.y);
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
