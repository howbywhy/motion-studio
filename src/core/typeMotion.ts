/** Editorial type sequencing. Time only reveals already-positioned authored units.
 * Together is identity with the static layout. No kinetic effects. */
import type { TypeRole, TypeSequenceMode, TypeState } from "./typeState";
import type { TypeLayout } from "./typeLayout";

export interface TypeUnitMotion {
  opacity: number;
  dx: number;
  dy: number;
}

export interface TypeSequenceState {
  identity: boolean;
  mode: TypeSequenceMode;
  unitCount: number;
  units: TypeUnitMotion[];
}

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function smooth(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function unitCount(layout: TypeLayout): number {
  let max = 0;
  for (const line of layout.lines) max = Math.max(max, line.unit);
  return max + 1;
}

function sequenceWindow(pace: number): number {
  return lerp(0.88, 0.34, clamp01(pace / 100));
}

function arriveK(pace: number, role: TypeRole): number {
  const base = lerp(0.42, 0.2, clamp01(pace / 100));
  if (role === "editorial") return Math.min(0.55, base * 1.35);
  if (role === "caption") return Math.min(0.5, base * 1.1);
  return base;
}

function arrivalOffset(
  role: TypeRole,
  canvasW: number,
  canvasH: number,
  layout: TypeLayout,
  unit: number,
): { dx: number; dy: number } {
  const s = canvasW / 500;
  if (role === "caption") return { dx: 0, dy: 6 * s };
  if (role === "editorial") return { dx: 0, dy: 10 * s };
  if (role === "display") return { dx: 0, dy: 16 * s };
  let y = 0;
  let n = 0;
  for (const line of layout.lines) {
    if (line.unit !== unit) continue;
    y += line.y;
    n += 1;
  }
  const cy = n > 0 ? y / n : canvasH * 0.5;
  const mag = 18 * s;
  return { dx: 0, dy: cy < canvasH * 0.5 ? -mag : mag };
}

function rest(): TypeUnitMotion {
  return { opacity: 1, dx: 0, dy: 0 };
}

function hidden(): TypeUnitMotion {
  return { opacity: 0, dx: 0, dy: 0 };
}

function arriving(u: number, off: { dx: number; dy: number }): TypeUnitMotion {
  const e = smooth(u);
  return {
    opacity: e,
    dx: off.dx * (1 - e),
    dy: off.dy * (1 - e),
  };
}

function staggerUnits(
  p: number,
  n: number,
  W: number,
  k: number,
  offs: { dx: number; dy: number }[],
): TypeUnitMotion[] {
  const slot = W / n;
  const dur = Math.max(0.04, slot * k);
  const out: TypeUnitMotion[] = [];
  for (let i = 0; i < n; i++) {
    const start = i * slot;
    if (i === 0 || p >= W || p >= start + dur) out.push(rest());
    else if (p <= start) out.push(hidden());
    else out.push(arriving((p - start) / dur, offs[i]!));
  }
  return out;
}

function holdUnits(
  p: number,
  n: number,
  k: number,
  offs: { dx: number; dy: number }[],
): TypeUnitMotion[] {
  const slot = 1 / n;
  const fade = Math.max(0.03, slot * k);
  const out: TypeUnitMotion[] = [];
  for (let i = 0; i < n; i++) {
    const start = i * slot;
    const end = (i + 1) * slot;
    if (p < start || p >= end) {
      out.push(hidden());
      continue;
    }
    const into = i === 0 ? 1 : smooth((p - start) / fade);
    const leave = i === n - 1 ? 1 : smooth((end - p) / fade);
    const vis = Math.min(into, leave);
    if (i === 0 || vis >= 0.999) out.push({ opacity: vis, dx: 0, dy: 0 });
    else {
      const a = arriving(into, offs[i]!);
      out.push({ opacity: vis, dx: a.dx, dy: a.dy });
    }
  }
  return out;
}

function alternateUnits(
  p: number,
  n: number,
  W: number,
  k: number,
  offs: { dx: number; dy: number }[],
): TypeUnitMotion[] {
  const beats = n + 1;
  const slot = W / beats;
  const dur = Math.max(0.04, slot * k);
  if (p >= W) return Array.from({ length: n }, rest);
  const beat = Math.min(beats - 1, Math.floor(p / slot));
  const local = p - beat * slot;
  const out: TypeUnitMotion[] = [];
  for (let i = 0; i < n; i++) {
    const exclusive = beat < n && beat === i;
    const resolve = beat === n;
    const on = exclusive || resolve;
    if (!on) {
      out.push(hidden());
      continue;
    }
    if (local >= dur) out.push(rest());
    else if (resolve && i === n - 1) out.push(rest());
    else out.push(arriving(local / dur, offs[i]!));
  }
  return out;
}

export function evaluateTypeSequence(
  state: TypeState,
  layout: TypeLayout,
  loopPhase: number,
): TypeSequenceState {
  const n = unitCount(layout);
  const mode = n <= 1 ? "together" : state.typeSequenceMode;
  if (mode === "together") {
    return {
      identity: true,
      mode: "together",
      unitCount: n,
      units: Array.from({ length: Math.max(1, n) }, rest),
    };
  }
  const p = ((loopPhase % 1) + 1) % 1;
  const role = layout.composition;
  const W = sequenceWindow(state.typeSequencePace);
  const k = arriveK(state.typeSequencePace, role);
  const offs = Array.from({ length: n }, (_, i) =>
    arrivalOffset(role, layout.canvasW, layout.canvasH, layout, i),
  );
  const units =
    mode === "stagger" ? staggerUnits(p, n, W, k, offs) :
    mode === "hold" ? holdUnits(p, n, k, offs) :
    alternateUnits(p, n, W, k, offs);
  return { identity: false, mode, unitCount: n, units };
}
