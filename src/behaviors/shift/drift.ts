/** DRIFT: the photograph's own physical registration has failed. This is
 * judged purely on the resulting image, not on how differentiated the code
 * is internally — so the mechanic itself has to stop being "duplicate +
 * offset + transparency + repetition" (that's what made an earlier pass
 * still read as Slice's technique on different geometry). Almost every
 * fragment here paints A and B under the exact SAME spatial transform (one
 * translate/stretch/compress, B laid on top at rising alpha) — there is
 * only ONE spatial thing happening per fragment, whose content happens to
 * be cross-fading, not two offset ghosts coexisting. The single deliberate
 * exception is "retain", which is explicitly ABOUT a fragment partially
 * keeping its previous position.
 *
 * Each fragment is permanently assigned one of seven kinds at build time —
 * directly the seven states the brief asks for:
 *   anchored  - remains anchored; barely moves.
 *   translate - a decisive, opaque slide to a new position.
 *   stretch   - deforms anisotropically between where it was and where
 *               it's going, rather than staying rigid while it slides.
 *   compress  - squeezes inward around its own territory, revealing the
 *               real, correctly-registered photograph in the gap it
 *               leaves behind.
 *   drag      - a continuous directional smear (one elongated draw faded
 *               out toward its trailing edge via a gradient), not a stack
 *               of discrete offset copies.
 *   overshoot - its displacement briefly bulges past where it eventually
 *               settles, then eases back — a sprung, physical overreach.
 *   retain    - partially keeps its previous position: a faint trace left
 *               at the origin underneath a decisive, mostly-opaque piece
 *               that has moved on.
 *
 * Critically, this is NOT "more fragments doing more things" — it's a
 * HIERARCHY. One or two fragments per state are picked as dominant and get
 * the large, dramatic distortions (translate/stretch/compress/drag/
 * overshoot at real magnitude); everything else stays quiet (mostly
 * anchored, occasionally a faint retain or a barely-there translate). The
 * goal is an otherwise coherent photograph with one or two genuinely
 * impossible spatial contradictions in it, not many fragments each nudged
 * a little. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanStretched, drawOverscanTranslated, drawScaled, getScratch } from "./compose";
import { distributeFragmentTimings, fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";
import { buildWavyPartition, clipToWavyRegion, type WavyCut } from "./wavy";

export type DriftFragmentKind = "anchored" | "translate" | "stretch" | "compress" | "drag" | "overshoot" | "retain";

// The quiet majority: mostly genuinely still, a little faint retention, a
// rare barely-there slide -- this is what keeps the rest of the photograph
// reading as coherent while one or two fragments elsewhere misbehave.
const QUIET_KIND_WEIGHTS: [DriftFragmentKind, number][] = [
  ["anchored", 0.62],
  ["retain", 0.22],
  ["translate", 0.16],
];

// The dramatic pool: only the fragments chosen as dominant draw from this.
const DOMINANT_KIND_WEIGHTS: [DriftFragmentKind, number][] = [
  ["translate", 0.22],
  ["stretch", 0.22],
  ["compress", 0.18],
  ["drag", 0.2],
  ["overshoot", 0.18],
];

function pickWeighted<T extends string>(rand: () => number, weights: [T, number][]): T {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [kind, w] of weights) {
    if (r < w) return kind;
    r -= w;
  }
  return weights[weights.length - 1][0];
}

export interface DriftFragment {
  kind: DriftFragmentKind;
  dominant: boolean;
  angleJitterDeg: number;
  magnitudeFrac: number;
  stretchAmount: number;
  compressAmount: number;
  timing: FragmentTiming;
}

export interface DriftState {
  cuts: WavyCut[];
  fragments: DriftFragment[];
}

const BASE_DRIFT_FRAC = 0.13;
const DOMINANT_REACH = 2.6;
const QUIET_REACH = 0.35;

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

  // Hierarchy: pick one or two fragments (never more) to carry the whole
  // drift for this state.
  const domCount = count >= 3 ? (fragRand() < 0.45 ? 1 : 2) : 1;
  const domIndices = new Set<number>();
  while (domIndices.size < Math.min(domCount, count)) {
    domIndices.add(Math.floor(fragRand() * count));
  }

  const fragments: DriftFragment[] = timings.map((timing, i) => {
    const dominant = domIndices.has(i);
    const kind = dominant ? pickWeighted(fragRand, DOMINANT_KIND_WEIGHTS) : pickWeighted(fragRand, QUIET_KIND_WEIGHTS);
    return {
      kind,
      dominant,
      angleJitterDeg: (fragRand() - 0.5) * 70,
      magnitudeFrac: dominant ? 1.1 + fragRand() * 0.7 : 0.25 + fragRand() * 0.35,
      stretchAmount: 0.7 + fragRand() * 0.9,
      compressAmount: 0.35 + fragRand() * 0.3,
      timing,
    };
  });
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

/** Fades a stretched trail out toward its trailing edge via a linear alpha
 * gradient — a continuous smear, not a stack of discrete offset copies. */
function applyDragFade(cctx: CanvasRenderingContext2D, width: number, height: number, dx: number, dy: number): void {
  cctx.save();
  cctx.globalCompositeOperation = "destination-in";
  const grad = cctx.createLinearGradient(width / 2 - dx * 1.3, height / 2 - dy * 1.3, width / 2 + dx * 0.5, height / 2 + dy * 0.5);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,1)");
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, width, height);
  cctx.globalCompositeOperation = "source-over";
  cctx.restore();
}

/** Builds one fragment's clipped, masked, blurred+grained content and
 * composites it onto ctx at `alpha`. The mask (the fragment's own
 * territory) is offset by (offsetX, offsetY) — for most kinds this moves
 * together with the content, so the fragment's whole silhouette appears to
 * have relocated; for "compress" it stays put while its content shrinks
 * inside it. */
function compositeFragment(
  ctx: CanvasRenderingContext2D,
  cuts: WavyCut[],
  index: number,
  width: number,
  height: number,
  blurPx: number,
  offsetX: number,
  offsetY: number,
  alpha: number,
  paint: (cctx: CanvasRenderingContext2D) => void
): void {
  const mask = getScratch("drift-mask", width, height);
  const mctx = mask.getContext("2d")!;
  mctx.clearRect(0, 0, width, height);
  mctx.save();
  mctx.translate(offsetX, offsetY);
  mctx.fillStyle = "#ffffff";
  clipToWavyRegion(mctx, cuts, index, width, height);
  mctx.fillRect(-width * 2, -height * 2, width * 5, height * 5);
  mctx.restore();

  const content = getScratch("drift-content", width, height);
  const cctx = content.getContext("2d")!;
  cctx.clearRect(0, 0, width, height);
  paint(cctx);
  cctx.save();
  cctx.globalCompositeOperation = "destination-in";
  cctx.filter = blurPx > 0.4 ? `blur(${blurPx}px)` : "none";
  cctx.drawImage(mask, 0, 0);
  cctx.filter = "none";
  cctx.globalCompositeOperation = "source-over";
  cctx.restore();
  applyGrain(cctx, width, height);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(content, 0, 0);
  ctx.restore();
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
  // Full-bleed A underneath every fragment paint: this is also what makes
  // "compress" safe -- a fragment that shrinks inward and leaves a gap in
  // its own mask reveals correctly-registered A there, never a hole.
  ctx.drawImage(aLayer, 0, 0);

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

    const reach = frag.dominant ? DOMINANT_REACH : QUIET_REACH;
    const baseDrift = Math.min(width, height) * BASE_DRIFT_FRAC * frag.magnitudeFrac * reach;
    const rad = ((directionDeg + frag.angleJitterDeg) * Math.PI) / 180;
    const dx = Math.cos(rad) * baseDrift * phase;
    const dy = Math.sin(rad) * baseDrift * phase;
    const alphaDim = 1 - overlapFrac * 0.25 * phase;

    switch (frag.kind) {
      case "anchored": {
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, 0, 0, alphaDim, (cctx) => {
          drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 1);
          drawOverscanTranslated(cctx, bLayer, width, height, 0, 0, phase);
        });
        break;
      }
      case "translate": {
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, dx, dy, alphaDim, (cctx) => {
          drawOverscanTranslated(cctx, aLayer, width, height, dx, dy, 1);
          drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, phase);
        });
        break;
      }
      case "stretch": {
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, dx, dy, alphaDim, (cctx) => {
          drawOverscanStretched(cctx, aLayer, width, height, dx, dy, frag.stretchAmount, 1);
          drawOverscanStretched(cctx, bLayer, width, height, dx, dy, frag.stretchAmount, phase);
        });
        break;
      }
      case "compress": {
        const scale = Math.max(0.3, 1 - frag.compressAmount * phase);
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, 0, 0, alphaDim, (cctx) => {
          drawScaled(cctx, aLayer, width, height, scale, 1);
          drawScaled(cctx, bLayer, width, height, scale, phase);
        });
        break;
      }
      case "drag": {
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, dx, dy, alphaDim, (cctx) => {
          drawOverscanStretched(cctx, aLayer, width, height, dx, dy, frag.stretchAmount * 1.5, 1);
          drawOverscanStretched(cctx, bLayer, width, height, dx, dy, frag.stretchAmount * 1.5, phase);
          applyDragFade(cctx, width, height, dx, dy);
        });
        break;
      }
      case "overshoot": {
        // Displacement briefly bulges past its own steady value, then
        // eases back through the same curve on the way out -- a sprung,
        // physical overreach rather than a rigid slide.
        const overshootMul = 1 + 0.55 * Math.sin(phase * Math.PI);
        const odx = dx * overshootMul;
        const ody = dy * overshootMul;
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, odx, ody, alphaDim, (cctx) => {
          drawOverscanTranslated(cctx, aLayer, width, height, odx, ody, 1);
          drawOverscanTranslated(cctx, bLayer, width, height, odx, ody, phase);
        });
        break;
      }
      case "retain": {
        // The one deliberate exception to "single transform" -- this kind
        // is explicitly ABOUT partially keeping a previous position, so it
        // gets two passes: a faint trace left at the origin, and a
        // decisive, mostly-opaque piece that has moved on.
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, 0, 0, 0.4 * alphaDim, (cctx) => {
          drawOverscanTranslated(cctx, aLayer, width, height, 0, 0, 1);
          drawOverscanTranslated(cctx, bLayer, width, height, 0, 0, phase * 0.45);
        });
        compositeFragment(ctx, state.cuts, i, width, height, blurPx, dx, dy, 0.92 * alphaDim, (cctx) => {
          drawOverscanTranslated(cctx, aLayer, width, height, dx, dy, 1);
          drawOverscanTranslated(cctx, bLayer, width, height, dx, dy, phase);
        });
        break;
      }
    }
  }
}
