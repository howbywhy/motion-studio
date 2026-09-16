/**
 * Incoming Sequence Type visibility and formation.
 *
 * Outgoing Type A stays Bloom-consumed. Type B starts at semantic
 * ownership. Formation may condense B through the remaining Type-safe
 * Bloom settle — not a fade, crop, slide, or a second Type system.
 */

export const TYPE_INCOMING_STRATEGIES = ["current", "ownership", "anticipated"] as const;
export type TypeIncomingStrategy = (typeof TYPE_INCOMING_STRATEGIES)[number];

/** Smallest useful anticipation: 2 frames at 30fps. Not a control. */
export const TYPE_INCOMING_ANTICIPATION_SEC = 2 / 30;
export const TYPE_INCOMING_ANTICIPATION_FRAMES = 2;
export const TYPE_INCOMING_FPS = 30;
/** Matches TRANSITION_FLICKER_DURATION_SEC. Duplicated so this file stays import-light. */
const FLICKER_DURATION_SEC = 0.12;

export const PRODUCT_SEQUENCE_TYPE_INCOMING: TypeIncomingStrategy = "ownership";

/**
 * How incoming Type B becomes visible AFTER ownership.
 * Ownership timing is unchanged. These are not product controls.
 *
 * CURRENT   full B at the flip
 * SHORT     B condenses through a tight remaining Bloom contour
 * MATERIAL  B uses more of the remaining contour before it is complete
 */
export const TYPE_INCOMING_FORMATIONS = ["current", "short", "material"] as const;
export type TypeIncomingFormation = (typeof TYPE_INCOMING_FORMATIONS)[number];

/** Incoming B condenses through a short remaining Bloom settle after ownership. */
export const PRODUCT_SEQUENCE_TYPE_FORMATION: TypeIncomingFormation = "short";

/** Envelope B resolve that finishes SHORT / MATERIAL. */
export const TYPE_INCOMING_SHORT_END = 0.4;
export const TYPE_INCOMING_MATERIAL_END = 0.72;
/** How far above the local Type-safe field B starts. Not a reverse of A. */
export const TYPE_INCOMING_SHORT_BIAS = 0.1;
export const TYPE_INCOMING_MATERIAL_BIAS = 0.18;
/** Fully formed B opens to the approved Type-safe floor. */
export const TYPE_INCOMING_OPEN = 0.28;

let evalFormation: TypeIncomingFormation | null = null;
const formationByOwner = new WeakMap<object, TypeIncomingFormation | null>();

export function clampTypeIncomingFormation(raw: unknown): TypeIncomingFormation {
  return TYPE_INCOMING_FORMATIONS.includes(raw as TypeIncomingFormation)
    ? (raw as TypeIncomingFormation)
    : "current";
}

export function setEvalTypeIncomingFormation(formation: TypeIncomingFormation | null): void {
  evalFormation = formation;
}

export function bindEvalTypeIncomingFormation(owner: object, formation: TypeIncomingFormation | null): void {
  formationByOwner.set(owner, formation);
}

export function resolveEvalTypeIncomingFormation(owner?: object): TypeIncomingFormation {
  if (owner && formationByOwner.has(owner)) {
    return clampTypeIncomingFormation(formationByOwner.get(owner) ?? PRODUCT_SEQUENCE_TYPE_FORMATION);
  }
  return clampTypeIncomingFormation(evalFormation ?? PRODUCT_SEQUENCE_TYPE_FORMATION);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function smooth01(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

export interface TypeIncomingFormationState {
  present: boolean;
  amount: number;
  threshold: number;
  full: boolean;
  treatment: TypeIncomingFormation;
}

export function incomingTypeBFormation(args: {
  treatment: TypeIncomingFormation;
  ownedB: boolean;
  resolve?: number;
}): TypeIncomingFormationState {
  const treatment = clampTypeIncomingFormation(args.treatment);
  if (!args.ownedB) {
    return { present: false, amount: 0, threshold: 1, full: false, treatment };
  }
  if (treatment === "current") {
    return { present: true, amount: 1, threshold: TYPE_INCOMING_OPEN, full: true, treatment };
  }
  const end = treatment === "short" ? TYPE_INCOMING_SHORT_END : TYPE_INCOMING_MATERIAL_END;
  const bias = treatment === "short" ? TYPE_INCOMING_SHORT_BIAS : TYPE_INCOMING_MATERIAL_BIAS;
  const amount = smooth01(clamp01(args.resolve ?? 0) / Math.max(1e-6, end));
  const full = amount >= 0.97;
  const threshold = TYPE_INCOMING_OPEN + bias * (1 - (full ? 1 : amount));
  return { present: true, amount: full ? 1 : amount, threshold: full ? TYPE_INCOMING_OPEN : threshold, full, treatment };
}

let evalIncoming: TypeIncomingStrategy | null = null;
const evalByOwner = new WeakMap<object, TypeIncomingStrategy | null>();

export function clampTypeIncoming(raw: unknown): TypeIncomingStrategy {
  return TYPE_INCOMING_STRATEGIES.includes(raw as TypeIncomingStrategy)
    ? (raw as TypeIncomingStrategy)
    : "current";
}

export function setEvalTypeIncoming(strategy: TypeIncomingStrategy | null): void {
  evalIncoming = strategy;
}

export function bindEvalTypeIncoming(owner: object, strategy: TypeIncomingStrategy | null): void {
  evalByOwner.set(owner, strategy);
}

export function resolveEvalTypeIncoming(owner?: object): TypeIncomingStrategy {
  if (owner && evalByOwner.has(owner)) {
    return clampTypeIncoming(evalByOwner.get(owner) ?? PRODUCT_SEQUENCE_TYPE_INCOMING);
  }
  return clampTypeIncoming(evalIncoming ?? PRODUCT_SEQUENCE_TYPE_INCOMING);
}

export function signedIncomingDelta(phase: number, cut: number): number {
  let d = phase - cut;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

export function secondsUntilCut(masterPhase: number, cut: number, loopSeconds: number): number {
  const delta = signedIncomingDelta(masterPhase, cut);
  return Math.max(0, -delta) * loopSeconds;
}

export function incomingTypeBPresent(args: {
  strategy: TypeIncomingStrategy;
  ownedB: boolean;
  masterPhase: number;
  cut: number;
  loopSeconds: number;
  anticipationSec?: number;
}): boolean {
  const strategy = clampTypeIncoming(args.strategy);
  if (strategy === "current") return false;
  if (strategy === "ownership") return args.ownedB === true;
  const lead = args.anticipationSec ?? TYPE_INCOMING_ANTICIPATION_SEC;
  const delta = signedIncomingDelta(args.masterPhase, args.cut);
  if (delta > 0) return false;
  return -delta * args.loopSeconds <= lead;
}

export interface TypeIncomingTimeline {
  strategy: TypeIncomingStrategy;
  slotSeconds: number;
  typeALastLocal: number | null;
  typeBFirstLocal: number | null;
  ownershipFlipLocal: number | null;
  flickerStartLocal: number | null;
  flickerPeakLocal: number;
  emptyGapLocal: number;
  emptyGapSec: number;
  emptyGapFrames: number;
}

/**
 * Signal-level incoming timeline for a single pair.
 * Type A is treated as gone once Bloom contribution reaches `aGone`.
 * CURRENT waits for the cut; OWNERSHIP uses the flip; ANTICIPATED uses lead.
 */
export function typeIncomingTimeline(args: {
  strategy: TypeIncomingStrategy;
  slotSeconds: number;
  ownershipFlipLocal: number | null;
  typeAGoneLocal: number | null;
  fps?: number;
  anticipationSec?: number;
}): TypeIncomingTimeline {
  const fps = args.fps ?? TYPE_INCOMING_FPS;
  const lead = args.anticipationSec ?? TYPE_INCOMING_ANTICIPATION_SEC;
  const flickerHalf = FLICKER_DURATION_SEC / 2;
  const flickerPeakLocal = 1;
  const flickerStartLocal = Math.max(0, 1 - flickerHalf / Math.max(1e-6, args.slotSeconds));
  const anticipatedLocal = Math.max(0, 1 - lead / Math.max(1e-6, args.slotSeconds));

  let typeBFirstLocal: number | null = 1;
  if (args.strategy === "ownership") typeBFirstLocal = args.ownershipFlipLocal;
  if (args.strategy === "anticipated") typeBFirstLocal = anticipatedLocal;

  const aLast = args.typeAGoneLocal;
  const bFirst = typeBFirstLocal;
  let emptyGapLocal = 0;
  if (aLast != null && bFirst != null && bFirst > aLast) emptyGapLocal = bFirst - aLast;
  if (aLast != null && bFirst == null) emptyGapLocal = Math.max(0, 1 - aLast);

  return {
    strategy: args.strategy,
    slotSeconds: args.slotSeconds,
    typeALastLocal: aLast,
    typeBFirstLocal: bFirst,
    ownershipFlipLocal: args.ownershipFlipLocal,
    flickerStartLocal,
    flickerPeakLocal,
    emptyGapLocal,
    emptyGapSec: emptyGapLocal * args.slotSeconds,
    emptyGapFrames: emptyGapLocal * args.slotSeconds * fps,
  };
}
