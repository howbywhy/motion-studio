/** DRIFT: form losing registration — pieces of the photograph coming loose
 * from where they belong, not a second chronology sliced through space
 * (that's Slice's job). Every fragment is drawn every frame (not just the
 * active ones) so the tiling is always complete and a fully-rested frame
 * is pixel-identical to A; only fragments with a nonzero envelope pay for
 * translation + blend + feathering.
 *
 * Critically, fragments do NOT all behave the same way — a uniform stack
 * of offset echoes on every piece is exactly what would make this read as
 * "Slice's technique on a different shape" instead of its own idea. Each
 * fragment is permanently assigned one of five behaviours at build time:
 *   retain    - barely detaches; a faint wash of B, almost no travel.
 *   stretch   - visibly DEFORMS between where it was and where it's
 *               going (an anisotropic smear along its own travel
 *               direction), rather than staying rigid while it slides.
 *   duplicate - one bold, confident displaced copy plus a faint trace
 *               left at the origin — a clean dislocation, not a soft
 *               multi-step trail.
 *   anchor    - moves hardly at all; stays legible as "this piece held
 *               its ground" while everything around it comes loose.
 *   overlap   - travels further than the rest and renders at reduced
 *               opacity throughout, so it visibly bleeds into whatever
 *               neighbouring territory it drifts across.
 * Composed together, a moment of DRIFT should show several different
 * KINDS of instability at once — not one visual trick applied uniformly
 * everywhere. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanStretched, drawOverscanTranslated, getScratch } from "./compose";
import { distributeFragmentTimings, fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";
import { buildWavyPartition, clipToWavyRegion, type WavyCut } from "./wavy";

export type DriftFragmentKind = "retain" | "stretch" | "duplicate" | "anchor" | "overlap";

const KIND_WEIGHTS: [DriftFragmentKind, number][] = [
  ["retain", 0.2],
  ["stretch", 0.25],
  ["duplicate", 0.25],
  ["anchor", 0.15],
  ["overlap", 0.15],
];

function pickKind(rand: () => number): DriftFragmentKind {
  const total = KIND_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [kind, w] of KIND_WEIGHTS) {
    if (r < w) return kind;
    r -= w;
  }
  return KIND_WEIGHTS[KIND_WEIGHTS.length - 1][0];
}

export interface DriftFragment {
  kind: DriftFragmentKind;
  angleJitterDeg: number; // deviation from the shared Direction, applied at render time
  magnitudeFrac: number;
  stretchAmount: number; // only meaningful for "stretch" fragments
  timing: FragmentTiming;
}

export interface DriftState {
  cuts: WavyCut[];
  fragments: DriftFragment[];
}

const BASE_DRIFT_FRAC = 0.15;

/** Direction is intentionally not baked in here — only the per-fragment
 * deviation from it is — so nudging Direction doesn't require reshuffling
 * which fragment got which piece of geometry; renderDriftComposite adds the
 * live Direction back in every frame. */
export function buildDriftState(fragment: number, spread: number, rhythm: number, seed: number): DriftState {
  const { count } = fragmentContinuum(fragment);
  const cutsRand = mulberry32(seed);
  const cuts = buildWavyPartition(count, cutsRand);
  const fragRand = mulberry32(seed + 104729);
  const timings = distributeFragmentTimings(count, spread / 100, rhythm / 100, fragRand);
  const fragments: DriftFragment[] = timings.map((timing) => ({
    kind: pickKind(fragRand),
    angleJitterDeg: (fragRand() - 0.5) * 100,
    magnitudeFrac: 0.5 + fragRand() * 0.75,
    stretchAmount: 0.45 + fragRand() * 0.55,
    timing,
  }));
  return { cuts, fragments };
}

export function renderDriftPhaseField(
  targetCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DriftState,
  globalPhase: GlobalPhase,
  blurPx: number
): void {
  const scratch = getScratch("drift-phase", width, height);
  const sctx = scratch.getContext("2d")!;
  sctx.clearRect(0, 0, width, height);
  sctx.fillStyle = "#ffffff";
  for (let i = 0; i < state.fragments.length; i++) {
    const phase = fragmentPhase(globalPhase, state.fragments[i].timing);
    if (phase <= 0.003) continue;
    sctx.save();
    clipToWavyRegion(sctx, state.cuts, i, width, height);
    sctx.globalAlpha = phase;
    sctx.fillRect(0, 0, width, height);
    sctx.restore();
  }
  blurInto(targetCtx, scratch, blurPx);
  applyGrain(targetCtx, width, height);
}

/** Paints one fragment's content (before masking) according to its kind —
 * this is where the five behaviours actually diverge. */
function paintFragmentContent(
  cctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  frag: DriftFragment,
  phase: number,
  dx: number,
  dy: number
): void {
  switch (frag.kind) {
    case "retain": {
      // Barely detaches -- a faint wash of B, almost no travel.
      const rdx = dx * 0.22;
      const rdy = dy * 0.22;
      const dampedBlend = phase * 0.55;
      drawOverscanTranslated(cctx, aLayer, width, height, rdx, rdy, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, rdx, rdy, dampedBlend);
      break;
    }
    case "stretch": {
      // Deforms between origin and destination rather than staying rigid.
      drawOverscanStretched(cctx, aLayer, width, height, dx, dy, frag.stretchAmount * phase, 1);
      drawOverscanStretched(cctx, bLayer, width, height, dx, dy, frag.stretchAmount * phase, phase);
      break;
    }
    case "duplicate": {
      // One bold displaced copy, plus a faint trace left behind at rest.
      drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 0.28);
      drawOverscanTranslated(cctx, aLayer, width, height, dx, dy, 0.92);
      drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, 0.92 * phase);
      break;
    }
    case "anchor": {
      // Holds its ground -- tiny displacement, modest blend.
      const adx = dx * 0.1;
      const ady = dy * 0.1;
      drawOverscanTranslated(cctx, aLayer, width, height, adx, ady, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, adx, ady, phase * 0.65);
      break;
    }
    case "overlap": {
      // Travels further, stays translucent throughout so it visibly
      // bleeds into whatever it drifts across.
      const odx = dx * 1.35;
      const ody = dy * 1.35;
      drawOverscanTranslated(cctx, aLayer, width, height, odx, ody, 0.72);
      drawOverscanTranslated(cctx, bLayer, width, height, odx, ody, 0.72 * phase);
      break;
    }
  }
}

export function renderDriftComposite(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  state: DriftState,
  globalPhase: GlobalPhase,
  directionDeg: number,
  overlapFrac: number,
  blurPx: number
): void {
  ctx.clearRect(0, 0, width, height);
  // Full-bleed A underneath every clipped fragment paint: adjacent
  // fragments' clip paths share exact geometry but rasterize
  // independently, so anti-aliasing at a shared edge can leave a
  // sub-pixel sliver where neither fragment's coverage reaches 100% —
  // without this base that sliver shows through as a faint seam, visible
  // even at rest when every fragment is just redrawing plain A.
  ctx.drawImage(aLayer, 0, 0);
  const content = getScratch("drift-content", width, height);
  const mask = getScratch("drift-mask", width, height);
  const cctx = content.getContext("2d")!;
  const mctx = mask.getContext("2d")!;

  const resolved = state.fragments.map((frag) => ({
    frag,
    phase: fragmentPhase(globalPhase, frag.timing),
  }));
  const order = resolved.map((_, i) => i).sort((a, b) => resolved[a].phase - resolved[b].phase);

  for (const i of order) {
    const { frag, phase } = resolved[i];

    if (phase <= 0.003) {
      ctx.save();
      clipToWavyRegion(ctx, state.cuts, i, width, height);
      ctx.drawImage(aLayer, 0, 0);
      ctx.restore();
      continue;
    }

    const baseDrift = Math.min(width, height) * BASE_DRIFT_FRAC * frag.magnitudeFrac;
    const rad = ((directionDeg + frag.angleJitterDeg) * Math.PI) / 180;
    const dx = Math.cos(rad) * baseDrift * phase;
    const dy = Math.sin(rad) * baseDrift * phase;

    mctx.clearRect(0, 0, width, height);
    mctx.save();
    mctx.translate(dx, dy);
    mctx.fillStyle = "#ffffff";
    clipToWavyRegion(mctx, state.cuts, i, width, height);
    mctx.fillRect(-width * 2, -height * 2, width * 5, height * 5);
    mctx.restore();

    cctx.clearRect(0, 0, width, height);
    paintFragmentContent(cctx, aLayer, bLayer, width, height, frag, phase, dx, dy);
    cctx.save();
    cctx.globalCompositeOperation = "destination-in";
    cctx.filter = blurPx > 0.4 ? `blur(${blurPx}px)` : "none";
    cctx.drawImage(mask, 0, 0);
    cctx.filter = "none";
    cctx.globalCompositeOperation = "source-over";
    cctx.restore();
    applyGrain(cctx, width, height);

    const kindAlpha = frag.kind === "overlap" ? 0.85 : 1;
    ctx.save();
    ctx.globalAlpha = kindAlpha * (1 - overlapFrac * 0.55 * phase);
    ctx.drawImage(content, 0, 0);
    ctx.restore();
  }
}
