import { switzerFont, switzerReady } from "./typeFont";
import { opticalFramePx, type TypeLayout } from "./typeLayout";
import type { TypeSequenceState } from "./typeMotion";

const overlays: [HTMLCanvasElement | null, HTMLCanvasElement | null] = [null, null];
const overlayCtxs: [CanvasRenderingContext2D | null, CanvasRenderingContext2D | null] = [null, null];
const overlayKeys: [string, string] = ["", ""];

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
    layout.lines.map((l) => `${l.text}:${l.x}:${l.y}:${l.width}:${l.wordGap}`).join("|"),
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
  if (line.wordGap > 0.05) {
    const words = line.text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      let x = line.x;
      const space = ctx.measureText(" ").width;
      for (let i = 0; i < words.length; i++) {
        ctx.fillText(words[i]!, x, line.y);
        x += ctx.measureText(words[i]!).width;
        if (i < words.length - 1) x += space + line.wordGap;
      }
      return;
    }
  }
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

function paintStatic(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  slot: 0 | 1,
): void {
  dest.drawImage(ensureOverlay(layout, color, opacity, slot, dest.canvas.width, dest.canvas.height), 0, 0);
}

function paintSequenced(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  sequence: TypeSequenceState,
  slot: 0 | 1,
): void {
  const motion = sequence.units[0];
  if (!motion || motion.opacity < 0.004) return;
  const src = ensureOverlay(layout, color, opacity, slot, dest.canvas.width, dest.canvas.height);
  dest.save();
  clipOptical(dest, dest.canvas.width, dest.canvas.height);
  dest.globalAlpha = Math.min(1, Math.max(0, motion.opacity));
  dest.drawImage(src, motion.dx, motion.dy);
  dest.restore();
}

/** PRODUCT: one clean Switzer silhouette per block. Sequencing may fade /
 * nudge the whole block. No scale, blur, tracking, or weight animation.
 * Typography paints after Registration and must not alter the photographic
 * Registration algorithm (golden master 728ff08). */
export function paintTypeLayer(
  dest: CanvasRenderingContext2D,
  layout: TypeLayout,
  color: string,
  opacity: number,
  sequence?: TypeSequenceState | null,
  slot: 0 | 1 = 0,
): void {
  if (layout.lines.length === 0) return;
  if (!switzerReady()) return;
  if (!sequence || sequence.identity) {
    paintStatic(dest, layout, color, opacity, slot);
    return;
  }
  paintSequenced(dest, layout, color, opacity, sequence, slot);
}

export function disposeTypeScratch(): void {
  overlayKeys[0] = "";
  overlayKeys[1] = "";
  for (const slot of [0, 1] as const) {
    if (overlays[slot]) {
      overlays[slot]!.width = 1;
      overlays[slot]!.height = 1;
    }
  }
}
