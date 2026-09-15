/**
 * Eval-only identity grammar. Product MARK stays CURRENT until a winner
 * is integrated. Treatments share the stacked lockup and existing Flicker
 * bands. No Bloom-masked logo. No new logo effect.
 */

import {
  MARK_ALIGN_X,
  MARK_LEFT_X,
  layoutMarkRect,
  markAligned,
  planMarkDock,
  type MarkPlan,
} from "./markPlan";
import { clampMarkState, type MarkState } from "./markState";
import { TRANSITION_FLICKER_ENERGY } from "./transitionFlicker";
import {
  flickerPeakMetrics,
  planFlickerBands,
  type FlickerState,
} from "./endBehaviour";

export const IDENTITY_FINAL_TREATMENTS = [
  "current",
  "flicker-presence",
  "flicker-assembly",
  "static",
] as const;

export type IdentityFinalTreatment = (typeof IDENTITY_FINAL_TREATMENTS)[number];
export type IdentityTypeYield = "hide" | "coexist" | "yield-strong";

export interface IdentityFinalConfig {
  treatment: IdentityFinalTreatment;
  typeYield: IdentityTypeYield;
}

let evalConfig: IdentityFinalConfig | null = null;
const evalByOwner = new WeakMap<object, IdentityFinalConfig | null>();

export function setEvalIdentityFinal(config: IdentityFinalConfig | null): void {
  evalConfig = config;
}

export function bindEvalIdentityFinal(owner: object, config: IdentityFinalConfig | null): void {
  evalByOwner.set(owner, config);
}

export function resolveEvalIdentityFinal(owner?: object): IdentityFinalConfig | null {
  if (owner && evalByOwner.has(owner)) return evalByOwner.get(owner) ?? null;
  return evalConfig;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function masterPhase(phase: number): number {
  return !(phase > 0) || phase >= 1 ? 0 : phase;
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

function microState(seed: number, slot: number): FlickerState {
  const n = (mix(seed + slot * 17) >>> 0) % 3;
  if (n === 0) return "joltA";
  if (n === 1) return "joltB";
  return "joltC";
}

function hideTypeFor(yieldMode: IdentityTypeYield, visible: boolean, envelope: number): boolean {
  if (!visible) return false;
  if (yieldMode === "hide") return true;
  if (yieldMode === "yield-strong") return envelope > 0.55;
  return false;
}

function withSharedFlicker(
  plan: MarkPlan,
  envelope: number,
  width: number,
  height: number,
): MarkPlan {
  if (envelope <= 0.02) return plan;
  const seed = mix(0x49444e54 ^ Math.imul(Math.round(plan.local * 1000), 2654435761));
  const flickerState = microState(seed, 0);
  const peak = flickerPeakMetrics(width, height);
  const maxDisp = peak.maxDisp * TRANSITION_FLICKER_ENERGY;
  const rgbBase = peak.rgb * TRANSITION_FLICKER_ENERGY;
  const bands = planFlickerBands(flickerState, seed, width, height, envelope, maxDisp, rgbBase);
  return { ...plan, flicker: envelope, flickerState, bands };
}

/** Aligned lockup for the full authored master window. No dock travel. */
export function planIdentityLockup(
  raw: MarkState | Partial<MarkState>,
  phase: number,
  width: number,
  height: number,
  flickerEnvelope: number,
  typeYield: IdentityTypeYield,
  treatment: Exclude<IdentityFinalTreatment, "current">,
): MarkPlan {
  const state = clampMarkState(raw);
  const layout = layoutMarkRect(width, height, state.scale, state.anchor);
  const empty: MarkPlan = {
    visible: false,
    kind: "absent",
    local: 0,
    madeLenX: MARK_ALIGN_X,
    aligned: false,
    flicker: 0,
    flickerState: null,
    bands: [],
    hideType: false,
    yieldEnd: false,
    layout,
    source: state.source,
    mode: state.mode,
  };
  if (!state.enabled) return empty;
  const p = masterPhase(phase);
  const start = state.sequenceStart;
  const stop = state.sequenceStop;
  if (p < start || p >= stop) return empty;
  const span = Math.max(1e-6, stop - start);
  const local = clamp01((p - start) / span);
  const split = treatment === "flicker-assembly" ? MARK_LEFT_X * 0.22 * clamp01(flickerEnvelope) : MARK_ALIGN_X;
  let plan: MarkPlan = {
    visible: true,
    kind: "logotype",
    local,
    madeLenX: split,
    aligned: markAligned(split),
    flicker: 0,
    flickerState: null,
    bands: [],
    hideType: hideTypeFor(typeYield, true, flickerEnvelope),
    yieldEnd: false,
    layout,
    source: state.source,
    mode: state.mode,
  };
  if (treatment === "flicker-presence") {
    plan = withSharedFlicker(plan, flickerEnvelope, width, height);
  }
  return plan;
}

export function planIdentityFinal(
  raw: MarkState | Partial<MarkState>,
  phase: number,
  width: number,
  height: number,
  loopSeconds: number,
  flickerEnvelope: number,
  config: IdentityFinalConfig,
): MarkPlan {
  if (config.treatment === "current") {
    const plan = planMarkDock(raw, phase, width, height, loopSeconds);
    if (config.typeYield !== "hide") {
      return {
        ...plan,
        hideType: hideTypeFor(config.typeYield, plan.visible, flickerEnvelope),
      };
    }
    return plan;
  }
  return planIdentityLockup(raw, phase, width, height, flickerEnvelope, config.typeYield, config.treatment);
}

/** Product and flicker treatments sit in the composition. Eval CURRENT paints after. */
export function identityPaintsBeforeFlicker(config: IdentityFinalConfig | null): boolean {
  return !config || config.treatment !== "current";
}

export function identityFinalLabel(id: IdentityFinalTreatment): string {
  if (id === "current") return "CURRENT";
  if (id === "flicker-presence") return "FLICKER PRESENCE";
  if (id === "flicker-assembly") return "FLICKER ASSEMBLY";
  return "STATIC SIGNATURE";
}
