import type { Cut, ResolvedRegion, ShiftRegion, ShiftState } from "./regions";

interface Pt {
  x: number;
  y: number;
}

/** The cut's own line, in absolute pixels, ordered along its cross axis
 * (top-to-bottom for a vertical cut, left-to-right for a horizontal one).
 * A jog inserts two extra points so the line steps sideways partway
 * through instead of running perfectly straight — this and the asymmetric
 * split ratio are what keep the partition from reading as a grid. */
function cutLinePoints(cut: Cut, width: number, height: number): Pt[] {
  const cross = cut.orientation === "vertical" ? height : width;
  const base = cut.pos * (cut.orientation === "vertical" ? width : height);
  const jogPx = cut.jogOffset * (cut.orientation === "vertical" ? width : height);
  const crossJogAt = cut.jogAt * cross;
  const crossJogSpan = cut.jogSpan * cross;

  const toPoint = (crossVal: number, mainVal: number): Pt =>
    cut.orientation === "vertical" ? { x: mainVal, y: crossVal } : { x: crossVal, y: mainVal };

  if (!cut.hasJog) {
    return [toPoint(0, base), toPoint(cross, base)];
  }

  const jogStart = Math.max(0, crossJogAt - crossJogSpan / 2);
  const jogEnd = Math.min(cross, crossJogAt + crossJogSpan / 2);
  return [
    toPoint(0, base),
    toPoint(jogStart, base),
    toPoint(jogEnd, base + jogPx),
    toPoint(cross, base + jogPx),
  ];
}

/** One full side of a cut, as a closed polygon spanning the entire frame —
 * "side A" is left/top, "side B" is right/bottom. Two adjacent regions'
 * polygons share the exact same boundary vertices along the cut, so
 * there is never a gap or overlap between them at rest. */
function cutSidePolygon(cut: Cut, side: "a" | "b", width: number, height: number): Pt[] {
  const line = cutLinePoints(cut, width, height);
  if (cut.orientation === "vertical") {
    return side === "a" ? [{ x: 0, y: 0 }, ...line, { x: 0, y: height }] : [{ x: width, y: height }, ...[...line].reverse(), { x: width, y: 0 }];
  }
  return side === "a" ? [{ x: 0, y: 0 }, ...line, { x: width, y: 0 }] : [{ x: 0, y: height }, ...line, { x: width, y: height }];
}

function pathFromPoints(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** Clips `ctx` (already save()'d by the caller) to region `index`: the
 * intersection of "side A" of every earlier cut with "side B" of its own
 * cut (the last region has no final cut — it's just whatever's left).
 * Each polygon gets its OWN clip() call rather than being combined into
 * one multi-subpath call — clip() intersects with whatever's already
 * clipped, which is exactly the sequential-BSP semantics this needs;
 * folding them into a single evenodd path would union them instead. */
function clipToRegion(ctx: CanvasRenderingContext2D, cuts: Cut[], index: number, width: number, height: number): void {
  for (let i = 0; i < index; i++) {
    ctx.beginPath();
    pathFromPoints(ctx, cutSidePolygon(cuts[i], "a", width, height));
    ctx.clip();
  }
  ctx.beginPath();
  if (index < cuts.length) {
    pathFromPoints(ctx, cutSidePolygon(cuts[index], "b", width, height));
  } else {
    // Last region: no closing cut of its own — the accumulated earlier
    // clips already confine it, so just clip to the full frame.
    pathFromPoints(ctx, [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]);
  }
  ctx.clip();
}

function offsetForRegion(region: ResolvedRegion, dirAxis: "x" | "y", width: number, height: number): { dx: number; dy: number } {
  const px = region.offsetFrac * (dirAxis === "x" ? width : height);
  return dirAxis === "x" ? { dx: px, dy: 0 } : { dx: 0, dy: px };
}

/** Draws `layer` translated by (dx,dy) with NO exposed edge — a plain
 * `drawImage(layer, dx, dy)` would leave a real transparent strip on
 * whichever side the image shifted away from, since aLayer/bLayer are
 * already cropped to exactly the frame with no extra pixels beyond it.
 * Instead this scales the layer up by just enough to cover the shift
 * (anchored at the frame center) before translating, so the drawn image
 * always fully covers the destination. At dx=dy=0 the scale is exactly 1
 * — no zoom, pixel-identical to the source — so an unmoved region is
 * untouched, and even a moved one only ever magnifies existing pixels
 * rather than needing image data that doesn't exist. */
function drawOffsetLayer(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  width: number,
  height: number,
  dx: number,
  dy: number,
  alpha: number
): void {
  if (alpha <= 0.003) return;
  const scale = 1 + 2 * Math.max(Math.abs(dx) / width, Math.abs(dy) / height) * 1.08;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (scale > 1.0005) {
    ctx.translate(width / 2 + dx, height / 2 + dy);
    ctx.scale(scale, scale);
    ctx.drawImage(layer, -width / 2, -height / 2);
  } else {
    ctx.drawImage(layer, dx, dy);
  }
  ctx.restore();
}

/** Draws one region's content: A at its own small offset, with B blended
 * on top (also offset, slightly less) at alpha = that region's current
 * envelope. At envelope 0 this is pixel-identical to plain A — the region
 * boundary is otherwise invisible, which is what keeps the frame reading
 * as one photograph until something actually moves. */
function paintRegionContent(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  region: ShiftRegion,
  resolved: ResolvedRegion
): void {
  const { dx, dy } = offsetForRegion(resolved, region.dirAxis, width, height);
  drawOffsetLayer(ctx, aLayer, width, height, dx, dy, 1);
  drawOffsetLayer(ctx, bLayer, width, height, dx * 0.6, dy * 0.6, Math.min(1, resolved.envelope));
}

export function renderShiftMask(ctx: CanvasRenderingContext2D, width: number, height: number, state: ShiftState, resolved: ResolvedRegion[]): void {
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < state.regions.length; i++) {
    const alpha = Math.min(1, resolved[i].envelope);
    if (alpha <= 0.003) continue;
    ctx.save();
    clipToRegion(ctx, state.cuts, i, width, height);
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function renderShiftComposite(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  state: ShiftState,
  resolved: ResolvedRegion[],
  edgeFrac: number
): void {
  ctx.clearRect(0, 0, width, height);
  // Full-bleed A underneath every clipped region paint: adjacent regions'
  // clip paths share exact geometry but are rasterized independently, so
  // anti-aliasing at a shared edge can leave a sub-pixel sliver where
  // neither region's coverage reaches 100% — without this base layer that
  // sliver would show the cleared (transparent) canvas beneath. Each
  // region's own paint always covers its own clip fully opaque, so this
  // base is only ever visible in that hairline of AA seam.
  ctx.drawImage(aLayer, 0, 0);
  for (let i = 0; i < state.regions.length; i++) {
    ctx.save();
    clipToRegion(ctx, state.cuts, i, width, height);
    paintRegionContent(ctx, aLayer, bLayer, width, height, state.regions[i], resolved[i]);
    ctx.restore();
  }

  if (edgeFrac > 0.003) paintSeams(ctx, aLayer, bLayer, width, height, state, resolved, edgeFrac);
}

/** A thin band straddling each cut where the two neighboring regions'
 * already-resolved content overlaps — two photographic states slightly
 * out of register, not a blur. Width and opacity both scale with `edgeFrac`;
 * at 0 this whole pass is skipped, leaving a clean hard cut. */
function paintSeams(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  state: ShiftState,
  resolved: ResolvedRegion[],
  edgeFrac: number
): void {
  const halfWidthPx = (1 + edgeFrac * 7) / 2; // ~1..8px total width per the brief
  const seamAlpha = 0.35 + edgeFrac * 0.4;

  for (let i = 0; i < state.cuts.length; i++) {
    const cut = state.cuts[i];
    const line = cutLinePoints(cut, width, height);
    const dxHalf = cut.orientation === "vertical" ? halfWidthPx : 0;
    const dyHalf = cut.orientation === "vertical" ? 0 : halfWidthPx;
    const near = line.map((p) => ({ x: p.x - dxHalf, y: p.y - dyHalf }));
    const far = line.map((p) => ({ x: p.x + dxHalf, y: p.y + dyHalf }));
    const strip = [...near, ...[...far].reverse()];

    ctx.save();
    // Confine the seam to the same accumulated prefix as its two regions
    // (cuts before it), so it never bleeds outside their shared area —
    // same sequential-clip reasoning as clipToRegion above.
    for (let j = 0; j < i; j++) {
      ctx.beginPath();
      pathFromPoints(ctx, cutSidePolygon(state.cuts[j], "a", width, height));
      ctx.clip();
    }
    ctx.beginPath();
    pathFromPoints(ctx, strip);
    ctx.clip();

    // The "far" (region i+1) side's content, laid slightly extra-offset on
    // top of what's already there — a soft registration mismatch, not a
    // blur, echoing the same offset-copy idea used for Bloom Refraction
    // but applied along a line instead of radially.
    const nextRegion = state.regions[i + 1];
    const nextResolved = resolved[i + 1];
    if (nextRegion && nextResolved) {
      const { dx, dy } = offsetForRegion(nextResolved, nextRegion.dirAxis, width, height);
      drawOffsetLayer(ctx, aLayer, width, height, dx * 1.4, dy * 1.4, seamAlpha);
      drawOffsetLayer(ctx, bLayer, width, height, dx * 0.9, dy * 0.9, seamAlpha * Math.min(1, nextResolved.envelope));
    }
    ctx.restore();
  }
}
