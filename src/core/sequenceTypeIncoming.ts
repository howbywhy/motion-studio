/**
 * Incoming Sequence Type visibility.
 *
 * Outgoing Type A stays Bloom-consumed. This module only decides when
 * Type B becomes present — no fade, crop, slide, or Type Bloom-in.
 *
 * CURRENT      B after the pair cut (today's late arrival)
 * OWNERSHIP    B when canonical semantic ownership flips to B
 * ANTICIPATED  B slightly before the existing Flicker peak
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
