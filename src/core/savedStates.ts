import type { MediaAsset, MediaTransform } from "./media";
import type { ParamValues } from "./types";

/** A lightweight, in-memory (session-only) capture of enough state to
 * recreate the exact output: behavior, expression/treatment (folded into
 * `params.treatment`), every behavior param, both global output-layer
 * toggles, and each loaded media's transform. Media itself is referenced
 * by identity, never cloned or re-encoded — `transform` is a plain-object
 * SNAPSHOT taken at save time, not a pointer into the live, mutable
 * MediaTransform on the asset, so a later crop/scale edit on the still-
 * loaded asset can never retroactively change what an earlier save
 * captured. */
export interface SavedState {
  id: string;
  name: string;
  createdAt: number;
  behaviorId: string;
  params: ParamValues;
  registrationOn: boolean;
  bwOn: boolean;
  swapped: boolean;
  aspect: string;
  playbackMode: "loop" | "pingpong";
  mediaA: { asset: MediaAsset; transform: MediaTransform; label: string } | null;
  mediaB: { asset: MediaAsset; transform: MediaTransform; label: string } | null;
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
    mediaA: found.mediaA ? { ...found.mediaA, transform: { ...found.mediaA.transform } } : null,
    mediaB: found.mediaB ? { ...found.mediaB, transform: { ...found.mediaB.transform } } : null,
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
 * callers use this before disposing an outgoing asset (see
 * Renderer.setMedia's `disposePrevious` option) so replacing the live
 * media in a slot never breaks a saved state that still points at it. */
export function isAssetReferencedBySavedState(asset: MediaAsset): boolean {
  return states.some((s) => s.mediaA?.asset === asset || s.mediaB?.asset === asset);
}
