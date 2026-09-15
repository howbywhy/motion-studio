/**
 * Sequence Type timing — no renderer imports.
 * Resolve starts at Envelope B hold (0.72).
 */

export type SequenceTypeMotion = "quiet" | "connected" | "expressive";
export type SequenceTypeArrival = "near-silent" | "soft-crop" | "current";
export type SequenceTypeStage = "arrive" | "hold" | "resolve" | "off";
export const SEQUENCE_TYPE_ARRIVALS: SequenceTypeArrival[] = ["near-silent", "soft-crop", "current"];

export const SEQUENCE_TYPE_ARRIVE_END = 0.18;
export const SEQUENCE_TYPE_RESOLVE_START = 0.72;
export const SEQUENCE_TYPE_WARN_EVENT_SECONDS = 2;

const MIN_HOLD_SECONDS = 1.05;
const MIN_ARRIVE_SECONDS = 0.16;
const MIN_RESOLVE_SECONDS = 0.22;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function smooth(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

export interface SequenceTypeEnvelope {
  stage: SequenceTypeStage;
  t: number;
  presence: number;
  eventSeconds: number;
  arriveEnd: number;
  resolveStart: number;
  holdSeconds: number;
  compressed: boolean;
}

export function sequenceTypeWindows(eventSeconds: number): { arriveEnd: number; resolveStart: number; compressed: boolean } {
  const event = Math.max(0.001, eventSeconds);
  const authoredArrive = SEQUENCE_TYPE_ARRIVE_END;
  const authoredResolve = SEQUENCE_TYPE_RESOLVE_START;

  let holdSec = (authoredResolve - authoredArrive) * event;
  let arriveSec = authoredArrive * event;
  let resolveSec = (1 - authoredResolve) * event;
  let compressed = false;

  if (holdSec < MIN_HOLD_SECONDS && event > MIN_HOLD_SECONDS) {
    compressed = true;
    holdSec = Math.min(MIN_HOLD_SECONDS, event * 0.72);
    const remain = Math.max(0, event - holdSec);
    const authoredArriveSec = authoredArrive * event;
    arriveSec = Math.min(authoredArriveSec, Math.max(MIN_ARRIVE_SECONDS, remain * 0.38));
    if (arriveSec > remain * 0.45) arriveSec = remain * 0.38;
    resolveSec = Math.max(MIN_RESOLVE_SECONDS, remain - arriveSec);
    if (arriveSec + resolveSec > remain) resolveSec = Math.max(0, remain - arriveSec);
  } else if (event <= MIN_HOLD_SECONDS) {
    compressed = true;
    holdSec = event * 0.55;
    const remain = event - holdSec;
    arriveSec = remain * 0.35;
    resolveSec = remain - arriveSec;
  }

  const arriveEnd = clamp01(arriveSec / event);
  const resolveStart = clamp01(1 - resolveSec / event);
  return { arriveEnd, resolveStart: Math.max(arriveEnd + 0.08, resolveStart), compressed };
}

export function sequenceTypeEnvelope(localPhase: number, eventSeconds: number): SequenceTypeEnvelope {
  const p = clamp01(localPhase);
  const { arriveEnd, resolveStart, compressed } = sequenceTypeWindows(eventSeconds);
  const holdSeconds = Math.max(0, (resolveStart - arriveEnd) * eventSeconds);
  if (p < arriveEnd) {
    const t = arriveEnd <= 0 ? 1 : p / arriveEnd;
    return { stage: "arrive", t, presence: smooth(t), eventSeconds, arriveEnd, resolveStart, holdSeconds, compressed };
  }
  if (p < resolveStart) {
    return { stage: "hold", t: 1, presence: 1, eventSeconds, arriveEnd, resolveStart, holdSeconds, compressed };
  }
  const span = Math.max(1e-6, 1 - resolveStart);
  const t = (p - resolveStart) / span;
  return { stage: "resolve", t, presence: 1 - smooth(t), eventSeconds, arriveEnd, resolveStart, holdSeconds, compressed };
}

export function sequenceTypeCopyForPair(copies: readonly string[], pairIndex: number): string {
  if (!copies.length) return "";
  const n = copies.length;
  const i = ((pairIndex % n) + n) % n;
  return (copies[i] ?? "").replace(/\s+$/g, "");
}

export type SequenceCopyChange =
  | { kind: "add" }
  | { kind: "remove"; index: number }
  | { kind: "resize" };

/** State owns copy. Replace / resize do not rewrite copy. Reorder uses reorderAuthoredSequence. */
export function applySequenceCopyChange(
  copies: readonly string[],
  count: number,
  change?: SequenceCopyChange,
): string[] {
  return applySequenceFieldChange(copies, count, change, "");
}

export function applySequenceFieldChange<T>(
  values: readonly T[],
  count: number,
  change: SequenceCopyChange | undefined,
  fill: T,
): T[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  const next = values.slice();
  if (change?.kind === "remove") {
    const index = Math.round(change.index);
    if (index >= 0 && index < next.length) next.splice(index, 1);
  }
  while (next.length < n) next.push(fill);
  if (next.length > n) next.length = n;
  return next;
}

export function sequenceCopiesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function clampTypeSystemMode(raw: unknown): "global" | "sequence" {
  return raw === "sequence" ? "sequence" : "global";
}

export function clampSequenceCopies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => (typeof value === "string" ? value : ""));
}

export function sequenceTypeHasCopy(copies: readonly string[], pairIndex: number): boolean {
  return sequenceTypeCopyForPair(copies, pairIndex).trim().length > 0;
}

export function sequenceTypeApplies(
  playbackMode: string,
  mapping: { untreated: boolean; pairCount: number },
): boolean {
  if (playbackMode !== "loop") return false;
  if (mapping.untreated || mapping.pairCount < 1) return false;
  return true;
}

export function productSequenceTypeApplies(
  type: { enabled: boolean; typeMode: string },
  playbackMode: string,
  mapping: { untreated: boolean; pairCount: number },
): boolean {
  if (!type.enabled) return false;
  if (type.typeMode !== "sequence") return false;
  return sequenceTypeApplies(playbackMode, mapping);
}

export function sequenceTypeReadability(
  loopSeconds: number,
  pairCount: number,
): {
  eventSeconds: number;
  holdSeconds: number;
  arriveSeconds: number;
  resolveSeconds: number;
  warn: boolean;
  compressed: boolean;
} {
  const n = Math.max(1, pairCount);
  const eventSeconds = loopSeconds / n;
  const { arriveEnd, resolveStart, compressed } = sequenceTypeWindows(eventSeconds);
  const holdSeconds = (resolveStart - arriveEnd) * eventSeconds;
  return {
    eventSeconds,
    holdSeconds,
    arriveSeconds: arriveEnd * eventSeconds,
    resolveSeconds: (1 - resolveStart) * eventSeconds,
    warn: eventSeconds < SEQUENCE_TYPE_WARN_EVENT_SECONDS || holdSeconds < MIN_HOLD_SECONDS,
    compressed,
  };
}

export interface SequenceTypeDraw {
  opacity: number;
  dy: number;
  cropT: number;
  cropB: number;
  cropL: number;
  cropR: number;
  trackingAdd: number;
}

function connectedResolve(env: SequenceTypeEnvelope, unit: number): SequenceTypeDraw {
  return {
    opacity: Math.max(0.06, env.presence),
    dy: -unit * 0.85 * (1 - env.presence),
    cropT: 1 - env.presence,
    cropB: 0,
    cropL: 0,
    cropR: 0,
    trackingAdd: 0,
  };
}

function connectedArrive(env: SequenceTypeEnvelope, unit: number, arrival: SequenceTypeArrival): SequenceTypeDraw {
  const fade = env.presence;
  const gone = 1 - fade;
  if (arrival === "near-silent") {
    const floor = env.compressed ? 0.88 : 0.74;
    return {
      opacity: floor + (1 - floor) * fade,
      dy: unit * (env.compressed ? 0.06 : 0.16) * gone,
      cropT: 0,
      cropB: 0,
      cropL: 0,
      cropR: 0,
      trackingAdd: 0,
    };
  }
  if (arrival === "soft-crop") {
    const floor = env.compressed ? 0.72 : 0.5;
    const crop = env.compressed ? 0.07 : 0.16;
    return {
      opacity: floor + (1 - floor) * fade,
      dy: unit * (env.compressed ? 0.12 : 0.28) * gone,
      cropT: 0,
      cropB: crop * gone,
      cropL: 0,
      cropR: 0,
      trackingAdd: 0,
    };
  }
  return {
    opacity: 0.12 + 0.88 * fade,
    dy: unit * 1.1 * gone,
    cropT: 0,
    cropB: 1 - fade,
    cropL: 0,
    cropR: 0,
    trackingAdd: 0,
  };
}

export function sequenceTypeDraw(
  env: SequenceTypeEnvelope,
  motion: SequenceTypeMotion,
  canvasH: number,
  arrival: SequenceTypeArrival = "soft-crop",
): SequenceTypeDraw {
  const unit = canvasH * 0.012;
  if (env.stage === "off") {
    return { opacity: 0, dy: 0, cropT: 0, cropB: 0, cropL: 0, cropR: 0, trackingAdd: 0 };
  }
  if (motion === "quiet") {
    if (env.stage === "arrive") {
      return { opacity: 0.2 + 0.8 * env.presence, dy: unit * 0.55 * (1 - env.presence), cropT: 0, cropB: 0.22 * (1 - env.presence), cropL: 0, cropR: 0, trackingAdd: 0 };
    }
    if (env.stage === "hold") return { opacity: 1, dy: 0, cropT: 0, cropB: 0, cropL: 0, cropR: 0, trackingAdd: 0 };
    return { opacity: env.presence, dy: -unit * 0.45 * (1 - env.presence), cropT: 0.22 * (1 - env.presence), cropB: 0, cropL: 0, cropR: 0, trackingAdd: 0 };
  }
  if (motion === "connected") {
    if (env.stage === "arrive") return connectedArrive(env, unit, arrival);
    if (env.stage === "hold") return { opacity: 1, dy: 0, cropT: 0, cropB: 0, cropL: 0, cropR: 0, trackingAdd: 0 };
    return connectedResolve(env, unit);
  }
  if (env.stage === "arrive") {
    return { opacity: 0.08 + 0.92 * env.presence, dy: unit * 1.8 * (1 - env.presence), cropT: 0, cropB: 0.35 * (1 - env.presence), cropL: 1 - env.presence, cropR: 0, trackingAdd: 6 * (1 - env.presence) };
  }
  if (env.stage === "hold") return { opacity: 1, dy: 0, cropT: 0, cropB: 0, cropL: 0, cropR: 0, trackingAdd: 0 };
  return { opacity: Math.max(0.04, env.presence), dy: -unit * 1.6 * (1 - env.presence), cropT: 0, cropB: 0.2 * (1 - env.presence), cropL: 0, cropR: 1 - env.presence, trackingAdd: -8 * (1 - env.presence) };
}

export function defaultEvalSequenceCopies(): string[] {
  return ["Motion starts here", "Made for movement", "Rhythm changes\neverything", "Back to the beginning"];
}
