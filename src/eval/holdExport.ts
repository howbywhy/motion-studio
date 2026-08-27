import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings, type EndBehaviourMode } from "../core/endBehaviour";
import { clampTypeState } from "../core/typeState";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const W = 320;
const H = 400;
const LOOP = 12;
const PHASES = [0, 0.17, 0.37, 0.63, 0.91, 0.97];
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

function pixelDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n += 1;
  return n;
}

function bloomParams(label: string) {
  const found = presetsForTreatment("clean").find((p) => p.label === label);
  if (!found) throw new Error(`Missing Bloom preset ${label}`);
  return { ...defaultParamValues(bloomBehavior.params), treatment: "clean", imageAware: "off", ...found.values };
}

function typeOn() {
  return clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, text: "MADE TO BE WORN", composition: "headline", anchor: "bl", color: "#ffffff", scale: 62 },
      { enabled: true, text: "NOW AVAILABLE", composition: "footnote", anchor: "bl", color: "#ffffff", scale: 34 },
    ],
  });
}

function makeRenderer(host: HTMLElement): Renderer {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W, H);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(true);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams("Expressive"));
  renderer.setSequence(
    [
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA(), "01") },
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA(), "02") },
    ],
    undefined,
  );
  renderer.setTypeState(clampTypeState({ enabled: false }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  return renderer;
}

async function previewHash(renderer: Renderer): Promise<{ hash: string; img: ImageData; phase: number }> {
  for (let i = 0; i < 8; i++) renderer.renderFrame();
  const img = renderer.getVisibleImageData();
  return { hash: hashPixels(img), img, phase: renderer.getLoopPhase() };
}

async function exportHash(renderer: Renderer, timeSec: number): Promise<{ hash: string; img: ImageData; phase: number }> {
  await renderer.renderExportFrame(timeSec);
  const img = renderer.getVisibleImageData();
  return { hash: hashPixels(img), img, phase: renderer.getLoopPhase() };
}

function finishExport(renderer: Renderer): void {
  renderer.endExport();
  renderer.resizeExact(W, H);
}

function allEqual(hashes: string[]): boolean {
  return hashes.length > 0 && hashes.every((h) => h === hashes[0]);
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

export interface HoldExportReport {
  holdIdentical: boolean;
  autoMoves: boolean;
  endBehaviourHold: boolean;
  workflowB: boolean;
  workflowC: boolean;
  pauseAll: boolean;
  exportRestoresClock: boolean;
  pngParity: boolean;
  fpsHoldIdentical: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runHoldExportSheet(root: HTMLElement): Promise<HoldExportReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";
  const intro = document.createElement("p");
  intro.textContent =
    "HOLD export must freeze the master phase. AUTO export must still move. Static image sources only.";
  root.appendChild(intro);

  const hidden = document.createElement("div");
  hidden.style.position = "absolute";
  hidden.style.left = "-9999px";
  root.appendChild(hidden);
  const renderer = makeRenderer(hidden);

  const holdRows: Record<string, unknown> = {};
  let holdIdentical = true;
  const visual = document.createElement("div");
  visual.className = "grid";
  const h2 = document.createElement("h2");
  h2.textContent = "HOLD 0.63 Expressive — preview vs export times";
  root.appendChild(h2);
  root.appendChild(visual);

  for (const preset of ["Restrained", "Balanced", "Expressive"] as const) {
    renderer.setParams(bloomParams(preset));
    renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
    const presetRows: Record<string, unknown> = {};
    for (const p of PHASES) {
      renderer.setHoldPhase(p);
      const preview = await previewHash(renderer);
      renderer.beginExport(W, H);
      const exports: { t: number; hash: string; phase: number; diff: number }[] = [];
      for (const t of EXPORT_TIMES) {
        const exp = await exportHash(renderer, t);
        exports.push({ t, hash: exp.hash, phase: exp.phase, diff: pixelDiff(preview.img, exp.img) });
      }
      const clockAfterBegin = { mode: renderer.getClockMode(), hold: renderer.getLoopPhase() };
      finishExport(renderer);
      const clockAfterEnd = { mode: renderer.getClockMode(), hold: renderer.getLoopPhase(), frozen: renderer.isFrozen() };
      const ok =
        exports.every((e) => e.hash === preview.hash && e.diff === 0 && e.phase === p) &&
        clockAfterBegin.mode === "hold" &&
        clockAfterEnd.mode === "hold" &&
        clockAfterEnd.hold === p;
      if (!ok) holdIdentical = false;
      presetRows[p.toFixed(2)] = { preview: preview.hash, exports, ok, clockAfterEnd };
      if (preset === "Expressive" && p === 0.63) {
        cell(visual, `preview ${p}`, preview.img);
        for (const e of exports) {
          const expImg = (await (async () => {
            renderer.setHoldPhase(p);
            renderer.beginExport(W, H);
            const r = await exportHash(renderer, e.t);
            finishExport(renderer);
            return r.img;
          })());
          cell(visual, `export ${e.t}s`, expImg);
        }
      }
    }
    holdRows[preset] = presetRows;
  }

  renderer.setParams(bloomParams("Expressive"));
  renderer.setClockMode("auto");
  const autoHashes: Record<string, string> = {};
  for (const p of [0.17, 0.37, 0.63]) {
    renderer.seekLoopPhase(p);
    autoHashes[String(p)] = (await previewHash(renderer)).hash;
  }
  renderer.beginExport(W, H);
  const autoExport: Record<string, string> = {};
  for (const p of [0.17, 0.37, 0.63]) {
    autoExport[String(p)] = (await exportHash(renderer, p * LOOP)).hash;
  }
  finishExport(renderer);
  const autoMoves =
    autoHashes["0.17"] !== autoHashes["0.37"] &&
    autoHashes["0.37"] !== autoHashes["0.63"] &&
    autoExport["0.17"] !== autoExport["0.37"] &&
    autoExport["0.37"] !== autoExport["0.63"];

  renderer.setTypeState(typeOn());
  for (let i = 0; i < 4; i++) renderer.renderFrame();

  const endRows: Record<string, unknown> = {};
  let endBehaviourHold = true;
  for (const mode of ["off", "flicker"] as EndBehaviourMode[]) {
    renderer.setEndBehaviour(
      clampEndBehaviourSettings({
        mode,
        amount: mode === "flicker" ? 65 : 50,
        hold: mode === "flicker" ? 45 : 40,
        duration: mode === "flicker" ? 35 : 45,
      }),
    );
    for (const p of [0.47, 0.96]) {
      renderer.setHoldPhase(p);
      const preview = await previewHash(renderer);
      const diag = renderer.lastEndDiagnostics;
      renderer.beginExport(W, H);
      const hashes = [];
      for (const t of EXPORT_TIMES) {
        const exp = await exportHash(renderer, t);
        hashes.push(exp.hash);
        if (exp.hash !== preview.hash || pixelDiff(preview.img, exp.img) !== 0) endBehaviourHold = false;
        if (exp.phase !== p) endBehaviourHold = false;
      }
      finishExport(renderer);
      endRows[`${mode}@${p}`] = {
        preview: preview.hash,
        hashes,
        identical: allEqual([preview.hash, ...hashes]),
        region: diag?.region,
        applied: diag?.applied,
        phase: preview.phase,
      };
    }
  }

  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setParams(bloomParams("Expressive"));
  renderer.setClockMode("auto");
  renderer.seekLoopPhase(0.63);
  renderer.setClockMode("hold");
  const bPreview = await previewHash(renderer);
  renderer.beginExport(W, H);
  const bFrames = [];
  for (const t of EXPORT_TIMES) bFrames.push((await exportHash(renderer, t)).hash);
  finishExport(renderer);
  const workflowB = allEqual([bPreview.hash, ...bFrames]) && renderer.getClockMode() === "hold" && renderer.getLoopPhase() === 0.63;
  const workflowBDetail = { preview: bPreview.hash, bFrames, mode: renderer.getClockMode(), phase: renderer.getLoopPhase() };

  renderer.setHoldPhase(0.63);
  renderer.seekLoopPhase(0.28);
  const cPreview = await previewHash(renderer);
  renderer.beginExport(W, H);
  const cFrames: { t: number; hash: string; phase: number }[] = [];
  for (const t of EXPORT_TIMES) {
    const exp = await exportHash(renderer, t);
    cFrames.push({ t, hash: exp.hash, phase: exp.phase });
  }
  finishExport(renderer);
  const workflowC = allEqual([cPreview.hash, ...cFrames.map((f) => f.hash)]) && renderer.getClockMode() === "hold" && renderer.getLoopPhase() === 0.28;
  const workflowCDetail = { preview: cPreview.hash, cFrames, mode: renderer.getClockMode(), phase: renderer.getLoopPhase() };

  renderer.setHoldPhase(0.63);
  renderer.setFrozen(true);
  const frozenBefore = renderer.isFrozen();
  const dPreview = await previewHash(renderer);
  renderer.beginExport(W, H);
  const d0 = (await exportHash(renderer, 0)).hash;
  const d11 = (await exportHash(renderer, 11.9)).hash;
  finishExport(renderer);
  const pauseAll =
    frozenBefore &&
    renderer.isFrozen() &&
    renderer.getClockMode() === "hold" &&
    renderer.getLoopPhase() === 0.63 &&
    dPreview.hash === d0 &&
    d0 === d11;
  renderer.setFrozen(false);

  renderer.setHoldPhase(0.37);
  const pngPreview = await previewHash(renderer);
  renderer.beginExport(W, H);
  await renderer.renderExportFrame(0.37 * LOOP, { graphicTime: renderer.getGraphicElapsed() });
  const pngExport = hashPixels(renderer.getVisibleImageData());
  const pngPhase = renderer.getLoopPhase();
  finishExport(renderer);
  const pngParity = pngPreview.hash === pngExport && pngPhase === 0.37 && renderer.getClockMode() === "hold";

  renderer.setHoldPhase(0.63);
  const fpsPreview = (await previewHash(renderer)).hash;
  renderer.beginExport(W, H);
  const fpsHashes: Record<number, string> = {};
  for (const fps of [24, 25, 30]) {
    const last = (Math.round(LOOP * fps) - 1) / fps;
    fpsHashes[fps] = (await exportHash(renderer, last)).hash;
  }
  finishExport(renderer);
  const fpsHoldIdentical = [24, 25, 30].every((fps) => fpsHashes[fps] === fpsPreview);

  const exportRestoresClock = renderer.getClockMode() === "hold" && renderer.getLoopPhase() === 0.63;

  return {
    holdIdentical,
    autoMoves,
    endBehaviourHold,
    workflowB,
    workflowC,
    pauseAll,
    exportRestoresClock,
    pngParity,
    fpsHoldIdentical,
    elapsedMs: performance.now() - t0,
    details: { holdRows, autoHashes, autoExport, endRows, fpsHashes, workflowBDetail, workflowCDetail },
  };
}
