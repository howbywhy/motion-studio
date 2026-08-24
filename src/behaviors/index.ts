import type { MaskBehavior } from "../core/types";
import { shiftBehavior } from "./shift";
import { bloomBehavior } from "./bloom";

// Registry of available mask behaviors. Add new behaviors here — nothing
// else in the renderer or UI needs to change.
//
// NOTE: the original "Slabs" implementation (src/behaviors/slabs.ts) is
// intentionally left in the tree but unregistered here while "Shift" is
// being proven out as its replacement — see that file's own header
// comment. Re-add `slabsBehavior` to this array to bring it back.
export const BEHAVIORS: MaskBehavior<unknown>[] = [
  shiftBehavior as MaskBehavior<unknown>,
  bloomBehavior as MaskBehavior<unknown>,
];
