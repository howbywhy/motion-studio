/**
 * FIELD — binary cellular source material.
 *
 * Macro density + spatial bias → threshold → coarse raster →
 * connected-component meso (corridors, holes, related islands) →
 * coverage match → fine binary mark paint.
 *
 * Two scales of information:
 *   MACRO / MESO — territory, holes, corridors, connected/fractured organisation
 *   SCREEN       — high-resolution binary line screen that renders those territories
 *
 * Topology is authored on a coarse grid. The screen is generated at source
 * resolution — never by upscaling a low-frequency texture.
 *
 * Output is strictly monochrome at source level: 0 or 255, never grey.
 * Density = how much territory. Bias = where. Scale = macro unit size.
 * Complexity = connected ↔ fractured. Frequency = screen resolution.
 */

export interface FieldParams {
  /** 0–100. Black mass vs negative space — composition, not fill %. */
  density: number;
  /** 0–100. Size of structural units (high = coarser). */
  scale: number;
  /** 0–100. Connected (0) ↔ fractured (100). Not “add noise”. */
  complexity: number;
  /** 0–100. Where mass accumulates (50 = centre). */
  biasX: number;
  biasY: number;
  seed: number;
  motion: "static" | "live";
  /** 0–100. Spatial frequency of the editorial screen. Independent of Scale. */
  frequency: number;
}

export const FREQUENCY_DEFAULT = 52;
export const LIVE_PHRASE_SECONDS = 19.4;

export function clampFrequency(value: number): number {
  if (!Number.isFinite(value)) return FREQUENCY_DEFAULT;
  return Math.min(100, Math.max(0, value));
}

/** Visual screen period in CSS pixels. More slider resolution in the
 * 2–5 px editorial band; low stays graphic without 10 px bars; high
 * approaches a micro-screen rather than 1-backing-px grain. */
export function screenPeriodCss(frequency: number): number {
  const t = clampFrequency(frequency) / 100;
  return 1.25 + 5.75 * Math.pow(1 - t, 2.35);
}

/** Backing-store period. Multiply by DPR so Frequency is a visual pitch,
 * not an accidental device-pixel density. */
export function screenPeriod(frequency: number, dpr = 1): number {
  return screenPeriodCss(frequency) * Math.max(1, dpr);
}

export interface LiveMotion {
  driftX: number;
  driftY: number;
  freqDelta: number;
  biasX: number;
  biasY: number;
}

/** Deterministic Live phrase — not a visible sine. Incommensurate
 * periods so the loop point is hard to catch. No per-frame noise. */
export function liveMotion(time: number): LiveMotion {
  const t = Math.max(0, time);
  const u = (t / LIVE_PHRASE_SECONDS) % 1;
  let freqShape = 0;
  if (u < 0.14) freqShape = 0;
  else if (u < 0.3) freqShape = -smooth01((u - 0.14) / 0.16);
  else if (u < 0.48) freqShape = -1 + 0.35 * smooth01((u - 0.3) / 0.18);
  else if (u < 0.6) freqShape = -0.65 + 0.65 * smooth01((u - 0.48) / 0.12);
  else if (u < 0.78) freqShape = 0.85 * smooth01((u - 0.6) / 0.18);
  else if (u < 0.88) freqShape = 0.85 - 0.85 * smooth01((u - 0.78) / 0.1);
  else freqShape = 0.15 * Math.sin(((u - 0.88) / 0.12) * Math.PI);

  return {
    driftX: t * 0.017 + 0.07 * Math.sin(t * 0.093) + 0.035 * Math.sin(t * 0.041),
    driftY: 0.1 * Math.sin(t * 0.067) + 0.04 * Math.sin(t * 0.029 + 1.1),
    freqDelta: freqShape * 9,
    biasX: 1.8 * Math.sin(t * 0.033) + 0.7 * Math.sin(t * 0.019 + 0.6),
    biasY: 1.5 * Math.sin(t * 0.027 + 0.4) + 0.6 * Math.sin(t * 0.014),
  };
}

function smooth01(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

export function liveFrequency(base: number, time: number): number {
  return clampFrequency(base + liveMotion(time).freqDelta);
}

/** Evaluation territories — not product presets. */
export const FIELD_TERRITORIES = {
  quiet: {
    density: 22,
    scale: 80,
    complexity: 8,
    biasX: 36,
    biasY: 56,
    seed: 3,
    motion: "static" as const,
    frequency: FREQUENCY_DEFAULT,
  },
  core: {
    density: 40,
    scale: 60,
    complexity: 46,
    biasX: 40,
    biasY: 52,
    seed: 3,
    motion: "static" as const,
    frequency: FREQUENCY_DEFAULT,
  },
  dense: {
    density: 70,
    scale: 46,
    complexity: 62,
    biasX: 48,
    biasY: 44,
    seed: 7,
    motion: "static" as const,
    frequency: FREQUENCY_DEFAULT,
  },
} satisfies Record<string, FieldParams>;

export const DEFAULT_FIELD: FieldParams = { ...FIELD_TERRITORIES.core };

export const DEFAULT_FIELD_B: FieldParams = {
  ...FIELD_TERRITORIES.core,
  density: 48,
  scale: 58,
  complexity: 40,
  biasX: 64,
  biasY: 38,
  seed: 11,
};

export function hash2(ix: number, iy: number, seed: number): number {
  const x = ix | 0;
  const y = iy | 0;
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fy;
  return a + (b - a) * fy;
}

/** One dominant octave. A weak second octave only breaks silhouettes. */
function densityField(x: number, y: number, seed: number, freq: number): number {
  const n1 = valueNoise(x * freq, y * freq, seed);
  const n2 = valueNoise(x * freq * 1.55 + 9.2, y * freq * 1.55, seed + 17) * 0.16;
  return n1 * 0.84 + n2;
}

function spatialBias(nx: number, ny: number, bx: number, by: number, density: number): number {
  const dx = nx - bx;
  const dy = ny - by;
  const d = Math.sqrt(dx * dx + dy * dy);
  const falloff = 0.88 + (1 - density) * 0.4;
  return 1 - Math.min(1, d * falloff);
}

/** 14–34 columns. Never fine enough to read as static. */
export function cellCounts(scale: number, aspectW: number, aspectH: number): { cols: number; rows: number } {
  const t = Math.max(0, Math.min(100, scale)) / 100;
  const cols = Math.round(14 + (1 - t) * 20);
  const rows = Math.max(10, Math.round((cols * aspectH) / aspectW));
  return { cols, rows };
}

function neighborOn(grid: Uint8Array, cols: number, rows: number, x: number, y: number): number {
  let on = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) continue;
      const xx = x + ox;
      const yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      on += grid[yy * cols + xx]!;
    }
  }
  return on;
}

function majorityPass(grid: Uint8Array, cols: number, rows: number, need: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(grid.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = neighborOn(grid, cols, rows, x, y) + grid[y * cols + x]!;
      next[y * cols + x] = on >= need ? 1 : 0;
    }
  }
  return next;
}

function dilate(grid: Uint8Array, cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(grid.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      next[y * cols + x] = grid[y * cols + x] || neighborOn(grid, cols, rows, x, y) > 0 ? 1 : 0;
    }
  }
  return next;
}

function erode(grid: Uint8Array, cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(grid.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      next[y * cols + x] = grid[y * cols + x] && neighborOn(grid, cols, rows, x, y) >= 3 ? 1 : 0;
    }
  }
  return next;
}

/** Drop connected components of `value` smaller than minSize. */
function removeSmallComponents(
  grid: Uint8Array,
  cols: number,
  rows: number,
  value: number,
  minSize: number,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(grid) as Uint8Array<ArrayBuffer>;
  const seen = new Uint8Array(grid.length);
  const stack: number[] = [];
  const fill: number[] = [];

  for (let i = 0; i < grid.length; i++) {
    if (seen[i] || out[i] !== value) continue;
    stack.length = 0;
    fill.length = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      fill.push(idx);
      const x = idx % cols;
      const y = (idx / cols) | 0;
      const nbs = [idx - 1, idx + 1, idx - cols, idx + cols];
      const ok = [x > 0, x < cols - 1, y > 0, y < rows - 1];
      for (let k = 0; k < 4; k++) {
        if (!ok[k]) continue;
        const n = nbs[k]!;
        if (seen[n] || out[n] !== value) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (fill.length < minSize) {
      const flip = value ? 0 : 1;
      for (const idx of fill) out[idx] = flip;
    }
  }
  return out;
}

function coverage(grid: Uint8Array): number {
  let on = 0;
  for (let i = 0; i < grid.length; i++) on += grid[i]!;
  return on / grid.length;
}

function peel(grid: Uint8Array, cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(grid.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      next[y * cols + x] = grid[y * cols + x] && neighborOn(grid, cols, rows, x, y) >= 6 ? 1 : 0;
    }
  }
  return next;
}

/** Lowest `fraction` of ON-cell values — the weakly committed interior of this mass. */
function onValueCutoff(grid: Uint8Array, values: Float32Array, fraction: number): number {
  const on: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i]) on.push(values[i]!);
  if (on.length < 8) return Infinity;
  on.sort((a, b) => a - b);
  const idx = Math.min(on.length - 1, Math.max(0, Math.floor(on.length * fraction)));
  return on[idx]!;
}

/** Interior local minima of the same value field — holes and pockets, not edge nibble. */
function carveInteriorMinima(
  grid: Uint8Array,
  values: Float32Array,
  cols: number,
  rows: number,
  complexity: number,
): Uint8Array<ArrayBuffer> {
  if (complexity < 0.26) return grid as Uint8Array<ArrayBuffer>;
  const scored: { i: number; s: number }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!grid[i]) continue;
      const n = neighborOn(grid, cols, rows, x, y);
      if (n < 6) continue;
      let sum = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const xx = x + ox;
          const yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          sum += values[yy * cols + xx]!;
          count++;
        }
      }
      if (!count) continue;
      scored.push({ i, s: sum / count - values[i]! });
    }
  }
  if (!scored.length) return grid as Uint8Array<ArrayBuffer>;
  scored.sort((a, b) => b.s - a.s);
  const take = Math.max(1, Math.round(scored.length * (0.08 + (complexity - 0.26) * 0.45)));
  const next = new Uint8Array(grid) as Uint8Array<ArrayBuffer>;
  for (let k = 0; k < take; k++) next[scored[k]!.i] = 0;
  return next;
}
function carveWeakMembership(
  grid: Uint8Array,
  values: Float32Array,
  cols: number,
  rows: number,
  cutoff: number,
): Uint8Array<ArrayBuffer> {
  if (!Number.isFinite(cutoff)) return grid as Uint8Array<ArrayBuffer>;
  const next = new Uint8Array(grid) as Uint8Array<ArrayBuffer>;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!grid[i]) continue;
      if (values[i]! > cutoff) continue;
      const n = neighborOn(grid, cols, rows, x, y);
      if (n >= 2) next[i] = 0;
    }
  }
  return next;
}

/**
 * Branches and related islands: raise near-threshold OFF cells that already
 * belong to the same density field, adjacent (or nearly adjacent) to the mass.
 */
function growRelatedStructure(
  grid: Uint8Array,
  values: Float32Array,
  cols: number,
  rows: number,
  thresh: number,
  complexity: number,
): Uint8Array<ArrayBuffer> {
  if (complexity < 0.22) return grid as Uint8Array<ArrayBuffer>;
  const attachBand = 0.06 + complexity * 0.12;
  const islandBand = 0.03 + complexity * 0.08;
  const next = new Uint8Array(grid) as Uint8Array<ArrayBuffer>;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (grid[i]) continue;
      const n = neighborOn(grid, cols, rows, x, y);
      if (n >= 1 && values[i]! >= thresh - attachBand) {
        next[i] = 1;
        continue;
      }
      if (complexity < 0.48 || values[i]! < thresh - islandBand) continue;
      let near = false;
      for (let oy = -2; oy <= 2 && !near; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const xx = x + ox;
          const yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          if (grid[yy * cols + xx]) near = true;
        }
      }
      if (near) next[i] = 1;
    }
  }
  return next;
}

/** Split related territories by opening 4-connected bridges at high complexity. */
function breakBridges(
  grid: Uint8Array,
  cols: number,
  rows: number,
  complexity: number,
  seed: number,
): Uint8Array<ArrayBuffer> {
  if (complexity < 0.48) return grid as Uint8Array<ArrayBuffer>;
  const chance = (complexity - 0.48) * 1.35;
  const next = new Uint8Array(grid) as Uint8Array<ArrayBuffer>;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!grid[i]) continue;
      const n = neighborOn(grid, cols, rows, x, y);
      if (n !== 2 && n !== 3) continue;
      const left = x > 0 && grid[i - 1];
      const right = x < cols - 1 && grid[i + 1];
      const up = y > 0 && grid[i - cols];
      const down = y < rows - 1 && grid[i + cols];
      const straight = (left && right && !up && !down) || (up && down && !left && !right);
      if (!straight && n !== 2) continue;
      if (hash2(x, y, seed + 47) < chance) next[i] = 0;
    }
  }
  return next;
}

/**
 * Density owns coverage. Peel if too black. If too light, attach the
 * highest-value OFF cells that already touch the mass — never sprinkle.
 */
function matchCoverage(
  grid: Uint8Array<ArrayBuffer>,
  values: Float32Array,
  cols: number,
  rows: number,
  target: number,
  maxPeel: number,
): Uint8Array<ArrayBuffer> {
  let out = grid;
  let guard = 0;
  while (coverage(out) > target + 0.03 && guard++ < maxPeel) {
    out = peel(out, cols, rows);
  }

  guard = 0;
  while (coverage(out) < target - 0.03 && guard++ < out.length) {
    let best = -1;
    let bestV = -1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (out[i]) continue;
        const nOn = neighborOn(out, cols, rows, x, y);
        if (nOn < 1 || nOn >= 5) continue;
        const v = values[i]!;
        if (v > bestV) {
          bestV = v;
          best = i;
        }
      }
    }
    if (best < 0) break;
    out[best] = 1;
  }
  return out;
}

export function generateFieldGrid(
  params: FieldParams,
  cols: number,
  rows: number,
  time: number,
): { grid: Uint8Array; values: Float32Array; thresh: number } {
  const density = Math.max(0, Math.min(100, params.density)) / 100;
  const complexity = Math.max(0, Math.min(100, params.complexity)) / 100;
  const seed = params.seed | 0;
  const live = params.motion === "live" ? liveMotion(time) : null;
  const bx = Math.max(0, Math.min(100, params.biasX + (live?.biasX ?? 0))) / 100;
  const by = Math.max(0, Math.min(100, params.biasY + (live?.biasY ?? 0))) / 100;
  const driftX = live?.driftX ?? 0;
  const driftY = live?.driftY ?? 0;
  const freq = 0.92 + (1 - params.scale / 100) * 0.95;
  const thresh = 0.55 - density * 0.2;

  const grid = new Uint8Array(cols * rows) as Uint8Array<ArrayBuffer>;
  const values = new Float32Array(cols * rows);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const nx = (x + 0.5) / cols;
      const ny = (y + 0.5) / rows;
      const macro = densityField(nx + driftX, ny + driftY, seed, freq);
      const bias = spatialBias(nx, ny, bx, by, density);
      const v = macro * 0.66 + bias * 0.34;
      const i = y * cols + x;
      values[i] = v;
      grid[i] = v > thresh ? 1 : 0;
    }
  }

  let out: Uint8Array<ArrayBuffer> = grid;
  let carveCutoff = -1;

  // Close only when we want one smooth territory. Meso needs the necks.
  if (complexity < 0.18) {
    out = dilate(out, cols, rows);
    out = erode(out, cols, rows);
    out = majorityPass(out, cols, rows, 5);
    out = majorityPass(out, cols, rows, 5);
  } else {
    out = majorityPass(out, cols, rows, complexity < 0.4 ? 5 : 4);
    out = growRelatedStructure(out, values, cols, rows, thresh, complexity);
    const carveFraction = Math.min(0.62, 0.12 + (complexity - 0.18) * 0.62);
    carveCutoff = onValueCutoff(out, values, carveFraction);
    out = carveWeakMembership(out, values, cols, rows, carveCutoff);
    out = carveInteriorMinima(out, values, cols, rows, complexity);
    out = breakBridges(out, cols, rows, complexity, seed);
  }

  const nCells = cols * rows;
  const minIsland =
    complexity < 0.22
      ? Math.max(8, Math.round(nCells * 0.028))
      : complexity < 0.55
        ? 5
        : 3;
  const minHole =
    complexity < 0.2 ? Math.max(10, Math.round(nCells * 0.04)) : complexity < 0.5 ? 4 : 2;
  out = removeSmallComponents(out, cols, rows, 1, minIsland);
  out = removeSmallComponents(out, cols, rows, 0, minHole);

  const target = 0.16 + density * 0.52;
  const maxPeel = complexity < 0.25 ? 8 : complexity < 0.5 ? 4 : 2;
  out = matchCoverage(out, values, cols, rows, target, maxPeel);
  out = removeSmallComponents(out, cols, rows, 1, minIsland);

  return { grid: out, values, thresh };
}

/** 75° line screen — offset-print black-plate angle. Raster A in the
 * Phase 10 study. Duty cycle follows occupancy so Density still means
 * territory, not “more dots”. */
const SCREEN_COS = Math.cos((75 * Math.PI) / 180);
const SCREEN_SIN = Math.sin((75 * Math.PI) / 180);

function sampleArray(data: ArrayLike<number>, cols: number, rows: number, ix: number, iy: number): number {
  if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) return 0;
  return data[iy * cols + ix]!;
}

function fadeBilinear(data: ArrayLike<number>, cols: number, rows: number, fx: number, fy: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const wx = fade(fx - x0);
  const wy = fade(fy - y0);
  return (
    sampleArray(data, cols, rows, x0, y0) * (1 - wx) * (1 - wy) +
    sampleArray(data, cols, rows, x0 + 1, y0) * wx * (1 - wy) +
    sampleArray(data, cols, rows, x0, y0 + 1) * (1 - wx) * wy +
    sampleArray(data, cols, rows, x0 + 1, y0 + 1) * wx * wy
  );
}

function wrap01(v: number): number {
  return v - Math.floor(v);
}

export function paintFieldToCanvas(
  canvas: HTMLCanvasElement,
  params: FieldParams,
  time: number,
  dpr = 1,
): void {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 1 || h < 1) return;

  const { cols, rows } = cellCounts(params.scale, w, h);
  const { grid, values, thresh } = generateFieldGrid(params, cols, rows, time);
  const freq = params.motion === "live"
    ? liveFrequency(params.frequency ?? FREQUENCY_DEFAULT, time)
    : clampFrequency(params.frequency ?? FREQUENCY_DEFAULT);
  const period = screenPeriod(freq, dpr);
  const invP = 1 / Math.max(0.5, period);

  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  d.fill(255);

  const cx = (w - 1) * 0.5;
  const cy = (h - 1) * 0.5;
  const invW = cols / w;
  const invH = rows / h;

  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) * invH - 0.5;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) * invW - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const c00 = sampleArray(grid, cols, rows, x0, y0);
      const c10 = sampleArray(grid, cols, rows, x0 + 1, y0);
      const c01 = sampleArray(grid, cols, rows, x0, y0 + 1);
      const c11 = sampleArray(grid, cols, rows, x0 + 1, y0 + 1);
      let occ = fadeBilinear(grid, cols, rows, fx, fy);
      const boundary = !(c00 === c10 && c10 === c01 && c01 === c11);
      if (boundary && occ > 0.02 && occ < 0.96) {
        const v = fadeBilinear(values, cols, rows, fx, fy);
        const iso = fade(Math.min(1, Math.max(0, (v - (thresh - 0.1)) / 0.22)));
        occ = Math.max(occ * 0.45, Math.min(1, occ * 0.4 + iso * 0.6));
      }
      if (occ <= 0.02) continue;
      const duty = 0.16 + occ * 0.72;
      if (wrap01(((x - cx) * SCREEN_COS + (y - cy) * SCREEN_SIN) * invP) >= duty) continue;
      const o = (rowOff + x) * 4;
      d[o] = 0;
      d[o + 1] = 0;
      d[o + 2] = 0;
    }
  }

  ctx.putImageData(img, 0, 0);
}
