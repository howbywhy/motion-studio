import { layoutTypeDocument } from "./typeLayout";
import { paintTypeLayer, paintTypeStamp } from "./typePaint";
import { activeTypeBlocks, type TypeState } from "./typeState";

/**
 * Duplicate Rhythm — one authored graphic-layer behaviour.
 *
 * A finished type block is flattened into a stamp, then reproduced.
 * This is not Position Rhythm (one object changing Frame Align).
 * Future marks/logos can feed the same stamp + instance sampler.
 */

/** Authored product count: original + two duplicates. */
export const DUPLICATE_COUNT = 3;

export interface DuplicateInstance {
  id: number;
  dx: number;
  dy: number;
  visible: boolean;
}

function wrapPhase(phase: number): number {
  return !(phase > 0) || phase >= 1 ? 0 : phase;
}

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function along(
  p: number,
  t0: number,
  t1: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const t = t1 <= t0 ? 1 : clamp01((p - t0) / (t1 - t0));
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

/** Which block, if any, is a live graphic source this frame. */
export function duplicateSourceIndex(state: TypeState): 0 | 1 | null {
  if (!state.enabled || state.duplicateRhythm !== true) return null;
  const want: 0 | 1 = state.duplicateRhythmSource === 1 ? 1 : 0;
  const block = state.blocks[want];
  if (!block.enabled || !block.text.trim()) return null;
  return want;
}

/**
 * Instance grammar (count 3):
 *   0.00–0.20  source only
 *   0.20       duplicate 1 appears offset (hard)
 *   0.20–0.32  1 travels (source holds)
 *   0.32–0.46  hold two-up
 *   0.46       duplicate 2 appears (hard)
 *   0.46–0.60  both copies reposition
 *   0.60–1.00  hold three-up through Flicker
 *
 * Source (id 0) never leaves its authored position.
 */
export function sampleDuplicateRhythm(
  phase: number,
  canvasW: number,
  canvasH: number,
  count = DUPLICATE_COUNT,
): DuplicateInstance[] {
  const p = wrapPhase(phase);
  const n = Math.min(4, Math.max(1, Math.round(count)));
  const w = canvasW;
  const h = canvasH;

  const d1a = { x: 0.04 * w, y: 0.28 * h };
  const d1b = { x: 0.58 * w, y: 0.04 * h };
  const d1c = { x: 0.16 * w, y: 0.32 * h };
  const d2a = { x: 0.42 * w, y: -0.22 * h };
  const d2b = { x: -0.1 * w, y: 0.48 * h };
  const d3a = { x: -0.7 * w, y: 0.1 * h };
  const d3b = { x: 0.28 * w, y: -0.14 * h };

  const out: DuplicateInstance[] = [{ id: 0, dx: 0, dy: 0, visible: true }];
  if (n < 2) return out;

  let d1 = d1a;
  if (p >= 0.2 && p < 0.32) d1 = along(p, 0.2, 0.32, d1a, d1b);
  else if (p >= 0.32 && p < 0.46) d1 = d1b;
  else if (p >= 0.46 && p < 0.6) d1 = along(p, 0.46, 0.6, d1b, d1c);
  else if (p >= 0.6) d1 = d1c;
  out.push({ id: 1, dx: d1.x, dy: d1.y, visible: p >= 0.2 });

  if (n >= 3) {
    let d2 = d2a;
    if (p >= 0.46 && p < 0.6) d2 = along(p, 0.46, 0.6, d2a, d2b);
    else if (p >= 0.6) d2 = d2b;
    out.push({ id: 2, dx: d2.x, dy: d2.y, visible: p >= 0.46 });
  }

  if (n >= 4) {
    let d3 = d3a;
    if (p >= 0.46 && p < 0.6) d3 = along(p, 0.46, 0.6, d3a, d3b);
    else if (p >= 0.6) d3 = d3b;
    out.push({ id: 3, dx: d3.x, dy: d3.y, visible: p >= 0.46 });
  }

  return out;
}

export function paintTypeDocument(
  dest: CanvasRenderingContext2D,
  state: TypeState,
  canvasW: number,
  canvasH: number,
  phase: number,
  count = DUPLICATE_COUNT,
): void {
  if (!state.enabled) return;
  const laid = layoutTypeDocument(state, canvasW, canvasH);
  if (laid.length === 0) return;

  const source = duplicateSourceIndex(state);
  if (source === null) {
    for (const item of laid) {
      paintTypeLayer(dest, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
    }
    return;
  }

  const instances = sampleDuplicateRhythm(phase, canvasW, canvasH, count);
  for (const item of laid) {
    if (item.index !== source) {
      paintTypeLayer(dest, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
      continue;
    }
    paintTypeLayer(dest, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
    for (const inst of instances) {
      if (inst.id === 0 || !inst.visible) continue;
      paintTypeStamp(
        dest,
        item.layout,
        item.layout.color,
        item.layout.opacity,
        item.index,
        inst.dx,
        inst.dy,
      );
    }
  }
}

export function duplicateRhythmActive(state: TypeState): boolean {
  return duplicateSourceIndex(state) !== null && activeTypeBlocks(state).length > 0;
}
