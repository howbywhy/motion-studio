import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeState } from "../core/typeState";
import { layoutTypeDocument } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import {
  applyEndBehaviour,
  clampEndBehaviourSettings,
  endWindows,
  parseEndBehaviourMode,
  planEndBehaviour,
  type EndBehaviourSettings,
  type EndDiagnostics,
} from "../core/endBehaviour";
import { loopPhaseFromElapsed } from "../core/sequence";
import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";

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
  { id: "C", label: "C  Flicker 50", settings: clampEndBehaviourSettings({ mode: "flicker", amount: 50, hold: 45, duration: 35 }) },
  { id: "D", label: "D  Flicker 75", settings: clampEndBehaviourSettings({ mode: "flicker", amount: 75, hold: 45, duration: 35 }) },
  { id: "E", label: "E  Flicker 100", settings: clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }) },
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
  fractureMigrates: boolean;
  amount0MatchesOff: boolean;
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

  const flicker = SHEET.find((s) => s.id === "E")!.settings;
  const win = endWindows(flicker.hold, flicker.duration);
  const seqPhases = [
    { label: "pre-hold", phase: Math.max(0, win.holdStart - 0.06) },
    { label: "hold", phase: (win.holdStart + win.disruptStart) / 2 },
    { label: "flicker start", phase: win.disruptStart },
    { label: "mid flicker", phase: win.disruptStart + win.durationFrac * 0.5 },
    { label: "peak", phase: 1 - win.durationFrac * 0.08 },
    { label: "final disrupted frame", phase: 0.995 },
    { label: "frame 0", phase: 0 },
  ];
  const seq = section(root, "Flicker 100 — IMAGE → RESOLVE → HOLD → INTERRUPTION → RETURN");
  const seqDiags: Record<string, EndDiagnostics> = {};
  for (const step of seqPhases) {
    const painted = paintAt(source, step.phase, flicker);
    seqDiags[step.label] = painted.diag;
    cell(seq, `${step.label}  ${step.phase.toFixed(3)}  ${painted.diag.region}`, painted.canvas);
  }

  const strip = section(root, "Flicker 100 — phase strip");
  for (const phase of STRIP) {
    const painted = paintAt(source, phase, flicker);
    cell(strip, phase.toFixed(3), painted.canvas);
  }

  const srcData = source.getContext("2d")!.getImageData(0, 0, W, H);
  const offPeak = paintAt(source, peak, SHEET[0]!.settings).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const flickerZero = paintAt(source, 0, flicker).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const flicker50Zero = paintAt(source, 0, SHEET[2]!.settings).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const holdPaint = paintAt(source, seqPhases[1]!.phase, flicker).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const a = paintAt(source, 0.96, flicker).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  const b = paintAt(source, 0.96, flicker).canvas.getContext("2d")!.getImageData(0, 0, W, H);
  paintAt(source, 0.8, flicker);
  const c = paintAt(source, 0.96, flicker).canvas.getContext("2d")!.getImageData(0, 0, W, H);

  const amountPlan25 = planEndBehaviour(peak, SHEET[1]!.settings, W, H, "loop");
  const amountPlan100 = planEndBehaviour(peak, SHEET[4]!.settings, W, H, "loop");
  const windowUnmoved = amountPlan25.window.disruptStart === amountPlan100.window.disruptStart
    && amountPlan25.window.holdStart === amountPlan100.window.holdStart;

  const pingCanvas = resolvedFrame(W, H);
  const ping = applyEndBehaviour(pingCanvas.getContext("2d")!, pingCanvas, peak, flicker, "pingpong");

  const loopSec = 12;
  const lastPhases = [24, 25, 30].map((fps) => ({
    fps,
    phase: loopPhaseFromElapsed((Math.round(loopSec * fps) - 1) / fps, loopSec),
  }));
  const fpsSameRecipe = lastPhases.every((row) => {
    const p = paintAt(source, row.phase, flicker);
    const again = paintAt(source, row.phase, flicker);
    return pixelDiff(p.canvas.getContext("2d")!.getImageData(0, 0, W, H), again.canvas.getContext("2d")!.getImageData(0, 0, W, H)) === 0;
  });

  const p1080 = planEndBehaviour(peak, flicker, 1080, 1350, "loop");
  const p2160 = planEndBehaviour(peak, flicker, 2160, 2700, "loop");
  const fractureMigrates = parseEndBehaviourMode("fracture") === "flicker";

  const live = runLiveSystemProofs(root);

  const report: EndBehaviourReport = {
    frame0Identity: pixelDiff(srcData, flickerZero) === 0 && pixelDiff(srcData, flicker50Zero) === 0,
    offBypassAtPeak: pixelDiff(srcData, offPeak) === 0,
    determinism: pixelDiff(a, b) === 0,
    noHistory: pixelDiff(a, c) === 0,
    amountDoesNotMoveWindow: windowUnmoved,
    holdCreatesStillness: pixelDiff(srcData, holdPaint) === 0 && seqDiags.hold?.region === "hold",
    pingpongBypass: ping.applied === false,
    fpsParity: fpsSameRecipe,
    scaleFragmentParity: p1080.fragmentCount === p2160.fragmentCount,
    fractureMigrates,
    amount0MatchesOff: live.amount0MatchesOff,
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
      live,
      fingerprints: {
        source: fingerprint(srcData),
        frame0: fingerprint(flickerZero),
        peakFlicker100: fingerprint(paintAt(source, peak, flicker).canvas.getContext("2d")!.getImageData(0, 0, W, H)),
      },
    },
  };

  return report;
}

function bloomParams(limit: number): ParamValues {
  const found = presetsForTreatment("clean").find((p) => p.label === "Expressive");
  if (!found) throw new Error("Missing Bloom Expressive");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...found.values,
    resolveLimit: limit,
  };
}

function mbmLiveType(): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      {
        enabled: true,
        text: mbmById("name-break").text,
        composition: "headline",
        anchor: "bl",
        textAlign: "left",
        color: "#ffffff",
        scale: 62,
        weight: 500,
      },
      {
        enabled: true,
        text: mbmById("worn").text,
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

function hashPixels(img: ImageData): string {
  let h = 2166136261;
  const d = img.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 8; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function makeLiveRenderer(host: HTMLElement): Renderer {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 400;
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(320, 400);
  renderer.setLoopSeconds(12);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(50);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams(100));
  renderer.setSequence(
    [
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#1c1c1e"), "01") },
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#c8a070"), "02") },
    ],
    undefined,
  );
  renderer.setTypeState(mbmLiveType());
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  return renderer;
}

function cellImage(parent: HTMLElement, label: string, img: ImageData): void {
  const wrap = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
}

function runLiveSystemProofs(root: HTMLElement): {
  amount0MatchesOff: boolean;
  registrationHashes: Record<number, string>;
  flickerReadable: Record<number, string>;
  heroHash: string;
  registrationMs: { off: number; amount50: number; amount100: number };
} {
  const host = document.createElement("div");
  host.style.display = "none";
  root.appendChild(host);
  const renderer = makeLiveRenderer(host);

  const amounts = [0, 25, 50, 75, 100];
  const registrationHashes: Record<number, string> = {};
  const amountGrid = section(root, "Registration Amount — same composition, Flicker Off, hold 0.63");
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setClockMode("hold");
  renderer.setHoldPhase(0.63);
  for (const amount of amounts) {
    renderer.setRegistrationEnabled(true);
    renderer.setRegistrationAmount(amount);
    const img = settle(renderer);
    registrationHashes[amount] = hashPixels(img);
    cellImage(amountGrid, `Amount ${amount}`, img);
  }

  renderer.setRegistrationEnabled(false);
  renderer.setRegistrationAmount(50);
  const offHash = hashPixels(settle(renderer));
  const amount0MatchesOff = offHash === registrationHashes[0];

  const flickerGrid = section(root, "Registration Amount × Flicker 100 — peak 0.96");
  const flickerReadable: Record<number, string> = {};
  renderer.setRegistrationEnabled(true);
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }));
  renderer.setHoldPhase(0.96);
  for (const amount of amounts) {
    renderer.setRegistrationAmount(amount);
    const img = settle(renderer);
    flickerReadable[amount] = hashPixels(img);
    cellImage(flickerGrid, `Reg ${amount} + Flicker 100`, img);
  }

  const hero = section(root, "Hero — Resolve Limit 55 · Registration 70 · Flicker 100");
  renderer.setParams(bloomParams(55));
  renderer.setRegistrationAmount(70);
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }));
  const heroPhases = [
    { label: "resolved incomplete", phase: 0.82 },
    { label: "end hold", phase: 0.88 },
    { label: "flicker", phase: 0.96 },
    { label: "frame 0", phase: 0 },
  ];
  let heroHash = "";
  for (const step of heroPhases) {
    renderer.setHoldPhase(step.phase);
    const img = settle(renderer);
    if (step.phase === 0.96) heroHash = hashPixels(img);
    cellImage(hero, step.label, img);
  }

  const combo = section(root, "Resolve Limit × Flicker 100");
  for (const limit of [100, 65, 50]) {
    for (const flickerAmt of limit === 50 ? [100, 60] : [100]) {
      renderer.setParams(bloomParams(limit));
      renderer.setRegistrationAmount(50);
      renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: flickerAmt, hold: 45, duration: 35 }));
      renderer.setHoldPhase(0.96);
      cellImage(combo, `Limit ${limit} · Flicker ${flickerAmt}`, settle(renderer));
    }
  }

  const bwGrid = section(root, "Registration Amount × B&W — Flicker Off, hold 0.63");
  renderer.setParams(bloomParams(100));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setHoldPhase(0.63);
  renderer.setRegistrationEnabled(true);
  for (const amount of [0, 50, 100]) {
    for (const bw of ["off", "A", "B", "both"] as const) {
      renderer.setRegistrationAmount(amount);
      renderer.setBwMode(bw);
      cellImage(bwGrid, `Reg ${amount} · B&W ${bw}`, settle(renderer));
    }
  }
  renderer.setBwMode("off");

  const typeGrid = section(root, "Registration Amount × Type blend — hold 0.63");
  for (const amount of [0, 50, 100]) {
    for (const blend of ["normal", "difference", "exclusion"] as const) {
      renderer.setRegistrationAmount(amount);
      const type = mbmLiveType();
      renderer.setTypeState({
        ...type,
        blocks: [
          { ...type.blocks[0], blendMode: blend },
          { ...type.blocks[1], blendMode: blend },
        ],
      });
      cellImage(typeGrid, `Reg ${amount} · ${blend}`, settle(renderer));
    }
  }
  renderer.setTypeState(mbmLiveType());

  renderer.setParams(bloomParams(100));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setHoldPhase(0.63);
  renderer.setProfiling(true);
  renderer.setRegistrationEnabled(false);
  settle(renderer);
  const offMs = renderer.lastProfile?.registrationMs ?? 0;
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(50);
  settle(renderer);
  const amt50Ms = renderer.lastProfile?.registrationMs ?? 0;
  renderer.setRegistrationAmount(100);
  settle(renderer);
  const amt100Ms = renderer.lastProfile?.registrationMs ?? 0;
  renderer.setProfiling(false);

  return {
    amount0MatchesOff,
    registrationHashes,
    flickerReadable,
    heroHash,
    registrationMs: { off: offMs, amount50: amt50Ms, amount100: amt100Ms },
  };
}
