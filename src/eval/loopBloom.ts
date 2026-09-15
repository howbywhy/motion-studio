import { bloomBehavior, lastBloomFieldMap } from "../behaviors/bloom";
import {
  bloomFieldBiasForPair,
  formatBias,
  getEvalLoopBloomVariantStrength,
  sequenceMap,
  setEvalLoopBloomVariantStrength,
  variantIdForPair,
  VARIANT_STRENGTHS,
  type VariantStrength,
} from "../core/bloomPairVariant";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { clampTypeState } from "../core/typeState";
import { loopPhaseFromElapsed, resolveActivePair } from "../core/sequence";
import { bloomPulsePhase, DEFAULT_BLOOM_PULSE } from "../core/bloomPulse";
import { sequenceEnvelope, ENVELOPE_B_HOLD } from "../core/sequencePhase";
import { timeFromPhase } from "../core/phaseClock";
import { transitionPairCuts } from "../core/transitionFlicker";

const W = 288;
const H = 360;
const LOOP = 12;
const SEAM = [0.97, 0.983, 0.992, 0, 0.008, 0.017] as const;
const TEMPO = [4, 8, 12] as const;
const ENVELOPE_LOCALS = [0, 0.26, 0.52, 0.62, 0.72, 0.86, 1] as const;

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

function meanAbsDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  const da = a.data;
  const db = b.data;
  let sum = 0;
  for (let i = 0; i < da.length; i++) sum += Math.abs(da[i]! - db[i]!);
  return sum / da.length;
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

function note(root: HTMLElement, text: string): void {
  const p = document.createElement("p");
  p.textContent = text;
  root.appendChild(p);
}

function table(root: HTMLElement, title: string, rows: string[][]): void {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  const pre = document.createElement("pre");
  pre.className = "sheet";
  pre.textContent = rows.map((r) => r.join("\t")).join("\n");
  root.appendChild(pre);
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

function strengthLabel(strength: VariantStrength): string {
  if (strength === "current") return "LEGACY";
  if (strength === "medium") return "PROD";
  return strength.toUpperCase();
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

function paintScene(kind: string, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (kind === "portrait") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2a1810");
    g.addColorStop(0.45, "#8a5a3a");
    g.addColorStop(1, "#1a100c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#d4a07a";
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.36, w * 0.18, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2218";
    ctx.fillRect(w * 0.28, h * 0.5, w * 0.44, h * 0.5);
  } else if (kind === "texture") {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const n = ((x * 73 + y * 157) ^ (x * 19 + y * 9)) & 255;
        img.data[i] = 90 + (n % 80);
        img.data[i + 1] = 70 + ((n * 3) % 70);
        img.data[i + 2] = 55 + ((n * 5) % 50);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (kind === "contrast") {
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(w * 0.52, 0, w * 0.48, h);
  } else if (kind === "soft") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#9a8070");
    g.addColorStop(1, "#7a6860");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (kind === "edge") {
    ctx.fillStyle = "#1c1410";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c8a070";
    ctx.beginPath();
    ctx.ellipse(w * 0.12, h * 0.55, w * 0.16, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "space") {
    ctx.fillStyle = "#14120e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b08968";
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.48, w * 0.08, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = kind;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

function makeRenderer(
  host: HTMLElement,
  mode: "loop" | "pingpong",
  opts?: { count?: number; w?: number; h?: number; scenes?: string[]; identical?: boolean },
): Renderer {
  const w = opts?.w ?? W;
  const h = opts?.h ?? H;
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(w, h);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode(mode);
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(60);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams());
  const n = opts?.count ?? 2;
  const identical = opts?.identical === true;
  const scenes = opts?.scenes ?? (identical ? ["portrait", "portrait", "portrait", "portrait", "portrait"] : ["#1c1c1e", "#c8a070", "#4a5a48", "#8a5a3a", "#2a2030"]);
  const items = [];
  for (let i = 0; i < n; i++) {
    const scene = identical ? (scenes[0] ?? "portrait") : (scenes[i] ?? `#${((i + 3) * 37).toString(16).padStart(6, "0")}`);
    const src = scene.startsWith("#") ? placeholderA(scene) : paintScene(scene, 640, 800);
    items.push({ id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(src, String(i + 1).padStart(2, "0")) });
  }
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

function at(renderer: Renderer, phase: number, strength: VariantStrength = "medium"): ImageData {
  renderer.setClockMode("hold");
  renderer.setHoldPhase(phase);
  const prev = getEvalLoopBloomVariantStrength();
  setEvalLoopBloomVariantStrength(strength);
  try {
    return settle(renderer);
  } finally {
    setEvalLoopBloomVariantStrength(prev);
  }
}

function masterFor(pairIndex: number, local: number, pairCount: number): number {
  return (pairIndex + local) / pairCount;
}

function fieldKey(): string {
  const map = lastBloomFieldMap();
  if (!map) return "none";
  return map.fields.map((f) => `${f.cx.toFixed(1)},${f.cy.toFixed(1)},${f.radius.toFixed(1)},${f.alpha.toFixed(2)}`).join("|");
}

function timingRow(pairCount: number, loopSeconds: number, local: number): string[] {
  const env = sequenceEnvelope("bloom", "clean", local);
  const bloomT = timeFromPhase("bloom", env.behaviorPhase, bloomParams());
  const wall = (loopSeconds / pairCount) * local;
  return [
    String(pairCount),
    loopSeconds.toFixed(0),
    local.toFixed(2),
    env.behaviorPhase.toFixed(3),
    env.resolve.toFixed(3),
    bloomT.toFixed(3),
    wall.toFixed(2),
  ];
}

export interface LoopBloomReport {
  pulseWrapMatches: boolean;
  durationPreservesPhaseLook: boolean;
  exportOmitsDuplicateEndFrame: boolean;
  holdExportIdenticalAtSeam: boolean;
  paramChangeKeepsPhase: boolean;
  singleRaf: boolean;
  fieldEnergySameAcrossPairs: boolean;
  wrapStepVsInternalStep: boolean;
  flickerDoesNotHitWrap: boolean;
  pairCountIsModelA: boolean;
  currentRepeatsAcrossPairs: boolean;
  mediumDiffersAcrossPairs: boolean;
  pulseUnchangedByVariant: boolean;
  pulseIsolationAfterLoop: boolean;
  variantPreviewExportMatch: boolean;
  durationKeepsVariant: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

function mountLiveInstrument(root: HTMLElement): void {
  const box = document.createElement("section");
  box.className = "live";
  const h = document.createElement("h2");
  h.textContent = "Live instrument — Loop vs Pulse · pair count · timing";
  box.appendChild(h);
  note(box, "Internal QA only. Loop can trial pair-field variants. Pulse stays the locked cyclic Bloom — no pair variation.");

  const row = document.createElement("div");
  row.className = "live-row";
  const loopHost = document.createElement("div");
  const pulseHost = document.createElement("div");
  loopHost.className = "stage";
  pulseHost.className = "stage";
  row.appendChild(loopHost);
  row.appendChild(pulseHost);
  box.appendChild(row);

  const hud = document.createElement("pre");
  hud.className = "hud";
  box.appendChild(hud);

  const bar = document.createElement("div");
  bar.className = "bar";
  box.appendChild(bar);

  const loopCanvas = document.createElement("canvas");
  const pulseCanvas = document.createElement("canvas");
  loopHost.appendChild(loopCanvas);
  pulseHost.appendChild(pulseCanvas);
  const capL = document.createElement("div");
  capL.textContent = "LOOP";
  const capP = document.createElement("div");
  capP.textContent = "PULSE";
  loopHost.appendChild(capL);
  pulseHost.appendChild(capP);

  const liveLoop = new Renderer(loopCanvas);
  const livePulse = new Renderer(pulseCanvas);
  let liveStrength: VariantStrength = "medium";
  let identical = true;
  const mixed = ["portrait", "texture", "contrast", "edge", "space"];
  const applyLiveStrength = (): void => {
    setEvalLoopBloomVariantStrength(liveStrength === "medium" ? null : liveStrength);
  };
  applyLiveStrength();

  const wire = (renderer: Renderer, mode: "loop" | "pingpong", count: number): void => {
    renderer.pause();
    renderer.resizeExact(W, H);
    renderer.setLoopSeconds(LOOP);
    renderer.setPlaybackMode(mode);
    renderer.setRegistrationEnabled(true);
    renderer.setRegistrationAmount(60);
    renderer.setBwMode("off");
    renderer.setBehavior(bloomBehavior, bloomParams());
    const items = [];
    for (let i = 0; i < count; i++) {
      const scene = identical ? "portrait" : (mixed[i] ?? "soft");
      items.push({
        id: renderer.nextSourceId(),
        asset: wrapCanvasAsPlaceholder(paintScene(scene, 640, 800), String(i + 1).padStart(2, "0")),
      });
    }
    renderer.setSequence(items, undefined);
    renderer.setTypeState(clampTypeState({ enabled: false }));
    renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
    renderer.setTransitionFlickerEnabled(false);
    renderer.setClockMode("auto");
    if (mode === "pingpong") renderer.setBloomPulse({ ...DEFAULT_BLOOM_PULSE });
    renderer.play();
  };

  let pairCount = 2;
  wire(liveLoop, "loop", pairCount);
  wire(livePulse, "pingpong", pairCount);

  const setCount = (n: number): void => {
    pairCount = n;
    wire(liveLoop, "loop", n);
    wire(livePulse, "pingpong", n);
  };

  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${n} pairs`;
    b.addEventListener("click", () => setCount(n));
    bar.appendChild(b);
  }
  for (const s of VARIANT_STRENGTHS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s === "current" ? "LEGACY" : s === "medium" ? "PRODUCTION" : s.toUpperCase();
    b.addEventListener("click", () => {
      liveStrength = s;
      applyLiveStrength();
    });
    bar.appendChild(b);
  }
  const imgBtn = document.createElement("button");
  imgBtn.type = "button";
  imgBtn.textContent = "identical / mixed";
  imgBtn.addEventListener("click", () => {
    identical = !identical;
    setCount(pairCount);
  });
  bar.appendChild(imgBtn);

  liveLoop.onFrame = () => {
    const phase = liveLoop.getLoopPhase();
    const pair = liveLoop.getActivePair();
    const env = sequenceEnvelope("bloom", "clean", pair.localPhase);
    const bloomT = timeFromPhase("bloom", env.behaviorPhase, bloomParams());
    const pulse = livePulse.getLoopPhase();
    const id = variantIdForPair(pair.pairIndex, pair.pairCount);
    hud.textContent = [
      `LOOP   ${liveStrength.toUpperCase()}  variant ${id}  ${formatBias(bloomFieldBiasForPair(pair.pairIndex, liveStrength, pair.pairCount))}  ${sequenceMap(pair.pairCount)}`,
      `       master ${phase.toFixed(4)}   pair ${pair.pairIndex}/${pair.pairCount}   local ${pair.localPhase.toFixed(4)}   env.beh ${env.behaviorPhase.toFixed(3)}   env.res ${env.resolve.toFixed(3)}   bloom t ${bloomT.toFixed(3)}`,
      `PULSE  CURRENT only  master ${pulse.toFixed(4)}   pair frozen 0   sample ${livePulse.getBloomSamplePhase().toFixed(4)}   u ${bloomPulsePhase(pulse, 0.42, 0.58, 1).toFixed(4)}`,
    ].join("\n");
  };

  root.appendChild(box);
}

export async function runLoopBloomSheet(root: HTMLElement): Promise<LoopBloomReport> {
  const t0 = performance.now();
  root.innerHTML = "";
  const hidden = document.createElement("div");
  hidden.style.display = "none";
  root.appendChild(hidden);

  note(root, "Loop is a pair sequence. Pulse is the cyclic Bloom. This page is QA only — no product controls.");
  mountLiveInstrument(root);

  const sameR = makeRenderer(hidden, "loop", { count: 3, identical: true });
  const diagRows: string[][] = [["pair", "local", "variant", "cx0", "cy0", "r0", "a0", "cx1", "cy1"]];
  const currentKeys: string[] = [];
  for (const pairIndex of [0, 1, 2]) {
    for (const local of [0.1, 0.25, 0.5, 0.8]) {
      at(sameR, masterFor(pairIndex, local, 3), "current");
      const map = lastBloomFieldMap();
      const f0 = map?.fields[0];
      const f1 = map?.fields[1];
      const key = `${local}:${fieldKey()}`;
      if (pairIndex === 0) currentKeys.push(key);
      diagRows.push([
        String(pairIndex),
        local.toFixed(2),
        variantIdForPair(pairIndex, 3),
        (f0?.cx ?? 0).toFixed(1),
        (f0?.cy ?? 0).toFixed(1),
        (f0?.radius ?? 0).toFixed(1),
        (f0?.alpha ?? 0).toFixed(2),
        (f1?.cx ?? 0).toFixed(1),
        (f1?.cy ?? 0).toFixed(1),
      ]);
    }
  }
  const currentRepeatsAcrossPairs = [0, 1, 2].every((pairIndex) =>
    [0.1, 0.25, 0.5, 0.8].every((local, i) => {
      at(sameR, masterFor(pairIndex, local, 3), "current");
      return `${local}:${fieldKey()}` === currentKeys[i];
    }),
  );
  table(root, "LEGACY — identical image · field geometry repeats across pairs", diagRows);

  const compareLocals = [0.25, 0.52, 0.8] as const;
  for (const local of compareLocals) {
    const grid = section(root, `Identical image · local ${local.toFixed(2)} · LEGACY / LOW / PROD / HIGH × pair 0 1 2`);
    for (const strength of VARIANT_STRENGTHS) {
      for (const pairIndex of [0, 1, 2]) {
        const img = at(sameR, masterFor(pairIndex, local, 3), strength);
        cell(grid, `${strengthLabel(strength)} p${pairIndex} ${variantIdForPair(pairIndex, 3)}`, img);
      }
    }
  }

  const twoSame = makeRenderer(hidden, "loop", { count: 2, identical: true });
  const twoGrid = section(root, "Two-source identical · peak 0.52 — LEGACY vs PRODUCTION (A then C)");
  cell(twoGrid, "LEGACY p0", at(twoSame, masterFor(0, 0.52, 2), "current"));
  cell(twoGrid, "LEGACY p1", at(twoSame, masterFor(1, 0.52, 2), "current"));
  cell(twoGrid, "PROD p0 A", at(twoSame, masterFor(0, 0.52, 2), "medium"));
  cell(twoGrid, "PROD p1 C", at(twoSame, masterFor(1, 0.52, 2), "medium"));

  at(sameR, masterFor(0, 0.25, 3), "medium");
  const medium0 = fieldKey();
  at(sameR, masterFor(1, 0.25, 3), "medium");
  const medium1 = fieldKey();
  at(sameR, masterFor(2, 0.25, 3), "medium");
  const medium2 = fieldKey();
  const mediumDiffersAcrossPairs = medium0 !== medium1 && medium1 !== medium2 && medium0 !== medium2;

  const mixedVar = makeRenderer(hidden, "loop", { count: 4, scenes: ["portrait", "texture", "contrast", "edge"] });
  const mixedGrid = section(root, "Mixed photography stand-ins · local 0.52 · MEDIUM");
  for (const pairIndex of [0, 1, 2, 3]) {
    cell(mixedGrid, `p${pairIndex} ${variantIdForPair(pairIndex, 4)}`, at(mixedVar, masterFor(pairIndex, 0.52, 4), "medium"));
  }

  note(root, `Sequence maps  ${[2, 3, 4, 5, 6, 7, 8].map((n) => `${n}: ${sequenceMap(n)}`).join("   ")}`);

  const pulseCheck = makeRenderer(hidden, "pingpong", { identical: true });
  pulseCheck.setBloomPulse({ ...DEFAULT_BLOOM_PULSE });
  const pulseCurrent = hashPixels(at(pulseCheck, 0.25, "current"));
  const pulseMedium = hashPixels(at(pulseCheck, 0.25, "medium"));
  const pulseHigh = hashPixels(at(pulseCheck, 0.25, "high"));
  const pulseUnchangedByVariant = pulseCurrent === pulseMedium && pulseMedium === pulseHigh;

  at(twoSame, masterFor(1, 0.52, 2), "high");
  const pulseAfterLoopHigh = hashPixels(at(pulseCheck, 0.25, "medium"));
  const pulseIsolationAfterLoop = pulseAfterLoopHigh === pulseCurrent;

  const detR = makeRenderer(hidden, "loop", { identical: true, count: 2 });
  const parityLocals = [0.1, 0.52, 0.72, 0.86] as const;
  const holdParity: Record<string, string> = {};
  const expParity: Record<string, string> = {};
  const autoFieldParity: Record<string, boolean> = {};
  for (const pairIndex of [0, 1]) {
    for (const local of parityLocals) {
      const key = `${pairIndex}:${local}`;
      const master = masterFor(pairIndex, local, 2);
      holdParity[key] = hashPixels(at(detR, master, "medium"));
      const holdFields = fieldKey();
      detR.beginExport(W, H);
      setEvalLoopBloomVariantStrength(null);
      await detR.renderExportFrame(master * LOOP, { graphicTime: detR.getGraphicElapsed() });
      expParity[key] = hashPixels(detR.getVisibleImageData());
      detR.endExport();
      detR.resizeExact(W, H);
      detR.setClockMode("auto");
      detR.beginExport(W, H);
      setEvalLoopBloomVariantStrength(null);
      await detR.renderExportFrame(master * LOOP, { graphicTime: 0 });
      autoFieldParity[key] = fieldKey() === holdFields;
      detR.endExport();
      detR.resizeExact(W, H);
      detR.setClockMode("hold");
    }
  }
  const hold0 = holdParity["0:0.52"] ?? "";
  const hold1 = holdParity["1:0.52"] ?? "";
  const exp0 = expParity["0:0.52"] ?? "";
  const exp1 = expParity["1:0.52"] ?? "";
  const variantPreviewExportMatch =
    Object.keys(holdParity).every((k) => holdParity[k] === expParity[k]) &&
    Object.values(autoFieldParity).every(Boolean);

  detR.setLoopSeconds(8);
  const at8 = hashPixels(at(detR, masterFor(0, 0.25, 2), "medium"));
  detR.setLoopSeconds(12);
  const at12 = hashPixels(at(detR, masterFor(0, 0.25, 2), "medium"));
  const durationKeepsVariant = at8 === at12;

  const loopR = makeRenderer(hidden, "loop");
  const pulseR = makeRenderer(hidden, "pingpong");
  pulseR.setBloomPulse({ ...DEFAULT_BLOOM_PULSE });

  const internal = section(root, "Internal pair boundary 0.50 — pair 0 resolve → pair 1 emerge");
  const internalPhases = [0.48, 0.492, 0.5, 0.508, 0.52];
  const internalFrames: ImageData[] = [];
  for (const p of internalPhases) {
    const img = at(loopR, p);
    internalFrames.push(img);
    const pair = loopR.getActivePair();
    const env = sequenceEnvelope("bloom", "clean", pair.localPhase);
    cell(internal, `φ ${p.toFixed(3)}  p${pair.pairIndex} L${pair.localPhase.toFixed(3)} r${env.resolve.toFixed(2)}`, img);
  }

  const wrapGrid = section(root, "Master wrap — last pair resolve → pair 0 emerge");
  const loopFrames: ImageData[] = [];
  for (const p of SEAM) {
    const img = at(loopR, p);
    loopFrames.push(img);
    const pair = loopR.getActivePair();
    const env = sequenceEnvelope("bloom", "clean", pair.localPhase);
    cell(wrapGrid, `φ ${p.toFixed(3)}  p${pair.pairIndex} L${pair.localPhase.toFixed(3)} r${env.resolve.toFixed(2)}`, img);
  }

  const pulseSeam = section(root, "Pulse wrap — same pair, cyclic sample");
  const pulseFrames: ImageData[] = [];
  for (const p of SEAM) {
    const img = at(pulseR, p);
    pulseFrames.push(img);
    cell(pulseSeam, `PULSE ${p.toFixed(3)}  u=${bloomPulsePhase(p, 0.42, 0.58, 1).toFixed(3)}`, img);
  }

  const internalStep = meanAbsDiff(internalFrames[1]!, internalFrames[2]!);
  const wrapStep = meanAbsDiff(loopFrames[2]!, loopFrames[3]!);
  const internalPixelStep = pixelDiff(internalFrames[1]!, internalFrames[2]!);
  const wrapPixelStep = pixelDiff(loopFrames[2]!, loopFrames[3]!);
  const wrapStepVsInternalStep = Math.abs(wrapStep - internalStep) / Math.max(1, internalStep) < 1.25;

  const pulseWrapDiff = meanAbsDiff(pulseFrames[2]!, pulseFrames[3]!);
  const pulseStepDiff = meanAbsDiff(pulseFrames[3]!, pulseFrames[4]!);
  const pulseWrapMatches = pulseWrapDiff <= pulseStepDiff * 2.5;

  at(loopR, masterFor(0, 0.25, 2), "current");
  const fields0 = fieldKey();
  at(loopR, masterFor(1, 0.25, 2), "current");
  const fields1 = fieldKey();
  const fieldEnergySameAcrossPairs = fields0 === fields1 && fields0 !== "none";

  const flickerCuts = transitionPairCuts(2);
  const flickerDoesNotHitWrap = flickerCuts.length === 1 && flickerCuts[0] === 0.5 && !flickerCuts.includes(0);

  const envGrid = section(root, "Envelope B — pair 0 locals (emerge / peak / hold / resolve)");
  for (const local of ENVELOPE_LOCALS) {
    const p = masterFor(0, local, 2);
    const img = at(loopR, p);
    const env = sequenceEnvelope("bloom", "clean", local);
    cell(envGrid, `L${local.toFixed(2)}  beh ${env.behaviorPhase.toFixed(2)}  res ${env.resolve.toFixed(2)}`, img);
  }

  const tempoRows: string[][] = [["pairs", "loop s", "local", "behφ", "resolve", "bloom t", "wall s"]];
  for (const pairs of [2, 3, 4, 5]) {
    for (const local of [0, 0.52, ENVELOPE_B_HOLD, 1]) {
      tempoRows.push(timingRow(pairs, LOOP, local));
    }
  }
  table(root, "Pair-count model A — fixed 12s loop, more pairs = shorter Bloom events", tempoRows);

  const counts = section(root, "Pair count — same local 0.52 on first pair");
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const r = makeRenderer(hidden, "loop", { count: n });
    const img = at(r, masterFor(0, 0.52, n));
    cell(counts, `${n} pairs  φ=${masterFor(0, 0.52, n).toFixed(3)}  ${ (LOOP / n).toFixed(1)}s/event`, img);
  }
  const pairCountIsModelA =
    Math.abs(LOOP / 2 - 6) < 1e-9 &&
    resolveActivePair(4, 0.25, "loop").pairIndex === 1 &&
    resolveActivePair(4, 0.25, "loop").localPhase === 0;

  const tempo = section(root, "Duration changes tempo — same master phase 0.25");
  const tempoHashes: string[] = [];
  for (const seconds of TEMPO) {
    loopR.setLoopSeconds(seconds);
    const img = at(loopR, 0.25);
    tempoHashes.push(hashPixels(img));
    cell(tempo, `${seconds}s @ 0.25`, img);
  }
  loopR.setLoopSeconds(LOOP);
  const durationPreservesPhaseLook = tempoHashes.every((h) => h === tempoHashes[0]);

  const formats = section(root, "Formats — 4:5 and 9:16 at wrap-adjacent phases");
  const fmtSpecs = [
    { id: "4:5", w: 288, h: 360 },
    { id: "9:16", w: 288, h: 512 },
  ];
  const formatHashes: Record<string, string> = {};
  for (const spec of fmtSpecs) {
    const r = makeRenderer(hidden, "loop", { w: spec.w, h: spec.h });
    for (const p of [0.492, 0.5, 0.992, 0]) {
      const img = at(r, p);
      formatHashes[`${spec.id}:${p}`] = hashPixels(img);
      cell(formats, `${spec.id} φ${p.toFixed(3)}`, img);
    }
  }

  const scenes = section(root, "Creative stills — portrait / texture / contrast / edge at peak and wrap");
  const sceneR = makeRenderer(hidden, "loop", { scenes: ["portrait", "texture"] });
  for (const p of [0.26, 0.52, 0.86, 0.992, 0]) {
    cell(scenes, `photo φ${p.toFixed(3)}`, at(sceneR, p));
  }
  const sceneR2 = makeRenderer(hidden, "loop", { scenes: ["contrast", "edge"] });
  for (const p of [0.52, 0.992, 0]) {
    cell(scenes, `hard φ${p.toFixed(3)}`, at(sceneR2, p));
  }
  const sceneR3 = makeRenderer(hidden, "loop", { scenes: ["space", "soft"] });
  for (const p of [0.52, 0]) {
    cell(scenes, `quiet φ${p.toFixed(3)}`, at(sceneR3, p));
  }

  const profileRows: string[][] = [["size", "phase", "resolveMs", "totalMs"]];
  for (const spec of [
    { w: 288, h: 360 },
    { w: 540, h: 675 },
    { w: 1080, h: 1350 },
  ]) {
    const r = makeRenderer(hidden, "loop", { w: spec.w, h: spec.h });
    r.setProfiling(true);
    for (const local of [0.26, 0.9]) {
      at(r, masterFor(0, local, 2));
      const prof = r.lastProfile;
      profileRows.push([
        `${spec.w}×${spec.h}`,
        local.toFixed(2),
        (prof?.resolveMs ?? -1).toFixed(2),
        (prof?.totalMs ?? -1).toFixed(2),
      ]);
    }
    r.setProfiling(false);
  }
  table(root, "applySequenceResolve cost — resolveMs at emerge vs terminal", profileRows);

  const fps = 30;
  const frameCount = Math.max(1, Math.round(LOOP * fps));
  const lastPhase = loopPhaseFromElapsed((frameCount - 1) / fps, LOOP);
  const dupEnd = loopPhaseFromElapsed(frameCount / fps, LOOP);
  const exportOmitsDuplicateEndFrame = lastPhase > 0.99 && lastPhase < 1 && dupEnd === 0;

  const exportR = makeRenderer(hidden, "loop");
  const seamPhase = 0.992;
  exportR.setHoldPhase(seamPhase);
  const preview = hashPixels(settle(exportR));
  exportR.beginExport(W, H);
  await exportR.renderExportFrame(seamPhase * LOOP, { graphicTime: exportR.getGraphicElapsed() });
  const exported = hashPixels(exportR.getVisibleImageData());
  exportR.endExport();
  const holdExportIdenticalAtSeam = preview === exported;

  const phaseBefore = loopR.getLoopPhase();
  loopR.setParams({ ...bloomParams(), drift: 40 });
  const paramChangeKeepsPhase = Math.abs(loopR.getLoopPhase() - phaseBefore) < 1e-9;
  loopR.setParams(bloomParams());

  loopR.play();
  const d1 = loopR.getPreviewClockDiagnostics();
  loopR.play();
  const d2 = loopR.getPreviewClockDiagnostics();
  loopR.pause();
  const singleRaf = d1.loopActive && d2.loopActive && d2.rafStarts === d1.rafStarts;
  setEvalLoopBloomVariantStrength(null);

  return {
    pulseWrapMatches,
    durationPreservesPhaseLook,
    exportOmitsDuplicateEndFrame,
    holdExportIdenticalAtSeam,
    paramChangeKeepsPhase,
    singleRaf,
    fieldEnergySameAcrossPairs,
    wrapStepVsInternalStep,
    flickerDoesNotHitWrap,
    pairCountIsModelA,
    currentRepeatsAcrossPairs,
    mediumDiffersAcrossPairs,
    pulseUnchangedByVariant,
    pulseIsolationAfterLoop,
    variantPreviewExportMatch,
    durationKeepsVariant,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      internalStep,
      wrapStep,
      internalPixelStep,
      wrapPixelStep,
      pulseWrapDiff,
      pulseStepDiff,
      fields0,
      fields1,
      flickerCuts,
      tempoHashes,
      formatHashes,
      frameCount,
      lastPhase,
      dupEnd,
      preview,
      exported,
      medium0,
      medium1,
      medium2,
      hold0,
      hold1,
      exp0,
      exp1,
      at8,
      at12,
      pulseCurrent,
      pulseMedium,
      pulseHigh,
      pulseAfterLoopHigh,
      sequenceMaps: Object.fromEntries([2, 3, 4, 5, 6, 7, 8].map((n) => [n, sequenceMap(n)])),
      holdParity,
      expParity,
      autoFieldParity,
      rafStarts: d2.rafStarts,
      secondsPerEvent: { 2: LOOP / 2, 3: LOOP / 3, 4: LOOP / 4, 5: LOOP / 5 },
    },
  };
}
