/** COMPAT — typography motion. Product UI is static; Renderer does not call this. */
import type { TypeInMotion, TypeOutMotion, TypeMotionKind, TypeState } from "./typeState";

export interface TypeLineMotion {
  dx: number;
  dy: number;
  opacity: number;
  clipT: number;
  weight: number;
}

export interface TypeMotionState {
  visible: boolean;
  lines: TypeLineMotion[];
  weight: number;
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

function lineProgress(global: number, index: number, count: number, stagger: number): number {
  if (count <= 1 || stagger <= 0.5) return clamp01(global);
  const span = 0.18 + (stagger / 100) * 0.62;
  const start = (index / Math.max(1, count - 1)) * span;
  const dur = 1 - span;
  return clamp01((global - start) / Math.max(0.12, dur));
}

function inOffsets(
  kind: TypeInMotion,
  u: number,
  index: number,
  fontSize: number,
  canvasW: number,
): { dx: number; dy: number; clip: number } {
  const e = 1 - smooth(u);
  if (kind === "none") return { dx: 0, dy: 0, clip: 1 };
  if (kind === "rise") return { dx: 0, dy: fontSize * 0.55 * e, clip: 1 };
  if (kind === "slide") return { dx: canvasW * 0.08 * (index % 2 === 0 ? -1 : 1) * e, dy: 0, clip: 1 };
  if (kind === "reveal") return { dx: 0, dy: fontSize * 0.08 * e, clip: smooth(u) };
  const assembleX = canvasW * 0.06 * (index % 2 === 0 ? -1 : 1) * e;
  const assembleY = fontSize * 0.22 * (index % 3 === 1 ? -1 : 1) * e;
  return { dx: assembleX, dy: assembleY, clip: 1 };
}

function outOffsets(
  kind: TypeOutMotion,
  u: number,
  index: number,
  fontSize: number,
  canvasW: number,
): { dx: number; dy: number; clip: number } {
  const e = smooth(u);
  if (kind === "none") return { dx: 0, dy: 0, clip: 1 };
  if (kind === "rise") return { dx: 0, dy: -fontSize * 0.45 * e, clip: 1 };
  if (kind === "slide") return { dx: canvasW * 0.07 * (index % 2 === 0 ? 1 : -1) * e, dy: 0, clip: 1 };
  if (kind === "reveal") return { dx: 0, dy: -fontSize * 0.06 * e, clip: 1 - e };
  return { dx: canvasW * 0.05 * (index % 2 === 0 ? -1 : 1) * e, dy: fontSize * 0.18 * e, clip: 1 };
}

function weightFor(
  kind: TypeMotionKind,
  base: number,
  inU: number | null,
  outU: number | null,
): number {
  if (kind === "position") return base;
  const delta = Math.min(140, Math.max(40, base * 0.18));
  if (inU !== null && inU < 1) {
    const from = Math.max(100, base - delta);
    return from + (base - from) * smooth(inU);
  }
  if (outU !== null && outU > 0) {
    const to = Math.max(100, base - delta * 0.75);
    return base + (to - base) * smooth(outU);
  }
  return base;
}

export function evaluateTypeMotion(
  state: TypeState,
  loopPhase: number,
  loopSeconds: number,
  lineCount: number,
  fontSize: number,
  canvasW: number,
): TypeMotionState {
  const n = Math.max(1, lineCount);
  if (!state.enabled) {
    return { visible: false, lines: [], weight: state.weight };
  }

  const inP = Math.min(state.inPoint, state.outPoint) / 100;
  const outP = Math.max(state.inPoint, state.outPoint) / 100;
  const inDur = Math.min(state.inDuration / Math.max(0.2, loopSeconds), Math.max(0.02, outP - inP) * 0.48);
  const outDur = Math.min(state.outDuration / Math.max(0.2, loopSeconds), Math.max(0.02, outP - inP) * 0.48);

  const p = ((loopPhase % 1) + 1) % 1;
  if (p < inP || p > outP) {
    return { visible: false, lines: [], weight: state.weight };
  }

  let inGlobal: number | null = null;
  let outGlobal: number | null = null;
  if (p < inP + inDur) inGlobal = (p - inP) / Math.max(0.0001, inDur);
  else if (p > outP - outDur) outGlobal = (p - (outP - outDur)) / Math.max(0.0001, outDur);

  const pos = state.typeMotion !== "variable";
  const lines: TypeLineMotion[] = [];
  let usedWeight = state.weight;

  for (let i = 0; i < n; i++) {
    const iu = inGlobal === null ? 1 : lineProgress(inGlobal, i, n, state.stagger);
    const ou = outGlobal === null ? 0 : lineProgress(outGlobal, i, n, state.stagger);
    const inn = inOffsets(state.inMotion, iu, i, fontSize, canvasW);
    const out = outOffsets(state.outMotion, ou, i, fontSize, canvasW);
    const dx = pos ? inn.dx + out.dx : 0;
    const dy = pos ? inn.dy + out.dy : 0;
    const clipT = Math.min(inn.clip, out.clip);
    const fadeIn = state.inMotion === "none" ? 1 : 0.35 + 0.65 * iu;
    const fadeOut = state.outMotion === "none" ? 1 : 1 - ou * 0.85;
    const w = weightFor(state.typeMotion, state.weight, inGlobal === null ? 1 : iu, outGlobal === null ? null : ou);
    lines.push({
      dx,
      dy,
      opacity: Math.max(0, Math.min(1, fadeIn * fadeOut)),
      clipT,
      weight: w,
    });
    usedWeight = w;
  }

  return { visible: true, lines, weight: usedWeight };
}
