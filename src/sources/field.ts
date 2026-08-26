/**
 * FIELD — full-frame binary graphic plate.
 *
 * Two scales, one material:
 *   MACRO — a slow occupancy map (density, bias, scale). Never thresholded
 *           into islands. Perceived as regions becoming denser or lighter.
 *   MICRO — a fine orthogonal lattice of irregular digital marks whose
 *           local black/white decision follows that occupancy.
 *
 * Marks may join into short cardinal runs. Complexity controls run length,
 * not giant territories. Frequency is mark size, independent of Scale.
 *
 * Output is strictly monochrome at source level: 0 or 255, never grey.
 */

export interface FieldParams {
  /** 0–100. Full-frame black mass vs white information. */
  density: number;
  /** 0–100. Spatial scale of occupancy variation (high = broader). */
  scale: number;
  /** 0–100. Connected (0) ↔ fractured (100). Run length, not islands. */
  complexity: number;
  /** 0–100. Where occupancy accumulates (50,50 = even). */
  biasX: number;
  biasY: number;
  seed: number;
  motion: "static" | "live";
  /** 0–100. Visual frequency of marks. Independent of Scale. */
  frequency: number;
}

export const FREQUENCY_DEFAULT = 52;
export const LIVE_PHRASE_SECONDS = 19.4;

export function clampFrequency(value: number): number {
  if (!Number.isFinite(value)) return FREQUENCY_DEFAULT;
  return Math.min(100, Math.max(0, value));
}

/** Mark cell size in CSS pixels. Fine ≈ 1.2 px; coarse extreme ≈ 6.5 px.
 *  Most of the slider lives in the 1.5–3.5 px editorial band. */
export function markPeriodCss(frequency: number): number {
  const t = clampFrequency(frequency) / 100;
  return 1.2 + 5.3 * Math.pow(1 - t, 1.9);
}

/** @deprecated alias — Frequency UI and older call sites. */
export function screenPeriodCss(frequency: number): number {
  return markPeriodCss(frequency);
}

export function markCellPx(frequency: number, dpr = 1): number {
  return Math.max(1, Math.round(markPeriodCss(frequency) * Math.max(1, dpr)));
}

export function screenPeriod(frequency: number, dpr = 1): number {
  return markCellPx(frequency, dpr);
}

export interface LiveMotion {
  driftX: number;
  driftY: number;
  freqDelta: number;
  biasX: number;
  biasY: number;
}

/** Deterministic Live phrase. Occupancy drifts; mark lattice does not
 *  rebuild. No per-frame noise. */
export function liveMotion(time: number): LiveMotion {
  const t = Math.max(0, time);
  const u = (t / LIVE_PHRASE_SECONDS) % 1;
  let amp = 0;
  if (u < 0.16) amp = 0;
  else if (u < 0.34) amp = -smooth01((u - 0.16) / 0.18);
  else if (u < 0.52) amp = -1 + 0.4 * smooth01((u - 0.34) / 0.18);
  else if (u < 0.66) amp = -0.6 + 0.6 * smooth01((u - 0.52) / 0.14);
  else if (u < 0.84) amp = 0.7 * smooth01((u - 0.66) / 0.18);
  else amp = 0.7 - 0.7 * smooth01((u - 0.84) / 0.16);

  return {
    driftX: t * 0.011 + 0.055 * Math.sin(t * 0.071) + 0.028 * Math.sin(t * 0.033),
    driftY: t * 0.007 + 0.08 * Math.sin(t * 0.053) + 0.03 * Math.sin(t * 0.021 + 1.1),
    freqDelta: amp * 4,
    biasX: 1.4 * Math.sin(t * 0.027) + 0.55 * Math.sin(t * 0.016 + 0.6),
    biasY: 1.2 * Math.sin(t * 0.023 + 0.4) + 0.45 * Math.sin(t * 0.012),
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

/** Slow occupancy. Two octaves only — variation, not a cloud demo. */
function occupancyNoise(x: number, y: number, seed: number, freq: number): number {
  const n1 = valueNoise(x * freq, y * freq, seed);
  const n2 = valueNoise(x * freq * 1.7 + 8.1, y * freq * 1.35, seed + 19) * 0.22;
  return n1 * 0.78 + n2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function occupancyAt(
  nx: number,
  ny: number,
  params: FieldParams,
  live: LiveMotion | null,
): number {
  const density = clamp01(params.density / 100);
  const scale = clamp01(params.scale / 100);
  const seed = params.seed | 0;
  const bx = clamp01((params.biasX + (live?.biasX ?? 0)) / 100);
  const by = clamp01((params.biasY + (live?.biasY ?? 0)) / 100);
  const driftX = live?.driftX ?? 0;
  const driftY = live?.driftY ?? 0;
  const contrastPulse = 1 + (live?.freqDelta ?? 0) * 0.012;

  const freq = 1.05 + (1 - scale) * 2.85;
  const macro = occupancyNoise(nx + driftX, ny + driftY, seed, freq);
  const tilt = (nx - 0.5) * (bx - 0.5) * 2 + (ny - 0.5) * (by - 0.5) * 2;
  const amp = (0.15 + (1 - scale) * 0.14) * contrastPulse;
  const base = 0.05 + density * 0.9;
  return clamp01(base + (macro - 0.5) * amp + tilt * 0.34);
}

function neighbor4(on: Uint8Array, cols: number, rows: number, x: number, y: number): number {
  let n = 0;
  if (x > 0 && on[y * cols + x - 1]) n++;
  if (x < cols - 1 && on[y * cols + x + 1]) n++;
  if (y > 0 && on[(y - 1) * cols + x]) n++;
  if (y < rows - 1 && on[(y + 1) * cols + x]) n++;
  return n;
}

function meanOcc(occ: Float32Array): number {
  let s = 0;
  for (let i = 0; i < occ.length; i++) s += occ[i]!;
  return s / occ.length;
}

function adjustCoverage(
  on: Uint8Array,
  occ: Float32Array,
  cols: number,
  rows: number,
  target: number,
  fractured: number,
): void {
  const n = on.length;
  let have = 0;
  for (let i = 0; i < n; i++) have += on[i]!;
  const want = Math.round(clamp01(target) * n);
  if (Math.abs(have - want) < n * 0.01) return;

  const connected = 1 - clamp01(fractured);

  if (have > want) {
    let need = have - want;
    const scored: { i: number; s: number }[] = [];
    const stride = Math.max(1, Math.floor(n / Math.min(n, need * 8 + 1200)));
    for (let i = 0; i < n; i += stride) {
      if (!on[i]) continue;
      const x = i % cols;
      const y = (i / cols) | 0;
      const nb = neighbor4(on, cols, rows, x, y);
      const s = connected > 0.5 ? occ[i]! + nb * 0.35 : occ[i]! - nb * 0.25;
      scored.push({ i, s });
    }
    scored.sort((a, b) => a.s - b.s);
    for (const item of scored) {
      if (need <= 0) break;
      if (!on[item.i]) continue;
      on[item.i] = 0;
      need--;
    }
    for (let i = 0; i < n && need > 0; i++) {
      if (on[i]) {
        on[i] = 0;
        need--;
      }
    }
    return;
  }

  let need = want - have;
  const scored: { i: number; s: number }[] = [];
  const stride = Math.max(1, Math.floor(n / Math.min(n, need * 8 + 1200)));
  for (let i = 0; i < n; i += stride) {
    if (on[i]) continue;
    const x = i % cols;
    const y = (i / cols) | 0;
    const nb = neighbor4(on, cols, rows, x, y);
    const extend = nb === 1 ? 0.45 * connected : 0;
    const blob = nb >= 2 ? -0.55 * connected : 0;
    const isolated = nb === 0 ? 0.25 * fractured : 0;
    scored.push({ i, s: occ[i]! + extend + blob + isolated });
  }
  scored.sort((a, b) => b.s - a.s);
  for (const item of scored) {
    if (need <= 0) break;
    if (on[item.i]) continue;
    on[item.i] = 1;
    need--;
  }
  for (let i = 0; i < n && need > 0; i++) {
    if (!on[i] && occ[i]! > 0.08) {
      on[i] = 1;
      need--;
    }
  }
}

function buildMarks(
  cols: number,
  rows: number,
  occ: Float32Array,
  complexity: number,
  seed: number,
): Uint8Array {
  const n = cols * rows;
  const on = new Uint8Array(n);
  const fractured = clamp01(complexity);
  const seedRate = 0.34 + fractured * 0.22;
  const growPasses = 1 + Math.round((1 - fractured) * 3);
  const join = 0.16 + (1 - fractured) * 0.34;

  for (let i = 0; i < n; i++) {
    if (hash2(i % cols, (i / cols) | 0, seed) < occ[i]! * seedRate) on[i] = 1;
  }

  const next = new Uint8Array(n);
  for (let pass = 0; pass < growPasses; pass++) {
    next.set(on);
    const passSeed = seed + 31 + pass * 17;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (on[i]) continue;
        const nb = neighbor4(on, cols, rows, x, y);
        if (nb === 0) continue;
        if (hash2(x, y, passSeed) < occ[i]! * (join + 0.12 * nb)) next[i] = 1;
      }
    }
    on.set(next);
  }

  adjustCoverage(on, occ, cols, rows, meanOcc(occ), fractured);
  return on;
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

  const freq = clampFrequency(params.frequency ?? FREQUENCY_DEFAULT);
  const cell = markCellPx(freq, dpr);
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const live = params.motion === "live" ? liveMotion(time) : null;
  const occ = new Float32Array(cols * rows);

  for (let y = 0; y < rows; y++) {
    const ny = (y + 0.5) / rows;
    for (let x = 0; x < cols; x++) {
      const nx = (x + 0.5) / cols;
      occ[y * cols + x] = occupancyAt(nx, ny, params, live);
    }
  }

  const on = buildMarks(cols, rows, occ, Math.max(0, Math.min(100, params.complexity)) / 100, params.seed | 0);

  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  d.fill(255);

  for (let cy = 0; cy < rows; cy++) {
    const y0 = cy * cell;
    const y1 = Math.min(h, y0 + cell);
    for (let cx = 0; cx < cols; cx++) {
      if (!on[cy * cols + cx]) continue;
      const x0 = cx * cell;
      const x1 = Math.min(w, x0 + cell);
      for (let y = y0; y < y1; y++) {
        let o = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++) {
          d[o] = 0;
          d[o + 1] = 0;
          d[o + 2] = 0;
          o += 4;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
}
