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
 * Tint is sampled from source B and is deterministic at a given image.
 * The HTML fixture is the pixel authority for that sample. Grammar
 * remains commit 728ff08 — not a redesign.
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

/** Product UI default. 50 maps exactly to golden-master paint amount 0.4. */
export const REGISTRATION_AMOUNT_DEFAULT = 50;

export function clampRegistrationAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return REGISTRATION_AMOUNT_DEFAULT;
  return Math.min(100, Math.max(0, value));
}

/** UI 0–100 → paint amount. 0 is off, 50 is 0.4, 100 is 0.8. */
export function registrationPaintAmount(uiAmount: unknown): number {
  return (clampRegistrationAmount(uiAmount) / 100) * (BLOOM_REGISTRATION_AMOUNT * 2);
}

/** Single product global Registration paint. Call after Bloom compose,
 * before typography. `bw` tints the ink when B&W is Both.
 * `uiAmount` is the 0–100 master control; omit for golden-master 0.4. */
export function paintGoldenMasterRegistration(
  dest: CanvasRenderingContext2D,
  bLayer: HTMLCanvasElement,
  fields: ResolvedField[],
  width: number,
  height: number,
  bw = false,
  uiAmount: number = REGISTRATION_AMOUNT_DEFAULT,
): void {
  paintRegistrationSurface(
    dest,
    bLayer,
    fields,
    width,
    height,
    registrationPaintAmount(uiAmount),
    bw,
  );
}
