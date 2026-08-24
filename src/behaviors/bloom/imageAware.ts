import type { Attractor } from "./fields";

// Experimental: instead of Bloom fields drifting through purely arbitrary
// coordinates, let the photograph itself pull them toward visually
// information-rich areas. Deliberately cheap and coarse — no models, no
// segmentation, just a downsampled luminance grid read a few times a
// second. It biases where fields wander around; it never stops them
// moving, and it's never rendered as its own visible layer.

const GRID_W = 16;
const GRID_H = 20;
const RECOMPUTE_INTERVAL_MS = 350;
const TOP_K = 5;

let scratch: HTMLCanvasElement | null = null;
let lastComputedAt = 0;
let lastAttractors: Attractor[] = [];

function computeAttractors(source: CanvasImageSource): Attractor[] {
  if (!scratch) scratch = document.createElement("canvas");
  scratch.width = GRID_W;
  scratch.height = GRID_H;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  let data: Uint8ClampedArray;
  try {
    ctx.clearRect(0, 0, GRID_W, GRID_H);
    ctx.drawImage(source, 0, 0, GRID_W, GRID_H);
    data = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
  } catch {
    return [];
  }

  const lum = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i < lum.length; i++) {
    const o = i * 4;
    lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  // Score each interior cell by local gradient magnitude — a cheap proxy
  // that responds to edges, contrast, and fine detail alike without
  // needing separate passes for each.
  const scored: { x: number; y: number; score: number }[] = [];
  let maxScore = 0;
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      const i = y * GRID_W + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + GRID_W] - lum[i - GRID_W];
      const score = Math.sqrt(gx * gx + gy * gy);
      if (score > maxScore) maxScore = score;
      scored.push({ x, y, score });
    }
  }
  if (maxScore < 4) return []; // too flat/uniform a frame to have a meaningful signal

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_K);
  return top.map((c) => ({
    x: (c.x + 0.5) / GRID_W,
    y: (c.y + 0.5) / GRID_H,
    weight: Math.min(1, c.score / maxScore),
  }));
}

/** Returns the current attractor points, recomputing at most a few times a
 * second regardless of call rate (safe to call every frame). */
export function getImageAwareAttractors(source: CanvasImageSource): Attractor[] {
  const now = performance.now();
  if (now - lastComputedAt > RECOMPUTE_INTERVAL_MS) {
    lastComputedAt = now;
    lastAttractors = computeAttractors(source);
  }
  return lastAttractors;
}
