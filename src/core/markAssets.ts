/**
 * Made by Madelen identity geometry — the supplied SVG suite, used directly.
 * Do not redraw. Paths are the artwork.
 *
 * Stacked and Horizontal share the same 13 letter paths.
 * Paths 0–5 = MADE BY. Paths 6–12 = MADELEN.
 * Horizontal MADELEN is the stacked row translated +1285 in x.
 * Alignment is that lateral dock. The hold state is the stacked SVG exactly.
 */
import stackedSvg from "../assets/mark/stacked.svg?raw";
import horizontalSvg from "../assets/mark/horizontal.svg?raw";
import emblemSvg from "../assets/mark/emblem.svg?raw";

export const MARK_ROW_SPLIT = 6;

function pathDs(svg: string): string[] {
  return [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);
}

function viewBox(svg: string): { w: number; h: number } {
  const m = /viewBox="([^"]+)"/.exec(svg);
  const p = (m?.[1] ?? "0 0 1080 394").trim().split(/[\s,]+/).map(Number);
  return { w: p[2] || 1080, h: p[3] || 394 };
}

function firstPoint(d: string): { x: number; y: number } {
  const m = /M\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(d);
  return { x: Number(m?.[1] ?? 0), y: Number(m?.[2] ?? 0) };
}

const stackedDs = pathDs(stackedSvg);
const horizontalDs = pathDs(horizontalSvg);
const emblemDs = pathDs(emblemSvg);

if (stackedDs.length !== 13) throw new Error("Stacked logotype must keep 13 letter paths");
if (horizontalDs.length !== 13) throw new Error("Horizontal logotype must keep 13 letter paths");
if (emblemDs.length !== 1) throw new Error("Emblem must keep a single path");

const stackedVb = viewBox(stackedSvg);
const horizontalVb = viewBox(horizontalSvg);
const emblemVb = viewBox(emblemSvg);

const stackedMadeLen = firstPoint(stackedDs[MARK_ROW_SPLIT]!);
const horizontalMadeLen = firstPoint(horizontalDs[MARK_ROW_SPLIT]!);

/** Lateral dock distance from the supplied Horizontal SVG, in stacked units. */
export const MARK_LATERAL_DX = horizontalMadeLen.x - stackedMadeLen.x;

export const MARK_STACKED = {
  width: stackedVb.w,
  height: stackedVb.h,
  madeBy: stackedDs.slice(0, MARK_ROW_SPLIT),
  madeLen: stackedDs.slice(MARK_ROW_SPLIT),
};

export const MARK_HORIZONTAL = {
  width: horizontalVb.w,
  height: horizontalVb.h,
  madeBy: horizontalDs.slice(0, MARK_ROW_SPLIT),
  madeLen: horizontalDs.slice(MARK_ROW_SPLIT),
};

export const MARK_EMBLEM = {
  width: emblemVb.w,
  height: emblemVb.h,
  paths: emblemDs,
};

export const MARK_FILL_WHITE = "#f4f0e8";
export const MARK_FILL_BLACK = "#111111";

let pathCache: {
  madeBy: Path2D[];
  madeLen: Path2D[];
  emblem: Path2D[];
} | null = null;

export function markPaths(): { madeBy: Path2D[]; madeLen: Path2D[]; emblem: Path2D[] } {
  if (pathCache) return pathCache;
  pathCache = {
    madeBy: MARK_STACKED.madeBy.map((d) => new Path2D(d)),
    madeLen: MARK_STACKED.madeLen.map((d) => new Path2D(d)),
    emblem: MARK_EMBLEM.paths.map((d) => new Path2D(d)),
  };
  return pathCache;
}
