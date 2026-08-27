import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeBlock, type TypeState } from "../core/typeState";
import { layoutTypeDocument, typeGeometryKey } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import {
  DUPLICATE_COUNT,
  paintTypeDocument,
  sampleDuplicateRhythm,
} from "../core/duplicateRhythm";
import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";

const PHASES = [0, 0.18, 0.24, 0.32, 0.46, 0.54, 0.64, 0.76, 0.9];
const W45 = 320;
const H45 = 400;
const W916 = 270;
const H916 = 480;

function photoGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, h * 0.08, w, h);
  g.addColorStop(0, "#1a1a1c");
  g.addColorStop(0.4, "#4a4a48");
  g.addColorStop(1, "#0c0c0e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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

function pixelDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n += 1;
  return n;
}

function block(partial: Partial<TypeBlock>, extra?: Partial<TypeState>): TypeState {
  return clampTypeState({
    enabled: true,
    duplicateRhythm: true,
    duplicateRhythmSource: 0,
    blocks: [
      { enabled: true, color: "#f3efe6", ...partial },
      { enabled: false, text: "" },
    ],
    ...extra,
  });
}

function pair(a: Partial<TypeBlock>, b: Partial<TypeBlock>): TypeState {
  return clampTypeState({
    enabled: true,
    duplicateRhythm: true,
    duplicateRhythmSource: 0,
    blocks: [
      { enabled: true, color: "#f3efe6", ...a },
      { enabled: true, color: "#f3efe6", ...b },
    ],
  });
}

function paintState(state: TypeState, w: number, h: number, phase: number, count = DUPLICATE_COUNT): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  photoGround(ctx, w, h);
  paintTypeDocument(ctx, state, w, h, phase, count);
  return canvas;
}

function paintStatic(state: TypeState, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  photoGround(ctx, w, h);
  for (const item of layoutTypeDocument(state, w, h)) {
    paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  }
  return canvas;
}

function cell(parent: HTMLElement, label: string, canvas: HTMLCanvasElement): void {
  const wrap = document.createElement("figure");
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
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

function strip(root: HTMLElement, title: string, state: TypeState, w: number, h: number, count = DUPLICATE_COUNT): void {
  const grid = section(root, title);
  for (const p of PHASES) {
    const sample = sampleDuplicateRhythm(p, w, h, count);
    const vis = sample.filter((s) => s.visible).length;
    cell(grid, `${p.toFixed(2)}  ×${vis}`, paintState(state, w, h, p, count));
  }
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

function makeLiveRenderer(host: HTMLElement): Renderer {
  const canvas = document.createElement("canvas");
  canvas.width = W45;
  canvas.height = H45;
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W45, H45);
  renderer.setLoopSeconds(12);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(70);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams(60));
  renderer.setSequence(
    [
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#1c1c1e"), "01") },
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#c8a070"), "02") },
    ],
    undefined,
  );
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }));
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 8; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
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

export interface TypeDuplicateRhythmReport {
  offBypass: boolean;
  sourceOnlyMatchesOff: boolean;
  geometryStable: boolean;
  copiesAppear: boolean;
  holdExportIdentical: boolean;
  autoMoves: boolean;
  authoredCount: number;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runTypeDuplicateRhythmSheet(root: HTMLElement): Promise<TypeDuplicateRhythmReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const coming = block({
    text: mbmById("coming-soon-break").text,
    composition: "headline",
    scale: 78,
    anchor: "tl",
  });
  const date = block({
    text: mbmById("date-split").text,
    composition: "headline",
    scale: 86,
    anchor: "tl",
  });
  const para = block({
    text: mbmById("way").text,
    composition: "paragraph",
    column: "narrow",
    scale: 42,
    anchor: "tl",
  });
  const two = pair(
    {
      text: mbmById("coming-soon-break").text,
      composition: "headline",
      scale: 70,
      anchor: "tl",
    },
    {
      text: mbmById("kelly").text,
      composition: "paragraph",
      column: "narrow",
      scale: 34,
      anchor: "br",
    },
  );
  const diff = block({
    text: mbmById("coming-soon-break").text,
    composition: "headline",
    scale: 78,
    anchor: "tl",
    blendMode: "difference",
  });
  const excl = block({
    text: mbmById("coming-soon-break").text,
    composition: "headline",
    scale: 78,
    anchor: "tl",
    blendMode: "exclusion",
  });

  strip(root, "A  Headline  COMING SOON  4:5", coming, W45, H45);
  strip(root, "B  Headline  07.09 / 2026", date, W45, H45);
  strip(root, "C  Paragraph  MBM  4:5", para, W45, H45);
  strip(root, "D  Type 01 duplicates + Type 02 static", two, W45, H45);
  strip(root, "E  Difference", diff, W45, H45);
  strip(root, "F  Exclusion", excl, W45, H45);
  strip(root, "G  9:16  COMING SOON", coming, W916, H916);
  strip(root, "H  4:5  COMING SOON", coming, W45, H45);

  const countGrid = section(root, "Count  2 vs 3 vs 4  at 0.64");
  for (const n of [2, 3, 4]) {
    cell(countGrid, `count ${n}`, paintState(coming, W45, H45, 0.64, n));
  }

  const off = clampTypeState({ ...coming, duplicateRhythm: false });
  const offA = paintStatic(off, W45, H45).getContext("2d")!.getImageData(0, 0, W45, H45);
  const offB = paintState(off, W45, H45, 0.54).getContext("2d")!.getImageData(0, 0, W45, H45);
  const offC = paintState(off, W45, H45, 0.9).getContext("2d")!.getImageData(0, 0, W45, H45);
  let offBypass = pixelDiff(offA, offB) === 0 && pixelDiff(offA, offC) === 0;
  const onAt0 = paintState(coming, W45, H45, 0).getContext("2d")!.getImageData(0, 0, W45, H45);
  const onAt18 = paintState(coming, W45, H45, 0.18).getContext("2d")!.getImageData(0, 0, W45, H45);
  const sourceOnlyMatchesOff = pixelDiff(offA, onAt0) === 0 && pixelDiff(offA, onAt18) === 0;

  const geometryStable =
    typeGeometryKey(coming, W45, H45) === typeGeometryKey(off, W45, H45) &&
    typeGeometryKey(coming, W45, H45) === typeGeometryKey(
      clampTypeState({ ...coming, blocks: [{ ...coming.blocks[0], blendMode: "difference" }, coming.blocks[1]] }),
      W45,
      H45,
    );

  const vis20 = sampleDuplicateRhythm(0.2, W45, H45, 3).filter((s) => s.visible).length;
  const vis45 = sampleDuplicateRhythm(0.45, W45, H45, 3).filter((s) => s.visible).length;
  const vis50 = sampleDuplicateRhythm(0.5, W45, H45, 3).filter((s) => s.visible).length;
  const vis64 = sampleDuplicateRhythm(0.64, W45, H45, 3).filter((s) => s.visible).length;
  const copiesAppear = vis20 === 2 && vis45 === 2 && vis50 === 3 && vis64 === 3;
  const moved = pixelDiff(
    paintState(coming, W45, H45, 0.24).getContext("2d")!.getImageData(0, 0, W45, H45),
    paintState(coming, W45, H45, 0.32).getContext("2d")!.getImageData(0, 0, W45, H45),
  ) > 0;

  const host = document.createElement("div");
  host.style.display = "none";
  root.appendChild(host);
  const renderer = makeLiveRenderer(host);
  renderer.setTypeState(two);
  const live = section(root, "Live system — Bloom Expressive · Limit 60 · Registration 70 · Flicker 100");
  const liveHashes: Record<string, string> = {};
  for (const p of PHASES) {
    renderer.setClockMode("hold");
    renderer.setHoldPhase(p);
    const img = settle(renderer);
    liveHashes[String(p)] = hashPixels(img);
    cellImage(live, `p${p.toFixed(2)}`, img);
  }

  renderer.setHoldPhase(0.54);
  const holdPreview = hashPixels(settle(renderer));
  renderer.beginExport(W45, H45);
  const holdFrames: string[] = [];
  for (const t of [0, 1, 3, 6, 11.9]) {
    await renderer.renderExportFrame(t);
    holdFrames.push(hashPixels(renderer.getVisibleImageData()));
  }
  renderer.endExport();
  renderer.resizeExact(W45, H45);
  const holdExportIdentical = holdFrames.every((h) => h === holdPreview);

  renderer.setClockMode("auto");
  renderer.seekLoopPhase(0.18);
  const a18 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.54);
  const a54 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.76);
  const a76 = hashPixels(settle(renderer));
  const autoMoves = a18 !== a54 && a54 !== a76;

  const liveCanvas = host.querySelector("canvas");
  if (liveCanvas instanceof HTMLCanvasElement) {
    renderer.setClockMode("auto");
    renderer.play();
    liveCanvas.style.display = "block";
    const fig = document.createElement("figure");
    fig.style.maxWidth = "320px";
    const cap = document.createElement("figcaption");
    cap.textContent = "Live loop — source planted, copies appear and travel";
    fig.appendChild(liveCanvas);
    fig.appendChild(cap);
    live.after(fig);
  }

  const bench = document.createElement("canvas");
  bench.width = W45;
  bench.height = H45;
  const benchCtx = bench.getContext("2d")!;
  const tOff = performance.now();
  for (let i = 0; i < 40; i++) paintTypeDocument(benchCtx, off, W45, H45, i / 40);
  const offMs = performance.now() - tOff;
  const t2 = performance.now();
  for (let i = 0; i < 40; i++) paintTypeDocument(benchCtx, coming, W45, H45, i / 40, 2);
  const ms2 = performance.now() - t2;
  const t3 = performance.now();
  for (let i = 0; i < 40; i++) paintTypeDocument(benchCtx, coming, W45, H45, i / 40, 3);
  const ms3 = performance.now() - t3;
  const t4 = performance.now();
  for (let i = 0; i < 40; i++) paintTypeDocument(benchCtx, coming, W45, H45, i / 40, 4);
  const ms4 = performance.now() - t4;

  return {
    offBypass,
    sourceOnlyMatchesOff,
    geometryStable,
    copiesAppear: copiesAppear && moved,
    holdExportIdentical,
    autoMoves,
    authoredCount: DUPLICATE_COUNT,
    elapsedMs: performance.now() - t0,
    details: {
      vis: { vis20, vis45, vis50, vis64 },
      liveHashes,
      holdPreview,
      holdFrames,
      paintMs: { off: offMs, count2: ms2, count3: ms3, count4: ms4 },
    },
  };
}
