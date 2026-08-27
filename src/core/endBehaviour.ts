import type { PlaybackMode } from "./sequence";

/** End Behaviour sits after the resolved composite (Bloom → Registration → Type).
 * It is a loop-seam interruption, not a continuous effect and not a second clock.
 * OFF is a true bypass: no canvas reads, no snapshots, no draws. */

export type EndBehaviourMode = "off" | "flicker" | "fracture";
export type EndRegion = "off" | "pingpong" | "before" | "hold" | "disrupt";
export type FlickerState = "resolved" | "joltA" | "joltB" | "joltC";

export interface EndBehaviourSettings {
  mode: EndBehaviourMode;
  amount: number;
  hold: number;
  duration: number;
}

export interface EndBand {
  axis: "h" | "v";
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  rgb: number;
}

export interface EndWindow {
  durationFrac: number;
  holdFrac: number;
  holdStart: number;
  disruptStart: number;
}

export interface EndPlan {
  active: boolean;
  region: EndRegion;
  phase: number;
  local: number;
  envelope: number;
  seed: number;
  kind: "identity" | "flicker" | "fracture";
  flickerState: FlickerState | null;
  fragmentCount: number;
  maxDisplacement: number;
  rgbDisplacement: number;
  bands: EndBand[];
  window: EndWindow;
}

export interface EndDiagnostics {
  applied: boolean;
  bypass: boolean;
  mode: EndBehaviourMode;
  region: EndRegion;
  phase: number;
  holdStart: number;
  disruptStart: number;
  durationFrac: number;
  holdFrac: number;
  local: number;
  envelope: number;
  seed: number;
  fragmentCount: number;
  maxDisplacement: number;
  rgbDisplacement: number;
  flickerState: FlickerState | null;
  paintMs: number;
}

/** Duration 0–100 → 4%–18% of the master loop. */
export const END_DURATION_MIN_FRAC = 0.04;
export const END_DURATION_MAX_FRAC = 0.18;
/** Hold 0–100 → 0%–12% stillness immediately before disruption. */
export const END_HOLD_MAX_FRAC = 0.12;

export const END_BEHAVIOUR_OFF: EndBehaviourSettings = {
  mode: "off",
  amount: 50,
  hold: 40,
  duration: 45,
};

export const END_BEHAVIOUR_FLICKER_DEFAULTS: Pick<EndBehaviourSettings, "amount" | "hold" | "duration"> = {
  amount: 35,
  hold: 45,
  duration: 35,
};

export const END_BEHAVIOUR_FRACTURE_DEFAULTS: Pick<EndBehaviourSettings, "amount" | "hold" | "duration"> = {
  amount: 50,
  hold: 40,
  duration: 45,
};

const RGB_SKIP = 0.42;

const scratchPool: Record<string, HTMLCanvasElement> = {};

function scratch(name: string, width: number, height: number): HTMLCanvasElement {
  let c = scratchPool[name];
  if (!c) {
    c = document.createElement("canvas");
    scratchPool[name] = c;
  }
  if (c.width !== width || c.height !== height) {
    c.width = width;
    c.height = height;
  }
  return c;
}

function clamp100(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(n: number): number {
  let x = n | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function unit(seed: number, lane: number): number {
  return mix(seed + lane * 0x9e3779b9) / 4294967296;
}

function signed(seed: number, lane: number): number {
  return unit(seed, lane) * 2 - 1;
}

export function parseEndBehaviourMode(raw: unknown): EndBehaviourMode {
  if (raw === "flicker" || raw === "fracture") return raw;
  return "off";
}

export function clampEndBehaviourSettings(raw: Partial<EndBehaviourSettings> | null | undefined): EndBehaviourSettings {
  const mode = parseEndBehaviourMode(raw?.mode);
  const fallback = mode === "flicker"
    ? END_BEHAVIOUR_FLICKER_DEFAULTS
    : mode === "fracture"
      ? END_BEHAVIOUR_FRACTURE_DEFAULTS
      : END_BEHAVIOUR_OFF;
  return {
    mode,
    amount: clamp100(raw?.amount, fallback.amount),
    hold: clamp100(raw?.hold, fallback.hold),
    duration: clamp100(raw?.duration, fallback.duration),
  };
}

export function defaultsForEndMode(mode: EndBehaviourMode): EndBehaviourSettings {
  if (mode === "flicker") return { mode, ...END_BEHAVIOUR_FLICKER_DEFAULTS };
  if (mode === "fracture") return { mode, ...END_BEHAVIOUR_FRACTURE_DEFAULTS };
  return { ...END_BEHAVIOUR_OFF };
}

export function endWindows(hold: number, duration: number): EndWindow {
  const durationFrac = lerp(END_DURATION_MIN_FRAC, END_DURATION_MAX_FRAC, clamp100(duration, 45) / 100);
  const holdFrac = lerp(0, END_HOLD_MAX_FRAC, clamp100(hold, 40) / 100);
  const disruptStart = 1 - durationFrac;
  const holdStart = Math.max(0, disruptStart - holdFrac);
  return { durationFrac, holdFrac, holdStart, disruptStart };
}

export function endBehaviourSeed(settings: EndBehaviourSettings): number {
  const modeBit = settings.mode === "fracture" ? 3 : settings.mode === "flicker" ? 1 : 0;
  return mix(((settings.amount | 0) * 2654435761) ^ (modeBit * 1597334677));
}

function envelope(local: number): number {
  const u = Math.min(1, Math.max(0, local));
  return Math.pow(u, 1.35);
}

function amountCurve(amount: number): number {
  return Math.pow(clamp100(amount, 50) / 100, 1.6);
}

function fragmentCountFor(amount: number): number {
  return 3 + Math.round((clamp100(amount, 50) / 100) * 6);
}

function maxDisplacementPx(amount: number, width: number, height: number): number {
  return lerp(0.8, Math.min(width, height) * 0.045, amountCurve(amount));
}

function rgbPxFor(amount: number): number {
  return lerp(0, 6.5, Math.pow(clamp100(amount, 50) / 100, 1.8));
}

export function endRegionFor(phase: number, settings: EndBehaviourSettings, playbackMode: PlaybackMode): EndRegion {
  if (settings.mode === "off") return "off";
  if (playbackMode !== "loop") return "pingpong";
  const win = endWindows(settings.hold, settings.duration);
  if (!(phase > 0) || phase >= 1) return "before";
  if (phase >= win.disruptStart) return "disrupt";
  if (phase >= win.holdStart) return "hold";
  return "before";
}

function flickerStateAt(seed: number, beat: number, nBeats: number): FlickerState {
  if (beat <= 0) return "resolved";
  if (beat >= nBeats - 1) return "joltB";
  if (beat === nBeats - 2) return "joltC";
  const slot = mix(seed + beat * 17) & 7;
  if (slot <= 1) return "resolved";
  if (slot <= 3) return "joltA";
  if (slot <= 5) return "joltB";
  return "joltC";
}

function horizontalCuts(seed: number, count: number, height: number): number[] {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const w = 0.55 + unit(seed, 40 + i) * 0.9;
    weights.push(w);
    sum += w;
  }
  const cuts = [0];
  let y = 0;
  for (let i = 0; i < count - 1; i++) {
    y += (weights[i]! / sum) * height;
    cuts.push(Math.round(y));
  }
  cuts.push(height);
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i]! <= cuts[i - 1]!) cuts[i] = Math.min(height, cuts[i - 1]! + 1);
  }
  cuts[cuts.length - 1] = height;
  return cuts;
}

function fractureBands(
  seed: number,
  amount: number,
  width: number,
  height: number,
  envelopeAmt: number,
  maxDisp: number,
  rgbBase: number,
): EndBand[] {
  const count = fragmentCountFor(amount);
  const cuts = horizontalCuts(seed, count, height);
  const bands: EndBand[] = [];
  const rgb = rgbBase * envelopeAmt;
  for (let i = 0; i < count; i++) {
    const y = cuts[i]!;
    const next = cuts[i + 1]!;
    const h = Math.max(1, next - y);
    const weight = 0.55 + unit(seed, 80 + i) * 0.7;
    const dx = maxDisp * envelopeAmt * signed(seed, 120 + i) * weight;
    const dy = maxDisp * 0.22 * envelopeAmt * signed(seed, 160 + i);
    bands.push({
      axis: "h",
      x: 0,
      y,
      w: width,
      h,
      dx,
      dy,
      rgb: rgb * (0.35 + 0.65 * unit(seed, 200 + i)),
    });
  }
  if (amount >= 48) {
    const slabW = Math.round(width * (0.2 + unit(seed, 9) * 0.16));
    const fromRight = unit(seed, 11) > 0.5;
    const x = fromRight ? width - slabW : 0;
    bands.push({
      axis: "v",
      x,
      y: 0,
      w: Math.max(8, slabW),
      h: height,
      dx: maxDisp * 0.72 * envelopeAmt * signed(seed, 13),
      dy: maxDisp * 0.18 * envelopeAmt * signed(seed, 15),
      rgb: rgb * 0.85,
    });
  }
  return bands;
}

function flickerBands(
  state: FlickerState,
  seed: number,
  width: number,
  height: number,
  envelopeAmt: number,
  maxDisp: number,
  rgbBase: number,
): EndBand[] {
  if (state === "resolved") return [];
  const mag = maxDisp * envelopeAmt * 1.65;
  const rgb = rgbBase * envelopeAmt;
  if (state === "joltA") {
    return [{
      axis: "h",
      x: 0,
      y: 0,
      w: width,
      h: height,
      dx: mag * 1.15 * (signed(seed, 3) >= 0 ? 1 : -1),
      dy: mag * 0.18 * signed(seed, 5),
      rgb: 0,
    }];
  }
  if (state === "joltB") {
    return [{
      axis: "h",
      x: 0,
      y: 0,
      w: width,
      h: height,
      dx: mag * 0.35 * signed(seed, 7),
      dy: mag * 0.82 * (signed(seed, 8) >= 0 ? 1 : -1),
      rgb: Math.max(rgb * 1.25, envelopeAmt > 0.7 ? 1.2 : 0),
    }];
  }
  const cuts = horizontalCuts(seed, 3, height);
  const bands: EndBand[] = [];
  for (let i = 0; i < 3; i++) {
    const y = cuts[i]!;
    const next = cuts[i + 1]!;
    bands.push({
      axis: "h",
      x: 0,
      y,
      w: width,
      h: Math.max(1, next - y),
      dx: mag * (i === 1 ? -0.85 : 0.7) * (signed(seed, 21 + i) >= 0 ? 1 : -1),
      dy: mag * 0.12 * signed(seed, 31 + i),
      rgb: i === 1 ? rgb * 0.9 : rgb * 0.35,
    });
  }
  return bands;
}

function diagnosticsFrom(
  plan: EndPlan,
  mode: EndBehaviourMode,
  applied: boolean,
  paintMs: number,
): EndDiagnostics {
  return {
    applied,
    bypass: !applied,
    mode,
    region: plan.region,
    phase: plan.phase,
    holdStart: plan.window.holdStart,
    disruptStart: plan.window.disruptStart,
    durationFrac: plan.window.durationFrac,
    holdFrac: plan.window.holdFrac,
    local: plan.local,
    envelope: plan.envelope,
    seed: plan.seed,
    fragmentCount: plan.fragmentCount,
    maxDisplacement: plan.maxDisplacement,
    rgbDisplacement: plan.rgbDisplacement,
    flickerState: plan.flickerState,
    paintMs,
  };
}

export function planEndBehaviour(
  phase: number,
  settings: EndBehaviourSettings,
  width: number,
  height: number,
  playbackMode: PlaybackMode,
): EndPlan {
  const win = endWindows(settings.hold, settings.duration);
  const seed = endBehaviourSeed(settings);
  const region = endRegionFor(phase, settings, playbackMode);
  const empty: EndPlan = {
    active: false,
    region,
    phase,
    local: 0,
    envelope: 0,
    seed,
    kind: "identity",
    flickerState: null,
    fragmentCount: fragmentCountFor(settings.amount),
    maxDisplacement: maxDisplacementPx(settings.amount, width, height),
    rgbDisplacement: rgbPxFor(settings.amount),
    bands: [],
    window: win,
  };
  if (region !== "disrupt" || settings.mode === "off") return empty;

  const local = (phase - win.disruptStart) / Math.max(1e-6, win.durationFrac);
  const env = envelope(local);
  const maxDisp = maxDisplacementPx(settings.amount, width, height);
  const rgbBase = rgbPxFor(settings.amount);

  if (settings.mode === "flicker") {
    const nBeats = 7 + Math.round((settings.amount / 100) * 5);
    const beat = Math.min(nBeats - 1, Math.floor(Math.min(0.999999, local) * nBeats));
    const flickerState = flickerStateAt(seed, beat, nBeats);
    const bands = flickerBands(flickerState, seed, width, height, env, maxDisp, rgbBase);
    return {
      active: flickerState !== "resolved" && bands.length > 0 && env > 0.02,
      region,
      phase,
      local,
      envelope: env,
      seed,
      kind: "flicker",
      flickerState,
      fragmentCount: fragmentCountFor(settings.amount),
      maxDisplacement: maxDisp,
      rgbDisplacement: rgbBase,
      bands,
      window: win,
    };
  }

  const bands = fractureBands(seed, settings.amount, width, height, env, maxDisp, rgbBase);
  return {
    active: env > 0.02,
    region,
    phase,
    local,
    envelope: env,
    seed,
    kind: "fracture",
    flickerState: null,
    fragmentCount: fragmentCountFor(settings.amount),
    maxDisplacement: maxDisp,
    rgbDisplacement: rgbBase,
    bands,
    window: win,
  };
}

function drawShiftedFull(
  dest: CanvasRenderingContext2D,
  src: CanvasImageSource,
  width: number,
  height: number,
  dx: number,
  dy: number,
): void {
  const scale = 1 + 2 * Math.max(Math.abs(dx) / width, Math.abs(dy) / height) * 1.05;
  dest.save();
  dest.translate(width / 2 + dx, height / 2 + dy);
  if (scale > 1.0004) dest.scale(scale, scale);
  dest.drawImage(src, -width / 2, -height / 2);
  dest.restore();
}

function paintRgbPlate(
  dest: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  band: EndBand,
  color: string,
  offsetX: number,
): void {
  if (Math.abs(band.rgb) < RGB_SKIP && Math.abs(offsetX) < RGB_SKIP) return;
  const plate = scratch("end-rgb", Math.max(2, Math.ceil(band.w)), Math.max(2, Math.ceil(band.h)));
  const pctx = plate.getContext("2d")!;
  pctx.imageSmoothingEnabled = false;
  pctx.globalCompositeOperation = "copy";
  pctx.drawImage(src, band.x, band.y, band.w, band.h, 0, 0, band.w, band.h);
  pctx.globalCompositeOperation = "multiply";
  pctx.fillStyle = color;
  pctx.fillRect(0, 0, band.w, band.h);
  dest.save();
  dest.imageSmoothingEnabled = false;
  dest.globalCompositeOperation = "screen";
  dest.globalAlpha = 0.42;
  dest.drawImage(plate, 0, 0, band.w, band.h, band.x + band.dx + offsetX, band.y + band.dy, band.w, band.h);
  dest.restore();
}

function paintBand(dest: CanvasRenderingContext2D, src: HTMLCanvasElement, band: EndBand): void {
  const extraX = Math.ceil(Math.abs(band.dx) + Math.abs(band.rgb) + 2);
  const extraY = Math.ceil(Math.abs(band.dy) + 2);
  const sx = band.x - extraX;
  const sy = band.y - extraY;
  const sw = band.w + extraX * 2;
  const sh = band.h + extraY * 2;
  dest.save();
  dest.beginPath();
  dest.rect(band.x, band.y, band.w, band.h);
  dest.clip();
  dest.imageSmoothingEnabled = false;
  dest.drawImage(src, sx, sy, sw, sh, sx + band.dx, sy + band.dy, sw, sh);
  dest.restore();
  if (band.rgb >= RGB_SKIP) {
    paintRgbPlate(dest, src, band, "#ff2020", band.rgb);
    paintRgbPlate(dest, src, band, "#00d5d8", -band.rgb);
  }
}

export function applyEndBehaviour(
  dest: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  phase: number,
  settings: EndBehaviourSettings,
  playbackMode: PlaybackMode,
): EndDiagnostics {
  const width = layer.width;
  const height = layer.height;
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const plan = planEndBehaviour(phase, settings, width, height, playbackMode);
  if (!plan.active) return diagnosticsFrom(plan, settings.mode, false, 0);

  const src = scratch("end-src", width, height);
  const sctx = src.getContext("2d")!;
  sctx.imageSmoothingEnabled = false;
  sctx.globalCompositeOperation = "copy";
  sctx.drawImage(layer, 0, 0);

  dest.save();
  dest.imageSmoothingEnabled = false;
  dest.globalCompositeOperation = "source-over";
  dest.globalAlpha = 1;

  if (plan.kind === "flicker" && plan.bands.length === 1 && plan.bands[0]!.w === width && plan.bands[0]!.h === height) {
    const band = plan.bands[0]!;
    drawShiftedFull(dest, src, width, height, band.dx, band.dy);
    if (band.rgb >= RGB_SKIP) {
      paintRgbPlate(dest, src, { ...band, dx: 0, dy: 0, x: 0, y: 0 }, "#ff2020", band.dx + band.rgb);
      paintRgbPlate(dest, src, { ...band, dx: 0, dy: 0, x: 0, y: 0 }, "#00d5d8", band.dx - band.rgb);
    }
  } else {
    dest.drawImage(src, 0, 0);
    for (const band of plan.bands) paintBand(dest, src, band);
  }

  dest.restore();
  const paintMs = typeof performance !== "undefined" ? performance.now() - t0 : 0;
  return diagnosticsFrom(plan, settings.mode, true, paintMs);
}

export function emptyEndDiagnostics(phase: number, settings: EndBehaviourSettings, playbackMode: PlaybackMode): EndDiagnostics {
  const win = endWindows(settings.hold, settings.duration);
  return {
    applied: false,
    bypass: true,
    mode: settings.mode,
    region: endRegionFor(phase, settings, playbackMode),
    phase,
    holdStart: win.holdStart,
    disruptStart: win.disruptStart,
    durationFrac: win.durationFrac,
    holdFrac: win.holdFrac,
    local: 0,
    envelope: 0,
    seed: endBehaviourSeed(settings),
    fragmentCount: fragmentCountFor(settings.amount),
    maxDisplacement: 0,
    rgbDisplacement: 0,
    flickerState: null,
    paintMs: 0,
  };
}
