import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings, END_BEHAVIOUR_OFF } from "../core/endBehaviour";
import { clampTypeState, type TypeBlock, type TypeState } from "../core/typeState";
import { generateRandomisation } from "../core/randomise";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import {
  TRANSITION_FLICKER_DURATION_SEC,
  transitionFlickerHalfSpan,
  transitionFlickerSpan,
  transitionPairCuts,
  planTransitionFlicker,
} from "../core/transitionFlicker";
import { createSavedState, deleteSavedState } from "../core/savedStates";

const W = 320;
const H = 400;
const LOOP = 12;

function hashPixels(img: ImageData): string {
  let h = 2166136261;
  const d = img.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function pixelDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n += 1;
  return n;
}

function bloomParams(): ParamValues {
  const found = presetsForTreatment("clean").find((p) => p.label === "Expressive");
  if (!found) throw new Error("Missing Bloom Expressive");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...found.values,
    resolveLimit: 50,
  };
}

function section(root: HTMLElement, title: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "grid";
  root.appendChild(grid);
  return grid;
}

function cell(parent: HTMLElement, label: string, img: ImageData): void {
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

function makeRenderer(host: HTMLElement, sources: number): Renderer {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W, H);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(false);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams());
  const hues = ["#1c1c1e", "#c8a070", "#3a5a8a", "#8a4040"];
  const items = hues.slice(0, Math.max(2, sources)).map((hex, i) => ({
    id: renderer.nextSourceId(),
    asset: wrapCanvasAsPlaceholder(placeholderA(hex), String(i + 1).padStart(2, "0")),
  }));
  renderer.setSequence(items, undefined);
  renderer.setTypeState(clampTypeState({ enabled: false }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setTransitionFlickerEnabled(false);
  renderer.setClockMode("hold");
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 6; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function at(renderer: Renderer, phase: number): ImageData {
  renderer.setClockMode("hold");
  renderer.setHoldPhase(phase);
  return settle(renderer);
}

function page(a: Partial<TypeBlock>): [Partial<TypeBlock>, Partial<TypeBlock>, Partial<TypeBlock>] {
  return [
    { enabled: true, color: "#f3efe6", ...a },
    { enabled: false, text: "", composition: "headline" },
    { enabled: false, text: "", composition: "headline" },
  ];
}

function repetitionType(): TypeState {
  return clampTypeState({
    enabled: true,
    sequenceStart: 0.15,
    sequenceStop: 0.72,
    sequenceSpeed: 48,
    frameHoldEnabled: [false, true, false, false, false],
    frameHoldLength: [2, 2, 2, 2, 2],
    pages: [
      page({ text: "MADE BY MADELEN", composition: "headline", scale: 62, anchor: "bl" }),
      page({ text: "MADE BY MADELEN", composition: "headline", scale: 62, anchor: "bc" }),
      page({ text: "MADE BY MADELEN", composition: "headline", scale: 90, anchor: "mc" }),
      page({ text: "MADE BY MADELEN", composition: "headline", scale: 70, anchor: "mr" }),
      page({ text: "MADE BY MADELEN", composition: "headline", scale: 62, anchor: "bl" }),
    ],
  });
}

export interface TransitionFlickerReport {
  cuts2: boolean;
  cuts3: boolean;
  cuts4: boolean;
  offIdentity: boolean;
  onDiffersAtCut: boolean;
  wrapSilent: boolean;
  deterministic: boolean;
  scrubSymmetric: boolean;
  holdExportIdentical: boolean;
  pulseIgnores: boolean;
  typeInterrupted: boolean;
  subtitleInterrupted: boolean;
  registrationOn: boolean;
  endFlickerIndependent: boolean;
  lastCutSuppressedNearEnd: boolean;
  savedRestore: boolean;
  randomiseLeaves: boolean;
  defaultOff: boolean;
  durationLocked: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runTransitionFlickerSheet(root: HTMLElement): Promise<TransitionFlickerReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const hidden = document.createElement("div");
  hidden.style.display = "none";
  root.appendChild(hidden);

  const cuts2 = JSON.stringify(transitionPairCuts(2)) === JSON.stringify([0.5]);
  const cuts3 = JSON.stringify(transitionPairCuts(3)) === JSON.stringify([1 / 3, 2 / 3]);
  const cuts4 = JSON.stringify(transitionPairCuts(4)) === JSON.stringify([0.25, 0.5, 0.75]);

  const r2 = makeRenderer(hidden, 2);
  const r2offA = at(r2, 0.5);
  const r2offB = at(r2, 0.2);
  const r2offWrap = at(r2, 0);
  r2.setTransitionFlickerEnabled(true);
  const r2onCut = at(r2, 0.5);
  const r2onCutApplied = r2.lastTransitionDiagnostics?.applied === true;
  const r2onAway = at(r2, 0.2);
  const r2onWrap = at(r2, 0);
  const r2onWrapApplied = r2.lastTransitionDiagnostics?.applied === true;
  const r2onCutAgain = at(r2, 0.5);
  const half12 = transitionFlickerHalfSpan(LOOP);
  const r2fwd = [0.5 - half12 * 0.6, 0.5, 0.5 + half12 * 0.6].map((p) => hashPixels(at(r2, p)));
  const r2back = [0.5 + half12 * 0.6, 0.5, 0.5 - half12 * 0.6].map((p) => hashPixels(at(r2, p)));
  const holdA = hashPixels(at(r2, 0.5));
  const holdB = hashPixels(at(r2, 0.5));

  const offIdentity = pixelDiff(r2offB, r2onAway) === 0;
  const onDiffersAtCut = pixelDiff(r2offA, r2onCut) > 0 && r2onCutApplied;
  const wrapSilent = pixelDiff(r2offWrap, r2onWrap) === 0 && !r2onWrapApplied;
  const deterministic = pixelDiff(r2onCut, r2onCutAgain) === 0;
  const scrubSymmetric = r2fwd[0] === r2back[2] && r2fwd[1] === r2back[1] && r2fwd[2] === r2back[0];
  const holdExportIdentical = holdA === holdB;

  const twoGrid = section(root, "2 images  ·  cut 0.50  ·  Off vs Flicker");
  r2.setTransitionFlickerEnabled(false);
  cell(twoGrid, "Off  0.50", at(r2, 0.5));
  r2.setTransitionFlickerEnabled(true);
  cell(twoGrid, "Flicker  0.50", at(r2, 0.5));
  cell(twoGrid, "Flicker  0.20  (no cut)", at(r2, 0.2));
  cell(twoGrid, "Flicker  0.00  (wrap)", at(r2, 0));

  const r3 = makeRenderer(hidden, 3);
  r3.setTransitionFlickerEnabled(true);
  const threeGrid = section(root, "3 images  ·  cuts 1/3  2/3");
  for (const p of [0, 1 / 3, 0.5, 2 / 3, 0.99]) {
    const img = at(r3, p);
    cell(threeGrid, `p${p.toFixed(2)}  ${r3.lastTransitionDiagnostics?.applied ? "flicker" : "bloom"}`, img);
  }

  const r4 = makeRenderer(hidden, 4);
  r4.setTransitionFlickerEnabled(true);
  const fourGrid = section(root, "4 images  ·  cuts 0.25  0.50  0.75");
  for (const p of [0, 0.25, 0.5, 0.75, 0.9]) {
    const img = at(r4, p);
    cell(fourGrid, `p${p.toFixed(2)}  ${r4.lastTransitionDiagnostics?.applied ? "flicker" : "bloom"}`, img);
  }

  const pulse = makeRenderer(hidden, 3);
  pulse.setTransitionFlickerEnabled(true);
  pulse.setPlaybackMode("pingpong");
  pulse.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  const pulseOff = makeRenderer(hidden, 3);
  pulseOff.setPlaybackMode("pingpong");
  pulseOff.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  const pulseA = at(pulse, 0.5);
  const pulseB = at(pulseOff, 0.5);
  const pulseIgnores = pixelDiff(pulseA, pulseB) === 0 && pulse.lastTransitionDiagnostics?.applied !== true;
  const pulseGrid = section(root, "Pulse  ·  Transition Flicker On is inert");
  cell(pulseGrid, "Pulse On  0.50", pulseA);
  cell(pulseGrid, "Pulse Off  0.50", pulseB);

  const typed = makeRenderer(hidden, 3);
  typed.setTypeState(repetitionType());
  typed.setRegistrationEnabled(true);
  typed.setRegistrationAmount(60);
  const typeOffCut = at(typed, 1 / 3);
  typed.setTransitionFlickerEnabled(true);
  const typeCut = at(typed, 1 / 3);
  const typeInterrupted = pixelDiff(typeOffCut, typeCut) > 0 && typed.lastTransitionDiagnostics?.applied === true;

  const sub = makeRenderer(hidden, 3);
  sub.setTypeState(clampTypeState({
    enabled: true,
    sequenceStart: 0,
    sequenceStop: 1,
    pages: [[
      { enabled: false, text: "", composition: "headline" },
      { enabled: false, text: "", composition: "headline" },
      { enabled: true, text: "Made in Sydney.\nDesigned for movement.", composition: "subtitle", anchor: "bc" },
    ]],
  }));
  const subOffCut = at(sub, 1 / 3);
  sub.setTransitionFlickerEnabled(true);
  const subCut = at(sub, 1 / 3);
  const subtitleInterrupted = pixelDiff(subOffCut, subCut) > 0 && sub.lastTransitionDiagnostics?.applied === true;

  const reg = makeRenderer(hidden, 2);
  reg.setRegistrationEnabled(true);
  reg.setRegistrationAmount(70);
  const regOff = at(reg, 0.5);
  reg.setTransitionFlickerEnabled(true);
  const regOn = at(reg, 0.5);
  const registrationOn = pixelDiff(regOff, regOn) > 0;

  const endOff = makeRenderer(hidden, 2);
  endOff.setTransitionFlickerEnabled(true);
  const midOn = at(endOff, 0.5);
  endOff.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }));
  const midOnEnd = at(endOff, 0.5);
  const endPeak = at(endOff, 0.96);
  const endFlickerIndependent =
    pixelDiff(midOn, midOnEnd) === 0 &&
    pixelDiff(midOnEnd, endPeak) > 0 &&
    endOff.lastEndDiagnostics?.applied === true;

  const suppressR = makeRenderer(hidden, 4);
  suppressR.setTransitionFlickerEnabled(true);
  suppressR.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 100, duration: 100 }));
  at(suppressR, 0.5);
  const midStill = suppressR.lastTransitionDiagnostics?.applied === true;
  at(suppressR, 0.75);
  const lastCutSuppressedNearEnd = midStill && suppressR.lastTransitionDiagnostics?.applied !== true
    && suppressR.lastTransitionDiagnostics?.suppressed === true;

  const durationGrid = section(root, "Duration lock  ·  same sources  ·  4s / 8s / 12s at cut 0.50");
  const durationOffsets = section(root, "Duration lock  ·  60ms from cut  ·  same punctuation width in time");
  const spanEq: Record<number, number> = {};
  let durationLocked = true;
  for (const seconds of [4, 8, 12] as const) {
    const span = transitionFlickerSpan(seconds);
    spanEq[seconds] = span;
    if (Math.abs(span * seconds - TRANSITION_FLICKER_DURATION_SEC) > 1e-9) durationLocked = false;
    if (Math.abs(span * seconds * 25 - 3) > 1e-9) durationLocked = false;
    const r = makeRenderer(hidden, 2);
    r.setLoopSeconds(seconds);
    r.setTransitionFlickerEnabled(true);
    const peak = at(r, 0.5);
    const peakOn = r.lastTransitionDiagnostics?.applied === true;
    const half = transitionFlickerHalfSpan(seconds);
    const edge = at(r, 0.5 + half * 0.5);
    const edgeOn = r.lastTransitionDiagnostics?.applied === true;
    at(r, 0.5 + half * 1.4);
    const outsideOn = r.lastTransitionDiagnostics?.applied === true;
    if (!peakOn || !edgeOn || outsideOn) durationLocked = false;
    cell(durationGrid, `${seconds}s  cut  ${Math.round(span * seconds * 1000)}ms`, peak);
    cell(durationOffsets, `${seconds}s  +60ms`, edge);
    r.setTransitionFlickerEnabled(false);
    const off = at(r, 0.5);
    if (pixelDiff(off, peak) === 0) durationLocked = false;
  }
  const probe = 0.5 + 0.008;
  const r4s = makeRenderer(hidden, 2);
  r4s.setLoopSeconds(4);
  r4s.setTransitionFlickerEnabled(true);
  at(r4s, probe);
  const probe4 = r4s.lastTransitionDiagnostics?.applied === true;
  const r12s = makeRenderer(hidden, 2);
  r12s.setLoopSeconds(12);
  r12s.setTransitionFlickerEnabled(true);
  at(r12s, probe);
  const probe12 = r12s.lastTransitionDiagnostics?.applied === true;
  if (!probe4 || probe12) durationLocked = false;

  const typeRepGrid = section(root, "Type repetition  ·  MADE BY MADELEN × 5  ·  4s / 8s / 12s at 1/3");
  typed.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  typed.setLoopSeconds(12);
  for (const seconds of [4, 8, 12] as const) {
    typed.setLoopSeconds(seconds);
    cell(typeRepGrid, `${seconds}s  1/3`, at(typed, 1 / 3));
  }
  const typeGrid = section(root, "Type repetition + Transition Flicker  ·  3 images · 12s");
  typed.setLoopSeconds(12);
  for (const p of [0.15, 0.25, 1 / 3, 0.45, 2 / 3, 0.7]) {
    cell(typeGrid, `p${p.toFixed(2)}`, at(typed, p));
  }

  const bloomShift = section(root, "Bloom shift  ·  4 images  ·  Off vs Flicker at 0.50");
  const shift = makeRenderer(hidden, 4);
  cell(bloomShift, "Off  0.50", at(shift, 0.5));
  shift.setTransitionFlickerEnabled(true);
  cell(bloomShift, "Flicker  0.50", at(shift, 0.5));
  cell(bloomShift, "Flicker  0.25", at(shift, 0.25));
  cell(bloomShift, "Flicker  0.75", at(shift, 0.75));

  const savedOn = makeRenderer(hidden, 2);
  savedOn.setTransitionFlickerEnabled(true);
  const rec = createSavedState({
    name: "xflick",
    behaviorId: "bloom",
    params: bloomParams(),
    registrationOn: false,
    bwOn: false,
    aspect: "4/5",
    playbackMode: "loop",
    loopSeconds: 12,
    selectedId: null,
    audioEnabled: true,
    sources: [],
    transitionFlickerEnabled: savedOn.getTransitionFlickerEnabled(),
  });
  const savedRestore = rec.transitionFlickerEnabled === true;
  deleteSavedState(rec.id);

  savedOn.setTransitionFlickerEnabled(true);
  generateRandomisation({
    seed: 7,
    params: bloomParams(),
    loopSeconds: LOOP,
    pairIndex: 0,
    pairCount: 2,
  });
  const randomiseLeaves = savedOn.getTransitionFlickerEnabled() === true;

  const fresh = makeRenderer(hidden, 2);
  const defaultOff = fresh.getTransitionFlickerEnabled() === false;

  const idlePlan = planTransitionFlicker(0.2, 2, "loop", true, END_BEHAVIOUR_OFF, W, H, LOOP);
  const cutPlan = planTransitionFlicker(0.5, 2, "loop", true, END_BEHAVIOUR_OFF, W, H, LOOP);

  return {
    cuts2,
    cuts3,
    cuts4,
    offIdentity,
    onDiffersAtCut,
    wrapSilent,
    deterministic,
    scrubSymmetric,
    holdExportIdentical,
    pulseIgnores,
    typeInterrupted,
    subtitleInterrupted,
    registrationOn,
    endFlickerIndependent,
    lastCutSuppressedNearEnd,
    savedRestore,
    randomiseLeaves,
    defaultOff,
    durationLocked,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      durationSec: TRANSITION_FLICKER_DURATION_SEC,
      span: spanEq,
      frames25: {
        4: spanEq[4]! * 4 * 25,
        8: spanEq[8]! * 8 * 25,
        12: spanEq[12]! * 12 * 25,
      },
      ms: {
        4: Math.round(spanEq[4]! * 4 * 1000),
        8: Math.round(spanEq[8]! * 8 * 1000),
        12: Math.round(spanEq[12]! * 12 * 1000),
      },
      probe4,
      probe12,
      idleEnvelope: idlePlan.envelope,
      cutEnvelope: cutPlan.envelope,
      cutState: cutPlan.flickerState,
      fwd: r2fwd,
      back: r2back,
    },
  };
}
