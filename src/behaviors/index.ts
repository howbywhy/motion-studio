import type { MaskBehavior } from "../core/types";
import { shiftBehavior } from "./shift";
import { bloomBehavior } from "./bloom";

/** Product registry. Bloom is the only behaviour the UI presents. */
export const PRODUCT_BEHAVIORS: MaskBehavior<unknown>[] = [bloomBehavior as MaskBehavior<unknown>];

/** Full registry including hidden Shift so a session Saved State that
 *  still holds Diffuse / Slice / Drift can load without conversion. */
export const BEHAVIORS: MaskBehavior<unknown>[] = [
  bloomBehavior as MaskBehavior<unknown>,
  shiftBehavior as MaskBehavior<unknown>,
];
