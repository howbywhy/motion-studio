/** DRIFT: irregular pieces of the photograph detach, lag behind their own
 * rest position, overlap one another, and carry a blend of A and B with
 * them before resolving back into place. Every fragment is drawn every
 * frame (not just the active ones) so the tiling is always complete and a
 * fully-rested frame is pixel-identical to A; only fragments with a
 * nonzero envelope pay for translation + blend + feathering. Active
 * fragments are drawn last (so they read as "on top" while detached) at
 * reduced opacity so overlapping pieces blend into genuine soft double
 * exposure rather than opaque stacking. */
import { mulberry32 } from "../../core/rng";
import { blurInto, drawOverscanTranslated, getScratch } from "./compose";
import { distributeFragmentTimings, fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";
import { buildWavyPartition, clipToWavyRegion, type WavyCut } from "./wavy";

export interface DriftFragment {
  angleJitterDeg: number; // deviation from the shared Direction, applied at render time
  magnitudeFrac: number;
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
    angleJitterDeg: (fragRand() - 0.5) * 100,
    magnitudeFrac: 0.5 + fragRand() * 0.75,
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
    drawOverscanTranslated(cctx, aLayer, width, height, dx, dy, 1);
    drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, phase);
    cctx.save();
    cctx.globalCompositeOperation = "destination-in";
    cctx.filter = blurPx > 0.4 ? `blur(${blurPx}px)` : "none";
    cctx.drawImage(mask, 0, 0);
    cctx.filter = "none";
    cctx.globalCompositeOperation = "source-over";
    cctx.restore();

    ctx.save();
    ctx.globalAlpha = 1 - overlapFrac * 0.55 * phase;
    ctx.drawImage(content, 0, 0);
    ctx.restore();
  }
}
