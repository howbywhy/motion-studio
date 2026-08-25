/** SLICE: one photograph containing incompatible moments of the same
 * subject — the chronophotography principle, pushed decisively rather than
 * treated as displacement/glitch. A frozen frame at maximum transformation
 * should read as an unusual PHOTOGRAPHIC TECHNIQUE (multiple-exposure,
 * strobe photography), not a transition effect caught mid-flight.
 *
 * Every band is permanently assigned one of four roles at build time, so
 * "incompatible moments coexisting" actually varies band to band instead of
 * being one uniform echo formula stamped across the whole frame:
 *   held    - retains its original position; a legible, undisplaced
 *             temporal state (this piece of the photo hasn't gone
 *             anywhere, only WHEN it is has changed).
 *   advance - decisively sampled from further along Direction: this band
 *             shows a LATER position of the subject.
 *   retreat - decisively sampled from earlier along Direction: this band
 *             shows an EARLIER position of the subject.
 *   overlap - two decisive moments visibly coexisting in the same band at
 *             once, an impossible double exposure.
 * Each role paints at most two fairly OPAQUE layers, never a fading stack
 * of three-plus soft echoes — that reads as motion blur/glitch rather than
 * distinct coexisting exposures, and it muddies the photographic
 * information the brief asks to preserve. Bands run at an arbitrary angle
 * (Direction, via one canvas rotation), stay in coherent spatial order (a
 * directional sweep, not a scattered stagger — see timing.ts), and their
 * boundaries undulate continuously so none of it reads as a ruled line or
 * a moving window. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanTranslated, getScratch } from "./compose";
import { distributeFragmentTimings, fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";
import { clipToSequentialBand, randomWave, type WaveParams, type WavyCut } from "./wavy";

export type SliceBandRole = "held" | "advance" | "retreat" | "overlap";

const ROLE_WEIGHTS: [SliceBandRole, number][] = [
  ["held", 0.3],
  ["advance", 0.25],
  ["retreat", 0.25],
  ["overlap", 0.2],
];

function pickRole(rand: () => number): SliceBandRole {
  const total = ROLE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [role, w] of ROLE_WEIGHTS) {
    if (r < w) return role;
    r -= w;
  }
  return ROLE_WEIGHTS[ROLE_WEIGHTS.length - 1][0];
}

export interface SliceBand {
  role: SliceBandRole;
  magnitudeFrac: number; // per-band variation in how far advance/retreat/overlap reach
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
    const role = pickRole(timingsRand);
    const magnitudeFrac = 0.65 + timingsRand() * 0.85;
    return { role, magnitudeFrac, alphaTiming, dispTiming };
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

/** Paints one band's content according to its role — this is where the
 * four roles actually diverge. At most two fairly opaque layers each, so a
 * paused frame reads as distinct coexisting exposures, not a fading
 * motion-blur trail. */
function paintBandContent(
  cctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  band: SliceBand,
  alphaPhase: number,
  dx: number,
  dy: number
): void {
  switch (band.role) {
    case "held": {
      // Retains its original position -- a legible, undisplaced moment.
      drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, 0, 0, alphaPhase);
      break;
    }
    case "advance": {
      // Sampled decisively forward along Direction -- a LATER position.
      drawOverscanTranslated(cctx, aLayer, width, height, dx, dy, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, alphaPhase);
      break;
    }
    case "retreat": {
      // Sampled decisively backward along Direction -- an EARLIER position.
      drawOverscanTranslated(cctx, aLayer, width, height, -dx, -dy, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, -dx, -dy, alphaPhase);
      break;
    }
    case "overlap": {
      // Two decisive moments visibly coexisting -- an impossible double
      // exposure, not a fading echo trail.
      drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, 0, 0, alphaPhase * 0.55);
      drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, alphaPhase * 0.9);
      break;
    }
  }
}

/** The real composite: every band renders its role's content once masked,
 * so freezing the frame at maximum transformation shows several distinct,
 * decisive interpolation states layered together rather than a blurred
 * stack of soft echoes. */
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
  // Meaningfully larger than a subtle nudge -- decisive temporal
  // separation is the whole point of this behaviour.
  const maxDispPx = Math.min(width, height) * (0.06 + overlapFrac * 0.16);

  const content = getScratch("slice-content", width, height);
  const cctx = content.getContext("2d")!;

  for (let i = 0; i < state.bands.length; i++) {
    const band = state.bands[i];
    const alphaPhase = fragmentPhase(globalPhase, band.alphaTiming);
    const dispPhase = fragmentPhase(globalPhase, band.dispTiming);
    if (alphaPhase <= 0.003 && dispPhase <= 0.003) continue;

    const mask = buildBandMask(width, height, directionDeg, state.cuts, i, blurPx);
    const disp = maxDispPx * band.magnitudeFrac * dispPhase;
    const dx = dirX * disp;
    const dy = dirY * disp;

    cctx.clearRect(0, 0, width, height);
    paintBandContent(cctx, aLayer, bLayer, width, height, band, alphaPhase, dx, dy);

    cctx.save();
    cctx.globalCompositeOperation = "destination-in";
    cctx.drawImage(mask, 0, 0);
    cctx.globalCompositeOperation = "source-over";
    cctx.restore();

    ctx.drawImage(content, 0, 0);
  }
}
