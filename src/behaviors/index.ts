import type { MaskBehavior } from "../core/types";
import { slabsBehavior } from "./slabs";
import { bloomBehavior } from "./bloom";

// Registry of available mask behaviors. Add new behaviors here — nothing
// else in the renderer or UI needs to change.
export const BEHAVIORS: MaskBehavior<unknown>[] = [
  slabsBehavior as MaskBehavior<unknown>,
  bloomBehavior as MaskBehavior<unknown>,
];
