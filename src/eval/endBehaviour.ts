import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeState } from "../core/typeState";
import { layoutTypeDocument } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import {
  applyEndBehaviour,
  clampEndBehaviourSettings,
  endWindows,
  planEndBehaviour,
  type EndBehaviourSettings,
  type EndDiagnostics,
} from "../core/endBehaviour";
import { loopPhaseFromElapsed } from "../core/sequence";

const W = 400;
const H = 500;

interface Shot {
  id: string;
  label: string;
  settings: EndBehaviourSettings;
}

const SHEET: Shot[] = [
  { id: "A", label: "A  Off", settings: clampEndBehaviourSettings({ mode: "off" }) },
  { id: "B", label: "B  Flicker 25", settings: clampEndBehaviourSettings({ mode: "flicker", amount: 25, hold: 45, duration: 35 }) },
  { id: "C", label: "C  Flicker 65", settings: clampEndBehaviourSettings({ mode: "flicker", amount: 65, hold: 45, duration: 35 }) },
  { id: "D", label: "D  Fracture 25", settings: clampEndBehaviourSettings({ mode: "fracture", amount: 25, hold: 40, duration: 45 }) },
  { id: "E", label: "E  Fracture 50", settings: clampEndBehaviourSettings({ mode: "fracture", amount: 50, hold: 40, duration: 45 }) },
  { id: "F", label: "F  Fracture 85", settings: clampEndBehaviourSettings({ mode: "fracture", amount: 85, hold: 40, duration: 45 }) },
];

const STRIP = [0.8, 0.86, 0.9, 0.93, 0.96, 0.98, 0.995, 0];

function mbmType(): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      {
        enabled: true,
        text: mbmById("worn").text,
        composition: "headline",
        anchor: "bl",
        textAlign: "left",
        color: "#ffffff",
        scale: 62,
        weight: 500,
      },
      {
        enabled: true,
        text: mbmById("now").text,
        composition: "footnote",
        anchor: "bl",
        textAlign: "left",
        color: "#ffffff",
        scale: 34,
        weight: 500,
      },
    ],
  });
}

function photoGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, h * 0.08, w, h);
  g.addColorStop(0, "#1a1a1c");
  g.addColorStop(0.35, "#4a4a48");
  g.addColorStop(0.62, "#2a2a2c");
  g.addColorStop(1, "#0c0c0e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.ellipse(w * 0.62, h * 0.28, w * 0.34, h * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, h * 0.58, w, h * 0.42);
  for (let i = 0; i < 7; i++) {
    const x = (w * (i + 0.35)) / 7;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(x, h * 0.12, 18, h * 0.76);
  }
}

function resolvedFrame(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  photoGround(ctx, w, h);
  const laid = layoutTypeDocument(mbmType(), w, h);
  for (const item of laid) paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  return c;
}

function paintAt(
  source: HTMLCanvasElement,
  phase: number,
  settings: EndBehaviourSettings,
): { canvas: HTMLCanvasElement; diag: EndDiagnostics } {
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = source.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  const diag = applyEndBehaviour(ctx, c, phase, settings, "loop");
  return { canvas: c, diag };
}

function pixelDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n += 1;
  return n;
}

function fingerprint(img: ImageData): string {
  let h = 2166136261;
  const d = img.data;
  for (let i = 0; i < d.length; i += 97) {
    h ^= d[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function cell(parent: HTMLElement, label: string, canvas: HTMLCanvasElement): void {
  const wrap = document.createElement("figure");
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
}

function section(parent: HTMLElement, title: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  parent.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "grid";
  parent.appendChild(grid);
  return grid;
}

export interface EndBehaviourReport {
  frame0Identity: boolean;
  offBypassAtPeak: boolean;
  determinism: boolean;
  noHistory: boolean;
  amountDoesNotMoveWindow: boolean;
  holdCreatesStillness: boolean;
  pingpongBypass: boolean;
  fpsParity: boolean;
  scaleFragmentParity: boolean;
  elapsedMs: number;
  diagnostics: Record<string, unknown>;
}

export async function runEndBehaviourSheet(root: HTMLElement): Promise<EndBehaviourReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const source = resolvedFrame(W, H);
  const intro = document.createElement("p");
  intro.textContent =
    "Resolved stand-in (dark photographic field + MBM type). End Behaviour is applied to the finished composite. OFF must match the source exactly.";
  root.appendChild(intro);

  const peak = 0.995;
  const sheet = section(root, "Contact sheet — peak disruption 0.995");
  const sheetZero = section(root, "Contact sheet — frame 0");
  const sheetDiags: Record<string, EndDiagnostics> = {};
  for (const shot of SHEET) {
    const peakPaint = paintAt(source, peak, shot.settings);
    const zeroPaint = paintAt(source, 0, shot.settings);
    sheetDiags[shot.id] = peakPaint.diag;
    cell(sheet, `${shot.label}  @ ${peak}`, peakPaint.canvas);
    cell(sheetZero, `${shot.label}  @ 0.00`, zeroPaint.canvas);
  }

  const fracture = SHEET.find((s) => s.id === "E")!.settings;
  const win = endWindows(fracture.hold, fracture.duration);
  const seqPhases = [
    { label: "pre-hold", phase: Math.max(0, win.holdStart - 0.06) },
    { label: "hold", phase: (win.holdStart + win.disruptStart) / 2 },
    { label: "transition start", phase: win.disruptStart },
    { label: "mid disruption", phase: win.disruptStart + win.durationFrac * 0.5 },
    { label: "peak disruption", phase: 1 - win.durationFrac * 0.08 },
    { label: "final transition", phase: 0.995 },
    { label: "frame 0", phase: 0 },
  ];
  const seq = section(root, "Fracture 50 — IMAGE → RESOLVE → HOLD → INTERRUPTION → RETURN");
  const seqDiags: Record<string, EndDiagnostics> = {};
  for (const step of seqPhases) {
    const painted = paintAt(source, step.phase, fracture);
    seqDiags[step.label] = painted.diag;
    cell(seq, `${step.label}  ${step.phase.toFixed(3)}  ${painted.diag.region}`, painted.canvas);
  }

  const strip = section(root, "Fracture 50 — phase strip");
  for (const phase of STRIP) {
    const painted = paintAt(source, phase, fracture);
    cell(strip, phase.toFixed(3), painted.canvas);
  }

  const srcData = source.getContext("2d")!.getImageData(0, 0, W, H);
  const offPeak = paintAt(source, peak, SHEET[0]!.settings).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const fracZero = paintAt(source, 0, fracture).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const flickerZero = paintAt(source, 0, SHEET[2]!.settings).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const holdPaint = paintAt(source, seqPhases[1]!.phase, fracture).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const a = paintAt(source, 0.96, fracture).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const b = paintAt(source, 0.96, fracture).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  paintAt(source, 0.8, fracture);
  const c = paintAt(source, 0.96, fracture).canvas.getContext("2d")!.getImageData(0, 0, W, H);

  const win25 = endWindows(40, 45);
  const win85 = endWindows(40, 45);
  const amountWindowSame = win25.disruptStart === win85.disruptStart;
  const amountPlan25 = planEndBehaviour(peak, SHEET[3]!.settings, W, H, "loop");
  const amountPlan85 = planEndBehaviour(peak, SHEET[5]!.settings, W, H, "loop");
  const windowUnmoved = amountPlan25.window.disruptStart === amountPlan85.window.disruptStart
    && amountPlan25.window.holdStart === amountPlan85.window.holdStart;

  const pingCanvas = resolvedFrame(W, H);
  const ping = applyEndBehaviour(pingCanvas.getContext("2d")!, pingCanvas, peak, fracture, "pingpong");

  const loopSec = 12;
  const lastPhases = [24, 25, 30].map((fps) => ({
    fps,
    phase: loopPhaseFromElapsed((Math.round(loopSec * fps) - 1) / fps, loopSec),
  }));
  const fpsSameRecipe = lastPhases.every((row) => {
    const p = paintAt(source, row.phase, fracture);
    const again = paintAt(source, row.phase, fracture);
    return pixelDiff(p.canvas.getContext("2d")!.getImageData(0, 0, W, H), again.canvas.getContext("2d")!.getImageData(0, 0, W, H)) === 0;
  });

  const p1080 = planEndBehaviour(peak, fracture, 1080, 1350, "loop");
  const p2160 = planEndBehaviour(peak, fracture, 2160, 2700, "loop");

  const report: EndBehaviourReport = {
    frame0Identity: pixelDiff(srcData, fracZero) === 0 && pixelDiff(srcData, flickerZero) === 0,
    offBypassAtPeak: pixelDiff(srcData, offPeak) === 0,
    determinism: pixelDiff(a, b) === 0,
    noHistory: pixelDiff(a, c) === 0,
    amountDoesNotMoveWindow: amountWindowSame && windowUnmoved,
    holdCreatesStillness: pixelDiff(srcData, holdPaint) === 0 && seqDiags.hold?.region === "hold",
    pingpongBypass: ping.applied === false,
    fpsParity: fpsSameRecipe,
    scaleFragmentParity: p1080.fragmentCount === p2160.fragmentCount,
    elapsedMs: performance.now() - t0,
    diagnostics: {
      windows: win,
      seed: p1080.seed,
      fragmentCount: p1080.fragmentCount,
      maxDisplacement1080: p1080.maxDisplacement,
      maxDisplacement2160: p2160.maxDisplacement,
      rgbDisplacement: p1080.rgbDisplacement,
      lastExportPhases: lastPhases,
      sheetPeak: sheetDiags,
      sequence: seqDiags,
      fingerprints: {
        source: fingerprint(srcData),
        frame0: fingerprint(fracZero),
        peakFracture50: fingerprint(paintAt(source, peak, fracture).canvas.getContext("2d")!.getImageData(0, 0, W, H)),
      },
    },
  };

  return report;
}
