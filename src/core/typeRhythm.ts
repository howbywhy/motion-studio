import { layoutTypeDocument, layoutTypography, typeInkBox, type TypeLayout } from "./typeLayout";
import {
  TYPE_ANCHORS,
  type TypeAnchor,
  type TypeBlock,
  type TypeState,
} from "./typeState";

/** Each transition is a short punctuation. Holds consume the rest of the loop.
 * The return to Position 01 is the loop seam (frame 0), not a travelled path —
 * Flicker therefore interrupts the last settled composition. */
const MOVE_TWO = 0.08;
const MOVE_THREE = 0.07;

export interface TypeRhythmSample {
  fromIndex: number;
  toIndex: number;
  from: TypeAnchor;
  to: TypeAnchor;
  t: number;
  region: "hold" | "move";
}

interface Seg {
  kind: "hold" | "move";
  from: number;
  to: number;
  start: number;
  end: number;
}

function parseAnchor(raw: unknown, fallback: TypeAnchor): TypeAnchor {
  if (typeof raw === "string" && (TYPE_ANCHORS as string[]).includes(raw)) return raw as TypeAnchor;
  return fallback;
}

export function oppositeAnchor(anchor: TypeAnchor): TypeAnchor {
  const row = anchor[0] === "t" ? "b" : anchor[0] === "b" ? "t" : "m";
  const col = anchor[1] === "l" ? "r" : anchor[1] === "r" ? "l" : "c";
  if (row === "m" && col === "c") return "bc";
  return `${row}${col}` as TypeAnchor;
}

export function clampRhythmStops(raw: unknown, home: TypeAnchor): TypeAnchor[] {
  const list = Array.isArray(raw) ? raw.map((item, i) => parseAnchor(item, i === 0 ? home : oppositeAnchor(home))) : [];
  const stops: TypeAnchor[] = [home];
  for (const a of list.slice(1)) {
    if (stops.length >= 3) break;
    stops.push(a);
  }
  return stops;
}

export function typeRhythmEnabled(block: TypeBlock): boolean {
  return block.positionRhythm === true;
}

export function typeRhythmMoving(block: TypeBlock): boolean {
  return typeRhythmEnabled(block) && clampRhythmStops(block.positionRhythmStops, block.anchor).length >= 2;
}

function segmentsFor(n: number): Seg[] {
  if (n < 2) return [{ kind: "hold", from: 0, to: 0, start: 0, end: 1 }];
  const segs: { kind: "hold" | "move"; from: number; to: number; dur: number }[] = [];
  if (n === 2) {
    segs.push({ kind: "hold", from: 0, to: 0, dur: 0.34 });
    segs.push({ kind: "move", from: 0, to: 1, dur: MOVE_TWO });
    segs.push({ kind: "hold", from: 1, to: 1, dur: 1 - 0.34 - MOVE_TWO });
  } else {
    segs.push({ kind: "hold", from: 0, to: 0, dur: 0.24 });
    segs.push({ kind: "move", from: 0, to: 1, dur: MOVE_THREE });
    segs.push({ kind: "hold", from: 1, to: 1, dur: 0.26 });
    segs.push({ kind: "move", from: 1, to: 2, dur: MOVE_THREE });
    segs.push({ kind: "hold", from: 2, to: 2, dur: 1 - 0.24 - 0.26 - MOVE_THREE * 2 });
  }
  let t = 0;
  return segs.map((s) => {
    const start = t;
    t += s.dur;
    return { kind: s.kind, from: s.from, to: s.to, start, end: t };
  });
}

export function typeRhythmStaticFrac(stopCount: number): number {
  const n = Math.min(3, Math.max(1, stopCount));
  if (n < 2) return 1;
  return segmentsFor(n).reduce((s, seg) => s + (seg.kind === "hold" ? seg.end - seg.start : 0), 0);
}

export function sampleTypeRhythm(phase: number, stops: TypeAnchor[]): TypeRhythmSample {
  const list = Array.isArray(stops) && stops.length > 0 ? stops : ["mc" as TypeAnchor];
  const n = list.length;
  const p = !(phase > 0) || phase >= 1 ? 0 : phase;
  const segs = segmentsFor(n);
  const hit = segs.find((s) => p < s.end) ?? segs[segs.length - 1]!;
  const span = Math.max(1e-9, hit.end - hit.start);
  const local = (p - hit.start) / span;
  const t = hit.kind === "move" ? Math.min(1, Math.max(0, local)) : 0;
  return {
    fromIndex: hit.from,
    toIndex: hit.to,
    from: list[Math.min(hit.from, list.length - 1)]!,
    to: list[Math.min(hit.to, list.length - 1)]!,
    t,
    region: hit.kind,
  };
}

function lerpLayout(a: TypeLayout, b: TypeLayout, t: number): TypeLayout {
  if (t <= 0 || a.lines.length !== b.lines.length) return a;
  if (t >= 1) return b;
  return {
    ...a,
    lines: a.lines.map((line, i) => ({
      ...line,
      x: line.x + (b.lines[i]!.x - line.x) * t,
      y: line.y + (b.lines[i]!.y - line.y) * t,
    })),
  };
}

function layoutAtAnchor(block: TypeBlock, canvasW: number, canvasH: number, slot: 0 | 1, anchor: TypeAnchor): TypeLayout | null {
  if (anchor === block.anchor) return layoutTypography(block, canvasW, canvasH, slot);
  return layoutTypography({ ...block, anchor }, canvasW, canvasH, slot);
}

export function layoutTypeDocumentAtPhase(
  state: TypeState,
  canvasW: number,
  canvasH: number,
  phase: number,
): { index: 0 | 1; layout: TypeLayout }[] {
  if (!state.enabled) return [];
  if (!state.blocks[0].positionRhythm && !state.blocks[1].positionRhythm) {
    return layoutTypeDocument(state, canvasW, canvasH);
  }
  const out: { index: 0 | 1; layout: TypeLayout }[] = [];
  for (const index of [0, 1] as const) {
    const block = state.blocks[index];
    if (!block.enabled || !block.text.trim()) continue;
    if (!typeRhythmMoving(block)) {
      const layout = layoutTypography(block, canvasW, canvasH, index);
      if (layout) out.push({ index, layout });
      continue;
    }
    const stops = clampRhythmStops(block.positionRhythmStops, block.anchor);
    const sample = sampleTypeRhythm(phase, stops);
    let layout: TypeLayout | null;
    if (sample.region === "hold" || sample.t <= 0) {
      layout = layoutAtAnchor(block, canvasW, canvasH, index, sample.from);
    } else if (sample.t >= 1) {
      layout = layoutAtAnchor(block, canvasW, canvasH, index, sample.to);
    } else {
      const a = layoutAtAnchor(block, canvasW, canvasH, index, sample.from);
      const b = layoutAtAnchor(block, canvasW, canvasH, index, sample.to);
      layout = a && b ? lerpLayout(a, b, sample.t) : a;
    }
    if (layout) out.push({ index, layout });
  }
  return out;
}

export function typeInvariantKey(layout: TypeLayout): string {
  return [
    layout.fontSize.toFixed(4),
    layout.tracking.toFixed(4),
    layout.weight,
    layout.lineHeight.toFixed(4),
    layout.lines.map((l) => `${l.text}:${l.unit}:${l.width.toFixed(3)}:${l.height.toFixed(3)}`).join("|"),
  ].join("\t");
}

export function typeOverflowsOptical(layout: TypeLayout, canvasW: number, canvasH: number, frame: number): boolean {
  const box = typeInkBox(layout);
  const eps = 0.51;
  return box.l < frame - eps || box.t < frame - eps || box.r > canvasW - frame + eps || box.b > canvasH - frame + eps;
}
