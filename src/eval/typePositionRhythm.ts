import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeBlock, type TypeState } from "../core/typeState";
import { layoutTypeDocument, opticalFramePx, typeInkBox } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import {
  layoutTypeDocumentAtPhase,
  sampleTypeRhythm,
  typeInvariantKey,
  typeOverflowsOptical,
  typeRhythmStaticFrac,
} from "../core/typeRhythm";
import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";

const PHASES = [0, 0.2, 0.34, 0.4, 0.55, 0.78, 0.84, 0.95];
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

function block(partial: Partial<TypeBlock>, extra?: Partial<TypeBlock>): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, color: "#f3efe6", ...partial, ...extra },
      { enabled: false, text: "" },
    ],
  });
}

function pair(a: Partial<TypeBlock>, b: Partial<TypeBlock>): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, color: "#f3efe6", ...a },
      { enabled: true, color: "#f3efe6", ...b },
    ],
  });
}

function paintState(state: TypeState, w: number, h: number, phase: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  photoGround(ctx, w, h);
  const laid = layoutTypeDocumentAtPhase(state, w, h, phase);
  for (const item of laid) paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
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
  parentGrid(root, grid);
  return grid;
}

function parentGrid(root: HTMLElement, grid: HTMLElement): void {
  root.appendChild(grid);
}

function strip(root: HTMLElement, title: string, state: TypeState, w: number, h: number): void {
  const grid = section(root, title);
  for (const p of PHASES) {
    const laid = layoutTypeDocumentAtPhase(state, w, h, p);
    const sample = state.blocks[0].positionRhythm
      ? sampleTypeRhythm(p, state.blocks[0].positionRhythmStops ?? [state.blocks[0].anchor])
      : null;
    const region = sample ? `${sample.region} ${sample.from}→${sample.to}` : "off";
    cell(grid, `${p.toFixed(2)}  ${region}`, paintState(state, w, h, p));
    void laid;
  }
}

function settledEqualsStatic(state: TypeState, phase: number, w: number, h: number): boolean {
  if (!state.blocks[0].positionRhythm) return true;
  const stops = state.blocks[0].positionRhythmStops ?? [state.blocks[0].anchor];
  const sample = sampleTypeRhythm(phase, stops);
  if (sample.region !== "hold") return true;
  const moving = layoutTypeDocumentAtPhase(state, w, h, phase);
  const staticState = clampTypeState({
    ...state,
    blocks: [
      { ...state.blocks[0], positionRhythm: false, anchor: sample.from },
      state.blocks[1],
    ],
  });
  const frozen = layoutTypeDocument(staticState, w, h);
  if (moving.length !== frozen.length) return false;
  for (let i = 0; i < moving.length; i++) {
    const a = moving[i]!.layout;
    const b = frozen[i]!.layout;
    if (a.lines.length !== b.lines.length) return false;
    for (let k = 0; k < a.lines.length; k++) {
      if (Math.abs(a.lines[k]!.x - b.lines[k]!.x) > 0.001) return false;
      if (Math.abs(a.lines[k]!.y - b.lines[k]!.y) > 0.001) return false;
      if (a.lines[k]!.text !== b.lines[k]!.text) return false;
    }
  }
  return true;
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

export interface TypePositionRhythmReport {
  offBypass: boolean;
  settledMatchesStatic: boolean;
  geometryStable: boolean;
  betweenIgnoresVertical: boolean;
  noOpticalOverflow: boolean;
  holdExportIdentical: boolean;
  autoMoves: boolean;
  staticFrac2: number;
  staticFrac3: number;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runTypePositionRhythmSheet(root: HTMLElement): Promise<TypePositionRhythmReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const coming = block({
    text: mbmById("coming-soon-break").text,
    composition: "headline",
    scale: 78,
    anchor: "tl",
    positionRhythm: true,
    positionRhythmStops: ["tl", "mc", "br"],
  });
  const para = block({
    text: mbmById("kelly").text,
    composition: "paragraph",
    column: "narrow",
    scale: 42,
    anchor: "tl",
    positionRhythm: true,
    positionRhythmStops: ["tl", "br"],
  });
  const note = block({
    text: `${mbmById("date").text}\n${mbmById("made-by").text}`,
    composition: "footnote",
    scale: 36,
    anchor: "bl",
    positionRhythm: true,
    positionRhythmStops: ["bl", "tr", "br"],
  });
  const two = pair(
    {
      text: mbmById("coming-soon-break").text,
      composition: "headline",
      scale: 70,
      anchor: "tl",
      positionRhythm: true,
      positionRhythmStops: ["tl", "mc", "br"],
    },
    {
      text: mbmById("kelly").text,
      composition: "paragraph",
      column: "narrow",
      scale: 36,
      anchor: "br",
      positionRhythm: true,
      positionRhythmStops: ["br", "tl"],
    },
  );
  const huge = block({
    text: mbmById("coming-soon-break").text,
    composition: "headline",
    scale: 100,
    anchor: "tl",
    positionRhythm: true,
    positionRhythmStops: ["tl", "br"],
  });

  strip(root, "A  Headline  COMING SOON  TL → MC → BR", coming, W45, H45);
  strip(root, "B  Paragraph  MBM  TL → BR", para, W45, H45);
  strip(root, "C  Footnote  BL → TR → BR", note, W45, H45);
  strip(root, "D  Two blocks  opposing", two, W45, H45);
  strip(root, "E  Scale 100  TL → BR", huge, W45, H45);
  strip(root, "F  9:16  Headline TL → BR", coming, W916, H916);

  const off = block({
    text: mbmById("coming-soon-break").text,
    composition: "headline",
    scale: 78,
    anchor: "bl",
    positionRhythm: false,
  });
  const offA = paintState(off, W45, H45, 0.2).getContext("2d")!.getImageData(0, 0, W45, H45);
  const offB = paintState(off, W45, H45, 0.8).getContext("2d")!.getImageData(0, 0, W45, H45);
  const offStatic = (() => {
    const c = document.createElement("canvas");
    c.width = W45;
    c.height = H45;
    const ctx = c.getContext("2d")!;
    photoGround(ctx, W45, H45);
    for (const item of layoutTypeDocument(off, W45, H45)) {
      paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
    }
    return ctx.getImageData(0, 0, W45, H45);
  })();
  let offBypass = pixelDiff(offA, offB) === 0 && pixelDiff(offA, offStatic) === 0;
  for (const style of ["headline", "paragraph", "footnote"] as const) {
    for (const scale of [0, 50, 100]) {
      for (const anchor of ["tl", "mc", "br"] as const) {
        const st = block({
          text: style === "paragraph" ? mbmById("kelly").text : mbmById("coming-soon-break").text,
          composition: style,
          scale,
          anchor,
          positionRhythm: false,
        });
        const a = layoutTypeDocument(st, W45, H45);
        const b = layoutTypeDocumentAtPhase(st, W45, H45, 0.37);
        const c = layoutTypeDocumentAtPhase(st, W45, H45, 0.9);
        if (JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(a) !== JSON.stringify(c)) offBypass = false;
      }
    }
  }

  let settledMatchesStatic = true;
  for (const state of [coming, para, note, huge]) {
    for (const p of PHASES) {
      if (!settledEqualsStatic(state, p, W45, H45)) settledMatchesStatic = false;
    }
  }

  let geometryStable = true;
  const home = layoutTypeDocumentAtPhase(coming, W45, H45, 0)[0]!.layout;
  const homeKey = typeInvariantKey(home);
  for (const p of [0, 0.2, 0.27, 0.4, 0.6, 0.8, 0.95]) {
    const laid = layoutTypeDocumentAtPhase(coming, W45, H45, p)[0];
    if (!laid || typeInvariantKey(laid.layout) !== homeKey) geometryStable = false;
  }

  const between = block({
    text: mbmById("free").text,
    composition: "headline",
    distribution: "between",
    scale: 70,
    anchor: "tl",
    positionRhythm: true,
    positionRhythmStops: ["tl", "bl"],
  });
  const bTop = layoutTypeDocumentAtPhase(between, W45, H45, 0)[0]!.layout;
  const bBot = layoutTypeDocument(
    clampTypeState({
      ...between,
      blocks: [{ ...between.blocks[0], positionRhythm: false, anchor: "bl" }, between.blocks[1]],
    }),
    W45,
    H45,
  )[0]!.layout;
  const betweenIgnoresVertical =
    bTop.lines.length === bBot.lines.length &&
    bTop.lines.every((line, i) => Math.abs(line.y - bBot.lines[i]!.y) < 0.001);

  let noOpticalOverflow = true;
  const frame = opticalFramePx(W45);
  for (let i = 0; i <= 40; i++) {
    const p = i / 40;
    const laid = layoutTypeDocumentAtPhase(huge, W45, H45, p);
    for (const item of laid) {
      if (typeOverflowsOptical(item.layout, W45, H45, frame)) noOpticalOverflow = false;
    }
  }

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

  renderer.setHoldPhase(0.37);
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
  renderer.seekLoopPhase(0.17);
  const a17 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.63);
  const a63 = hashPixels(settle(renderer));
  renderer.seekLoopPhase(0.95);
  const a95 = hashPixels(settle(renderer));
  const autoMoves = a17 !== a63 && a63 !== a95;

  const tLayout0 = performance.now();
  for (let i = 0; i < 40; i++) layoutTypeDocument(off, W45, H45);
  const offMs = performance.now() - tLayout0;
  const tLayout1 = performance.now();
  for (let i = 0; i < 40; i++) layoutTypeDocumentAtPhase(coming, W45, H45, i / 40);
  const onMs = performance.now() - tLayout1;

  return {
    offBypass,
    settledMatchesStatic,
    geometryStable,
    betweenIgnoresVertical,
    noOpticalOverflow,
    holdExportIdentical,
    autoMoves,
    staticFrac2: typeRhythmStaticFrac(2),
    staticFrac3: typeRhythmStaticFrac(3),
    elapsedMs: performance.now() - t0,
    details: {
      liveHashes,
      holdPreview,
      holdFrames,
      layoutMs: { off: offMs, rhythm: onMs },
      inkAt100: typeInkBox(layoutTypeDocumentAtPhase(huge, W45, H45, 0.36)[0]!.layout),
    },
  };
}
