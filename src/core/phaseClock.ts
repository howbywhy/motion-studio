import { RESOLVE_CYCLE_SECONDS } from "../behaviors/bloom/fields";
import { shiftCycleSpans } from "../behaviors/shift/timing";
import type { ParamValues } from "./types";

/** AUTO: behaviour time advances with the render loop.
 *  HOLD: behaviour time is a frozen 0..1 phase; media may still update. */
export type ClockMode = "auto" | "hold";

/**
 * Public 0..1 phase for the Phase control.
 *
 * Shift: 0 is REST (the photograph whole). (0, 1] is localPhase inside the
 * transform span — EARLY / MEDIUM / MAXIMUM / RETURN. This is independent
 * of Rhythm/Speed hold duration, so a held 0.50 is "peak transform" across
 * presets and expressions.
 *
 * Bloom has no rest/transform choreography. 0..1 is the shared resolve
 * sweep (`RESOLVE_CYCLE_SECONDS`). Freezing it freezes field drift, local
 * breathing, and the coalesce — deterministic, no Bloom rewrite.
 */
export function phaseFromTime(behaviorId: string | undefined, time: number, params: ParamValues): number {
  if (behaviorId === "bloom") return bloomPhaseFromTime(time, params);
  return shiftPhaseFromTime(time, params);
}

export function timeFromPhase(behaviorId: string | undefined, phase: number, params: ParamValues): number {
  const p = clampPhase(phase);
  if (behaviorId === "bloom") return bloomTimeFromPhase(p, params);
  return shiftTimeFromPhase(p, params);
}

export function shiftPhaseFromTime(time: number, params: ParamValues): number {
  const { holdSpan, transformSpan, cycle } = shiftCycleSpans(params);
  let t = time % cycle;
  if (t < 0) t += cycle;
  if (t < holdSpan) return 0;
  return (t - holdSpan) / transformSpan;
}

export function shiftTimeFromPhase(phase: number, params: ParamValues): number {
  const { holdSpan, transformSpan } = shiftCycleSpans(params);
  if (phase <= 0) return holdSpan * 0.5;
  return holdSpan + Math.min(1, phase) * transformSpan;
}

export function bloomPhaseFromTime(time: number, params: ParamValues): number {
  const speed = Math.max(0.01, params.speed as number);
  const t = time * speed;
  const period = RESOLVE_CYCLE_SECONDS / speed;
  let p = (t % period) / period;
  if (p < 0) p += 1;
  return p;
}

export function bloomTimeFromPhase(phase: number, params: ParamValues): number {
  const speed = Math.max(0.01, params.speed as number);
  const period = RESOLVE_CYCLE_SECONDS / speed;
  return (clampPhase(phase) * period) / speed;
}

function clampPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  return Math.min(1, Math.max(0, phase));
}
