import type { MediaAsset, MediaTransform } from "./media";
import type { ParamValues } from "./types";
import { clampTypeState, cloneTypeState, type TypeState } from "./typeState";

/** A lightweight, in-memory (session-only) capture of enough state to
 * recreate the exact output: behavior, expression/treatment (folded into
 * `params.treatment`), every behavior param, both global output-layer
 * toggles, and the source sequence. Media itself is referenced by
 * identity, never cloned or re-encoded — `transform` is a plain-object
 * SNAPSHOT taken at save time, not a pointer into the live, mutable
 * MediaTransform on the asset, so a later crop/scale edit on the still-
 * loaded asset can never retroactively change what an earlier save
 * captured. */
export interface SavedSource {
  id: string;
  asset: MediaAsset;
  transform: MediaTransform;
  label: string;
}

export interface SavedState {
  id: string;
  name: string;
  createdAt: number;
  behaviorId: string;
  params: ParamValues;
  registrationOn: boolean;
  bwOn: boolean;
  aspect: string;
  playbackMode: "loop" | "pingpong";
  pulseStart?: number;
  pulseEnd?: number;
  pulseCycles?: number;
  loopSeconds: number;
  selectedId: string | null;
  audioEnabled: boolean;
  sources: SavedSource[];
  /** Optional freeze/clock fields so a randomised still can be restored
   *  in-session. Older saves omit them. */
  clockMode?: "auto" | "hold";
  holdPhase?: number;
  elapsed?: number;
  graphicElapsed?: number;
  frozen?: boolean;
  playing?: boolean;
  randomisationSeed?: number;
  /** Selective B&W. Older saves used `bwOn` as a global output grayscale. */
  bwMode?: "off" | "A" | "B" | "both";
  placeholderBg?: string;
  type?: TypeState;
  /** Loop-seam interruption. Older saves omit these and load as Off.
   * Legacy `"fracture"` is accepted on load and mapped to flicker. */
  endBehaviourMode?: "off" | "flicker" | "fracture";
  endBehaviourAmount?: number;
  endBehaviourHold?: number;
  endBehaviourDuration?: number;
  /** Master Registration presence 0–100. Legacy saves omit this and load as 50. */
  registrationAmount?: number;
  /** Loop-only Bloom source-change punctuation. Legacy omits this and loads Off. */
  transitionFlickerEnabled?: boolean;
  /** Identity event. Legacy omits these and loads Off. */
  markEnabled?: boolean;
  markMode?: "intro" | "interrupt" | "end";
  markSource?: "stacked" | "horizontal" | "emblem";
  markStart?: number;
  markStop?: number;
  markScale?: number;
  markAnchor?: string;
  /** Typography may include Type States, page order, Speed, Frame Hold, and Sequence Window.
   *  Start/Stop gate Type presence (hard in/out). Speed paces multi-State cuts.
   *  Frame Hold Length (1.0×–3.0×) emphasises a selected non-final State.
   *  Review-branch Beat 1× → Hold Off. Beat 2× → Hold On / 2.0×. Beat 3× → Hold On / 3.0×.
   *  Legacy type saves load as one page. */
}

export type SavedStateInput = Omit<SavedState, "id" | "createdAt">;

let states: SavedState[] = [];
let nextId = 1;

export function listSavedStates(): SavedState[] {
  return states;
}

export function createSavedState(input: SavedStateInput): SavedState {
  const state: SavedState = { ...input, id: `state-${nextId++}`, createdAt: Date.now() };
  states = [...states, state];
  return state;
}

/** A duplicate gets its own id and a fresh copy of every plain-object field
 * (params, transform snapshots) so editing the copy can never mutate the
 * original — but still references the SAME underlying media assets (no
 * duplication of the actual image/video data). */
export function duplicateSavedState(id: string): SavedState | null {
  const found = states.find((s) => s.id === id);
  if (!found) return null;
  const copy: SavedState = {
    ...found,
    id: `state-${nextId++}`,
    name: `${found.name} copy`,
    createdAt: Date.now(),
    params: { ...found.params },
    type: found.type ? cloneTypeState(clampTypeState(found.type)) : undefined,
    sources: found.sources.map((s) => ({ ...s, transform: { ...s.transform } })),
  };
  states = [...states, copy];
  return copy;
}

export function renameSavedState(id: string, name: string): void {
  states = states.map((s) => (s.id === id ? { ...s, name } : s));
}

export function deleteSavedState(id: string): SavedState | null {
  const found = states.find((s) => s.id === id) ?? null;
  states = states.filter((s) => s.id !== id);
  return found;
}

/** Whether any saved state still holds a reference to this exact asset —
 * callers use this before disposing an outgoing asset so replacing the live
 * media never breaks a saved state that still points at it. */
export function isAssetReferencedBySavedState(asset: MediaAsset): boolean {
  return states.some((s) => s.sources.some((src) => src.asset === asset));
}
