/** DIFFUSE: photograph -> density -> atmosphere -> photograph. The least
 * geometric of the three Shift expressions — Slice owns time, Drift owns
 * space, Diffuse owns MATTER. There is no discrete shape here at all, not
 * even a soft blurred one: a shape-based field (wobbly polygon cells, no
 * matter how blurred) still reads as N separate translucent patches once
 * you compare it side by side with Drift's fragments, which is exactly
 * what an earlier pass on this file collapsed into.
 *
 * Instead the whole frame is ONE continuous density field: two octaves of
 * random noise (a coarse cloud + a finer, Fragment-controlled cloud,
 * combined via canvas's own "overlay" blend and a Direction-biased
 * gradient) pushed through a brightness/contrast threshold that sweeps
 * with the transform's own activity level. High contrast over continuously
 * -varying, bilinear-upscaled noise is what produces the granular,
 * speckled breakup at the boundary — material dissolving into grain, not a
 * gaussian blur softening a shape's edge. At the strongest moment,
 * coverage should be so near-total that there is no legible boundary left
 * to identify at all. A slight registration offset for B (keyed to the
 * field's own activity) keeps this reading as photographic material
 * changing state rather than a flat crossfade. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanTranslated, getScratch } from "./compose";
import { fragmentContinuum, type GlobalPhase } from "./timing";

const FIELD_W = 640;
const FIELD_H = 800;
const COARSE_COLS = 12;
const COARSE_ROWS = 15;

function buildNoiseCanvas(rand: () => number, cols: number, rows: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(cols, rows);
  const d = img.data;
  for (let i = 0; i < cols * rows; i++) {
    const v = Math.floor(rand() * 255);
    d[i * 4] = v;
    d[i * 4 + 1] = v;
    d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface DiffuseState {
  coarseCloud: HTMLCanvasElement;
  fineCloud: HTMLCanvasElement;
}

/** Fragment controls the fine cloud's grid density (finer grain at higher
 * Fragment) -- the only build-time-baked control; Direction/Spread/Rhythm/
 * Overlap are all consumed live at render time (see buildDensityField), so
 * nudging any of them never requires rebuilding the clouds themselves.
 * The fine grid is deliberately dense (a few pixels per cell even before
 * the final upscale to frame size) -- this is what makes the threshold
 * boundary read as fine, granular breakup instead of one smooth blob
 * edge; a coarse grid, no matter how much contrast is applied to it,
 * still upscales into a soft blob, not grain. */
export function buildDiffuseState(fragment: number, seed: number): DiffuseState {
  const { f } = fragmentContinuum(fragment);
  const rand = mulberry32(seed);
  const coarseCloud = buildNoiseCanvas(rand, COARSE_COLS, COARSE_ROWS);
  const fineCols = Math.round(120 + f * 380);
  const fineRows = Math.round(150 + f * 475);
  const fineCloud = buildNoiseCanvas(rand, fineCols, fineRows);
  return { coarseCloud, fineCloud };
}

// Set by renderDiffusePhaseField (which always runs first each frame, per
// the shared Renderer's fixed call order) and read back by
// renderDiffuseComposite, so the registration-offset amount doesn't need
// to recompute -- and can't drift out of sync with -- the field's own
// activity level.
let cachedActivity = 0;

/** The whole field's activity as ONE coherent arc (rises, peaks, falls)
 * rather than N independently-timed fragments -- Diffuse is a single
 * atmospheric event, not a population of staggered pieces. */
function fieldActivity(globalPhase: GlobalPhase): number {
  return globalPhase.inTransform ? Math.sin(globalPhase.localPhase * Math.PI) : 0;
}

function buildDensityField(
  state: DiffuseState,
  directionDeg: number,
  spreadFrac: number,
  rhythmFrac: number,
  overlapFrac: number,
  activity: number,
  time: number
): HTMLCanvasElement {
  const field = getScratch("diffuse-field", FIELD_W, FIELD_H);
  const fctx = field.getContext("2d")!;
  fctx.clearRect(0, 0, FIELD_W, FIELD_H);
  fctx.imageSmoothingEnabled = true;
  fctx.globalCompositeOperation = "source-over";
  fctx.drawImage(state.coarseCloud, 0, 0, FIELD_W, FIELD_H);

  // The fine cloud slowly pans (turbulence, driven by Rhythm) and combines
  // via "overlay" -- a second octave of detail rather than a second
  // discrete layer.
  const panX = Math.sin(time * 0.17) * rhythmFrac * state.fineCloud.width * 0.5;
  const panY = Math.cos(time * 0.13) * rhythmFrac * state.fineCloud.height * 0.5;
  fctx.globalCompositeOperation = "overlay";
  fctx.drawImage(state.fineCloud, panX, panY, state.fineCloud.width, state.fineCloud.height, 0, 0, FIELD_W, FIELD_H);
  fctx.globalCompositeOperation = "source-over";

  // A Direction-biased gradient (strength driven by Spread) so the field
  // leans toward dissolving from one side, without ever becoming a literal
  // moving wipe front.
  const rad = (directionDeg * Math.PI) / 180;
  const gx0 = FIELD_W / 2 - Math.cos(rad) * FIELD_W * 0.75;
  const gy0 = FIELD_H / 2 - Math.sin(rad) * FIELD_H * 0.75;
  const gx1 = FIELD_W / 2 + Math.cos(rad) * FIELD_W * 0.75;
  const gy1 = FIELD_H / 2 + Math.sin(rad) * FIELD_H * 0.75;
  const grad = fctx.createLinearGradient(gx0, gy0, gx1, gy1);
  const biasStrength = 0.12 + spreadFrac * 0.4;
  grad.addColorStop(0, `rgba(0,0,0,${biasStrength})`);
  grad.addColorStop(1, `rgba(255,255,255,${biasStrength})`);
  fctx.globalCompositeOperation = "overlay";
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, FIELD_W, FIELD_H);
  fctx.globalCompositeOperation = "source-over";

  // High contrast over this continuously-varying, bilinear-upscaled noise
  // is what produces granular, speckled breakup instead of a smooth curve
  // -- material dissolving, not a shape being blurred. Brightness sweeps
  // the effective threshold with the field's own activity level, so
  // different regions cross over at different moments even though the
  // threshold itself moves uniformly.
  const contrastPct = 260 + (1 - overlapFrac) * 220;
  // Floored low enough that even the single brightest possible noise pixel
  // (255) can never cross the contrast filter's midpoint at activity=0 --
  // true rest must show exactly nothing, not a faint permanent peppering
  // of the brightest noise islands.
  const brightnessPct = 30 + activity * 175;
  const thresholded = getScratch("diffuse-field-thresh", FIELD_W, FIELD_H);
  const tctx = thresholded.getContext("2d")!;
  tctx.clearRect(0, 0, FIELD_W, FIELD_H);
  tctx.filter = `brightness(${brightnessPct}%) contrast(${contrastPct}%)`;
  tctx.drawImage(field, 0, 0);
  tctx.filter = "none";

  // Canvas has no built-in luminosity-to-alpha, so convert with one small
  // pixel pass (cheap: FIELD_W x FIELD_H, not the real frame size) --
  // everything upstream ran at this same small resolution specifically so
  // this conversion, and the bilinear upscale that follows it, stay cheap.
  const img = tctx.getImageData(0, 0, FIELD_W, FIELD_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i];
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = lum;
  }
  tctx.putImageData(img, 0, 0);
  return thresholded;
}

export function renderDiffusePhaseField(
  targetCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DiffuseState,
  globalPhase: GlobalPhase,
  directionDeg: number,
  spreadFrac: number,
  rhythmFrac: number,
  overlapFrac: number,
  blurPx: number,
  time: number
): void {
  const activity = fieldActivity(globalPhase);
  cachedActivity = activity;
  const field = buildDensityField(state, directionDeg, spreadFrac, rhythmFrac, overlapFrac, activity, time);

  const scratch = getScratch("diffuse-upscaled", width, height);
  const sctx = scratch.getContext("2d")!;
  sctx.clearRect(0, 0, width, height);
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(field, 0, 0, width, height);

  blurInto(targetCtx, scratch, blurPx);
  applyGrain(targetCtx, width, height);
}

export function renderDiffuseComposite(
  ctx: CanvasRenderingContext2D,
  aLayer: HTMLCanvasElement,
  bLayer: HTMLCanvasElement,
  maskLayer: HTMLCanvasElement,
  width: number,
  height: number,
  directionDeg: number
): void {
  const content = getScratch("diffuse-content", width, height);
  const cctx = content.getContext("2d")!;
  cctx.clearRect(0, 0, width, height);

  // A slight registration offset for B, peaking with the field's own
  // activity -- two prints briefly out of register, not a flat crossfade.
  const rad = (directionDeg * Math.PI) / 180;
  const offsetPx = (1.5 + cachedActivity * 5) * Math.min(width, height) * 0.005;
  const dx = Math.cos(rad) * offsetPx;
  const dy = Math.sin(rad) * offsetPx;
  drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, 1);

  cctx.save();
  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(maskLayer, 0, 0);
  cctx.globalCompositeOperation = "source-over";
  cctx.restore();

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(aLayer, 0, 0);
  ctx.drawImage(content, 0, 0);
}
