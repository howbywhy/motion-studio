/** Shared organic-boundary geometry: every Shift expression divides the
 * frame using continuously undulating cut lines rather than straight or
 * single-jog edges (see the previous Shift's post-mortem — a single jog
 * still reads as "a rectangle with a notch"). A boundary built here never
 * sits still along its own length, which is most of what keeps a fragment
 * edge from reading as a drawn/graphic shape once it's softened.
 *
 * Everything here is defined in normalized (0..1) units and only resolved
 * to pixels at render/clip time, using whatever width/height the caller
 * currently has — so a partition built once survives a resize without any
 * rebuild: the fractions stay valid, only their pixel conversion changes. */

export interface Pt {
  x: number;
  y: number;
}

export interface WaveParams {
  freq1: number;
  amp1: number;
  phase1: number;
  freq2: number;
  amp2: number;
  phase2: number;
}

export function randomWave(rand: () => number): WaveParams {
  return {
    freq1: 1.3 + rand() * 2.0,
    amp1: 0.5 + rand() * 0.5,
    phase1: rand() * Math.PI * 2,
    freq2: 3.2 + rand() * 3.2,
    amp2: 0.2 + rand() * 0.3,
    phase2: rand() * Math.PI * 2,
  };
}

function waveOffset(t: number, w: WaveParams): number {
  return Math.sin(t * Math.PI * w.freq1 + w.phase1) * w.amp1 + Math.sin(t * Math.PI * w.freq2 + w.phase2) * w.amp2;
}

/** A wavy division of a `width` x `height` rectangle, splitting along
 * `orientation` at mean fraction `pos` (0..1 of the main axis), undulating
 * by up to `amplitudeFrac` of the main axis along its own length. Resolved
 * fresh to pixels every call — pos/amplitudeFrac/wave are the only state
 * that needs to survive a resize. */
export function wavyCutPoints(
  orientation: "vertical" | "horizontal",
  pos: number,
  amplitudeFrac: number,
  width: number,
  height: number,
  wave: WaveParams,
  segments = 18
): Pt[] {
  const cross = orientation === "vertical" ? height : width;
  const mainSize = orientation === "vertical" ? width : height;
  const amplitudePx = amplitudeFrac * mainSize;
  const pts: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const crossVal = t * cross;
    const mainVal = pos * mainSize + waveOffset(t, wave) * amplitudePx;
    pts.push(orientation === "vertical" ? { x: mainVal, y: crossVal } : { x: crossVal, y: mainVal });
  }
  return pts;
}

/** Closes a cut polyline into a fillable polygon for one side of it. */
export function cutSidePolygon(cutPoints: Pt[], orientation: "vertical" | "horizontal", side: "a" | "b", width: number, height: number): Pt[] {
  if (orientation === "vertical") {
    return side === "a" ? [{ x: 0, y: 0 }, ...cutPoints, { x: 0, y: height }] : [{ x: width, y: height }, ...[...cutPoints].reverse(), { x: width, y: 0 }];
  }
  return side === "a" ? [{ x: 0, y: 0 }, ...cutPoints, { x: width, y: 0 }] : [{ x: 0, y: height }, ...cutPoints, { x: width, y: height }];
}

export function pathFromPoints(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** A single cut, fully normalized — safe to keep across a resize. */
export interface WavyCut {
  orientation: "vertical" | "horizontal";
  pos: number;
  amplitudeFrac: number;
  wave: WaveParams;
}

function resolveCutPoints(cut: WavyCut, width: number, height: number): Pt[] {
  return wavyCutPoints(cut.orientation, cut.pos, cut.amplitudeFrac, width, height, cut.wave);
}

/** Sequential BSP-style partition into `count` irregular, asymmetric
 * regions (never near-50/50), each boundary wavy along its full length.
 * Regions always fully tile the frame — there is no separate "region
 * rectangle" to desync from the cuts. Built entirely in normalized 0..1
 * space, independent of any actual pixel size. */
export function buildWavyPartition(count: number, rand: () => number): WavyCut[] {
  const cuts: WavyCut[] = [];
  let bx0 = 0,
    by0 = 0,
    bx1 = 1,
    by1 = 1;
  for (let i = 0; i < count - 1; i++) {
    const w = bx1 - bx0;
    const h = by1 - by0;
    const orientation: "vertical" | "horizontal" = rand() < 0.8 ? (w >= h ? "vertical" : "horizontal") : rand() < 0.5 ? "vertical" : "horizontal";
    const ratio = 0.32 + rand() * 0.36; // 0.32..0.68 of the remaining span
    const pos = orientation === "vertical" ? bx0 + w * ratio : by0 + h * ratio;
    const wave = randomWave(rand);
    const amplitudeFrac = 0.02 + rand() * 0.035;
    cuts.push({ orientation, pos, amplitudeFrac, wave });
    if (orientation === "vertical") bx0 = pos;
    else by0 = pos;
  }
  return cuts;
}

/** Clips `ctx` to region `index` of a wavy partition built by
 * buildWavyPartition — sequential ctx.clip() calls intersect (they do NOT
 * union), which is what lets regions tile with zero gaps. */
export function clipToWavyRegion(ctx: CanvasRenderingContext2D, cuts: WavyCut[], index: number, width: number, height: number): void {
  for (let i = 0; i < index; i++) {
    ctx.beginPath();
    pathFromPoints(ctx, cutSidePolygon(resolveCutPoints(cuts[i], width, height), cuts[i].orientation, "a", width, height));
    ctx.clip();
  }
  ctx.beginPath();
  if (index < cuts.length) {
    pathFromPoints(ctx, cutSidePolygon(resolveCutPoints(cuts[index], width, height), cuts[index].orientation, "b", width, height));
  } else {
    pathFromPoints(ctx, [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]);
  }
  ctx.clip();
}

/** Clips to band `index` of a flat, single-axis, monotonically-increasing
 * sequence of cuts (all the same orientation, `pos` strictly increasing —
 * what Slice's bands are, unlike buildWavyPartition's recursively-shrunk,
 * mixed-orientation BSP). clipToWavyRegion's "intersect every earlier
 * A-side" trick only yields a correct partition for that recursive BSP
 * case; applied to a flat cumulative sequence it collapses every band's
 * "before" constraint down to just the very first cut, so bands overlap
 * instead of tiling — this is the direct, unambiguous version: band index
 * is simply "after the previous cut, before this one". */
export function clipToSequentialBand(ctx: CanvasRenderingContext2D, cuts: WavyCut[], index: number, width: number, height: number): void {
  const full: Pt[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  ctx.beginPath();
  if (index > 0) {
    const prev = cuts[index - 1];
    pathFromPoints(ctx, cutSidePolygon(resolveCutPoints(prev, width, height), prev.orientation, "b", width, height));
  } else {
    pathFromPoints(ctx, full);
  }
  ctx.clip();
  ctx.beginPath();
  if (index < cuts.length) {
    const cut = cuts[index];
    pathFromPoints(ctx, cutSidePolygon(resolveCutPoints(cut, width, height), cut.orientation, "a", width, height));
  } else {
    pathFromPoints(ctx, full);
  }
  ctx.clip();
}
