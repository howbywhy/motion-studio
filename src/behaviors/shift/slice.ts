/** SLICE: the A->B transition is distributed spatially across bands running
 * across the frame — each band occupies its own moment of the transition,
 * so at any instant some bands read as still-A, some mid-blend, some
 * already-B, all at once: one photographic moment fragmented into several
 * simultaneous ones. Bands run at an arbitrary angle (Direction, via a
 * single canvas rotation rather than per-orientation geometry), their
 * boundaries undulate continuously along their own length (never a ruled
 * line), and the whole field is blurred in one pass so no edge reads as a
 * drawn shape — this is a blend field, not a set of moving windows. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, getScratch } from "./compose";
import { distributeFragmentTimings, fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";
import { clipToSequentialBand, randomWave, type WaveParams, type WavyCut } from "./wavy";

export interface SliceState {
  cuts: WavyCut[];
  timings: FragmentTiming[];
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
  const timings = distributeFragmentTimings(count, spread / 100, rhythm / 100, timingsRand, true);
  return { cuts, timings };
}

/** Renders the blurred band-phase field into `targetCtx` — used directly as
 * the diagnostic mask, and as the alpha for the generic A/B composite (no
 * spatial offset needed, so Slice doesn't need its own renderComposite).
 * Bands are drawn in a `diag` x `diag` square big enough to fully cover the
 * real width x height frame after an arbitrary Direction rotation. */
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
  for (let i = 0; i < state.timings.length; i++) {
    const phase = fragmentPhase(globalPhase, state.timings[i]);
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
