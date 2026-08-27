/**
 * REGISTRATION GOLDEN MASTER
 * Visual behaviour approved against commit 728ff08
 * ("Use historical Bloom Registration as global surface language").
 *
 * Do not modify algorithm, constants, mask behaviour or compositing
 * as part of unrelated feature work (Typography, Bloom motion, B&W,
 * Sequence, Export).
 *
 * PRODUCT path (one):
 *   Bloom stays Clean
 *   → lastBloomFieldMap()
 *   → paintRegistrationSurface
 *       (paintRegistrationInkContent, sharp field rings, amount 0.4)
 *
 * This module is the product facade. It must not grow a second visual path.
 */
import { paintRegistrationSurface } from "../behaviors/bloom/treatments";
import type { ResolvedField } from "../behaviors/bloom/fields";
import { BLOOM_REGISTRATION_AMOUNT } from "./registrationInk";

export const REGISTRATION_GOLDEN_MASTER = Object.freeze({
  commit: "728ff088b3ee01e6b1ee968a6388fa6c4fc56200",
  amount: BLOOM_REGISTRATION_AMOUNT,
});

/** Single product global Registration paint. Call after Bloom compose,
 * before typography. `bw` tints the ink when B&W is Both. */
export function paintGoldenMasterRegistration(
  dest: CanvasRenderingContext2D,
  bLayer: HTMLCanvasElement,
  fields: ResolvedField[],
  width: number,
  height: number,
  bw = false,
): void {
  paintRegistrationSurface(
    dest,
    bLayer,
    fields,
    width,
    height,
    REGISTRATION_GOLDEN_MASTER.amount,
    bw,
  );
}
