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
 *   B  peak-hold-settle — peak by 0.58, hold, then authored mask settle
 *   C  peak-hold-cut    — peak by 0.62, hold to the boundary, editorial cut
 *
 * Ping-pong reverses source order. Behaviour phase is never run backwards.
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

/** 0 → 0.5 with zero derivative at both ends. Native Bloom/Shift peak. */
function oneWayToPeak(p: number): number {
  return 0.25 * (1 - Math.cos(Math.PI * clamp01(p)));
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

  // B — default: peak, hold, settle through the existing mask.
  const peakAt = 0.58;
  const holdUntil = 0.78;
  if (p <= peakAt) return { behaviorPhase: oneWayToPeak(p / peakAt), resolve: 0 };
  if (p <= holdUntil) return { behaviorPhase: 0.5, resolve: 0 };
  return { behaviorPhase: 0.5, resolve: smoothstep((p - holdUntil) / (1 - holdUntil)) };
}
