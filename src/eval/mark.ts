import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { clampTypeState, type TypeState } from "../core/typeState";
import { generateRandomisation } from "../core/randomise";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import { MARK_LATERAL_DX, MARK_STACKED } from "../core/markAssets";
import { clampMarkState, defaultMarkState, MARK_MODE_WINDOW } from "../core/markState";
import { markTravelT, planMark, planMarkStudy, type MarkStudyId } from "../core/markPlan";
import { paintMarkLayer } from "../core/markPaint";
import { createSavedState, deleteSavedState } from "../core/savedStates";
import { mbmById } from "./mbmCopy";

const W = 288;
const H = 512;
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
    resolveLimit: 100,
  };
}

function campaignType(): TypeState {
  return clampTypeState({
    enabled: true,
    sequenceStart: 0.18,
    sequenceStop: 0.72,
    sequenceSpeed: 50,
    pages: [
      [
        { enabled: true, text: "MADE BY MADELEN", composition: "headline", scale: 78, anchor: "mc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        { enabled: false, text: "", composition: "subtitle" },
      ],
      [
        { enabled: true, text: "MADE BY\nMADELEN", composition: "headline", scale: 86, anchor: "bl", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        { enabled: false, text: "", composition: "subtitle" },
      ],
      [
        { enabled: true, text: mbmById("name").text, composition: "headline", scale: 70, anchor: "tl", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        { enabled: false, text: "", composition: "subtitle" },
      ],
    ],
  });
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

function makeRenderer(host: HTMLElement, w = W, h = H): Renderer {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(w, h);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(60);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams());
  renderer.setSequence(
    [
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#1c1c1e"), "01") },
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#c8a070"), "02") },
    ],
    undefined,
  );
  renderer.setTypeState(clampTypeState({ enabled: false }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setTransitionFlickerEnabled(false);
  renderer.setMarkState(defaultMarkState());
  renderer.setClockMode("hold");
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 8; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function at(renderer: Renderer, phase: number): ImageData {
  renderer.setClockMode("hold");
  renderer.setHoldPhase(phase);
  return settle(renderer);
}

function introState() {
  return clampMarkState({ enabled: true, mode: "intro", source: "stacked", scale: 78, anchor: "mc" });
}

export interface MarkReport {
  defaultOff: boolean;
  offIdentity: boolean;
  stackedExactAtHold: boolean;
  travelSnaps: boolean;
  lateralFromSvg: boolean;
  typeHiddenInIntro: boolean;
  interruptEmblemThenStacked: boolean;
  endYieldsFlicker: boolean;
  pulseKeepsMark: boolean;
  scrubReverse: boolean;
  holdExportIdentical: boolean;
  savedRestore: boolean;
  randomiseLeaves: boolean;
  windowGates: boolean;
  registrationLeavesCleanHold: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runMarkSheet(root: HTMLElement): Promise<MarkReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const hidden = document.createElement("div");
  hidden.style.display = "none";
  root.appendChild(hidden);

  const defaultOff = defaultMarkState().enabled === false && makeRenderer(hidden).getMarkState().enabled === false;

  const offR = makeRenderer(hidden);
  const offA = at(offR, 0.09);
  offR.setMarkState({ enabled: false, mode: "intro" });
  const offB = at(offR, 0.09);
  const offIdentity = hashPixels(offA) === hashPixels(offB) && pixelDiff(offA, offB) === 0;

  const introR = makeRenderer(hidden);
  introR.setMarkState(introState());
  const sep = at(introR, 0.04);
  const mid = at(introR, 0.08);
  const hold = at(introR, 0.12);
  const gap = at(introR, 0.148);
  const after = at(introR, 0.19);
  const modes = section(root, "Intro / Interrupt / End — 9:16 · 12s");
  cell(modes, "INTRO separated", sep);
  cell(modes, "INTRO travel", mid);
  cell(modes, "INTRO stacked HOLD", hold);
  cell(modes, "INTRO gap", gap);
  cell(modes, "INTRO released", after);

  const intR = makeRenderer(hidden);
  intR.setMarkState(clampMarkState({ enabled: true, mode: "interrupt", source: "stacked", scale: 78 }));
  const intEmblem = at(intR, 0.47);
  const intStacked = at(intR, 0.53);
  const intOut = at(intR, 0.62);
  cell(modes, "INTERRUPT emblem", intEmblem);
  cell(modes, "INTERRUPT stacked", intStacked);
  cell(modes, "INTERRUPT out", intOut);

  const endR = makeRenderer(hidden);
  endR.setTypeState(campaignType());
  endR.setMarkState(clampMarkState({ enabled: true, mode: "end", source: "stacked", scale: 78 }));
  endR.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 70, hold: 40, duration: 40 }));
  const endBefore = at(endR, 0.7);
  const endSep = at(endR, 0.82);
  const endHold = at(endR, 0.88);
  const endGap = at(endR, 0.93);
  cell(modes, "END type still", endBefore);
  cell(modes, "END separated", endSep);
  cell(modes, "END HOLD", endHold);
  cell(modes, "END gap", endGap);

  const scrub = section(root, "Scrub through Start → Stop (Intro 0–18)");
  const scrubPhases = [0, 0.04, 0.07, 0.1, 0.12, 0.15, 0.18, 0.22];
  const scrubHashes: string[] = [];
  for (const p of scrubPhases) {
    const img = at(introR, p);
    scrubHashes.push(hashPixels(img));
    cell(scrub, `p ${p.toFixed(2)}`, img);
  }
  const back = at(introR, 0.1);
  const scrubReverse = hashPixels(back) === scrubHashes[3];

  const study = section(root, "Motion study — local 0–1");
  const studies: { id: MarkStudyId; label: string }[] = [
    { id: "lateral", label: "A lateral → stacked" },
    { id: "snapFlicker", label: "B snap + micro Flicker" },
    { id: "gapRelease", label: "C stacked → gap" },
    { id: "emblemCut", label: "D horizontal → emblem → stacked" },
  ];
  for (const item of studies) {
    for (const local of [0.08, 0.32, 0.55, 0.78, 0.94]) {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#141416";
      ctx.fillRect(0, 0, W, H);
      const plan = planMarkStudy(item.id, local, W, H, LOOP);
      paintMarkLayer(ctx, plan);
      cell(study, `${item.label} · ${local.toFixed(2)}`, ctx.getImageData(0, 0, W, H));
    }
  }

  const creative = section(root, "Creative — End 78–96 + Pulse 42–58 2×");
  const piece = makeRenderer(hidden, 360, 640);
  piece.setTypeState(campaignType());
  piece.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  piece.setPlaybackMode("pingpong");
  piece.setMarkState(clampMarkState({ enabled: true, mode: "end", source: "stacked", scale: 74 }));
  for (const p of [0.22, 0.5, 0.7, 0.82, 0.88, 0.93, 0.99]) {
    cell(creative, `END piece ${p.toFixed(2)}`, at(piece, p));
  }

  const introPiece = section(root, "Creative — Intro 0–18");
  const open = makeRenderer(hidden, 360, 640);
  open.setTypeState(campaignType());
  open.setMarkState(clampMarkState({ enabled: true, mode: "intro", source: "stacked", scale: 80 }));
  for (const p of [0.02, 0.08, 0.12, 0.16, 0.22, 0.4]) {
    cell(introPiece, `INTRO piece ${p.toFixed(2)}`, at(open, p));
  }

  const holdPlan = planMark(introState(), 0.12, W, H, LOOP);
  const stackedExactAtHold = holdPlan.travel === 1 && holdPlan.gap === 0 && holdPlan.kind === "logotype";
  const travelSnaps = markTravelT(0.87) < 1 && markTravelT(0.88) === 1 && markTravelT(1) === 1;
  const lateralFromSvg = MARK_LATERAL_DX > 1200 && MARK_STACKED.madeBy.length === 6 && MARK_STACKED.madeLen.length === 7;

  introR.setTypeState(campaignType());
  introR.setMarkState(introState());
  at(introR, 0.12);
  const typeHiddenInIntro = introR.lastMarkDiagnostics?.hideType === true;

  intR.setMarkState(clampMarkState({ enabled: true, mode: "interrupt", source: "stacked" }));
  at(intR, 0.47);
  const emblemKind = intR.lastMarkDiagnostics?.kind === "emblem";
  at(intR, 0.53);
  const stackedKind = intR.lastMarkDiagnostics?.kind === "logotype";
  const interruptEmblemThenStacked = emblemKind && stackedKind;

  endR.setMarkState(clampMarkState({ enabled: true, mode: "end", source: "stacked" }));
  endR.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 80, hold: 40, duration: 40 }));
  at(endR, 0.88);
  const endYieldsFlicker = endR.lastMarkDiagnostics?.yieldEnd === true && endR.lastEndDiagnostics?.applied !== true;

  const pulseR = makeRenderer(hidden);
  pulseR.setPlaybackMode("pingpong");
  pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  pulseR.setMarkState(introState());
  at(pulseR, 0.12);
  const pulseKeepsMark = pulseR.lastMarkDiagnostics?.kind === "logotype";

  const exportR = makeRenderer(hidden);
  exportR.setMarkState(introState());
  exportR.setHoldPhase(0.12);
  const preview = hashPixels(settle(exportR));
  exportR.beginExport(W, H);
  await exportR.renderExportFrame(0.12 * LOOP, { graphicTime: exportR.getGraphicElapsed() });
  const exported = hashPixels(exportR.getVisibleImageData());
  exportR.endExport();
  const holdExportIdentical = preview === exported && exportR.getClockMode() === "hold";

  const saveR = makeRenderer(hidden);
  saveR.setMarkState(clampMarkState({ enabled: true, mode: "end", source: "emblem", scale: 61, sequenceStart: 0.8, sequenceStop: 0.95, anchor: "bl" }));
  const rec = createSavedState({
    name: "mark",
    behaviorId: "bloom",
    params: bloomParams(),
    registrationOn: true,
    bwOn: false,
    aspect: "9:16",
    playbackMode: "loop",
    loopSeconds: LOOP,
    selectedId: null,
    audioEnabled: true,
    sources: [],
    markEnabled: saveR.getMarkState().enabled,
    markMode: saveR.getMarkState().mode,
    markSource: saveR.getMarkState().source,
    markStart: saveR.getMarkState().sequenceStart,
    markStop: saveR.getMarkState().sequenceStop,
    markScale: saveR.getMarkState().scale,
    markAnchor: saveR.getMarkState().anchor,
  });
  const fresh = makeRenderer(hidden);
  fresh.setMarkState(clampMarkState({
    enabled: rec.markEnabled,
    mode: rec.markMode,
    source: rec.markSource,
    sequenceStart: rec.markStart,
    sequenceStop: rec.markStop,
    scale: rec.markScale,
    anchor: rec.markAnchor,
  }));
  const saved = fresh.getMarkState();
  const savedRestore =
    saved.enabled &&
    saved.mode === "end" &&
    saved.source === "emblem" &&
    saved.scale === 61 &&
    saved.anchor === "bl";
  deleteSavedState(rec.id);

  const randR = makeRenderer(hidden);
  randR.setMarkState(clampMarkState({ enabled: true, mode: "interrupt", source: "horizontal", sequenceStart: 0.4, sequenceStop: 0.55, scale: 66 }));
  const before = randR.getMarkState();
  const rand = generateRandomisation({ seed: 7, params: bloomParams(), loopSeconds: LOOP, pairIndex: 0, pairCount: 2 });
  randR.setParams(rand.params);
  const afterRand = randR.getMarkState();
  const randomiseLeaves =
    afterRand.enabled === before.enabled &&
    afterRand.mode === before.mode &&
    afterRand.source === before.source &&
    afterRand.sequenceStart === before.sequenceStart &&
    afterRand.sequenceStop === before.sequenceStop &&
    afterRand.scale === before.scale;

  introR.setMarkState(introState());
  at(introR, 0.5);
  const outside = introR.lastMarkDiagnostics?.kind === "absent" && introR.lastMarkDiagnostics?.applied === false;
  at(introR, 0.09);
  const inside = introR.lastMarkDiagnostics?.kind === "logotype";
  const windowGates = outside && inside;

  const regR = makeRenderer(hidden);
  regR.setMarkState(introState());
  regR.setRegistrationEnabled(true);
  const withReg = at(regR, 0.12);
  regR.setRegistrationEnabled(false);
  const noReg = at(regR, 0.12);
  const registrationLeavesCleanHold = pixelDiff(withReg, noReg) > 0 && planMark(introState(), 0.12, W, H, LOOP).travel === 1;

  return {
    defaultOff,
    offIdentity,
    stackedExactAtHold,
    travelSnaps,
    lateralFromSvg,
    typeHiddenInIntro,
    interruptEmblemThenStacked,
    endYieldsFlicker,
    pulseKeepsMark,
    scrubReverse,
    holdExportIdentical,
    savedRestore,
    randomiseLeaves,
    windowGates,
    registrationLeavesCleanHold,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      lateralDx: MARK_LATERAL_DX,
      stacked: MARK_STACKED.width,
      introWindow: MARK_MODE_WINDOW.intro,
      holdTravel: holdPlan.travel,
      endApplied: endR.lastEndDiagnostics?.applied,
      preview,
      exported,
    },
  };
}
