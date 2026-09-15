/**
 * Type-specific Bloom mask. Shares Envelope family and pair variant ID
 * with image Bloom, at a much smaller spatial scale, centred on the
 * glyph block. HOLD is unmasked so reading is never waiting on a field.
 */

import type { Lobe, ResolvedField } from "../behaviors/bloom/fields";
import { renderMaskFromFields } from "../behaviors/bloom/render";
import { variantIdForPair, type VariantId } from "./bloomPairVariant";
import { typeBloomPresence, type TypeConnectionMode } from "./sequenceTypeConnection";

const TYPE_SHIFT: Record<VariantId, { x: number; y: number; rot: number }> = {
  A: { x: 0.016, y: -0.008, rot: 0.08 },
  C: { x: -0.011, y: 0.014, rot: -0.1 },
  B: { x: -0.014, y: -0.012, rot: 0.12 },
  D: { x: 0.012, y: 0.01, rot: -0.09 },
};

const LOBES: Lobe[][] = [
  [
    { angle: 0.2, distFrac: 0.18, radiusMul: 0.92 },
    { angle: 2.1, distFrac: 0.28, radiusMul: 0.7 },
    { angle: 4.0, distFrac: 0.22, radiusMul: 0.78 },
  ],
  [
    { angle: 1.1, distFrac: 0.2, radiusMul: 0.86 },
    { angle: 3.3, distFrac: 0.26, radiusMul: 0.74 },
    { angle: 5.2, distFrac: 0.16, radiusMul: 0.8 },
  ],
];

export interface TypeInkBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

export function typeBloomFields(
  box: TypeInkBox,
  pairIndex: number,
  pairCount: number,
  presence: number,
  canvasW: number,
  canvasH: number,
): ResolvedField[] {
  const id = variantIdForPair(pairIndex, pairCount);
  const shift = TYPE_SHIFT[id];
  const bw = Math.max(8, box.r - box.l);
  const bh = Math.max(8, box.b - box.t);
  const cx = (box.l + box.r) / 2 + shift.x * canvasW;
  const cy = (box.t + box.b) / 2 + shift.y * canvasH;
  const cover = Math.max(bw, bh) * (0.42 + 0.78 * presence);
  const alpha = Math.min(1, 0.2 + 0.8 * presence);
  return LOBES.map((lobes, i) => {
    const ox = (i === 0 ? -0.12 : 0.14) * bw;
    const oy = (i === 0 ? 0.08 : -0.1) * bh;
    return {
      cx: cx + ox,
      cy: cy + oy,
      radius: cover * (i === 0 ? 1 : 0.82),
      alpha,
      innerStop: 0.42,
      rotation: shift.rot + i * 0.35,
      lobes,
    };
  });
}

let typeScratch: HTMLCanvasElement | null = null;
let maskScratch: HTMLCanvasElement | null = null;

function scratch(holder: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const c = holder && holder.width === w && holder.height === h ? holder : document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function applyTypeBloomMask(
  dest: CanvasRenderingContext2D,
  typeLayer: HTMLCanvasElement,
  box: TypeInkBox,
  localPhase: number,
  mode: TypeConnectionMode,
  pairIndex: number,
  pairCount: number,
): void {
  const { stage, presence } = typeBloomPresence(localPhase, mode);
  if (stage === "hold" || presence >= 0.995) {
    dest.drawImage(typeLayer, 0, 0);
    return;
  }
  if (presence <= 0.01) return;

  const w = typeLayer.width;
  const h = typeLayer.height;
  typeScratch = scratch(typeScratch, w, h);
  maskScratch = scratch(maskScratch, w, h);
  const tctx = typeScratch.getContext("2d")!;
  const mctx = maskScratch.getContext("2d")!;
  tctx.globalCompositeOperation = "copy";
  tctx.drawImage(typeLayer, 0, 0);
  mctx.globalCompositeOperation = "copy";
  mctx.clearRect(0, 0, w, h);
  mctx.globalCompositeOperation = "source-over";
  const fields = typeBloomFields(box, pairIndex, pairCount, presence, w, h);
  renderMaskFromFields(mctx, w, h, fields, 0.7);
  tctx.globalCompositeOperation = "destination-in";
  tctx.drawImage(maskScratch, 0, 0);
  tctx.globalCompositeOperation = "source-over";
  dest.drawImage(typeScratch, 0, 0);
}
