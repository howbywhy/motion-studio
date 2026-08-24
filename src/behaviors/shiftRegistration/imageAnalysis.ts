// Standalone luminance-gradient sampler for Shift's cut placement — kept
// entirely independent from Bloom's Image Aware (src/behaviors/bloom/
// imageAware.ts) even though the underlying idea is similar, so nothing
// here can ever affect Bloom's behavior.
//
// Shift wants a different question answered: not "where is the busiest
// point" but "which row/column already reads as a natural seam" — i.e. a
// position where the image already changes sharply across that line
// (background -> subject, light -> dark). That's a directional profile,
// not a set of attractor points.

const GRID_W = 28;
const GRID_H = 34;

export interface GradientProfiles {
  colScore: number[]; // length GRID_W — average |horizontal luminance gradient| at each column
  rowScore: number[]; // length GRID_H — average |vertical luminance gradient| at each row
}

const FLAT_PROFILE: GradientProfiles = {
  colScore: new Array(GRID_W).fill(0),
  rowScore: new Array(GRID_H).fill(0),
};

/** One-time (per state build), not throttled/cached — Shift only samples
 * this when its region count changes, not every frame. */
export function computeGradientProfiles(source: CanvasImageSource): GradientProfiles {
  const canvas = document.createElement("canvas");
  canvas.width = GRID_W;
  canvas.height = GRID_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return FLAT_PROFILE;

  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(source, 0, 0, GRID_W, GRID_H);
    data = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
  } catch {
    return FLAT_PROFILE;
  }

  const lum = (x: number, y: number): number => {
    const i = (y * GRID_W + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  const colScore = new Array(GRID_W).fill(0);
  for (let x = 1; x < GRID_W - 1; x++) {
    let s = 0;
    for (let y = 0; y < GRID_H; y++) s += Math.abs(lum(x + 1, y) - lum(x - 1, y));
    colScore[x] = s / GRID_H;
  }

  const rowScore = new Array(GRID_H).fill(0);
  for (let y = 1; y < GRID_H - 1; y++) {
    let s = 0;
    for (let x = 0; x < GRID_W; x++) s += Math.abs(lum(x, y + 1) - lum(x, y - 1));
    rowScore[y] = s / GRID_W;
  }

  return { colScore, rowScore };
}

/** Nudges `baseFraction` (0..1, within [rangeLo,rangeHi]) toward whichever
 * nearby position scores highest in `profile` — a bias, not a snap: the
 * result is a 50/50 blend of the random base and the best nearby score. */
export function biasFractionTowardEdge(
  profile: number[],
  baseFraction: number,
  rangeLo: number,
  rangeHi: number,
  searchWindowFrac = 0.16
): number {
  const n = profile.length;
  const lo = Math.max(1, Math.floor((baseFraction - searchWindowFrac) * n));
  const hi = Math.min(n - 2, Math.ceil((baseFraction + searchWindowFrac) * n));
  if (hi <= lo) return baseFraction;

  let bestIdx = -1;
  let bestScore = -1;
  for (let i = lo; i <= hi; i++) {
    if (profile[i] > bestScore) {
      bestScore = profile[i];
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestScore <= 0) return baseFraction;

  const bestFraction = Math.min(rangeHi, Math.max(rangeLo, bestIdx / n));
  return baseFraction + (bestFraction - baseFraction) * 0.5;
}
