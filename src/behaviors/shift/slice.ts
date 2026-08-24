/** SLICE: not "A -> a moving band -> B" but multiple moments of the same
 * photograph coexisting spatially at once — the chronophotography
 * principle. A frozen frame at maximum transformation should read as a
 * genuinely new composition, not a transition caught mid-flight: one band
 * already predominantly B, its neighbour a 70/30 A/B state, another still
 * mostly A but visibly displaced, another carrying a faint trailing echo
 * of a less-transformed version of itself underneath its current state.
 *
 * Each band therefore renders as a short stack of 2-3 progressively more
 * offset, progressively more B-blended copies of itself (not one flat
 * alpha fill) — the earliest, faintest copy near rest position and barely
 * blended, the last copy fully at the band's current blend ratio and
 * offset. Displacement and blend are driven by two DIFFERENT envelopes
 * sharing a center but not a width, so a band can be substantially
 * displaced while still mostly A, or nearly resolved while still faintly
 * displaced — the two never move in lockstep. Bands run at an arbitrary
 * angle (Direction, via one canvas rotation), stay in coherent spatial
 * order (a directional sweep, not a scattered stagger — see timing.ts),
 * and their boundaries undulate continuously so none of it reads as a
 * ruled line or a moving window. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanTranslated, getScratch } from "./compose";
import { distributeFragmentTimings, fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";
import { clipToSequentialBand, randomWave, type WaveParams, type WavyCut } from "./wavy";

export interface SliceBand {
  alphaTiming: FragmentTiming; // drives the A->B blend ratio
  dispTiming: FragmentTiming; // same center, wider width -- displacement is active before/after the blend itself is
}

export interface SliceState {
  cuts: WavyCut[];
  bands: SliceBand[];
}

function bandWeights(count: number, rand: () => number, uniformity: number): number[] {
  const raw = Array.from({ length: count }, () => 0.4 + rand() * 1.3);
  const blended = raw.map((w) => w * (1 - uniformity) + uniformity);
  const sum = blended.reduce((a, b) => a + b, 0);
  return blended.map((w) => w / sum);
}

export function buildSliceState(fragment: number, spread: number, rhythm: number, seed: number): SliceState {
  const { count, f } = fragmentContinuum(fragment);
  const rand = mulberry32(seed);
  const weights = bandWeights(count, rand, f);
  const cuts: WavyCut[] = [];
  let cum = 0;
  for (let i = 0; i < count - 1; i++) {
    cum += weights[i];
    const wave: WaveParams = randomWave(rand);
    const amplitudeFrac = 0.015 + rand() * 0.02;
    cuts.push({ orientation: "horizontal", pos: cum, amplitudeFrac, wave });
  }
  const timingsRand = mulberry32(seed + 104729);
  // coherent=true: band index order IS temporal order, so the transition
  // reads as a directional sweep across the bands (a strobe-exposure
  // quality) rather than a spatially arbitrary stagger.
  const alphaTimings = distributeFragmentTimings(count, spread / 100, rhythm / 100, timingsRand, true);
  const bands: SliceBand[] = alphaTimings.map((alphaTiming) => {
    const dispWidthMul = 1.35 + timingsRand() * 0.95; // 1.35..2.3 -- variable per-band lag/lead
    const dispTiming: FragmentTiming = { center: alphaTiming.center, width: Math.min(0.55, alphaTiming.width * dispWidthMul) };
    return { alphaTiming, dispTiming };
  });
  return { cuts, bands };
}

/** Builds one band's blurred, grained alpha shape — a plain axis-aligned
 * bitmap even though it was drawn via a rotated clip, so it can be used as
 * an ordinary destination-in mask against un-rotated A/B content. */
function buildBandMask(width: number, height: number, directionDeg: number, cuts: WavyCut[], index: number, blurPx: number): HTMLCanvasElement {
  const diag = Math.ceil(Math.sqrt(width * width + height * height)) + 8;
  const raw = getScratch("slice-band-raw", width, height);
  const rctx = raw.getContext("2d")!;
  rctx.clearRect(0, 0, width, height);
  rctx.save();
  rctx.translate(width / 2, height / 2);
  rctx.rotate((directionDeg * Math.PI) / 180);
  rctx.translate(-diag / 2, -diag / 2);
  clipToSequentialBand(rctx, cuts, index, diag, diag);
  rctx.fillStyle = "#ffffff";
  rctx.fillRect(0, 0, diag, diag);
  rctx.restore();

  const out = getScratch("slice-band-mask", width, height);
  const octx = out.getContext("2d")!;
  octx.clearRect(0, 0, width, height);
  blurInto(octx, raw, blurPx);
  applyGrain(octx, width, height);
  return out;
}

/** Diagnostic-only aggregate field (Show Mask) — a simple sum of each
 * band's own blend phase, not the full echo stack the real composite
 * paints; enough to see where activity is without doubling the render
 * cost of the diagnostic view. */
export function renderSlicePhaseField(
  targetCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  directionDeg: number,
  state: SliceState,
  globalPhase: GlobalPhase,
  blurPx: number
): void {
  const diag = Math.ceil(Math.sqrt(width * width + height * height)) + 8;
  const scratch = getScratch("slice-bands", width, height);
  const sctx = scratch.getContext("2d")!;
  sctx.clearRect(0, 0, width, height);
  sctx.save();
  sctx.translate(width / 2, height / 2);
  sctx.rotate((directionDeg * Math.PI) / 180);
  sctx.translate(-diag / 2, -diag / 2);
  sctx.fillStyle = "#ffffff";
  for (let i = 0; i < state.bands.length; i++) {
    const phase = fragmentPhase(globalPhase, state.bands[i].alphaTiming);
    if (phase <= 0.003) continue;
    sctx.save();
    clipToSequentialBand(sctx, state.cuts, i, diag, diag);
    sctx.globalAlpha = phase;
    sctx.fillRect(0, 0, diag, diag);
    sctx.restore();
  }
  sctx.restore();
  blurInto(targetCtx, scratch, blurPx);
  applyGrain(targetCtx, width, height);
}

const ECHO_OFFSET_FRACS = [0.3, 0.6, 1.0];
const ECHO_OPACITIES = [0.22, 0.42, 0.82];

/** The real composite: every band is a short stack of progressively more
 * offset, more B-blended copies rather than one flat reveal, so freezing
 * the frame at maximum transformation shows several distinct interpolation
 * states layered together with soft trailing echoes between them. */
export function renderSliceComposite(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  directionDeg: number,
  state: SliceState,
  globalPhase: GlobalPhase,
  overlapFrac: number,
  blurPx: number
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(aLayer, 0, 0); // full-bleed base -- every band's mask/echo math stays safely inside this

  const dirRad = (directionDeg * Math.PI) / 180;
  const dirX = Math.cos(dirRad);
  const dirY = Math.sin(dirRad);
  const maxDispPx = Math.min(width, height) * (0.035 + overlapFrac * 0.07);

  const content = getScratch("slice-content", width, height);
  const cctx = content.getContext("2d")!;

  for (let i = 0; i < state.bands.length; i++) {
    const band = state.bands[i];
    const alphaPhase = fragmentPhase(globalPhase, band.alphaTiming);
    const dispPhase = fragmentPhase(globalPhase, band.dispTiming);
    if (alphaPhase <= 0.003 && dispPhase <= 0.003) continue;

    const mask = buildBandMask(width, height, directionDeg, state.cuts, i, blurPx);

    cctx.clearRect(0, 0, width, height);
    for (let k = 0; k < ECHO_OFFSET_FRACS.length; k++) {
      const f = ECHO_OFFSET_FRACS[k];
      const dx = dirX * maxDispPx * dispPhase * f;
      const dy = dirY * maxDispPx * dispPhase * f;
      // Earlier (smaller-offset) copies are also less blended toward B —
      // they read as fainter, less-transformed moments trailing behind
      // the band's current state, not just a translated duplicate of it.
      const echoBlend = Math.min(1, alphaPhase * (0.45 + f * 0.55));
      drawOverscanTranslated(cctx, aLayer, width, height, dx, dy, ECHO_OPACITIES[k]);
      drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, ECHO_OPACITIES[k] * echoBlend);
    }

    cctx.save();
    cctx.globalCompositeOperation = "destination-in";
    cctx.drawImage(mask, 0, 0);
    cctx.globalCompositeOperation = "source-over";
    cctx.restore();

    ctx.drawImage(content, 0, 0);
  }
}
