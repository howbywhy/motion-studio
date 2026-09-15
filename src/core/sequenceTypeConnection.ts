/**
 * Sequence Type connection treatments.
 *
 * Product uses FLICKER: Type holds, then swaps inside the shared handoff.
 * SOFT and BLOOM remain eval / QA only.
 *
 * SOFT          crop arrive / connected resolve (QA baseline)
 * FLICKER       hold-through; the shared Flicker owns the cut
 * BLOOM         Type-specific Bloom mask, HOLD stays unmasked (eval)
 * BLOOM+FLICKER restrained Type Bloom + Flicker cut (eval)
 */

import type { SequenceTypeDraw, SequenceTypeEnvelope } from "./sequenceTypeTiming";

export const TYPE_CONNECTION_MODES = ["soft", "flicker", "bloom", "bloom-flicker"] as const;
export type TypeConnectionMode = (typeof TYPE_CONNECTION_MODES)[number];

export const FLICKER_WRAP_MODES = ["current", "include-wrap"] as const;
export type FlickerWrapMode = (typeof FLICKER_WRAP_MODES)[number];

export const FLICKER_SWAPS = ["early", "centre", "late"] as const;
export type FlickerSwap = (typeof FLICKER_SWAPS)[number];

/** Type Bloom settles slightly before image Envelope B (0.18). */
export const TYPE_BLOOM_ARRIVE_END = 0.14;
/** Type stays clean a moment after image resolve begins (0.72). */
export const TYPE_BLOOM_RESOLVE_START = 0.74;
/** Combined treatment: only start dissolving toward the Flicker. */
export const TYPE_BLOOM_FLICKER_RESOLVE_START = 0.88;

export interface SequenceUnityBind {
  connection: TypeConnectionMode;
  flickerWrap: FlickerWrapMode;
  flickerSwap?: FlickerSwap;
}

export function clampTypeConnection(raw: unknown): TypeConnectionMode {
  return TYPE_CONNECTION_MODES.includes(raw as TypeConnectionMode) ? (raw as TypeConnectionMode) : "soft";
}

export function clampFlickerWrap(raw: unknown): FlickerWrapMode {
  return raw === "include-wrap" ? "include-wrap" : "current";
}

export function clampFlickerSwap(raw: unknown): FlickerSwap {
  return FLICKER_SWAPS.includes(raw as FlickerSwap) ? (raw as FlickerSwap) : "centre";
}

export function signedPhaseDelta(phase: number, cut: number): number {
  let d = phase - cut;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

/** Where inside the Flicker window the copy changes. 0 is the cut. */
export function flickerSwapThreshold(swap: FlickerSwap, halfSpan: number): number {
  if (swap === "early") return -0.4 * halfSpan;
  if (swap === "late") return 0.4 * halfSpan;
  return 0;
}

/**
 * Copy index during a Flicker handoff. pairIndex already flips at the cut;
 * EARLY/LATE shift the semantic swap inside the interruption.
 */
export function sequenceTypeCopyIndex(
  pairIndex: number,
  pairCount: number,
  masterPhase: number,
  flickerCut: number,
  flickerEnvelope: number,
  swap: FlickerSwap,
  halfSpan: number,
): number {
  const n = Math.max(1, pairCount);
  const i = ((pairIndex % n) + n) % n;
  if (flickerEnvelope <= 0.02) return i;
  const delta = signedPhaseDelta(masterPhase, flickerCut);
  const threshold = flickerSwapThreshold(swap, halfSpan);
  if (swap === "early" && delta >= threshold && delta < 0) return (i + 1) % n;
  if (swap === "late" && delta >= 0 && delta < threshold) return (i - 1 + n) % n;
  return i;
}

export function connectionUsesFlicker(mode: TypeConnectionMode): boolean {
  return mode === "flicker" || mode === "bloom-flicker";
}

export function connectionUsesBloom(mode: TypeConnectionMode): boolean {
  return mode === "bloom" || mode === "bloom-flicker";
}

export function typeBloomWindows(mode: TypeConnectionMode): { arriveEnd: number; resolveStart: number } {
  if (mode === "bloom-flicker") {
    return { arriveEnd: TYPE_BLOOM_ARRIVE_END, resolveStart: TYPE_BLOOM_FLICKER_RESOLVE_START };
  }
  return { arriveEnd: TYPE_BLOOM_ARRIVE_END, resolveStart: TYPE_BLOOM_RESOLVE_START };
}

export function typeBloomPresence(localPhase: number, mode: TypeConnectionMode): {
  stage: "arrive" | "hold" | "resolve";
  presence: number;
} {
  const p = Number.isFinite(localPhase) ? Math.min(1, Math.max(0, localPhase)) : 0;
  const { arriveEnd, resolveStart } = typeBloomWindows(mode);
  const smooth = (t: number): number => {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
  };
  if (p < arriveEnd) {
    const t = arriveEnd <= 0 ? 1 : p / arriveEnd;
    return { stage: "arrive", presence: smooth(t) };
  }
  if (p < resolveStart) return { stage: "hold", presence: 1 };
  const span = Math.max(1e-6, 1 - resolveStart);
  const t = (p - resolveStart) / span;
  const floor = mode === "bloom-flicker" ? 0.55 : 0;
  return { stage: "resolve", presence: floor + (1 - floor) * (1 - smooth(t)) };
}

/** Crop/opacity for Type ink. Bloom modes leave reveal to the Type mask. */
export function sequenceTypeConnectionDraw(
  _env: SequenceTypeEnvelope,
  _mode: TypeConnectionMode,
  _canvasH: number,
): SequenceTypeDraw {
  return { opacity: 1, dy: 0, cropT: 0, cropB: 0, cropL: 0, cropR: 0, trackingAdd: 0 };
}

let unityBind: SequenceUnityBind | null = null;
const unityByOwner = new WeakMap<object, SequenceUnityBind | null>();

export function bindEvalSequenceUnity(owner: object, bind: SequenceUnityBind | null): void {
  unityByOwner.set(owner, bind);
}

export function setEvalSequenceUnity(bind: SequenceUnityBind | null): void {
  unityBind = bind;
}

export function resolveEvalSequenceUnity(owner?: object): SequenceUnityBind | null {
  if (owner && unityByOwner.has(owner)) return unityByOwner.get(owner) ?? null;
  return unityBind;
}
