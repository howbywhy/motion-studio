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
const GAP_MAX = 36;
const MARK_SEED = 0x4d41524b;

export type MarkKind = "absent" | "logotype" | "emblem";

export interface MarkLayout {
  x: number;
  y: number;
  s: number;
  worldW: number;
  worldH: number;
}

export interface MarkPlan {
  visible: boolean;
  kind: MarkKind;
  local: number;
  travel: number;
  gap: number;
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
  travel: number;
  gap: number;
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

/** Linear travel, then a hard snap into registration. */
export function markTravelT(u: number): number {
  const t = clamp01(u);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.88) return (t / 0.88) * 0.92;
  return 1;
}

function inRange(local: number, a: number, b: number): boolean {
  return local >= a && local < b;
}

function rangeT(local: number, a: number, b: number): number {
  if (b <= a) return 1;
  return clamp01((local - a) / (b - a));
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

export function layoutMarkRect(
  width: number,
  height: number,
  scale: number,
  anchor: TypeAnchor,
): MarkLayout {
  const worldW = MARK_STACKED.width + MARK_LATERAL_DX;
  const worldH = MARK_STACKED.height + GAP_MAX;
  const safeW = width * (1 - INSET * 2);
  const safeH = height * (1 - INSET * 2);
  const fit = Math.min(safeW / worldW, safeH / worldH);
  const s = fit * (0.42 + 0.58 * (Math.min(100, Math.max(0, scale)) / 100));
  const dw = worldW * s;
  const dh = worldH * s;
  const { hx, hy } = anchorFrac(TYPE_ANCHORS.includes(anchor) ? anchor : "mc");
  const x = width * INSET + (safeW - dw) * hx;
  const y = height * INSET + (safeH - dh) * hy;
  return { x, y, s, worldW, worldH };
}

function emptyPlan(state: MarkState, width: number, height: number): MarkPlan {
  return {
    visible: false,
    kind: "absent",
    local: 0,
    travel: 0,
    gap: 0,
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

function introPlan(local: number, source: MarkSource): { kind: MarkKind; travel: number; gap: number; snapAt: number; releaseAt: number } {
  if (source === "emblem") {
    if (local < 0.12) return { kind: "absent", travel: 1, gap: 0, snapAt: 0.12, releaseAt: 0.88 };
    if (local < 0.88) return { kind: "emblem", travel: 1, gap: 0, snapAt: 0.12, releaseAt: 0.88 };
    return { kind: "absent", travel: 1, gap: 0, snapAt: 0.12, releaseAt: 0.88 };
  }
  if (source === "horizontal") {
    if (inRange(local, 0, 0.75)) return { kind: "logotype", travel: 0, gap: 0, snapAt: 0.55, releaseAt: 0.88 };
    if (inRange(local, 0.75, 0.88)) return { kind: "logotype", travel: 0, gap: rangeT(local, 0.75, 0.88), snapAt: 0.55, releaseAt: 0.88 };
    return { kind: "absent", travel: 0, gap: 1, snapAt: 0.55, releaseAt: 0.88 };
  }
  if (inRange(local, 0, 0.3)) return { kind: "logotype", travel: 0, gap: 0, snapAt: 0.55, releaseAt: 0.88 };
  if (inRange(local, 0.3, 0.55)) return { kind: "logotype", travel: markTravelT(rangeT(local, 0.3, 0.55)), gap: 0, snapAt: 0.55, releaseAt: 0.88 };
  if (inRange(local, 0.55, 0.75)) return { kind: "logotype", travel: 1, gap: 0, snapAt: 0.55, releaseAt: 0.88 };
  if (inRange(local, 0.75, 0.88)) return { kind: "logotype", travel: 1, gap: rangeT(local, 0.75, 0.88), snapAt: 0.55, releaseAt: 0.88 };
  return { kind: "absent", travel: 1, gap: 1, snapAt: 0.55, releaseAt: 0.88 };
}

function interruptPlan(local: number, source: MarkSource): { kind: MarkKind; travel: number; gap: number; snapAt: number; releaseAt: number } {
  if (local < 0.1) return { kind: "absent", travel: 1, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
  if (source === "emblem") {
    if (local < 0.82) return { kind: "emblem", travel: 1, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
    return { kind: "absent", travel: 1, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
  }
  if (source === "horizontal") {
    if (local < 0.82) return { kind: "logotype", travel: 0, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
    return { kind: "absent", travel: 0, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
  }
  if (local < 0.38) return { kind: "emblem", travel: 1, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
  if (local < 0.82) return { kind: "logotype", travel: 1, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
  return { kind: "absent", travel: 1, gap: 0, snapAt: 0.1, releaseAt: 0.82 };
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
  const seq = state.mode === "interrupt" ? interruptPlan(local, state.source) : introPlan(local, state.source);
  const layout = layoutMarkRect(width, height, state.scale, state.anchor);
  const visible = seq.kind !== "absent";
  let plan: MarkPlan = {
    visible,
    kind: seq.kind,
    local,
    travel: seq.travel,
    gap: seq.gap,
    flicker: 0,
    flickerState: null,
    bands: [],
    hideType: true,
    yieldEnd: true,
    layout,
    source: state.source,
    mode: state.mode,
  };
  const half = flickerHalfLocal(loopSeconds, span);
  const snapEnv = triangle(local, seq.snapAt, half);
  const relEnv = triangle(local, seq.releaseAt, half);
  const envelope = Math.max(snapEnv, relEnv);
  const slot = snapEnv >= relEnv ? 0 : 1;
  plan = withFlicker(plan, envelope, slot, width, height);
  return plan;
}

export function emptyMarkDiagnostics(): MarkDiagnostics {
  return {
    applied: false,
    kind: "absent",
    local: 0,
    travel: 0,
    gap: 0,
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
    travel: plan.travel,
    gap: plan.gap,
    flicker: plan.flicker,
    hideType: plan.hideType,
    yieldEnd: plan.yieldEnd,
  };
}

/** Motion-study variants. Eval only — not product UI. */
export type MarkStudyId = "lateral" | "snapFlicker" | "gapRelease" | "emblemCut";

export function planMarkStudy(
  id: MarkStudyId,
  local: number,
  width: number,
  height: number,
  loopSeconds: number,
): MarkPlan {
  const state = clampMarkState({
    enabled: true,
    mode: "intro",
    source: id === "emblemCut" ? "stacked" : "stacked",
    sequenceStart: 0,
    sequenceStop: 1,
    scale: 80,
    anchor: "mc",
  });
  const layout = layoutMarkRect(width, height, state.scale, state.anchor);
  const l = clamp01(local);
  let kind: MarkKind = "logotype";
  let travel = 0;
  let gap = 0;
  let snapAt = 0.55;
  let releaseAt = 0.88;
  if (id === "lateral") {
    if (l < 0.2) travel = 0;
    else if (l < 0.7) travel = markTravelT(rangeT(l, 0.2, 0.7));
    else if (l < 0.92) travel = 1;
    else kind = "absent";
    snapAt = 0.7;
    releaseAt = 0.92;
  } else if (id === "snapFlicker") {
    if (l < 0.18) travel = 0;
    else if (l < 0.52) travel = markTravelT(rangeT(l, 0.18, 0.52));
    else if (l < 0.86) travel = 1;
    else kind = "absent";
    snapAt = 0.52;
    releaseAt = 0.86;
  } else if (id === "gapRelease") {
    travel = 1;
    if (l < 0.55) gap = 0;
    else if (l < 0.82) gap = rangeT(l, 0.55, 0.82);
    else kind = "absent";
    snapAt = 0.12;
    releaseAt = 0.82;
  } else {
    if (l < 0.22) {
      kind = "logotype";
      travel = 0;
    } else if (l < 0.4) kind = "emblem";
    else if (l < 0.82) {
      kind = "logotype";
      travel = 1;
    } else kind = "absent";
    snapAt = 0.4;
    releaseAt = 0.82;
  }
  let plan: MarkPlan = {
    visible: kind !== "absent",
    kind,
    local: l,
    travel,
    gap,
    flicker: 0,
    flickerState: null,
    bands: [],
    hideType: true,
    yieldEnd: true,
    layout,
    source: "stacked",
    mode: "intro",
  };
  if (id === "snapFlicker" || id === "emblemCut") {
    const half = flickerHalfLocal(loopSeconds, 1);
    const env = Math.max(triangle(l, snapAt, half), triangle(l, releaseAt, half));
    plan = withFlicker(plan, env, 0, width, height);
  }
  return plan;
}
