/**
 * LOCKED VISUAL SYSTEM — Global Registration
 *
 * This is the single PRODUCT global Registration path.
 *
 * Approved historical implementation:
 *   commit e9e49f92ff0590ab3ba780bd64ba019a6be0b005
 *   prepareFieldPrintInk → writeToneMaps → paintPersistent (0.1)
 *     → paintReactive (0.4, mask tent)
 *
 * Do not alter its rendering algorithm, constants, compositing order,
 * plate generation or texture characteristics as part of unrelated work
 * (Typography, Bloom, B&W, Sequence, Export).
 *
 * Public surface is this module only. `registrationFieldInk.ts` is internal.
 * Bloom ring ink in `registrationInk.ts` is COMPAT, not the product path.
 *
 * Render order (historical, locked):
 *   Bloom composed frame
 *   → prepare plates from that frame
 *   → paint persistent + reactive onto the composed frame
 *   → typography (if any) after Registration
 */
import { paintFieldPersistent, paintFieldReactive, prepareFieldPrintInk } from "./registrationFieldInk";

export const GLOBAL_REGISTRATION = Object.freeze({
  historicalCommit: "e9e49f92ff0590ab3ba780bd64ba019a6be0b005",
  persistentAmount: 0.1,
  reactiveAmount: 0.4,
});

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number): void {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
}

let globalBoundarySmall: HTMLCanvasElement | null = null;
const BOUNDARY_SMALL_W = 200;

export function prepareLockedGlobalRegistration(
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  dpr = 1,
  composed?: HTMLCanvasElement,
  live = false,
  bw = false,
): void {
  prepareFieldPrintInk(composed ?? bLayer, width, height, dpr, live, bw);
}

function buildBoundaryAlpha(maskLayer: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (!globalBoundarySmall) globalBoundarySmall = makeCanvas();
  const smallW = BOUNDARY_SMALL_W;
  const smallH = Math.max(1, Math.round(smallW * (height / width)));
  sizeCanvas(globalBoundarySmall, smallW, smallH);
  const sctx = globalBoundarySmall.getContext("2d", { willReadFrequently: true })!;
  sctx.clearRect(0, 0, smallW, smallH);
  sctx.drawImage(maskLayer, 0, 0, smallW, smallH);
  const img = sctx.getImageData(0, 0, smallW, smallH);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const tent = 4 * a * (1 - a);
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = Math.round(tent * 255);
  }
  sctx.putImageData(img, 0, 0);
  return globalBoundarySmall;
}

export function paintLockedPersistent(dest: CanvasRenderingContext2D, width: number, height: number): void {
  paintFieldPersistent(dest, width, height, GLOBAL_REGISTRATION.persistentAmount);
}

export function paintLockedReactive(
  dest: CanvasRenderingContext2D,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const amount = GLOBAL_REGISTRATION.reactiveAmount;
  if (amount <= 0.001) return;
  const boundarySmall = buildBoundaryAlpha(maskLayer, width, height);
  paintFieldReactive(dest, maskLayer, boundarySmall, width, height, amount);
}

/** Persistent + reactive, locked amounts. Matches e9 finalizeOutput. */
export function paintLockedGlobalRegistration(
  dest: CanvasRenderingContext2D,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  paintLockedPersistent(dest, width, height);
  paintLockedReactive(dest, maskLayer, width, height);
}
