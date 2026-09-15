import { clampLoopSeconds, type PlaybackMode } from "./sequence";
import {
  equalSequenceWeights,
  sequenceSpans,
  sequenceWeightsAreUniform,
  transitionCutsFromWeights,
} from "./sequenceRhythm";
import {
  endWindows,
  flickerPeakMetrics,
  paintFlickerGrammar,
  planFlickerBands,
  type EndBand,
  type EndBehaviourSettings,
  type FlickerState,
} from "./endBehaviour";

/**
 * Transition Flicker is a Loop-only micro interruption at Bloom pair cuts.
 * Same grammar as End Flicker, lower duration and violence.
 * Deterministic from master phase. No timers, no events, no accumulating state.
 * Window width is wall-clock time / authored loop length, so 4s / 8s / 12s
 * share the same punctuation duration. Not runtime-FPS dependent.
 */

/** Authored wall-clock duration of the micro interruption. Not exposed. */
export const TRANSITION_FLICKER_DURATION_SEC = 0.12;
/** Peak energy vs End Flicker at amount 100. Visible Transition Flicker punctuation. */
export const TRANSITION_FLICKER_ENERGY = 0.28;
/** Restrained state handoff when Sequence Type is on and Transition Flicker is off. */
export const SEQUENCE_HANDOFF_ENERGY = 0.11;
/** Cap Flicker to this fraction of the shorter neighbouring slot. */
export const TRANSITION_FLICKER_SHORT_FRACTION = 0.25;

/** Full master-phase span for this loop length. ~3 frames at 25fps. */
export function transitionFlickerSpan(loopSeconds: number): number {
  return TRANSITION_FLICKER_DURATION_SEC / clampLoopSeconds(loopSeconds);
}

export function transitionFlickerHalfSpan(loopSeconds: number): number {
  return transitionFlickerSpan(loopSeconds) / 2;
}
const TRANSITION_SEED = 0x51f1c4e1;

export interface TransitionFlickerPlan {
  active: boolean;
  applied: boolean;
  envelope: number;
  cutIndex: number;
  cut: number;
  pairCount: number;
  flickerState: FlickerState | null;
  bands: EndBand[];
  suppressed: boolean;
}

export interface TransitionFlickerDiagnostics {
  applied: boolean;
  envelope: number;
  cutIndex: number;
  cut: number;
  pairCount: number;
  flickerState: FlickerState | null;
  suppressed: boolean;
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

export function phaseDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/**
 * Internal pair cuts, plus wrap at 0 when `includeWrap` is set.
 * Product Loop always includes wrap so last → first uses the same grammar.
 */
export function transitionPairCuts(
  pairCount: number,
  weights?: readonly number[],
  includeWrap = false,
): number[] {
  const n = Math.max(0, Math.floor(pairCount));
  if (n < 2) return [];
  const internal =
    weights && weights.length === n && !sequenceWeightsAreUniform(weights)
      ? transitionCutsFromWeights(weights)
      : Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
  if (!includeWrap) return internal;
  return [0, ...internal];
}

function microState(seed: number, cutIndex: number): FlickerState {
  const slot = (mix(seed + cutIndex * 17) >>> 0) % 3;
  if (slot === 0) return "joltA";
  if (slot === 1) return "joltB";
  return "joltC";
}

export function incomingSlotForTransitionCut(cutIndex: number, includeWrap: boolean): number {
  return includeWrap ? cutIndex : cutIndex + 1;
}

/** Perceptual Flicker length in seconds. Scales down only when a neighbour is very short. */
export function transitionFlickerDurationSec(
  loopSeconds: number,
  pairCount: number,
  weights?: readonly number[] | null,
  incomingIndex?: number,
): number {
  const authored = TRANSITION_FLICKER_DURATION_SEC;
  const n = Math.max(0, Math.floor(pairCount));
  if (n < 2 || incomingIndex == null || incomingIndex < 0) return authored;
  const clamped = weights && weights.length === n ? weights : equalSequenceWeights(n);
  const spans = sequenceSpans(clamped);
  const incoming = spans[((incomingIndex % n) + n) % n];
  const outgoing = spans[(((incomingIndex - 1) % n) + n) % n];
  if (!incoming || !outgoing) return authored;
  const shorter = Math.min(incoming.share, outgoing.share) * clampLoopSeconds(loopSeconds);
  return Math.min(authored, Math.max(1 / 30, shorter * TRANSITION_FLICKER_SHORT_FRACTION));
}

export function transitionFlickerEnvelope(
  phase: number,
  pairCount: number,
  loopSeconds: number,
  weights?: readonly number[],
  includeWrap = false,
): { envelope: number; cutIndex: number; cut: number } {
  const p = masterPhase(phase);
  const cuts = transitionPairCuts(pairCount, weights, includeWrap);
  const loop = clampLoopSeconds(loopSeconds);
  let best = 0;
  let bestI = -1;
  let bestCut = 0;
  for (let i = 0; i < cuts.length; i++) {
    const incoming = incomingSlotForTransitionCut(i, includeWrap);
    const duration = transitionFlickerDurationSec(loopSeconds, pairCount, weights, incoming);
    const half = duration / loop / 2;
    const dist = includeWrap ? phaseDistance(p, cuts[i]!) : Math.abs(p - cuts[i]!);
    const env = half > 0 ? 1 - dist / half : 0;
    if (env > best) {
      best = env;
      bestI = i;
      bestCut = cuts[i]!;
    }
  }
  return {
    envelope: Math.min(1, Math.max(0, best)),
    cutIndex: bestI,
    cut: bestCut,
  };
}

/** Last pair-cut near End Flicker hold/disrupt: suppress so one event remains. */
export function transitionFlickerOverlapsEnd(
  cut: number,
  end: EndBehaviourSettings,
  loopSeconds: number,
): boolean {
  if (end.mode !== "flicker") return false;
  const win = endWindows(end.hold, end.duration);
  return cut + transitionFlickerHalfSpan(loopSeconds) >= win.holdStart;
}

export function emptyTransitionFlickerPlan(pairCount = 0): TransitionFlickerPlan {
  return {
    active: false,
    applied: false,
    envelope: 0,
    cutIndex: -1,
    cut: 0,
    pairCount,
    flickerState: null,
    bands: [],
    suppressed: false,
  };
}

export function planTransitionFlicker(
  phase: number,
  pairCount: number,
  playbackMode: PlaybackMode,
  enabled: boolean,
  end: EndBehaviourSettings,
  width: number,
  height: number,
  loopSeconds: number,
  weights?: readonly number[],
  includeWrap = false,
  energy = TRANSITION_FLICKER_ENERGY,
): TransitionFlickerPlan {
  const empty = emptyTransitionFlickerPlan(pairCount);
  if (!enabled || playbackMode !== "loop" || pairCount < 2) return empty;
  const { envelope, cutIndex, cut } = transitionFlickerEnvelope(phase, pairCount, loopSeconds, weights, includeWrap);
  if (cutIndex < 0 || envelope <= 0.02) return empty;

  const p = masterPhase(phase);
  if (end.mode === "flicker") {
    const win = endWindows(end.hold, end.duration);
    if (p >= win.holdStart || transitionFlickerOverlapsEnd(cut, end, loopSeconds)) {
      return { ...empty, cutIndex, cut, envelope, suppressed: true };
    }
  }

  const seed = mix(TRANSITION_SEED ^ Math.imul(pairCount, 2654435761) ^ Math.imul(cutIndex + 1, 1597334677));
  const flickerState = microState(seed, cutIndex);
  const peak = flickerPeakMetrics(width, height);
  const maxDisp = peak.maxDisp * energy;
  const rgbBase = peak.rgb * energy;
  const bands = planFlickerBands(flickerState, seed, width, height, envelope, maxDisp, rgbBase);
  const active = bands.length > 0 && envelope > 0.02;
  return {
    active,
    applied: false,
    envelope,
    cutIndex,
    cut,
    pairCount,
    flickerState,
    bands,
    suppressed: false,
  };
}

export function applyTransitionFlicker(
  dest: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  phase: number,
  pairCount: number,
  playbackMode: PlaybackMode,
  enabled: boolean,
  end: EndBehaviourSettings,
  loopSeconds: number,
  weights?: readonly number[],
  includeWrap = false,
  energy = TRANSITION_FLICKER_ENERGY,
): TransitionFlickerDiagnostics {
  const plan = planTransitionFlicker(
    phase,
    pairCount,
    playbackMode,
    enabled,
    end,
    layer.width,
    layer.height,
    loopSeconds,
    weights,
    includeWrap,
    energy,
  );
  if (!plan.active) {
    return {
      applied: false,
      envelope: plan.envelope,
      cutIndex: plan.cutIndex,
      cut: plan.cut,
      pairCount: plan.pairCount,
      flickerState: plan.flickerState,
      suppressed: plan.suppressed,
    };
  }
  paintFlickerGrammar(dest, layer, plan.bands, "xflick");
  return {
    applied: true,
    envelope: plan.envelope,
    cutIndex: plan.cutIndex,
    cut: plan.cut,
    pairCount: plan.pairCount,
    flickerState: plan.flickerState,
    suppressed: false,
  };
}

/** Frozen comparison points: first internal cut and the wrap seam. */
export function flickerComparePhases(
  pairCount: number,
  loopSeconds: number,
  weights?: readonly number[],
): {
  internalOut: number;
  internalPeak: number;
  internalIn: number;
  wrapOut: number;
  wrapPeak: number;
  wrapIn: number;
} {
  const half = transitionFlickerHalfSpan(loopSeconds);
  const cuts = transitionPairCuts(pairCount, weights, false);
  const internal = cuts[0] ?? 0.5;
  const edge = half * 0.55;
  const wrap = (n: number): number => {
    if (n < 0) return n + 1;
    if (n >= 1) return n - 1;
    return n;
  };
  return {
    internalOut: wrap(internal - edge),
    internalPeak: internal,
    internalIn: wrap(internal + edge),
    wrapOut: wrap(1 - edge),
    wrapPeak: 0,
    wrapIn: wrap(edge),
  };
}

export function emptyTransitionFlickerDiagnostics(pairCount = 0): TransitionFlickerDiagnostics {
  return {
    applied: false,
    envelope: 0,
    cutIndex: -1,
    cut: 0,
    pairCount,
    flickerState: null,
    suppressed: false,
  };
}
