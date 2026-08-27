import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings, type EndBehaviourMode } from "../core/endBehaviour";
import { clampTypeState } from "../core/typeState";
import { limitedSequenceResolve, sequenceEnvelope } from "../core/sequencePhase";

const W = 320;
const H = 400;
const LOOP = 12;
const LIMITS = [100, 75, 50, 25, 0];
const PHASES = [0.25, 0.5, 0.7, 0.85, 0.95, 0.995];
const EXPORT_TIMES = [0, 1, 3, 6, 11.9];

function hashPixels(img: ImageData): string {
  let h = 2166136261;
  const d = img.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
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

function makeRenderer(host: HTMLElement, sources = 2): Renderer {
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
  renderer.setBehavior(bloomBehavior, bloomParams(100));
  const items = [
    { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#1c1c1e"), "01") },
    { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#c8a070"), "02") },
  ];
  if (sources >= 3) {
    items.push({ id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#3a5a8a"), "03") });
  }
  renderer.setSequence(items, undefined);
  renderer.setTypeState(clampTypeState({ enabled: false }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 8; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function allEqual(hashes: string[]): boolean {
  return hashes.length > 0 && hashes.every((h) => h === hashes[0]);
}

export interface ResolveLimitReport {
  identity100: boolean;
  peakUnaffected: boolean;
  terminalDiffers: boolean;
  holdExportIdentical: boolean;
  autoMoves: boolean;
  envelopeMath: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runResolveLimitSheet(root: HTMLElement): Promise<ResolveLimitReport> {
  const t0 = performance.now();
  root.textContent = "";

  const host = document.createElement("div");
  root.appendChild(host);
  const renderer = makeRenderer(host, 2);

  const matrix = section(root, "Bloom Expressive — Resolve Limit × phase");
  const hashes: Record<string, string> = {};

  for (const limit of LIMITS) {
    renderer.setParams(bloomParams(limit));
    for (const phase of PHASES) {
      renderer.setClockMode("hold");
      renderer.setHoldPhase(phase);
      const img = settle(renderer);
      const key = `${limit}@${phase}`;
      hashes[key] = hashPixels(img);
      cell(matrix, `L${limit}  p${phase.toFixed(3)}`, img);
    }
  }

  renderer.setParams(bloomParams(100));
  const omitted: ParamValues = { ...bloomParams(100) };
  delete omitted.resolveLimit;
  renderer.setParams(omitted);
  renderer.setHoldPhase(0.995);
  const omittedHash = hashPixels(settle(renderer));
  const identity100 = hashes["100@0.995"] === omittedHash;

  const peakUnaffected = PHASES.filter((p) => p <= 0.7).every((p) =>
    allEqual(LIMITS.map((l) => hashes[`${l}@${p}`]!)),
  );

  const terminal = LIMITS.map((l) => hashes[`${l}@0.995`]!);
  const terminalDiffers = new Set(terminal).size === LIMITS.length;

  const env995 = sequenceEnvelope("bloom", "clean", 0.995);
  const envelopeMath =
    limitedSequenceResolve(env995.resolve, 100) === env995.resolve &&
    limitedSequenceResolve(env995.resolve, 50) === env995.resolve * 0.5 &&
    limitedSequenceResolve(env995.resolve, 0) === 0 &&
    limitedSequenceResolve(env995.resolve, undefined) === env995.resolve;

  renderer.setParams(bloomParams(45));
  renderer.setClockMode("hold");
  renderer.setHoldPhase(0.85);
  const holdPreview = hashPixels(settle(renderer));
  renderer.beginExport(W, H);
  const holdFrames: string[] = [];
  for (const t of EXPORT_TIMES) {
    await renderer.renderExportFrame(t);
    holdFrames.push(hashPixels(renderer.getVisibleImageData()));
  }
  renderer.endExport();
  renderer.resizeExact(W, H);
  const holdExportIdentical = allEqual([holdPreview, ...holdFrames]);

  renderer.setParams(bloomParams(100));
  renderer.setClockMode("auto");
  renderer.seekLoopPhase(0.17);
  const a17 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.63);
  const a63 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.95);
  const a95 = hashPixels(settle(renderer));
  const autoMoves = a17 !== a63 && a63 !== a95;

  const ends = section(root, "End Behaviour at phase 0.96 — Limit 100 vs 50");
  for (const limit of [100, 50]) {
    for (const mode of ["off", "flicker"] as EndBehaviourMode[]) {
      renderer.setParams(bloomParams(limit));
      renderer.setEndBehaviour(clampEndBehaviourSettings({ mode, amount: 50, hold: 40, duration: 45 }));
      renderer.setClockMode("hold");
      renderer.setHoldPhase(0.96);
      cell(ends, `${mode} L${limit}`, settle(renderer));
    }
  }
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));

  const seqHost = document.createElement("div");
  seqHost.style.display = "none";
  root.appendChild(seqHost);
  const seq = makeRenderer(seqHost, 3);
  seq.setParams(bloomParams(50));
  const strip = section(root, "3-source sequence — Resolve Limit 50 (pair boundaries at ⅓, ⅔)");
  const seqPhases = [0, 0.28, 0.32, 0.333, 0.34, 0.5, 0.65, 0.666, 0.67, 0.85, 0.995];
  const seqPairs: number[] = [];
  for (const p of seqPhases) {
    seq.setClockMode("hold");
    seq.setHoldPhase(p);
    const img = settle(seq);
    const info = seq.mediaInfo();
    seqPairs.push(info.pairIndex);
    cell(strip, `p${p.toFixed(3)} pair ${info.pairIndex}`, img);
  }

  return {
    identity100,
    peakUnaffected,
    terminalDiffers,
    holdExportIdentical,
    autoMoves,
    envelopeMath,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      hashes,
      omittedHash,
      holdPreview,
      holdFrames,
      auto: { a17, a63, a95 },
      seqPairs,
      env995: env995.resolve,
    },
  };
}
