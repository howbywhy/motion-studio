import { mbmById } from "./mbmCopy";
import { clampTypeState, cloneTypeState, TYPE_ANCHORS, type TypeAnchor, type TypeBlock, type TypeState } from "../core/typeState";
import { HEADLINE_INK_BLEED, headlineEdgeBleed, layoutTypeDocument, opticalFramePx, typeGeometryKey, typeInkBox } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import { SEQUENCE_SPEED_DEFAULT, typePageCuts, typePageIndexAtPhase, typePageIndexForState, typeStateAtPhase } from "../core/typePages";
import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";

const PHASES = [0, 0.2, 0.29, 0.31, 0.42, 0.5, 0.57, 0.59, 0.8, 0.95];
const WINDOW_PHASES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];
const W45 = 320;
const H45 = 400;
const W916 = 270;
const H916 = 480;
const ANCHOR_LABEL: Record<TypeAnchor, string> = {
  tl: "Top Left",
  tc: "Top Centre",
  tr: "Top Right",
  ml: "Centre Left",
  mc: "Centre",
  mr: "Centre Right",
  bl: "Bottom Left",
  bc: "Bottom Centre",
  br: "Bottom Right",
};

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

function book(
  pages: [Partial<TypeBlock>, Partial<TypeBlock>][],
  timing?: number | { speed?: number; start?: number; stop?: number },
): TypeState {
  const t = typeof timing === "number" ? { speed: timing } : (timing ?? {});
  return clampTypeState({
    enabled: true,
    blocks: pages[0],
    pages,
    selected: 0,
    sequenceSpeed: t.speed ?? SEQUENCE_SPEED_DEFAULT,
    sequenceStart: t.start,
    sequenceStop: t.stop,
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
  for (const p of PHASES) {
    const i = typePageIndexForState(state, p);
    cell(grid, `${p.toFixed(2)}  0${i + 1}`, paintResolved(state, w, h, p));
  }
}

function cropCaption(state: TypeState, w: number, h: number): string {
  const laid = layoutTypeDocument(state, w, h);
  const frame = opticalFramePx(w);
  const parts: string[] = [];
  for (const item of laid) {
    const block = state.blocks[item.index]!;
    const bleed = headlineEdgeBleed(block);
    const box = typeInkBox(item.layout);
    const inkH = Math.max(1, box.b - box.t);
    const over = {
      l: Math.max(0, -box.l),
      r: Math.max(0, box.r - w),
      t: Math.max(0, -box.t),
      b: Math.max(0, box.b - h),
    };
    const pct = (px: number) => `${Math.round((px / inkH) * 100)}%`;
    const crops: string[] = [];
    if (over.t > 0.5) crops.push(`T ${pct(over.t)}`);
    if (over.b > 0.5) crops.push(`B ${pct(over.b)}`);
    if (over.l > 0.5) crops.push(`L ${pct(over.l)}`);
    if (over.r > 0.5) crops.push(`R ${pct(over.r)}`);
    const unsafe: string[] = [];
    if (!bleed.l && box.l < frame - 0.6) unsafe.push("L");
    if (!bleed.r && box.r > w - frame + 0.6) unsafe.push("R");
    if (!bleed.t && box.t < frame - 0.6) unsafe.push("T");
    if (!bleed.b && box.b > h - frame + 0.6) unsafe.push("B");
    parts.push(crops.length ? crops.join(" ") : "contained");
    if (unsafe.length) parts.push(`UNSAFE ${unsafe.join("")}`);
  }
  return parts.join(" · ") || "empty";
}

function paintBleed(state: TypeState, w: number, h: number): HTMLCanvasElement {
  const canvas = paintResolved(state, w, h, 0);
  const ctx = canvas.getContext("2d")!;
  const frame = opticalFramePx(w);
  ctx.save();
  ctx.strokeStyle = "rgba(90,170,255,0.7)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(frame + 0.5, frame + 0.5, w - frame * 2 - 1, h - frame * 2 - 1);
  ctx.setLineDash([]);
  for (const item of layoutTypeDocument(state, w, h)) {
    const box = typeInkBox(item.layout);
    ctx.strokeStyle = "rgba(255,70,90,0.95)";
    ctx.strokeRect(box.l + 0.5, box.t + 0.5, box.r - box.l - 1, box.b - box.t - 1);
  }
  ctx.restore();
  return canvas;
}

function headlinePage(text: string, anchor: TypeAnchor, scale: number): TypeState {
  return book([page({ text, composition: "headline", scale, anchor, distribution: "packed" })]);
}

function inkOver(state: TypeState, w: number, h: number): { l: number; r: number; t: number; b: number; inkW: number; inkH: number } {
  const laid = layoutTypeDocument(state, w, h)[0];
  if (!laid) return { l: 0, r: 0, t: 0, b: 0, inkW: 1, inkH: 1 };
  const box = typeInkBox(laid.layout);
  return {
    l: Math.max(0, -box.l),
    r: Math.max(0, box.r - w),
    t: Math.max(0, -box.t),
    b: Math.max(0, box.b - h),
    inkW: Math.max(1, box.r - box.l),
    inkH: Math.max(1, box.b - box.t),
  };
}

function opticalContained(state: TypeState, w: number, h: number): boolean {
  const frame = opticalFramePx(w);
  return layoutTypeDocument(state, w, h).every((item) => {
    const box = typeInkBox(item.layout);
    return box.l >= frame - 0.6 && box.t >= frame - 0.6 && box.r <= w - frame + 0.6 && box.b <= h - frame + 0.6;
  });
}

function unrelatedEdgesSafe(state: TypeState, w: number, h: number): boolean {
  const bleed = headlineEdgeBleed(state.blocks[0]!);
  const over = inkOver(state, w, h);
  if (!bleed.l && over.l > 0.6) return false;
  if (!bleed.r && over.r > 0.6) return false;
  if (!bleed.t && over.t > 0.6) return false;
  if (!bleed.b && over.b > 0.6) return false;
  return true;
}

function obviousCrop(px: number, dim: number): boolean {
  const t = px / dim;
  return t >= 0.06 && t <= 0.22;
}

function edgeMatrix(root: HTMLElement, title: string, word: string, scale: number, w: number, h: number): void {
  const grid = section(root, title);
  for (const anchor of TYPE_ANCHORS) {
    const state = headlinePage(word, anchor, scale);
    cell(grid, `${ANCHOR_LABEL[anchor]}  ${cropCaption(state, w, h)}`, paintBleed(state, w, h));
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
  headlineBleed: boolean;
  centreSafe: boolean;
  paragraphSafe: boolean;
  footnoteSafe: boolean;
  windowSemantics: boolean;
  speedMovesCutsOnly: boolean;
  oncePerLoop: boolean;
  orderPreservesDocuments: boolean;
  insertAfterSelected: boolean;
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

  edgeMatrix(root, `Headline edge · MADELEN · Scale 50 · 4:5 · bleed ${Math.round(HEADLINE_INK_BLEED * 100)}%`, "MADELEN", 50, W45, H45);
  edgeMatrix(root, "Headline edge · MADELEN · Scale 78 · 4:5", "MADELEN", 78, W45, H45);
  edgeMatrix(root, "Headline edge · MADELEN · Scale 100 · 4:5", "MADELEN", 100, W45, H45);
  edgeMatrix(root, "Headline edge · MADELEN · Scale 78 · 9:16", "MADELEN", 78, W916, H916);
  edgeMatrix(root, "Headline edge · MADELEN · Scale 100 · 9:16", "MADELEN", 100, W916, H916);

  const shapeGrid = section(root, "Headline edge · MADE / COMING / NEW · Scale 100 · 4:5");
  for (const word of ["MADE", "COMING", "NEW"] as const) {
    for (const anchor of ["tl", "mc", "bc", "br"] as TypeAnchor[]) {
      const state = headlinePage(word, anchor, 100);
      cell(shapeGrid, `${word}  ${ANCHOR_LABEL[anchor]}  ${cropCaption(state, W45, H45)}`, paintBleed(state, W45, H45));
    }
  }

  const twoSpeedPages: [Partial<TypeBlock>, Partial<TypeBlock>][] = [
    page({ text: mbmById("new").text, composition: "headline", scale: 100, anchor: "tl" }),
    page({ text: mbmById("name-break").text, composition: "headline", scale: 78, anchor: "bc" }),
  ];
  const threeSpeedPages: [Partial<TypeBlock>, Partial<TypeBlock>][] = [
    page({ text: "NEW", composition: "headline", scale: 100, anchor: "tl" }),
    page({ text: mbmById("name-break").text, composition: "headline", scale: 78, anchor: "mc" }),
    page({ text: "07.09.2026", composition: "headline", scale: 86, anchor: "br" }),
  ];
  const windows: { start: number; stop: number }[] = [
    { start: 0, stop: 1 },
    { start: 0.2, stop: 0.7 },
    { start: 0.4, stop: 0.8 },
  ];
  for (const win of windows) {
    for (const speed of [0, 50, 100] as const) {
      const two = book(twoSpeedPages, { speed, start: win.start, stop: win.stop });
      const three = book(threeSpeedPages, { speed, start: win.start, stop: win.stop });
      const twoGrid = section(root, `Window ${Math.round(win.start * 100)}–${Math.round(win.stop * 100)} · Speed ${speed} · 2 states`);
      const threeGrid = section(root, `Window ${Math.round(win.start * 100)}–${Math.round(win.stop * 100)} · Speed ${speed} · 3 states`);
      for (const p of WINDOW_PHASES) {
        cell(twoGrid, `${p.toFixed(2)}  0${typePageIndexForState(two, p) + 1}`, paintResolved(two, W45, H45, p));
        cell(threeGrid, `${p.toFixed(2)}  0${typePageIndexForState(three, p) + 1}`, paintResolved(three, W45, H45, p));
      }
    }
  }

  const campaignPages: [Partial<TypeBlock>, Partial<TypeBlock>][] = [
    page({ text: "07.09", composition: "headline", scale: 100, anchor: "tl" }),
    page({ text: mbmById("name-break").text, composition: "headline", scale: 78, anchor: "mc" }),
    page(
      { text: "2026", composition: "headline", scale: 90, anchor: "bl" },
      { text: mbmById("now").text, composition: "footnote", scale: 70, anchor: "br" },
    ),
  ];
  strip(root, "Creative A  Start 10 / Stop 55 / Speed 75", book(campaignPages, { speed: 75, start: 0.1, stop: 0.55 }), W45, H45);
  strip(root, "Creative B  Start 25 / Stop 70 / Speed 50", book(campaignPages, { speed: 50, start: 0.25, stop: 0.7 }), W45, H45);
  strip(root, "Creative C  Start 45 / Stop 80 / Speed 25", book(campaignPages, { speed: 25, start: 0.45, stop: 0.8 }), W45, H45);

  const orderOrig = book(threeSpeedPages);
  const orderMoved = clampTypeState({ ...orderOrig, typePageMove: { from: 1, to: 2 } });
  const origPages = section(root, "Order · authored 01 NEW TL · 02 MADE BY MADELEN Centre · 03 07.09.2026 BR");
  orderOrig.pages.forEach((_, i) => {
    cell(origPages, `01/${String(i + 1).padStart(2, "0")} static`, paintPage(orderOrig, i, W45, H45));
  });
  strip(root, "Order · playback authored", orderOrig, W45, H45);
  const movedPages = section(root, "Order · after 02↔03 drag · visible 01 NEW · 02 date BR · 03 MADELEN Centre");
  orderMoved.pages.forEach((_, i) => {
    cell(movedPages, `01/${String(i + 1).padStart(2, "0")} static`, paintPage(orderMoved, i, W45, H45));
  });
  strip(root, "Order · playback reordered", orderMoved, W45, H45);

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
      const i = typePageIndexForState(state, p);
      const moving = paintResolved(state, W45, H45, p).getContext("2d")!.getImageData(0, 0, W45, H45);
      const frozen = paintPage(state, i, W45, H45).getContext("2d")!.getImageData(0, 0, W45, H45);
      if (pixelDiff(moving, frozen) !== 0) cutEqualsStatic = false;
    }
  }

  const cutsA = typePageCuts(3, sequenceA.sequenceSpeed, sequenceA.sequenceStart, sequenceA.sequenceStop);
  const cutsTwo = typePageCuts(2, free.sequenceSpeed, free.sequenceStart, free.sequenceStop);
  const cutA = cutsA[0]!;
  const cutTwo = cutsTwo[0]!;
  const before = typePageIndexForState(sequenceA, cutA - 0.001);
  const after = typePageIndexForState(sequenceA, cutA + 0.001);
  const twoBefore = typePageIndexForState(free, cutTwo - 0.001);
  const twoAfter = typePageIndexForState(free, cutTwo + 0.001);
  const hardCut = before === 0 && after === 1 && twoBefore === 0 && twoAfter === 1
    && pixelDiff(
      paintResolved(sequenceA, W45, H45, cutA - 0.001).getContext("2d")!.getImageData(0, 0, W45, H45),
      paintResolved(sequenceA, W45, H45, cutA + 0.001).getContext("2d")!.getImageData(0, 0, W45, H45),
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
    cellImage(live, `p${p.toFixed(2)}  0${typePageIndexForState(sequenceA, p) + 1}`, img);
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

  const autoCuts = liveHashes["0"] !== liveHashes["0.5"] && liveHashes["0.5"] !== liveHashes["0.8"];

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

  const para = book([page({
    text: "A seasonal offering of garments made to be worn, not archived.",
    composition: "paragraph",
    scale: 42,
    anchor: "ml",
    column: "medium",
  })]);
  const note = book([page({ text: "07.09.2026", composition: "footnote", scale: 80, anchor: "bl" })]);
  const centre = headlinePage("MADELEN", "mc", 100);
  const bc = headlinePage("MADELEN", "bc", 100);
  const tl = headlinePage("MADELEN", "tl", 100);
  const br = headlinePage("MADELEN", "br", 100);
  const ml = headlinePage("MADELEN", "ml", 100);
  const paragraphSafe = opticalContained(para, W45, H45) && opticalContained(para, W916, H916);
  const footnoteSafe = opticalContained(note, W45, H45) && opticalContained(note, W916, H916);
  const centreSafe = opticalContained(centre, W45, H45) && opticalContained(centre, W916, H916);
  const bcOver = inkOver(bc, W45, H45);
  const tlOver = inkOver(tl, W45, H45);
  const brOver = inkOver(br, W45, H45);
  const mlOver = inkOver(ml, W45, H45);
  const headlineBleed =
    obviousCrop(bcOver.b, bcOver.inkH) &&
    unrelatedEdgesSafe(bc, W45, H45) &&
    obviousCrop(tlOver.t, tlOver.inkH) &&
    obviousCrop(tlOver.l, tlOver.inkH) &&
    unrelatedEdgesSafe(tl, W45, H45) &&
    obviousCrop(brOver.b, brOver.inkH) &&
    obviousCrop(brOver.r, brOver.inkH) &&
    unrelatedEdgesSafe(br, W45, H45) &&
    obviousCrop(mlOver.l, mlOver.inkH) &&
    unrelatedEdgesSafe(ml, W45, H45) &&
    TYPE_ANCHORS.every((anchor) => unrelatedEdgesSafe(headlinePage("MADELEN", anchor, 100), W45, H45)) &&
    TYPE_ANCHORS.every((anchor) => unrelatedEdgesSafe(headlinePage("MADELEN", anchor, 78), W916, H916));

  const mid = book(threeSpeedPages, { speed: 50, start: 0.2, stop: 0.7 });
  const slow = book(threeSpeedPages, { speed: 0, start: 0.2, stop: 0.7 });
  const fast = book(threeSpeedPages, { speed: 100, start: 0.2, stop: 0.7 });
  const windowSemantics =
    typePageIndexForState(mid, 0) === 0 &&
    typePageIndexForState(mid, 0.19) === 0 &&
    typePageIndexForState(mid, 0.2) === 0 &&
    typePageIndexForState(mid, 0.7) === 2 &&
    typePageIndexForState(mid, 0.9) === 2 &&
    typePageIndexForState(mid, 0.99) === 2 &&
    typePageIndexAtPhase(0.19, 3, 50, 0.2, 0.7) === 0 &&
    typePageIndexAtPhase(0.7, 3, 50, 0.2, 0.7) === 2;

  const midCuts = typePageCuts(3, 50, 0.2, 0.7);
  const slowCuts = typePageCuts(3, 0, 0.2, 0.7);
  const fastCuts = typePageCuts(3, 100, 0.2, 0.7);
  const geo0 = typeGeometryKey(slow, W45, H45);
  const geo100 = typeGeometryKey(fast, W45, H45);
  const speedMovesCutsOnly =
    geo0 === geo100 &&
    fastCuts[0]! < midCuts[0]! &&
    midCuts[0]! < slowCuts[0]! &&
    fastCuts[1]! < midCuts[1]! &&
    midCuts[1]! < slowCuts[1]! &&
    fastCuts[1]! < 0.7 &&
    slowCuts[1]! <= 0.7 + 1e-9 &&
    typePageIndexForState(fast, 0.4) === 2 &&
    typePageIndexForState(slow, 0.4) === 0;

  function pathOnce(state: TypeState): boolean {
    const n = state.pages.length;
    const seen: number[] = [];
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const p = i === 200 ? 0 : i / 200;
      const idx = typePageIndexForState(state, p);
      if (idx !== prev) {
        seen.push(idx);
        prev = idx;
      }
    }
    const body = seen[seen.length - 1] === 0 && seen.length > 1 ? seen.slice(0, -1) : seen;
    if (body.length !== n || body[0] !== 0 || body[n - 1] !== n - 1) return false;
    for (let i = 1; i < body.length; i++) if (body[i]! !== body[i - 1]! + 1) return false;
    return true;
  }
  const edgeWindows = [
    book(threeSpeedPages, { speed: 0, start: 0, stop: 1 }),
    book(threeSpeedPages, { speed: 100, start: 0, stop: 0.2 }),
    book(threeSpeedPages, { speed: 50, start: 0.8, stop: 1 }),
    book(threeSpeedPages, { speed: 50, start: 0.2, stop: 0.7 }),
    book(twoSpeedPages, { speed: 0, start: 0.2, stop: 0.7 }),
    book(twoSpeedPages, { speed: 100, start: 0.2, stop: 0.7 }),
  ];
  const oncePerLoop = edgeWindows.every(pathOnce);

  const holdWindowEdges =
    typePageIndexForState(mid, 0.2 - 1e-6) === 0 &&
    typePageIndexForState(mid, 0.2) === 0 &&
    typePageIndexForState(mid, 0.45) === 1 &&
    typePageIndexForState(mid, 0.7 - 1e-6) === 2 &&
    typePageIndexForState(mid, 0.7) === 2 &&
    typePageIndexForState(mid, 0.7 + 1e-6) === 2;

  const orderPreservesDocuments =
    orderMoved.pages[0]![0]!.text === "NEW" &&
    orderMoved.pages[1]![0]!.text === "07.09.2026" &&
    orderMoved.pages[2]![0]!.text === mbmById("name-break").text &&
    orderOrig.pages[1]![0]!.text === mbmById("name-break").text &&
    typePageIndexForState(orderMoved, 0.1) === 0 &&
    typeStateAtPhase(orderMoved, 0.1).blocks[0]!.text === "NEW" &&
    typeStateAtPhase(orderMoved, 0.4).blocks[0]!.text === "07.09.2026" &&
    typeStateAtPhase(orderMoved, 0.8).blocks[0]!.text === mbmById("name-break").text;

  const twoThenAdd = clampTypeState({
    ...book([
      page({ text: "NEW", composition: "headline", scale: 100, anchor: "tl" }),
      page({ text: "07.09.2026", composition: "headline", scale: 80, anchor: "br" }),
    ]),
    selected: 0,
    typePage: "add",
  });
  const insertAfterSelected =
    twoThenAdd.pages.length === 3 &&
    twoThenAdd.selected === 1 &&
    twoThenAdd.pages[0]![0]!.text === "NEW" &&
    twoThenAdd.pages[1]![0]!.text === "NEW" &&
    twoThenAdd.pages[2]![0]!.text === "07.09.2026";

  return {
    onePageBypass,
    cutEqualsStatic,
    hardCut,
    holdExportIdentical,
    autoCuts,
    geometryStable,
    headlineBleed,
    centreSafe,
    paragraphSafe,
    footnoteSafe,
    windowSemantics: windowSemantics && holdWindowEdges,
    speedMovesCutsOnly,
    oncePerLoop,
    orderPreservesDocuments,
    insertAfterSelected,
    elapsedMs: performance.now() - t0,
    details: {
      liveHashes,
      holdPreview,
      holdFrames,
      cuts: { before, after, twoBefore, twoAfter, midCuts, slowCuts, fastCuts },
      layoutMs: { one: oneMs, three: threeMs },
      cloneKeepsPages: cloneTypeState(sequenceA).pages.length === 3,
      bleed: HEADLINE_INK_BLEED,
      crop: { bc: bcOver, tl: tlOver, br: brOver, ml: mlOver },
      window: { start: mid.sequenceStart, stop: mid.sequenceStop },
      orderTexts: orderMoved.pages.map((p) => p[0]!.text),
      insertTexts: twoThenAdd.pages.map((p) => p[0]!.text),
    },
  };
}
