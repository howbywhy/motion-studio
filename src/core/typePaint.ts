import { switzerFont, switzerReady } from "./typeFont";
import type { TypeLayout } from "./typeLayout";
import type { TypeMotionState } from "./typeMotion";

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
  opacity: number,
): void {
  ctx.save();
  ctx.translate(layout.offsetX, layout.offsetY);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const baseA = Math.min(1, Math.max(0, opacity));
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const m = motion.lines[i] ?? { dx: 0, dy: 0, opacity: 1, clipT: 1, weight: motion.weight };
    if (m.opacity <= 0.01 || m.clipT <= 0.01) continue;
    ctx.save();
    ctx.globalAlpha = baseA * m.opacity;
    ctx.font = switzerFont(m.weight, layout.fontSize);
    const x = line.x + m.dx;
    const y = line.y + m.dy;
    if (m.clipT < 0.999) {
      const pad = Math.max(4, layout.fontSize * 0.06);
      ctx.beginPath();
      ctx.rect(x - pad, y - line.height * 0.92, line.width + pad * 2, line.height * m.clipT);
      ctx.clip();
    }
    ctx.fillText(line.text, x, y);
    ctx.restore();
  }
  ctx.restore();
}

export function paintTypeLayer(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  motion: TypeMotionState,
  color: string,
  opacity: number,
): void {
  if (!motion.visible || layout.lines.length === 0) return;
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
  paintLines(overlayCtx, layout, motion, color, opacity);
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
