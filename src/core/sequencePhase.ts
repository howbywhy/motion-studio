/** Sequence-level mapping from pair progress onto existing behaviour phase
 * plus an optional sequence-only resolve toward B.
 *
 * Behaviours are not rewritten. Bloom HOLD language stays the native
 * 0..0.5 field envelope. The resolve amount is applied by Renderer after
 * the behaviour composite, using the existing mask as a seed — not a
 * canvas-opacity crossfade, and not a change to Bloom's parameter range.
 *
 * Phase 9: pair 0→1 mapped onto behaviour 0→peak only. Source identity
 * continued; composition still jumped peak-fields → whole-A.
 *
 * Phase 10 candidates (switchable for eval, one production default):
 *   A  terminal-resolve — Bloom owns 0–0.70, then mask-expand toward B
 *   B  peak-hold-settle — peak by 0.52, hold to 0.72, then authored mask settle
 *   C  peak-hold-cut    — peak by 0.62, hold to the boundary, editorial cut
 *
 * Bloom Ping-pong remaps pair-local progress only. Behaviour phase is
 * still the one-way envelope; we sample it between Pulse Start and End.
 * Type / Flicker / Registration keep using master phase.
 */

export type SeamCandidate = "A" | "B" | "C";

let seamCandidate: SeamCandidate = "B";

export function getSeamCandidate(): SeamCandidate {
  return seamCandidate;
}

export function setSeamCandidate(mode: SeamCandidate): void {
  if (mode === "A" || mode === "B" || mode === "C") seamCandidate = mode;
}

function clamp01(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

function smoothstep(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/** Envelope B (production). Shared by resolve-limit remapping. */
const ENVELOPE_B_PEAK = 0.52;
const ENVELOPE_B_HOLD = 0.72;

/** 0 → 0.5 with zero derivative at both ends. Native Bloom/Shift peak. */
function oneWayToPeak(p: number): number {
  return 0.25 * (1 - Math.cos(Math.PI * clamp01(p)));
}

function invertSmoothstep(y: number): number {
  const target = clamp01(y);
  if (target <= 0) return 0;
  if (target >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (smoothstep(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface SequenceEnvelope {
  behaviorPhase: number;
  /** 0 = behaviour composite only. 1 = remaining A retired via mask expansion. */
  resolve: number;
}

export function sequenceEnvelope(
  behaviorId: string | undefined,
  treatment: string | undefined,
  pairProgress: number,
  candidate: SeamCandidate = seamCandidate,
): SequenceEnvelope {
  const p = clamp01(pairProgress);
  const slice = behaviorId === "shift" && treatment === "slice";

  if (slice) {
    // Spatial intervals must persist into the handoff. Resolve would
    // flood the bands toward a wipe. Peak early, hold, editorial cut.
    const peakAt = candidate === "A" ? 0.55 : 0.5;
    if (p <= peakAt) return { behaviorPhase: oneWayToPeak(p / peakAt), resolve: 0 };
    return { behaviorPhase: 0.5, resolve: 0 };
  }

  if (candidate === "A") {
    const bloomEnd = 0.7;
    if (p <= bloomEnd) return { behaviorPhase: oneWayToPeak(p / bloomEnd), resolve: 0 };
    return { behaviorPhase: 0.5, resolve: smoothstep((p - bloomEnd) / (1 - bloomEnd)) };
  }

  if (candidate === "C") {
    const peakAt = 0.62;
    if (p <= peakAt) return { behaviorPhase: oneWayToPeak(p / peakAt), resolve: 0 };
    return { behaviorPhase: 0.5, resolve: 0 };
  }

  // B — default: peak earlier, then authored mask settle that can
  // actually reach whole B before the next pair's A takes over.
  const peakAt = ENVELOPE_B_PEAK;
  const holdUntil = ENVELOPE_B_HOLD;
  if (p <= peakAt) return { behaviorPhase: oneWayToPeak(p / peakAt), resolve: 0 };
  if (p <= holdUntil) return { behaviorPhase: 0.5, resolve: 0 };
  return { behaviorPhase: 0.5, resolve: smoothstep((p - holdUntil) / (1 - holdUntil)) };
}

/** Bloom terminal coverage 0–100. Missing/invalid = 100 (legacy identity). */
export function clampResolveLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, value));
}

/**
 * Authored terminal completeness in grow-space.
 * `applySequenceResolve` uses resolve², so linear slider × linear resolve
 * collapsed 0–50 into almost no mask expansion. These keypoints are the
 * intended visual reads at pair end:
 *   0   peak field / no terminal
 *   25  strongly incomplete
 *   50  clearly suspended
 *   75  mostly resolved
 *   100 full approved Bloom
 */
export function resolveLimitCompleteness(limit: unknown): number {
  const u = clampResolveLimit(limit) / 100;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < 0.25) return (0.22 * u) / 0.25;
  if (u < 0.5) return 0.22 + ((0.48 - 0.22) * (u - 0.25)) / 0.25;
  if (u < 0.75) return 0.48 + ((0.8 - 0.48) * (u - 0.5)) / 0.25;
  return 0.8 + ((1 - 0.8) * (u - 0.75)) / 0.25;
}

/**
 * How far through the pair-local envelope Bloom is allowed to travel.
 * 100 leaves pair progress untouched (approved Bloom). 0 freezes at the
 * peak-field boundary so the pair never enters terminal settle.
 */
export function limitedPairProgress(pairProgress: number, resolveLimit: unknown): number {
  const p = clamp01(pairProgress);
  const u = clampResolveLimit(resolveLimit) / 100;
  if (u >= 1) return p;
  const grow = resolveLimitCompleteness(resolveLimit);
  if (grow <= 0) return Math.min(p, ENVELOPE_B_PEAK);
  const targetResolve = Math.sqrt(grow);
  const t = invertSmoothstep(targetResolve);
  const pMax = ENVELOPE_B_HOLD + (1 - ENVELOPE_B_HOLD) * t;
  return Math.min(p, pMax);
}

/**
 * Resolve after Limit when the caller already has an envelope resolve
 * (pair progress already applied). 100 is a no-op. Prefer feeding
 * `limitedPairProgress` into `sequenceEnvelope` so incomplete limits hold.
 */
export function limitedSequenceResolve(resolve: number, resolveLimit: unknown): number {
  const u = clampResolveLimit(resolveLimit) / 100;
  if (u >= 1) return clamp01(resolve);
  if (u <= 0) return 0;
  const full = sequenceEnvelope("bloom", "clean", 1).resolve;
  const cap = sequenceEnvelope("bloom", "clean", limitedPairProgress(1, resolveLimit)).resolve;
  if (!(full > 0)) return 0;
  return clamp01(resolve) * (cap / full);
}
