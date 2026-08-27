import { mbmById } from "./mbmCopy";
import { clampTypeState, cloneTypeState, type TypeBlock, type TypeState } from "../core/typeState";
import { layoutTypeDocument, typeGeometryKey } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import { typePageIndexAtPhase, typeStateAtPhase } from "../core/typePages";
import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";

const PHASES = [0, 0.2, 0.29, 0.31, 0.42, 0.5, 0.57, 0.59, 0.8, 0.95];
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

function page(a: Partial<TypeBlock>, b?: Partial<TypeBlock>): [Partial<TypeBlock>, Partial<TypeBlock>] {
  return [
    { enabled: true, color: "#f3efe6", ...a },
    b ? { enabled: true, color: "#f3efe6", ...b } : { enabled: false, text: "", composition: "footnote" },
  ];
}

function book(pages: [Partial<TypeBlock>, Partial<TypeBlock>][]): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: pages[0],
    pages,
    selected: 0,
  });
}

function paintResolved(state: TypeState, w: number, h: number, phase: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  photoGround(ctx, w, h);
  const resolved = typeStateAtPhase(state, phase);
  for (const item of layoutTypeDocument(resolved, w, h)) {
    paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  }
  return canvas;
}

function paintPage(state: TypeState, index: number, w: number, h: number): HTMLCanvasElement {
  const isolated = clampTypeState({
    enabled: true,
    blocks: state.pages[index],
    pages: [state.pages[index]!],
    selected: 0,
  });
  return paintResolved(isolated, w, h, 0);
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

function strip(root: HTMLElement, title: string, state: TypeState, w: number, h: number): void {
  const grid = section(root, title);
  const n = state.pages.length;
  for (const p of PHASES) {
    const i = typePageIndexAtPhase(p, n);
    cell(grid, `${p.toFixed(2)}  0${i + 1}`, paintResolved(state, w, h, p));
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

export interface TypeStatesReport {
  onePageBypass: boolean;
  cutEqualsStatic: boolean;
  hardCut: boolean;
  holdExportIdentical: boolean;
  autoCuts: boolean;
  geometryStable: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runTypeStatesSheet(root: HTMLElement): Promise<TypeStatesReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const sequenceA = book([
    page({ text: mbmById("coming-soon-break").text, composition: "headline", scale: 78, anchor: "tl" }),
    page({ text: mbmById("coming-soon-break").text, composition: "headline", scale: 78, anchor: "bl" }),
    page(
      { text: mbmById("coming-soon-break").text, composition: "headline", scale: 70, anchor: "mc" },
      { text: mbmById("date").text, composition: "footnote", scale: 80, anchor: "br" },
    ),
  ]);
  const sequenceB = book([
    page({ text: mbmById("new").text, composition: "headline", scale: 100, anchor: "mc" }),
    page({ text: mbmById("name-break").text, composition: "headline", scale: 78, anchor: "tl" }),
    page(
      { text: mbmById("now").text, composition: "headline", scale: 64, anchor: "tl" },
      { text: mbmById("date").text, composition: "footnote", scale: 70, anchor: "br" },
    ),
  ]);
  const sequenceC = book([
    page({ text: mbmById("redy-break").text, composition: "headline", scale: 86, anchor: "tl" }),
    page(
      { text: mbmById("redy-break").text, composition: "headline", scale: 78, anchor: "tl" },
      { text: mbmById("worn").text, composition: "footnote", scale: 70, anchor: "br" },
    ),
    page(
      { text: mbmById("flawed-break").text, composition: "headline", scale: 64, anchor: "bl" },
      { text: mbmById("date").text, composition: "footnote", scale: 70, anchor: "tr" },
    ),
  ]);
  const free = book([
    page({ text: mbmById("free").text, composition: "headline", scale: 70, distribution: "between", anchor: "tl" }),
    page({ text: mbmById("free").text, composition: "headline", scale: 70, distribution: "between", anchor: "mc" }),
  ]);
  const ss = book([
    page({ text: "SPRING\nSUMMER\n2026", composition: "headline", scale: 78, anchor: "tl" }),
    page(
      { text: mbmById("ss26-short").text, composition: "headline", scale: 100, anchor: "mc" },
      { text: mbmById("now").text, composition: "footnote", scale: 64, anchor: "bl" },
    ),
  ]);

  strip(root, "A  COMING SOON top → bottom → + date", sequenceA, W45, H45);
  strip(root, "B  NEW → MADE BY MADELEN → NOW AVAILABLE + date", sequenceB, W45, H45);
  strip(root, "C  Headline → + Footnote → rearranged", sequenceC, W45, H45);
  strip(root, "CARE-FREE Between  two states", free, W45, H45);
  strip(root, "SPRING SUMMER 2026  two states", ss, W45, H45);
  strip(root, "A  9:16", sequenceA, W916, H916);

  const one = book([
    page({ text: mbmById("coming-soon-break").text, composition: "headline", scale: 78, anchor: "tl" }),
  ]);
  const oneA = paintResolved(one, W45, H45, 0.2).getContext("2d")!.getImageData(0, 0, W45, H45);
  const oneB = paintResolved(one, W45, H45, 0.8).getContext("2d")!.getImageData(0, 0, W45, H45);
  const oneStatic = paintPage(one, 0, W45, H45).getContext("2d")!.getImageData(0, 0, W45, H45);
  const onePageBypass = pixelDiff(oneA, oneB) === 0 && pixelDiff(oneA, oneStatic) === 0
    && typeStateAtPhase(one, 0.63) === one;

  let cutEqualsStatic = true;
  for (const state of [sequenceA, sequenceB, sequenceC, free, ss]) {
    for (const p of PHASES) {
      const i = typePageIndexAtPhase(p, state.pages.length);
      const moving = paintResolved(state, W45, H45, p).getContext("2d")!.getImageData(0, 0, W45, H45);
      const frozen = paintPage(state, i, W45, H45).getContext("2d")!.getImageData(0, 0, W45, H45);
      if (pixelDiff(moving, frozen) !== 0) cutEqualsStatic = false;
    }
  }

  const before = typePageIndexAtPhase(0.299, 3);
  const after = typePageIndexAtPhase(0.301, 3);
  const twoBefore = typePageIndexAtPhase(0.419, 2);
  const twoAfter = typePageIndexAtPhase(0.421, 2);
  const hardCut = before === 0 && after === 1 && twoBefore === 0 && twoAfter === 1
    && pixelDiff(
      paintResolved(sequenceA, W45, H45, 0.299).getContext("2d")!.getImageData(0, 0, W45, H45),
      paintResolved(sequenceA, W45, H45, 0.301).getContext("2d")!.getImageData(0, 0, W45, H45),
    ) > 0;

  const geometryStable = sequenceA.pages.every((_, i) => {
    const isolated = clampTypeState({ enabled: true, blocks: sequenceA.pages[i], pages: [sequenceA.pages[i]!], selected: 0 });
    const live = typeStateAtPhase(sequenceA, i === 0 ? 0.1 : i === 1 ? 0.4 : 0.8);
    return typeGeometryKey(isolated, W45, H45) === typeGeometryKey(live, W45, H45);
  });

  const host = document.createElement("div");
  host.style.display = "none";
  root.appendChild(host);
  const renderer = makeLiveRenderer(host);
  renderer.setTypeState(sequenceA);
  const live = section(root, "Live system — Bloom Expressive · Limit 60 · Registration 70 · Flicker 100");
  const liveHashes: Record<string, string> = {};
  for (const p of PHASES) {
    renderer.setClockMode("hold");
    renderer.setHoldPhase(p);
    const img = settle(renderer);
    liveHashes[String(p)] = hashPixels(img);
    cellImage(live, `p${p.toFixed(2)}  0${typePageIndexAtPhase(p, 3) + 1}`, img);
  }

  renderer.setHoldPhase(0.5);
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
  renderer.seekLoopPhase(0.1);
  const a10 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.4);
  const a40 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.8);
  const a80 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.1);
  const a10b = hashPixels(settle(renderer));
  const autoCuts = a10 !== a40 && a40 !== a80 && a10 === a10b;

  const liveCanvas = host.querySelector("canvas");
  if (liveCanvas instanceof HTMLCanvasElement) {
    renderer.setClockMode("auto");
    renderer.play();
    liveCanvas.style.display = "block";
    const fig = document.createElement("figure");
    fig.style.maxWidth = "320px";
    const cap = document.createElement("figcaption");
    cap.textContent = "Live loop — cuts, final page into Flicker, return to 01";
    fig.appendChild(liveCanvas);
    fig.appendChild(cap);
    live.after(fig);
  }

  const bench = document.createElement("canvas");
  bench.width = W45;
  bench.height = H45;
  const benchCtx = bench.getContext("2d")!;
  const t1 = performance.now();
  for (let i = 0; i < 40; i++) {
    const resolved = typeStateAtPhase(one, i / 40);
    layoutTypeDocument(resolved, W45, H45);
  }
  const oneMs = performance.now() - t1;
  const t3 = performance.now();
  for (let i = 0; i < 40; i++) {
    const resolved = typeStateAtPhase(sequenceA, i / 40);
    layoutTypeDocument(resolved, W45, H45);
  }
  const threeMs = performance.now() - t3;
  void benchCtx;

  return {
    onePageBypass,
    cutEqualsStatic,
    hardCut,
    holdExportIdentical,
    autoCuts,
    geometryStable,
    elapsedMs: performance.now() - t0,
    details: {
      liveHashes,
      holdPreview,
      holdFrames,
      cuts: { before, after, twoBefore, twoAfter },
      layoutMs: { one: oneMs, three: threeMs },
      cloneKeepsPages: cloneTypeState(sequenceA).pages.length === 3,
    },
  };
}
