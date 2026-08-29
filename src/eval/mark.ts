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
import { MARK_FILL_BLACK, MARK_LATERAL_DX, MARK_STACKED, markPaths } from "../core/markAssets";
import { clampMarkState, defaultMarkState, MARK_MODE_WINDOW } from "../core/markState";
import {
  layoutMarkRect,
  layoutMarkTravelRect,
  MARK_ALIGN_X,
  MARK_CLAMP_START_X,
  MARK_LEFT_X,
  MARK_LOCAL,
  MARK_OSC_LOCAL,
  MARK_RIGHT_X,
  MARK_START_X,
  markAligned,
  markMadeLenX,
  markMadeLenXOscillating,
  planMark,
  planMarkStudy,
  type MarkPlan,
  type MarkStudyId,
} from "../core/markPlan";
import { paintMarkLayer } from "../core/markPaint";
import { createSavedState, deleteSavedState } from "../core/savedStates";
import { mbmById } from "./mbmCopy";

const W = 288;
const H = 512;
const LOOP = 12;
const GEO_W = 720;
const GEO_H = 260;

const SCRUB_LOCAL = [0, 0.16, 0.28, 0.4, 0.52, 0.58, 0.63, 0.64, 0.68, 0.8, 0.92, 1];
const OSC_LOCALS = [0, 0.15, 0.38, 0.48, 0.62, 0.72, 0.84, 0.92];
const RED_LOCALS = [0, 0.16, 0.52, 0.63, 0.64, 0.68, 0.84, 0.92];

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

function windowPhase(mode: "intro" | "interrupt" | "end", local: number): number {
  const w = MARK_MODE_WINDOW[mode];
  return w.start + local * (w.stop - w.start);
}

function scrubLabel(local: number, xFn: (t: number) => number = markMadeLenX): string {
  const x = Math.round(xFn(local));
  const pct = Math.round(local * 100);
  const k = MARK_LOCAL;
  if (local >= k.holdEnd) return `${pct}% release  x=${x}`;
  if (local >= k.holdStart) return `${pct}% HOLD  x=${x}`;
  if (local >= k.leftPeak) return `${pct}% SNAP  x=${x}`;
  if (local > k.firstAlign) return `${pct}% left overshoot  x=${x}`;
  if (local > k.rightHold) return `${pct}% travel left  x=${x}`;
  return `${pct}% RIGHT hold  x=${x}`;
}

function oscLabel(local: number): string {
  const x = Math.round(markMadeLenXOscillating(local));
  const pct = Math.round(local * 100);
  const k = MARK_OSC_LOCAL;
  if (local >= k.holdEnd) return `OSC ${pct}% release  x=${x}`;
  if (local >= k.holdStart) return `OSC ${pct}% HOLD  x=${x}`;
  if (local >= k.rightPeak) return `OSC ${pct}% SNAP  x=${x}`;
  if (local > k.secondAlign) return `OSC ${pct}% right overshoot  x=${x}`;
  if (local >= k.leftPeak) return `OSC ${pct}% 2nd align  x=${x}`;
  if (local > k.firstAlign) return `OSC ${pct}% left overshoot  x=${x}`;
  if (local > k.rightHold) return `OSC ${pct}% travel left  x=${x}`;
  return `OSC ${pct}% RIGHT hold  x=${x}`;
}

function paintClean(plan: MarkPlan, w = GEO_W, h = GEO_H): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  paintMarkLayer(ctx, plan, MARK_FILL_BLACK);
  return ctx.getImageData(0, 0, w, h);
}

function paintStackedReference(layout: MarkPlan["layout"]): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = GEO_W;
  canvas.height = GEO_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, GEO_W, GEO_H);
  const paths = markPaths();
  ctx.save();
  ctx.translate(layout.x, layout.y);
  ctx.scale(layout.s, layout.s);
  ctx.translate(layout.originX, 0);
  ctx.fillStyle = MARK_FILL_BLACK;
  for (const path of paths.madeBy) ctx.fill(path);
  for (const path of paths.madeLen) ctx.fill(path);
  ctx.restore();
  return ctx.getImageData(0, 0, GEO_W, GEO_H);
}

function paintTrajectory(): ImageData {
  const tw = 720;
  const th = 260;
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tw, th);
  const padL = 56;
  const padR = 18;
  const padT = 18;
  const padB = 36;
  const x0 = padL;
  const x1 = tw - padR;
  const y0 = padT;
  const y1 = th - padB;
  const xMin = MARK_LEFT_X * 1.35;
  const xMax = MARK_START_X * 1.04;
  const toX = (t: number) => x0 + t * (x1 - x0);
  const toY = (x: number) => y1 - ((x - xMin) / (xMax - xMin)) * (y1 - y0);

  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.stroke();

  ctx.strokeStyle = "#c43d3d";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, toY(MARK_ALIGN_X));
  ctx.lineTo(x1, toY(MARK_ALIGN_X));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#c43d3d";
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText("ALIGN x=0", x0 + 6, toY(MARK_ALIGN_X) - 6);

  const samples = 400;
  ctx.strokeStyle = "#bbbbbb";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * MARK_OSC_LOCAL.holdEnd;
    const px = toX(t);
    const py = toY(markMadeLenXOscillating(t));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * MARK_LOCAL.holdEnd;
    const px = toX(t);
    const py = toY(markMadeLenX(t));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.fillStyle = "#111111";
  for (const t of [0, MARK_LOCAL.rightHold, MARK_LOCAL.firstAlign, MARK_LOCAL.leftPeak, MARK_LOCAL.holdStart, MARK_LOCAL.holdEnd]) {
    ctx.beginPath();
    ctx.arc(toX(t), toY(markMadeLenX(t)), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#666";
  ctx.fillText("local →", x1 - 48, y1 + 22);
  ctx.fillText("grey = CURRENT osc  black = REDUCED", 6, 14);
  ctx.fillText("RIGHT", 6, toY(MARK_START_X) + 4);
  ctx.fillText("LEFT", 6, toY(MARK_LEFT_X) + 4);
  return ctx.getImageData(0, 0, tw, th);
}

function paintFlickerStudy(id: MarkStudyId, local: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = GEO_W;
  canvas.height = GEO_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, GEO_W, GEO_H);
  const plan = planMarkStudy(id, local, GEO_W, GEO_H, LOOP);
  paintMarkLayer(ctx, plan, MARK_FILL_BLACK);
  if (plan.flicker > 0.02) {
    ctx.fillStyle = "#c43d3d";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`flicker ${plan.flicker.toFixed(2)}`, 12, 18);
  } else {
    ctx.fillStyle = "#888";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("flicker off", 12, 18);
  }
  return ctx.getImageData(0, 0, GEO_W, GEO_H);
}

export interface MarkReport {
  defaultOff: boolean;
  offIdentity: boolean;
  stackedExactAtHold: boolean;
  dockSnaps: boolean;
  firstAlignCrosses: boolean;
  leftOvershoots: boolean;
  noSecondOscillation: boolean;
  snapFlickerOffProduct: boolean;
  interruptKeepsFlicker: boolean;
  lateralFromSvg: boolean;
  typeHiddenInIntro: boolean;
  interruptEmblemThenStacked: boolean;
  endYieldsFlicker: boolean;
  pulseKeepsMark: boolean;
  scrubReverse: boolean;
  holdExportIdentical: boolean;
  madeLenXDeterministic: boolean;
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

  const traj = section(root, "Trajectory — CURRENT oscillating (grey) vs REDUCED (black)");
  cell(traj, "CURRENT: RIGHT → ALIGN → LEFT → ALIGN → RIGHT → SNAP   |   REDUCED: RIGHT → ALIGN → LEFT → SNAP", paintTrajectory());

  const compare = section(root, "CURRENT vs REDUCED — travel-fit, white field, black mark");
  for (const local of OSC_LOCALS) {
    cell(compare, oscLabel(local), paintClean(planMarkStudy("oscillating", local, GEO_W, GEO_H, LOOP)));
  }
  for (const local of RED_LOCALS) {
    cell(compare, `RED ${scrubLabel(local)}`, paintClean(planMarkStudy("dock", local, GEO_W, GEO_H, LOOP)));
  }

  const clean = section(root, "Clean reduced — white field, black mark, no Bloom / Type / Registration");
  const xAt: number[] = [];
  for (const local of SCRUB_LOCAL) {
    const plan = planMarkStudy("dock", local, GEO_W, GEO_H, LOOP);
    xAt.push(plan.madeLenX);
    cell(clean, scrubLabel(local), paintClean(plan));
  }

  const holdPlan = planMarkStudy("dock", 0.84, GEO_W, GEO_H, LOOP);
  const stackedRef = paintStackedReference(holdPlan.layout);
  const stackedDock = paintClean(holdPlan);
  cell(clean, "HOLD vs stacked SVG (should match)", stackedRef);
  const stackedExactAtHold =
    holdPlan.madeLenX === 0 &&
    holdPlan.kind === "logotype" &&
    hashPixels(stackedRef) === hashPixels(stackedDock) &&
    pixelDiff(stackedRef, stackedDock) === 0;

  const flicker = section(root, "SNAP Flicker — A off (product) · B 120ms / 28% (eval)");
  for (const local of [0.64, 0.66, 0.68, 0.84]) {
    cell(flicker, `A off · ${Math.round(local * 100)}%`, paintFlickerStudy("flickerA", local));
    cell(flicker, `B on · ${Math.round(local * 100)}%`, paintFlickerStudy("flickerB", local));
  }

  const modes = section(root, "Intro / Interrupt / End — 9:16 · 12s (product layout, off-frame start)");
  const introR = makeRenderer(hidden);
  introR.setMarkState(introState());
  for (const local of [0, 0.28, 0.52, 0.63, 0.64, 0.68, 0.84, 0.96]) {
    cell(modes, `INTRO ${scrubLabel(local)}`, at(introR, windowPhase("intro", local)));
  }

  const offFrame = section(root, "Off-frame start — A full separation (product) · B clamped in-frame (eval)");
  const layout916 = layoutMarkRect(W, H, 78, "mc");
  const productStart = planMark(introState(), windowPhase("intro", 0), W, H, LOOP);
  cell(offFrame, `A start dx=${MARK_START_X} (product)`, paintClean({ ...productStart, layout: layout916 }, W, H));
  cell(offFrame, `B start dx=${MARK_CLAMP_START_X}`, paintClean({
    ...productStart,
    layout: layout916,
    madeLenX: MARK_CLAMP_START_X,
    aligned: markAligned(MARK_CLAMP_START_X),
  }, W, H));
  const productTravel = planMark(introState(), windowPhase("intro", 0.28), W, H, LOOP);
  cell(offFrame, "A travel 28%", paintClean({ ...productTravel, layout: layout916 }, W, H));
  const clampTravelX = MARK_CLAMP_START_X + (MARK_ALIGN_X - MARK_CLAMP_START_X) * ((0.28 - 0.16) / (0.52 - 0.16));
  cell(offFrame, "B travel 28% from clamp", paintClean({
    ...productTravel,
    layout: layout916,
    madeLenX: clampTravelX,
    aligned: markAligned(clampTravelX),
  }, W, H));
  cell(offFrame, "A 9:16 campaign start", at(introR, windowPhase("intro", 0)));
  cell(offFrame, "A 9:16 campaign 28%", at(introR, windowPhase("intro", 0.28)));
  cell(offFrame, "A 9:16 campaign HOLD", at(introR, windowPhase("intro", 0.84)));

  const intR = makeRenderer(hidden);
  intR.setMarkState(clampMarkState({ enabled: true, mode: "interrupt", source: "stacked", scale: 78 }));
  const intEmblem = at(intR, windowPhase("interrupt", 0.25));
  const intStacked = at(intR, windowPhase("interrupt", 0.6));
  const intOut = at(intR, windowPhase("interrupt", 0.95));
  cell(modes, "INTERRUPT emblem", intEmblem);
  cell(modes, "INTERRUPT stacked", intStacked);
  cell(modes, "INTERRUPT out", intOut);
  for (const local of [0.08, 0.25, 0.55, 0.88]) {
    cell(flicker, `INTERRUPT · ${Math.round(local * 100)}%`, paintFlickerStudy("interrupt", local));
  }

  const endR = makeRenderer(hidden);
  endR.setTypeState(campaignType());
  endR.setMarkState(clampMarkState({ enabled: true, mode: "end", source: "stacked", scale: 78 }));
  endR.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 70, hold: 40, duration: 40 }));
  cell(modes, "END type still", at(endR, 0.7));
  cell(modes, "END travel", at(endR, windowPhase("end", 0.28)));
  cell(modes, "END HOLD", at(endR, windowPhase("end", 0.84)));
  cell(modes, "END released", at(endR, windowPhase("end", 0.96)));

  const scrub = section(root, "Scrub reduced 0 / 16 / 28 / 40 / 52 / 58 / 63 / 64 / 68 / 80 / 92 / 100%");
  const scrubHashes: string[] = [];
  const scrubX: number[] = [];
  for (const local of SCRUB_LOCAL) {
    const img = at(introR, windowPhase("intro", local));
    scrubHashes.push(hashPixels(img));
    scrubX.push(planMark(introState(), windowPhase("intro", local), W, H, LOOP).madeLenX);
    cell(scrub, scrubLabel(local), img);
  }
  const backLocal = 0.4;
  const back = at(introR, windowPhase("intro", backLocal));
  const scrubReverse = hashPixels(back) === scrubHashes[SCRUB_LOCAL.indexOf(backLocal)];

  const creative = section(root, "Campaign — Bloom + Registration + Type · MARK End 78–96");
  const piece = makeRenderer(hidden, 360, 640);
  piece.setTypeState(campaignType());
  piece.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  piece.setPlaybackMode("pingpong");
  piece.setMarkState(clampMarkState({ enabled: true, mode: "end", source: "stacked", scale: 74 }));
  for (const p of [0.22, 0.5, 0.7, windowPhase("end", 0.28), windowPhase("end", 0.58), windowPhase("end", 0.84), 0.99]) {
    cell(creative, `END piece ${p.toFixed(2)}`, at(piece, p));
  }

  const introPiece = section(root, "Campaign — Intro 0–18");
  const open = makeRenderer(hidden, 360, 640);
  open.setTypeState(campaignType());
  open.setMarkState(clampMarkState({ enabled: true, mode: "intro", source: "stacked", scale: 80 }));
  for (const local of [0.02, 0.28, 0.52, 0.63, 0.64, 0.84, 1.1]) {
    const p = local > 1 ? 0.22 : windowPhase("intro", local);
    cell(introPiece, local > 1 ? "after MARK" : `INTRO ${scrubLabel(local)}`, at(open, p));
  }

  const dockSnaps =
    markMadeLenX(MARK_LOCAL.leftPeak - 0.001) < -1 &&
    markMadeLenX(MARK_LOCAL.leftPeak) === 0 &&
    markMadeLenX(0.84) === 0;
  const firstAlignCrosses =
    markMadeLenX(MARK_LOCAL.firstAlign) === 0 &&
    markMadeLenX(MARK_LOCAL.firstAlign - 0.02) > 0 &&
    markMadeLenX(MARK_LOCAL.firstAlign + 0.02) < 0;
  const leftOvershoots = markMadeLenX(MARK_LOCAL.leftPeak - 0.001) < -1 && MARK_LEFT_X < 0;
  let noSecondOscillation = true;
  for (let i = 0; i <= 80; i++) {
    const t = MARK_LOCAL.leftPeak + (i / 80) * (MARK_LOCAL.holdEnd - MARK_LOCAL.leftPeak);
    if (markMadeLenX(t) !== 0) noSecondOscillation = false;
  }
  const snapPhase = windowPhase("intro", MARK_LOCAL.snap);
  const snapPlan = planMark(introState(), snapPhase, W, H, LOOP);
  const snapFlickerOffProduct = snapPlan.flicker <= 0.02 && snapPlan.madeLenX === 0;
  const intFlickerPlan = planMark(
    clampMarkState({ enabled: true, mode: "interrupt" }),
    windowPhase("interrupt", 0.1),
    W,
    H,
    LOOP,
  );
  const interruptKeepsFlicker = intFlickerPlan.flicker > 0.02;
  const lateralFromSvg = MARK_LATERAL_DX > 1200 && MARK_STACKED.madeBy.length === 6 && MARK_STACKED.madeLen.length === 7;

  introR.setTypeState(campaignType());
  introR.setMarkState(introState());
  at(introR, windowPhase("intro", 0.84));
  const typeHiddenInIntro = introR.lastMarkDiagnostics?.hideType === true;

  intR.setMarkState(clampMarkState({ enabled: true, mode: "interrupt", source: "stacked" }));
  at(intR, windowPhase("interrupt", 0.25));
  const emblemKind = intR.lastMarkDiagnostics?.kind === "emblem";
  at(intR, windowPhase("interrupt", 0.6));
  const stackedKind = intR.lastMarkDiagnostics?.kind === "logotype" && intR.lastMarkDiagnostics?.aligned === true;
  const interruptEmblemThenStacked = emblemKind && stackedKind;

  endR.setMarkState(clampMarkState({ enabled: true, mode: "end", source: "stacked" }));
  endR.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 80, hold: 40, duration: 40 }));
  at(endR, windowPhase("end", 0.84));
  const endYieldsFlicker = endR.lastMarkDiagnostics?.yieldEnd === true && endR.lastEndDiagnostics?.applied !== true;

  const pulseR = makeRenderer(hidden);
  pulseR.setPlaybackMode("pingpong");
  pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  pulseR.setMarkState(introState());
  at(pulseR, windowPhase("intro", 0.84));
  const pulseKeepsMark = pulseR.lastMarkDiagnostics?.kind === "logotype";

  const travelPhase = windowPhase("intro", 0.28);
  const exportR = makeRenderer(hidden);
  exportR.setMarkState(introState());
  exportR.setHoldPhase(travelPhase);
  const preview = hashPixels(settle(exportR));
  const holdX = exportR.lastMarkDiagnostics?.madeLenX;
  exportR.beginExport(W, H);
  await exportR.renderExportFrame(travelPhase * LOOP, { graphicTime: exportR.getGraphicElapsed() });
  const exported = hashPixels(exportR.getVisibleImageData());
  const exportX = exportR.lastMarkDiagnostics?.madeLenX;
  exportR.endExport();
  const holdExportIdentical = preview === exported && exportR.getClockMode() === "hold";
  const madeLenXDeterministic = holdX === exportX && holdX === markMadeLenX(0.28);

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
  at(introR, windowPhase("intro", 0.28));
  const inside = introR.lastMarkDiagnostics?.kind === "logotype";
  const windowGates = outside && inside;

  const regR = makeRenderer(hidden);
  regR.setMarkState(introState());
  regR.setRegistrationEnabled(true);
  const withReg = at(regR, windowPhase("intro", 0.84));
  regR.setRegistrationEnabled(false);
  const noReg = at(regR, windowPhase("intro", 0.84));
  const registrationLeavesCleanHold =
    pixelDiff(withReg, noReg) > 0 && planMark(introState(), windowPhase("intro", 0.84), W, H, LOOP).aligned === true;

  return {
    defaultOff,
    offIdentity,
    stackedExactAtHold,
    dockSnaps,
    firstAlignCrosses,
    leftOvershoots,
    noSecondOscillation,
    snapFlickerOffProduct,
    interruptKeepsFlicker,
    lateralFromSvg,
    typeHiddenInIntro,
    interruptEmblemThenStacked,
    endYieldsFlicker,
    pulseKeepsMark,
    scrubReverse,
    holdExportIdentical,
    madeLenXDeterministic,
    savedRestore,
    randomiseLeaves,
    windowGates,
    registrationLeavesCleanHold,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      lateralDx: MARK_LATERAL_DX,
      startX: MARK_START_X,
      leftX: MARK_LEFT_X,
      rightX: MARK_RIGHT_X,
      clampStartX: MARK_CLAMP_START_X,
      stacked: MARK_STACKED.width,
      introWindow: MARK_MODE_WINDOW.intro,
      holdX: holdPlan.madeLenX,
      snapFlicker: snapPlan.flicker,
      interruptFlicker: intFlickerPlan.flicker,
      scrubX,
      xAt,
      travelLayout: layoutMarkTravelRect(GEO_W, GEO_H, 80, "mc"),
      preview,
      exported,
    },
  };
}
