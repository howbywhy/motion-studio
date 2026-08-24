/** DIFFUSE: A and B bleed into one another through a continuous, unstable
 * field rather than any discrete shape — many small soft irregular cells
 * whose own reveal timing is derived from where they sit along Direction,
 * so overlapping them produces a genuine traveling front of instability
 * (not independent popcorn blobs, and not a flat directional wipe: each
 * cell still has its own seeded timing jitter). Cells are wobbly polygons
 * (the same organic-boundary language Slice and Drift use), not circles —
 * a circular soft-edged field is Bloom's own visual signature, and this
 * needs to read as a different, more structured kind of instability. A
 * slight registration offset between where A fades and where B fades in —
 * rather than a plain crossfade — is what keeps this reading as
 * photographic information changing state instead of a blur/dissolve. */
import { mulberry32 } from "../../core/rng";
import { applyGrain, blurInto, drawOverscanTranslated, getScratch } from "./compose";
import { fragmentContinuum, fragmentPhase, type FragmentTiming, type GlobalPhase } from "./timing";

interface CellShape {
  freq: number; // lobes around the cell outline
  phaseOffset: number;
  wobble: number; // 0..1 relative radius variation
}

export interface DiffuseCell {
  x: number;
  y: number;
  radius: number;
  shape: CellShape;
  timing: FragmentTiming;
}

export interface DiffuseState {
  cells: DiffuseCell[];
}

export function buildDiffuseState(fragment: number, directionDeg: number, spread: number, rhythm: number, seed: number): DiffuseState {
  const { count } = fragmentContinuum(fragment);
  const rand = mulberry32(seed);
  const dirRad = (directionDeg * Math.PI) / 180;
  const dirX = Math.cos(dirRad);
  const dirY = Math.sin(dirRad);

  const raw = Array.from({ length: count }, () => {
    const x = rand();
    const y = rand();
    return { x, y, proj: x * dirX + y * dirY };
  });
  const projs = raw.map((r) => r.proj);
  const minP = Math.min(...projs);
  const maxP = Math.max(...projs);
  const range = Math.max(1e-6, maxP - minP);

  const spreadFrac = Math.min(1, Math.max(0, spread / 100));
  const rhythmFrac = Math.min(1, Math.max(0, rhythm / 100));
  const densityScale = Math.sqrt(Math.max(1, count) / 6);

  const cells: DiffuseCell[] = raw.map((r) => {
    const normalizedProj = (r.proj - minP) / range;
    const center0 = 0.5 + (normalizedProj - 0.5) * spreadFrac;
    const jitter = (rand() - 0.5) * (0.06 + rhythmFrac * 0.24);
    const center = Math.min(0.96, Math.max(0.04, center0 + jitter));
    const width = Math.min(0.5, Math.max(0.14, 0.32 - rhythmFrac * 0.1 + rand() * 0.14));
    const radius = (0.19 + rand() * 0.22) / densityScale;
    const shape: CellShape = { freq: 2 + Math.floor(rand() * 2), phaseOffset: rand() * Math.PI * 2, wobble: 0.1 + rand() * 0.14 };
    return { x: r.x, y: r.y, radius, shape, timing: { center, width } };
  });
  return { cells };
}

function tracePolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, baseR: number, shape: CellShape, segments = 14): void {
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const r = baseR * (1 + shape.wobble * Math.sin(t * shape.freq + shape.phaseOffset));
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function paintPhaseField(ctx: CanvasRenderingContext2D, width: number, height: number, state: DiffuseState, globalPhase: GlobalPhase, sizeFrac: number): number {
  ctx.fillStyle = "#ffffff";
  let activitySum = 0;
  let activityCount = 0;
  for (const cell of state.cells) {
    const phase = fragmentPhase(globalPhase, cell.timing);
    activitySum += phase;
    activityCount++;
    if (phase <= 0.003) continue;
    const cx = cell.x * width;
    const cy = cell.y * height;
    const r = cell.radius * Math.min(width, height) * (0.75 + sizeFrac * 0.7);
    ctx.globalAlpha = phase;
    ctx.beginPath();
    tracePolygon(ctx, cx, cy, r, cell.shape);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return activityCount > 0 ? activitySum / activityCount : 0;
}

let cachedActivity = 0;

export function renderDiffusePhaseField(
  targetCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DiffuseState,
  globalPhase: GlobalPhase,
  overlapFrac: number,
  blurPx: number
): void {
  const scratch = getScratch("diffuse-field", width, height);
  const sctx = scratch.getContext("2d")!;
  sctx.clearRect(0, 0, width, height);
  cachedActivity = paintPhaseField(sctx, width, height, state, globalPhase, overlapFrac);
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

  // A slight registration offset for B, peaking while the field is most
  // active overall -- this is what keeps a blend zone from reading as a
  // flat crossfade, more like two prints briefly out of register.
  const rad = (directionDeg * Math.PI) / 180;
  const offsetPx = (2 + cachedActivity * 6) * Math.min(width, height) * 0.006;
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
