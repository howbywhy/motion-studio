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
 * a moving window.
 *
 * Their TIMING is deliberately clustered rather than evenly spread: raw
 * per-band centers get snapped hard (78%) toward a small set of shared
 * event centers (buildSliceEventCenters), so a handful of bands fire in
 * near-unison as one legible temporal event instead of many bands each
 * getting their own slightly-different moment — that reads as a smooth
 * gradient/effect, not a chronophotographic exposure. A band also has a
 * chance (PARTIAL_CHANCE) of only affecting a partial-width slice of its
 * own strip rather than the full frame width, so a temporal event can read
 * as one displaced limb or region rather than a clean full-width stripe.
 * And instead of crossfading a translated copy in place (repeated
 * translucent ghosts), advance/retreat/overlap bands draw an ANISOTROPIC
 * STRETCH along Direction (drawOverscanStretched) that grows with the
 * band's own displacement phase — a directional exposure drag, closer to
 * slit-scan/registration-error smear than a stacked double exposure. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanStretched, drawOverscanTranslated, getScratch } from "./compose";
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
  stretchAmount: number; // per-band anisotropic smear for advance/retreat/overlap -- exposure drag, not a rigid duplicate
  partialRange: [number, number] | null; // along-band extent this band's content is confined to; null = spans the band's full length
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

/** A small number of unevenly-placed temporal "events" (2-5, loosely
 * driven by Spread) rather than one continuous sweep -- the difference
 * between "the photograph has a few genuinely distinct moments in it" and
 * "one smooth wipe." Placement is jittered around even spacing, never
 * exactly even. */
function buildSliceEventCenters(rand: () => number, spreadFrac: number): number[] {
  const eventCount = Math.max(2, Math.min(5, Math.round(2 + spreadFrac * 2.4 + rand())));
  const centers: number[] = [];
  for (let i = 0; i < eventCount; i++) {
    const base = (i + 0.5) / eventCount;
    const jitter = (rand() - 0.5) * (0.75 / eventCount);
    centers.push(Math.min(0.95, Math.max(0.05, base + jitter)));
  }
  return centers.sort((a, b) => a - b);
}

function nearestEventCenter(centers: number[], t: number): number {
  let best = centers[0];
  let bestDist = Infinity;
  for (const c of centers) {
    const d = Math.abs(c - t);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
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
  const rawAlphaTimings = distributeFragmentTimings(count, spread / 100, rhythm / 100, timingsRand, true);

  // Snap each band's independently-spread center strongly toward its
  // nearest shared event -- most of the way, not all of it, so bands
  // sharing an event still show slight individual lag/lead rather than
  // moving in perfect lockstep.
  const eventCenters = buildSliceEventCenters(timingsRand, spread / 100);
  const SNAP = 0.78;
  const alphaTimings = rawAlphaTimings.map((t) => {
    const nearest = nearestEventCenter(eventCenters, t.center);
    const center = t.center * (1 - SNAP) + nearest * SNAP;
    const width = Math.max(0.045, t.width * 0.82);
    return { center, width };
  });

  const PARTIAL_CHANCE = 0.34;
  const bands: SliceBand[] = alphaTimings.map((alphaTiming) => {
    const dispWidthMul = 1.35 + timingsRand() * 0.95; // 1.35..2.3 -- variable per-band lag/lead
    const dispTiming: FragmentTiming = { center: alphaTiming.center, width: Math.min(0.55, alphaTiming.width * dispWidthMul) };
    const role = pickRole(timingsRand);
    const magnitudeFrac = 0.65 + timingsRand() * 0.85;
    const stretchAmount = 0.5 + timingsRand() * 0.75;

    let partialRange: [number, number] | null = null;
    // "held" bands stay in place already -- a partial crop on top would
    // just look like a floating patch rather than a moment of the photo
    // partially changing, so only the roles that already carry a temporal
    // event (advance/retreat/overlap) get to be partial.
    if (role !== "held" && timingsRand() < PARTIAL_CHANCE) {
      const span = 0.32 + timingsRand() * 0.3;
      const start = timingsRand() * (1 - span);
      partialRange = [start, start + span];
    }

    return { role, magnitudeFrac, stretchAmount, partialRange, alphaTiming, dispTiming };
  });
  return { cuts, bands };
}

/** Builds one band's blurred, grained alpha shape — a plain axis-aligned
 * bitmap even though it was drawn via a rotated clip, so it can be used as
 * an ordinary destination-in mask against un-rotated A/B content.
 * `partialRange`, when given, additionally confines the band along its own
 * length (in the rotated diag-space) to that fraction — a partial-body
 * echo rather than a stripe spanning the entire frame; the hard rectangle
 * edge this introduces gets softened by the same blur pass as the rest of
 * the band's boundary, below. */
function buildBandMask(
  width: number,
  height: number,
  directionDeg: number,
  cuts: WavyCut[],
  index: number,
  blurPx: number,
  partialRange: [number, number] | null
): HTMLCanvasElement {
  const diag = Math.ceil(Math.sqrt(width * width + height * height)) + 8;
  const raw = getScratch("slice-band-raw", width, height);
  const rctx = raw.getContext("2d")!;
  rctx.clearRect(0, 0, width, height);
  rctx.save();
  rctx.translate(width / 2, height / 2);
  rctx.rotate((directionDeg * Math.PI) / 180);
  rctx.translate(-diag / 2, -diag / 2);
  clipToSequentialBand(rctx, cuts, index, diag, diag);
  if (partialRange) {
    rctx.beginPath();
    rctx.rect(partialRange[0] * diag, 0, (partialRange[1] - partialRange[0]) * diag, diag);
    rctx.clip();
  }
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
 * four roles actually diverge. Held is a plain crossfade in place; the
 * roles that carry actual motion (advance/retreat/overlap) stretch
 * anisotropically along their own travel direction rather than sliding a
 * rigid duplicate -- exposure drag, closer to a slit-scan or long-exposure
 * smear than a pasted-on copy. The stretch grows in with dispPhase (none
 * at rest, full once the band is fully underway), and stays modest
 * (band.stretchAmount, not Drift's dramatic range) so it reads as
 * photographic motion, not a spatial dislocation. */
function paintBandContent(
  cctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  width: number,
  height: number,
  band: SliceBand,
  alphaPhase: number,
  dispPhase: number,
  dx: number,
  dy: number
): void {
  const stretch = band.stretchAmount * dispPhase;
  switch (band.role) {
    case "held": {
      // Retains its original position -- a legible, undisplaced moment.
      drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, 0, 0, alphaPhase);
      break;
    }
    case "advance": {
      // Sampled decisively forward along Direction -- a LATER position,
      // smeared toward it rather than snapped there.
      drawOverscanStretched(cctx, aLayer, width, height, dx, dy, stretch, 1);
      drawOverscanStretched(cctx, bLayer, width, height, dx, dy, stretch, alphaPhase);
      break;
    }
    case "retreat": {
      // Sampled decisively backward along Direction -- an EARLIER position.
      drawOverscanStretched(cctx, aLayer, width, height, -dx, -dy, stretch, 1);
      drawOverscanStretched(cctx, bLayer, width, height, -dx, -dy, stretch, alphaPhase);
      break;
    }
    case "overlap": {
      // Two decisive moments visibly coexisting -- an impossible double
      // exposure, not a fading echo trail. The displaced copy carries a
      // lighter smear than advance/retreat so it still reads as a second
      // distinct exposure, not a blurred trail.
      drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 1);
      drawOverscanTranslated(cctx, bLayer, width, height, 0, 0, alphaPhase * 0.55);
      drawOverscanStretched(cctx, bLayer, width, height, dx, dy, stretch * 0.55, alphaPhase * 0.9);
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

    const mask = buildBandMask(width, height, directionDeg, state.cuts, i, blurPx, band.partialRange);
    const disp = maxDispPx * band.magnitudeFrac * dispPhase;
    const dx = dirX * disp;
    const dy = dirY * disp;

    cctx.clearRect(0, 0, width, height);
    paintBandContent(cctx, aLayer, bLayer, width, height, band, alphaPhase, dispPhase, dx, dy);

    cctx.save();
    cctx.globalCompositeOperation = "destination-in";
    cctx.drawImage(mask, 0, 0);
    cctx.globalCompositeOperation = "source-over";
    cctx.restore();

    ctx.drawImage(content, 0, 0);
  }
}
