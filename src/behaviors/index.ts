import type { MaskBehavior } from "../core/types";
import { shiftBehavior } from "./shift";
import { bloomBehavior } from "./bloom";

// Registry of available mask behaviors. Add new behaviors here — nothing
// else in the renderer or UI needs to change.
//
// NOTE: two earlier "01" implementations are intentionally left in the
// tree but unregistered while this fragmentation-based Shift is proven
// out — src/behaviors/slabs.ts (moving rectangles) and
// src/behaviors/shiftRegistration/ (regions physically offsetting to
// reveal B underneath). See each one's own header comment; re-add its
// export to this array to bring it back.
export const BEHAVIORS: MaskBehavior<unknown>[] = [
  shiftBehavior as MaskBehavior<unknown>,
  bloomBehavior as MaskBehavior<unknown>,
];
