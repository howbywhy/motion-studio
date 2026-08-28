import type { PlaybackMode } from "./sequence";
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
 */

/** Full master-phase span ≈ 0.012 (~3.6 frames at 12s / 25fps). Not exposed. */
export const TRANSITION_FLICKER_HALF_SPAN = 0.006;
/** Peak energy vs End Flicker at amount 100. Not exposed. */
export const TRANSITION_FLICKER_ENERGY = 0.28;
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

/** Internal pair cuts only. Loop wrap (0 / 1) is never a Transition Flicker seam. */
export function transitionPairCuts(pairCount: number): number[] {
  const n = Math.max(0, Math.floor(pairCount));
  if (n < 2) return [];
  const cuts: number[] = [];
  for (let i = 1; i < n; i++) cuts.push(i / n);
  return cuts;
}

function microState(seed: number, cutIndex: number): FlickerState {
  const slot = (mix(seed + cutIndex * 17) >>> 0) % 3;
  if (slot === 0) return "joltA";
  if (slot === 1) return "joltB";
  return "joltC";
}

export function transitionFlickerEnvelope(
  phase: number,
  pairCount: number,
): { envelope: number; cutIndex: number; cut: number } {
  const p = masterPhase(phase);
  const cuts = transitionPairCuts(pairCount);
  let best = 0;
  let bestI = -1;
  let bestCut = 0;
  for (let i = 0; i < cuts.length; i++) {
    const env = 1 - Math.abs(p - cuts[i]!) / TRANSITION_FLICKER_HALF_SPAN;
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
): boolean {
  if (end.mode !== "flicker") return false;
  const win = endWindows(end.hold, end.duration);
  return cut + TRANSITION_FLICKER_HALF_SPAN >= win.holdStart;
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
): TransitionFlickerPlan {
  const empty = emptyTransitionFlickerPlan(pairCount);
  if (!enabled || playbackMode !== "loop" || pairCount < 2) return empty;
  const { envelope, cutIndex, cut } = transitionFlickerEnvelope(phase, pairCount);
  if (cutIndex < 0 || envelope <= 0.02) return empty;

  const p = masterPhase(phase);
  if (end.mode === "flicker") {
    const win = endWindows(end.hold, end.duration);
    if (p >= win.holdStart || transitionFlickerOverlapsEnd(cut, end)) {
      return { ...empty, cutIndex, cut, envelope, suppressed: true };
    }
  }

  const seed = mix(TRANSITION_SEED ^ Math.imul(pairCount, 2654435761) ^ Math.imul(cutIndex + 1, 1597334677));
  const flickerState = microState(seed, cutIndex);
  const peak = flickerPeakMetrics(width, height);
  const maxDisp = peak.maxDisp * TRANSITION_FLICKER_ENERGY;
  const rgbBase = peak.rgb * TRANSITION_FLICKER_ENERGY;
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
): TransitionFlickerDiagnostics {
  const plan = planTransitionFlicker(
    phase,
    pairCount,
    playbackMode,
    enabled,
    end,
    layer.width,
    layer.height,
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
