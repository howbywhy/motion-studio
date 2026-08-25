/** SLICE: time becoming spatial. At a held maximum the photograph should
 * read as chronophotography — a few incompatible moments of the same
 * subject occupying different spatial intervals — not a wipe, not a glitch,
 * not a frame full of soft echoes.
 *
 * Hierarchy, not population:
 *   held     - the quiet majority. Left as the A base; they do not
 *              crossfade. This is what keeps the photograph the subject.
 *   primary  - one contiguous cluster of adjacent bands: retreat | overlap |
 *              advance along Direction. The major temporal event.
 *   secondary- one or two smaller, often partial, events at irregular
 *              earlier/later centres. Never a second copy of the primary.
 *
 * Bands stay in coherent spatial order (a directional stack, not a scatter).
 * They do not need to span the full frame; partial ranges let a slice
 * terminate against photographic structure. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanStretched, drawOverscanTranslated, getScratch } from "./compose";
import { fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";
import { clipToSequentialBand, randomWave, type WaveParams, type WavyCut } from "./wavy";

export type SliceBandRole = "held" | "advance" | "retreat" | "overlap";
export type SliceEventRank = "held" | "primary" | "secondary";

export interface SliceBand {
  role: SliceBandRole;
  rank: SliceEventRank;
  magnitudeFrac: number;
  stretchAmount: number;
  partialRange: [number, number] | null;
  alphaTiming: FragmentTiming;
  dispTiming: FragmentTiming;
}

export interface SliceState {
  cuts: WavyCut[];
  bands: SliceBand[];
}

function bandWeights(count: number, rand: () => number): number[] {
  const raw = Array.from({ length: count }, () => 0.22 + rand() * 2.4);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

function pickFarIndex(count: number, blocked: Set<number>, rand: () => number): number | null {
  const candidates: number[] = [];
  for (let i = 0; i < count; i++) {
    if (blocked.has(i)) continue;
    if (blocked.has(i - 1) || blocked.has(i + 1)) continue;
    candidates.push(i);
  }
  const pool = candidates.length > 0 ? candidates : [...Array(count).keys()].filter((i) => !blocked.has(i));
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)];
}

export function buildSliceState(fragment: number, spread: number, rhythm: number, seed: number): SliceState {
  const { count, f } = fragmentContinuum(fragment);
  const rand = mulberry32(seed);
  const spreadFrac = Math.min(1, Math.max(0, spread / 100));
  const rhythmFrac = Math.min(1, Math.max(0, rhythm / 100));
  const weights = bandWeights(count, rand);
  const cuts: WavyCut[] = [];
  let cum = 0;
  for (let i = 0; i < count - 1; i++) {
    cum += weights[i];
    const wave: WaveParams = randomWave(rand);
    const amplitudeFrac = 0.02 + rand() * 0.035;
    cuts.push({ orientation: "horizontal", pos: cum, amplitudeFrac, wave });
  }

  const timingsRand = mulberry32(seed + 104729);

  const primaryLen = Math.min(count, Math.max(2, Math.round(2 + f * 1.6)));
  const primaryStart = Math.floor(timingsRand() * Math.max(1, count - primaryLen + 1));
  const ranks: SliceEventRank[] = Array.from({ length: count }, () => "held");
  const blocked = new Set<number>();
  for (let i = 0; i < primaryLen; i++) {
    ranks[primaryStart + i] = "primary";
    blocked.add(primaryStart + i);
  }

  const secondaryCount = spreadFrac < 0.3 ? 0 : spreadFrac < 0.7 ? 1 : Math.min(2, Math.max(0, count - primaryLen));
  for (let s = 0; s < secondaryCount; s++) {
    const idx = pickFarIndex(count, blocked, timingsRand);
    if (idx === null) break;
    ranks[idx] = "secondary";
    blocked.add(idx);
  }

  const primaryCenter = 0.5 + (timingsRand() - 0.5) * 0.06;
  const secondaryCenters = [0.18 + timingsRand() * 0.08, 0.78 + (timingsRand() - 0.5) * 0.06];
  let secondarySlot = 0;

  const lag = 0.012 + rhythmFrac * 0.03;
  const bands: SliceBand[] = ranks.map((rank, i) => {
    if (rank === "held") {
      return {
        role: "held" as const,
        rank,
        magnitudeFrac: 0,
        stretchAmount: 0,
        partialRange: null,
        alphaTiming: { center: 0.5, width: 0.04 },
        dispTiming: { center: 0.5, width: 0.04 },
      };
    }

    const isPrimary = rank === "primary";
    const local = isPrimary ? i - primaryStart : 0;
    let role: SliceBandRole;
    if (isPrimary) {
      if (primaryLen === 2) role = local === 0 ? "overlap" : "advance";
      else if (local === 0) role = "retreat";
      else if (local === primaryLen - 1) role = "advance";
      else role = "overlap";
    } else {
      role = timingsRand() < 0.55 ? "retreat" : "overlap";
    }

    const center = isPrimary ? primaryCenter + (local - (primaryLen - 1) / 2) * lag : secondaryCenters[secondarySlot++ % secondaryCenters.length];
    // Primary occupies most of the transform span so named inspection
    // points (early / medium / max / return) land on the same event
    // rather than missing it. Secondaries stay short and offset.
    const width = isPrimary ? 0.42 + timingsRand() * 0.08 : 0.1 + timingsRand() * 0.06;
    const alphaTiming: FragmentTiming = { center: Math.min(0.92, Math.max(0.08, center)), width };
    const dispTiming: FragmentTiming = { center: alphaTiming.center, width: Math.min(0.45, width * (isPrimary ? 1.35 : 1.15)) };

    let partialRange: [number, number] | null = null;
    const partialChance = isPrimary ? (role === "overlap" ? 0.18 : 0.42) : 0.82;
    if (timingsRand() < partialChance) {
      const span = isPrimary ? 0.48 + timingsRand() * 0.4 : 0.28 + timingsRand() * 0.32;
      const start = timingsRand() * (1 - span);
      partialRange = [start, start + span];
    }

    return {
      role,
      rank,
      magnitudeFrac: isPrimary ? 1.05 + timingsRand() * 0.45 : 0.4 + timingsRand() * 0.3,
      stretchAmount: isPrimary ? 0.65 + timingsRand() * 0.45 : 0.3 + timingsRand() * 0.3,
      partialRange,
      alphaTiming,
      dispTiming,
    };
  });

  return { cuts, bands };
}

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
    const band = state.bands[i];
    if (band.rank === "held") continue;
    const phase = fragmentPhase(globalPhase, band.alphaTiming);
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
    case "held":
      break;
    case "advance": {
      drawOverscanStretched(cctx, aLayer, width, height, dx, dy, stretch, 1);
      drawOverscanStretched(cctx, bLayer, width, height, dx, dy, stretch, alphaPhase);
      break;
    }
    case "retreat": {
      drawOverscanStretched(cctx, aLayer, width, height, -dx, -dy, stretch, 1);
      drawOverscanStretched(cctx, bLayer, width, height, -dx, -dy, stretch, alphaPhase);
      break;
    }
    case "overlap": {
      drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 1);
      drawOverscanStretched(cctx, bLayer, width, height, dx, dy, stretch * 0.7, alphaPhase);
      break;
    }
  }
}

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
  ctx.drawImage(aLayer, 0, 0);

  const dirRad = (directionDeg * Math.PI) / 180;
  const dirX = Math.cos(dirRad);
  const dirY = Math.sin(dirRad);
  const maxDispPx = Math.min(width, height) * (0.07 + overlapFrac * 0.18);

  const content = getScratch("slice-content", width, height);
  const cctx = content.getContext("2d")!;

  for (let i = 0; i < state.bands.length; i++) {
    const band = state.bands[i];
    if (band.rank === "held") continue;
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
