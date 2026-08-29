import { TYPE_ANCHORS, type TypeAnchor } from "./typeState";
import { TRANSITION_FLICKER_DURATION_SEC, TRANSITION_FLICKER_ENERGY } from "./transitionFlicker";
import {
  flickerPeakMetrics,
  planFlickerBands,
  type EndBand,
  type FlickerState,
} from "./endBehaviour";
import { MARK_LATERAL_DX, MARK_STACKED } from "./markAssets";
import { clampMarkState, type MarkMode, type MarkSource, type MarkState } from "./markState";

const INSET = 0.07;
const MARK_SEED = 0x4d41524b;

/** MADELEN X in stacked SVG units. 0 = exact stacked lockup. Positive = right. */
export const MARK_ALIGN_X = 0;
export const MARK_START_X = MARK_LATERAL_DX;
/** After first alignment: about one letter, not another trip across the page. */
export const MARK_LEFT_X = -Math.round(MARK_LATERAL_DX * 0.14);
export const MARK_RIGHT_X = Math.round(MARK_LATERAL_DX * 0.16);

export const MARK_LOCAL = {
  rightHold: 0.15,
  firstAlign: 0.38,
  leftPeak: 0.48,
  secondAlign: 0.62,
  rightPeak: 0.72,
  snap: 0.74,
  holdStart: 0.76,
  holdEnd: 0.92,
} as const;

export type MarkKind = "absent" | "logotype" | "emblem";
export type MarkFlickerTest = "A" | "B" | "C";

export interface MarkLayout {
  x: number;
  y: number;
  s: number;
  worldW: number;
  worldH: number;
  /** Stacked origin inside the layout world. Product is 0; eval travel-fit pads for the left overshoot. */
  originX: number;
}

export interface MarkPlan {
  visible: boolean;
  kind: MarkKind;
  local: number;
  madeLenX: number;
  aligned: boolean;
  flicker: number;
  flickerState: FlickerState | null;
  bands: EndBand[];
  hideType: boolean;
  yieldEnd: boolean;
  layout: MarkLayout;
  source: MarkSource;
  mode: MarkMode;
}

export interface MarkDiagnostics {
  applied: boolean;
  kind: MarkKind;
  local: number;
  madeLenX: number;
  aligned: boolean;
  flicker: number;
  hideType: boolean;
  yieldEnd: boolean;
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

function masterPhase(phase: number): number {
  return !(phase > 0) || phase >= 1 ? 0 : phase;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * clamp01(u);
}

function triangle(local: number, center: number, half: number): number {
  if (half <= 0) return 0;
  return clamp01(1 - Math.abs(local - center) / half);
}

function flickerHalfLocal(loopSeconds: number, windowSpan: number): number {
  const span = Math.max(1e-6, windowSpan);
  const phaseSpan = TRANSITION_FLICKER_DURATION_SEC / Math.max(0.25, loopSeconds);
  return (phaseSpan / span) / 2;
}

function microState(seed: number, slot: number): FlickerState {
  const n = (mix(seed + slot * 17) >>> 0) % 3;
  if (n === 0) return "joltA";
  if (n === 1) return "joltB";
  return "joltC";
}

function anchorFrac(anchor: TypeAnchor): { hx: number; hy: number } {
  const col = anchor[1];
  const row = anchor[0];
  return {
    hx: col === "l" ? 0 : col === "r" ? 1 : 0.5,
    hy: row === "t" ? 0 : row === "b" ? 1 : 0.5,
  };
}

function layoutBox(
  width: number,
  height: number,
  scale: number,
  anchor: TypeAnchor,
  worldW: number,
  worldH: number,
  originX: number,
): MarkLayout {
  const safeW = width * (1 - INSET * 2);
  const safeH = height * (1 - INSET * 2);
  const fit = Math.min(safeW / worldW, safeH / worldH);
  const s = fit * (0.42 + 0.58 * (Math.min(100, Math.max(0, scale)) / 100));
  const dw = worldW * s;
  const dh = worldH * s;
  const { hx, hy } = anchorFrac(TYPE_ANCHORS.includes(anchor) ? anchor : "mc");
  const x = width * INSET + (safeW - dw) * hx;
  const y = height * INSET + (safeH - dh) * hy;
  return { x, y, s, worldW, worldH, originX };
}

/**
 * Product layout: the stacked lockup is the Frame Align box.
 * MADELEN may extend right (and slightly left) of that box during travel.
 */
export function layoutMarkRect(
  width: number,
  height: number,
  scale: number,
  anchor: TypeAnchor,
): MarkLayout {
  return layoutBox(width, height, scale, anchor, MARK_STACKED.width, MARK_STACKED.height, 0);
}

/** Eval-only: fit the full RIGHT → LEFT overshoot so the trajectory is visible. */
export function layoutMarkTravelRect(
  width: number,
  height: number,
  scale: number,
  anchor: TypeAnchor,
): MarkLayout {
  const leftPad = -MARK_LEFT_X;
  const worldW = leftPad + MARK_STACKED.width + MARK_LATERAL_DX;
  return layoutBox(width, height, scale, anchor, worldW, MARK_STACKED.height, leftPad);
}

/**
 * MADELEN X vs MARK local phase.
 * RIGHT hold → through ALIGN → LEFT → through ALIGN → RIGHT → SNAP ALIGN → HOLD.
 * Linear segments. Hard snap at 72%. No sine, bounce, or elastic.
 */
export function markMadeLenX(local: number): number {
  const t = clamp01(local);
  const k = MARK_LOCAL;
  if (t < k.rightHold) return MARK_START_X;
  if (t < k.firstAlign) return lerp(MARK_START_X, MARK_ALIGN_X, (t - k.rightHold) / (k.firstAlign - k.rightHold));
  if (t < k.leftPeak) return lerp(MARK_ALIGN_X, MARK_LEFT_X, (t - k.firstAlign) / (k.leftPeak - k.firstAlign));
  if (t < k.secondAlign) return lerp(MARK_LEFT_X, MARK_ALIGN_X, (t - k.leftPeak) / (k.secondAlign - k.leftPeak));
  if (t < k.rightPeak) return lerp(MARK_ALIGN_X, MARK_RIGHT_X, (t - k.secondAlign) / (k.rightPeak - k.secondAlign));
  return MARK_ALIGN_X;
}

export function markAligned(x: number): boolean {
  return Math.abs(x) < 0.5;
}

/** Product default is A: Flicker only on the final snap. */
export function dockFlickerCenters(test: MarkFlickerTest): number[] {
  if (test === "B") return [MARK_LOCAL.secondAlign, MARK_LOCAL.snap];
  if (test === "C") return [MARK_LOCAL.holdEnd];
  return [MARK_LOCAL.snap];
}

function emptyPlan(state: MarkState, width: number, height: number): MarkPlan {
  return {
    visible: false,
    kind: "absent",
    local: 0,
    madeLenX: MARK_START_X,
    aligned: false,
    flicker: 0,
    flickerState: null,
    bands: [],
    hideType: false,
    yieldEnd: false,
    layout: layoutMarkRect(width, height, state.scale, state.anchor),
    source: state.source,
    mode: state.mode,
  };
}

function withFlicker(
  plan: MarkPlan,
  envelope: number,
  slot: number,
  width: number,
  height: number,
): MarkPlan {
  if (envelope <= 0.02) return plan;
  const seed = mix(MARK_SEED ^ Math.imul(slot + 1, 1597334677) ^ Math.imul(Math.round(plan.local * 1000), 2654435761));
  const flickerState = microState(seed, slot);
  const peak = flickerPeakMetrics(width, height);
  const maxDisp = peak.maxDisp * TRANSITION_FLICKER_ENERGY;
  const rgbBase = peak.rgb * TRANSITION_FLICKER_ENERGY;
  const bands = planFlickerBands(flickerState, seed, width, height, envelope, maxDisp, rgbBase);
  return { ...plan, flicker: envelope, flickerState, bands };
}

function applyCenters(
  plan: MarkPlan,
  centers: number[],
  loopSeconds: number,
  span: number,
  width: number,
  height: number,
): MarkPlan {
  const half = flickerHalfLocal(loopSeconds, span);
  let envelope = 0;
  let slot = 0;
  for (let i = 0; i < centers.length; i++) {
    const env = triangle(plan.local, centers[i]!, half);
    if (env > envelope) {
      envelope = env;
      slot = i;
    }
  }
  return withFlicker(plan, envelope, slot, width, height);
}

function introEndSeq(local: number): { kind: MarkKind; madeLenX: number } {
  if (local >= MARK_LOCAL.holdEnd) return { kind: "absent", madeLenX: MARK_ALIGN_X };
  return { kind: "logotype", madeLenX: markMadeLenX(local) };
}

function interruptSeq(local: number): { kind: MarkKind; madeLenX: number } {
  if (local < 0.1) return { kind: "absent", madeLenX: MARK_ALIGN_X };
  if (local < 0.42) return { kind: "emblem", madeLenX: MARK_ALIGN_X };
  if (local < 0.82) return { kind: "logotype", madeLenX: MARK_ALIGN_X };
  return { kind: "absent", madeLenX: MARK_ALIGN_X };
}

export function planMark(
  raw: MarkState | Partial<MarkState>,
  phase: number,
  width: number,
  height: number,
  loopSeconds: number,
): MarkPlan {
  const state = clampMarkState(raw);
  const empty = emptyPlan(state, width, height);
  if (!state.enabled) return empty;
  const p = masterPhase(phase);
  const start = state.sequenceStart;
  const stop = state.sequenceStop;
  if (p < start || p >= stop) return empty;
  const span = Math.max(1e-6, stop - start);
  const local = clamp01((p - start) / span);
  const seq = state.mode === "interrupt" ? interruptSeq(local) : introEndSeq(local);
  const layout = layoutMarkRect(width, height, state.scale, state.anchor);
  const visible = seq.kind !== "absent";
  const plan: MarkPlan = {
    visible,
    kind: seq.kind,
    local,
    madeLenX: seq.madeLenX,
    aligned: seq.kind === "logotype" && markAligned(seq.madeLenX),
    flicker: 0,
    flickerState: null,
    bands: [],
    hideType: true,
    yieldEnd: true,
    layout,
    source: state.source,
    mode: state.mode,
  };
  const centers = state.mode === "interrupt" ? [0.1, 0.82] : dockFlickerCenters("A");
  return applyCenters(plan, centers, loopSeconds, span, width, height);
}

export function emptyMarkDiagnostics(): MarkDiagnostics {
  return {
    applied: false,
    kind: "absent",
    local: 0,
    madeLenX: MARK_START_X,
    aligned: false,
    flicker: 0,
    hideType: false,
    yieldEnd: false,
  };
}

export function diagnosticsFrom(plan: MarkPlan): MarkDiagnostics {
  return {
    applied: plan.visible || plan.flicker > 0.02,
    kind: plan.kind,
    local: plan.local,
    madeLenX: plan.madeLenX,
    aligned: plan.aligned,
    flicker: plan.flicker,
    hideType: plan.hideType,
    yieldEnd: plan.yieldEnd,
  };
}

/** Motion-study variants. Eval only — not product UI. */
export type MarkStudyId = "dock" | "flickerA" | "flickerB" | "flickerC" | "interrupt";

export function planMarkStudy(
  id: MarkStudyId,
  local: number,
  width: number,
  height: number,
  loopSeconds: number,
): MarkPlan {
  const l = clamp01(local);
  const layout = id === "interrupt"
    ? layoutMarkRect(width, height, 80, "mc")
    : layoutMarkTravelRect(width, height, 80, "mc");
  const seq = id === "interrupt" ? interruptSeq(l) : introEndSeq(l);
  const plan: MarkPlan = {
    visible: seq.kind !== "absent",
    kind: seq.kind,
    local: l,
    madeLenX: seq.madeLenX,
    aligned: seq.kind === "logotype" && markAligned(seq.madeLenX),
    flicker: 0,
    flickerState: null,
    bands: [],
    hideType: true,
    yieldEnd: true,
    layout,
    source: "stacked",
    mode: id === "interrupt" ? "interrupt" : "intro",
  };
  const centers = id === "interrupt"
    ? [0.1, 0.82]
    : id === "flickerB"
      ? dockFlickerCenters("B")
      : id === "flickerC"
        ? dockFlickerCenters("C")
        : id === "flickerA" || id === "dock"
          ? dockFlickerCenters("A")
          : [];
  if (id === "dock") return plan;
  return applyCenters(plan, centers, loopSeconds, 1, width, height);
}
