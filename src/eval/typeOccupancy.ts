import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState, type SequenceTypeAnchor, type SequenceTypeSizeMode } from "../core/typeState";
import { clampMarkState } from "../core/markState";
import { loadSwitzer } from "../core/typeFont";
import { clampSequenceWeights, masterPhaseFromSlotLocal } from "../core/sequenceRhythm";
import { composeSequenceTypeState } from "../core/sequenceType";
import {
  bindEvalTypeOccupancy,
  occupancyLabel,
  resolveInheritOccupancyAnchor,
  resolveSequenceTypeAnchor,
  signatureOccupiedRect,
  type OccupancyModel,
} from "./typeOccupancyModels";
import { buildSequenceRhythmStrip } from "../ui/sequenceRhythmStrip";

const MATRIX_COPIES = [
  "STAY",
  "AFTER HOURS",
  "THE ROOM\nKEEPS GOING",
  "GO",
  "SOFT LIGHT",
];

type PieceId = "editorial" | "fast" | "quiet";
type SizeKind = "auto" | "small" | "large";

interface PieceSpec {
  id: PieceId;
  label: string;
  aspect: "4:5" | "9:16";
  loop: number;
  weights: number[];
  copies: string[];
  sizeModes: SequenceTypeSizeMode[];
  sizes: number[];
  anchors: SequenceTypeAnchor[];
  flicker: boolean;
  scenes: string[];
}

const PIECES: Record<PieceId, PieceSpec> = {
  editorial: {
    id: "editorial",
    label: "EDITORIAL",
    aspect: "4:5",
    loop: 12,
    weights: [1.7916666666666667, 0.20833333333333331, 1, 1.7916666666666667, 0.20833333333333326],
    copies: ["STILL", "after hours", "the room\nkeeps going", "", "hold this"],
    sizeModes: ["auto", "auto", "manual", "auto", "manual"],
    sizes: [78, 78, 34, 78, 58],
    anchors: ["inherit", "inherit", "inherit", "inherit", "tl"],
    flicker: true,
    scenes: ["dark", "studio", "warm", "turn", "organic"],
  },
  fast: {
    id: "fast",
    label: "FAST",
    aspect: "9:16",
    loop: 8,
    weights: [0.4, 1.6, 0.4, 1.6, 1.6, 0.4, 1],
    copies: ["NOW", "look up", "CUT", "", "stay with it", "GO", "after"],
    sizeModes: ["manual", "auto", "manual", "auto", "auto", "manual", "auto"],
    sizes: [72, 78, 80, 78, 78, 64, 78],
    anchors: ["inherit", "inherit", "tc", "inherit", "inherit", "bl", "inherit"],
    flicker: true,
    scenes: ["luma", "yellow", "chrome", "speaker", "turn", "fence", "domain"],
  },
  quiet: {
    id: "quiet",
    label: "QUIET",
    aspect: "4:5",
    loop: 14,
    weights: [1.8041042822741074, 0.19589571772589265, 1.6254144417687502, 0.37458555823124984],
    copies: ["here", "", "soft light", ""],
    sizeModes: ["auto", "auto", "manual", "auto"],
    sizes: [78, 78, 26, 78],
    anchors: ["inherit", "inherit", "bc", "inherit"],
    flicker: false,
    scenes: ["yellow", "portrait", "studio", "grain"],
  },
};

const FILLS: Record<string, [string, string]> = {
  dark: ["#1a1210", "#3a2820"],
  studio: ["#2a2420", "#6a5848"],
  warm: ["#4a2010", "#c87840"],
  turn: ["#102028", "#3a6078"],
  organic: ["#1c1410", "#8a5a3a"],
  luma: ["#0c0c0e", "#f3efe6"],
  yellow: ["#6a4a10", "#e8c040"],
  chrome: ["#181820", "#6a7080"],
  speaker: ["#201810", "#5a4030"],
  fence: ["#2a1810", "#6a4030"],
  domain: ["#101418", "#3a4858"],
  portrait: ["#2a1810", "#8a5a3a"],
  grain: ["#2a2420", "#5a5048"],
};

function bloomParams() {
  const found = presetsForTreatment("clean").find((p) => p.label === "Balanced");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...(found?.values ?? {}),
    resolveLimit: 100,
  };
}

function paintScene(kind: string, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const [a, b] = FILLS[kind] ?? ["#333", "#888"];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(w * 0.1, h * 0.16, w * 0.32, h * 0.2);
  return c;
}

function sceneAsset(kind: string): MediaAsset {
  const src = paintScene(kind, 640, 800);
  return { kind: "image", source: src, naturalW: 640, naturalH: 800, label: kind, transform: defaultTransform() };
}

function stageSize(aspect: "4:5" | "9:16"): { w: number; h: number } {
  return aspect === "9:16" ? { w: 315, h: 560 } : { w: 420, h: 525 };
}

function stillSize(aspect: "4:5" | "9:16"): { w: number; h: number } {
  return aspect === "9:16" ? { w: 180, h: 320 } : { w: 200, h: 250 };
}

function productMark() {
  return clampMarkState({
    enabled: true,
    mode: "intro",
    source: "stacked",
    scale: 40,
    anchor: "mc",
    sequenceStart: 0,
    sequenceStop: 1,
  });
}

function typeFor(piece: PieceSpec, format: "4:5" | "9:16") {
  void format;
  return clampTypeState({
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: piece.copies.slice(),
    sequenceSizeModes: piece.sizeModes.slice(),
    sequenceSizes: piece.sizes.slice(),
    sequenceAnchors: piece.anchors.slice(),
    blocks: [{
      enabled: true,
      text: "",
      composition: "headline",
      textAlign: "center",
      anchor: "mc",
      scale: 78,
    }],
  });
}

function matrixStyle(size: SizeKind) {
  return clampTypeState({
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: MATRIX_COPIES.slice(),
    sequenceSizeModes: MATRIX_COPIES.map(() => (size === "auto" ? "auto" : "manual")),
    sequenceSizes: MATRIX_COPIES.map(() => (size === "small" ? 26 : size === "large" ? 72 : 48)),
    sequenceAnchors: MATRIX_COPIES.map(() => "inherit" as SequenceTypeAnchor),
    blocks: [{
      enabled: true,
      text: "",
      composition: "headline",
      textAlign: "center",
      anchor: "mc",
      scale: 48,
    }],
  });
}

const modelsBar = document.getElementById("models")!;
const piecesBar = document.getElementById("pieces")!;
const optsBar = document.getElementById("opts")!;
const sizesBar = document.getElementById("sizes")!;
const stage = document.getElementById("stage")!;
const stripHost = document.getElementById("strip")!;
const grid = document.getElementById("grid")!;
const hud = document.getElementById("hud")!;

const canvas = document.createElement("canvas");
stage.appendChild(canvas);
const renderer = new Renderer(canvas);
renderer.setBehavior(bloomBehavior, bloomParams());
renderer.setPlaybackMode("loop");
renderer.setEndBehaviour({ mode: "off" });
renderer.setClockMode("auto");
renderer.setRegistrationEnabled(true);

const stillCanvas = document.createElement("canvas");
const stillRenderer = new Renderer(stillCanvas);
stillRenderer.setBehavior(bloomBehavior, bloomParams());
stillRenderer.setPlaybackMode("loop");
stillRenderer.setEndBehaviour({ mode: "off" });
stillRenderer.setClockMode("hold");
stillRenderer.setRegistrationEnabled(false);
stillRenderer.setSequence([{ id: "still", asset: sceneAsset("studio") }], "still");
stillRenderer.setLoopSeconds(8);

let model: OccupancyModel = "current";
let pieceId: PieceId = "editorial";
let formatOverride: "4:5" | "9:16" | "piece" = "piece";
let sizeKind: SizeKind = "auto";
let watchOnly = false;
let selectedId: string | null = null;

function formatNow(): "4:5" | "9:16" {
  return formatOverride === "piece" ? PIECES[pieceId].aspect : formatOverride;
}

function occupancyBind(): void {
  const mark = productMark();
  bindEvalTypeOccupancy(renderer, { model, mark });
  bindEvalTypeOccupancy(stillRenderer, { model, mark });
}

function applyPiece(): void {
  const piece = PIECES[pieceId];
  const format = formatNow();
  const dim = stageSize(format);
  renderer.resizeExact(dim.w, dim.h);
  renderer.setLoopSeconds(piece.loop);
  renderer.setTransitionFlickerEnabled(piece.flicker);
  renderer.setMarkState(productMark());
  renderer.setTypeState(typeFor(piece, format));
  renderer.setSequence(
    piece.scenes.map((kind, i) => ({ id: `src-${i}`, asset: sceneAsset(kind) })),
    "src-0",
  );
  renderer.setSequenceWeights(clampSequenceWeights(piece.weights, piece.scenes.length));
  selectedId = renderer.getSelectedItem()?.id ?? "src-0";
  occupancyBind();
  strip.refresh();
  renderer.setClockMode("auto");
  renderer.play();
}

const strip = buildSequenceRhythmStrip(stripHost, {
  getItems: () => renderer.getSequence(),
  getWeights: () => renderer.getSequenceWeights(),
  getSelectedId: () => selectedId,
  getActiveIndex: () => renderer.getSequenceTiming().index,
  getLoopSeconds: () => renderer.getLoopSeconds(),
  onSelect: (id) => {
    selectedId = id;
    renderer.selectItem(id);
    strip.syncMarks();
  },
  onAdd: () => {},
  onReorder: () => {},
  onWeights: (weights) => {
    renderer.setSequenceWeights(weights);
    strip.refresh();
  },
  onResetTiming: () => {
    renderer.resetSequenceWeights();
    strip.refresh();
  },
});

function button(parent: HTMLElement, label: string, on: boolean, click: () => void): void {
  const b = document.createElement("button");
  b.textContent = label;
  if (on) b.className = "is-on";
  b.addEventListener("click", click);
  parent.appendChild(b);
}

function paintMatrix(): void {
  const format = formatNow();
  const dim = stillSize(format);
  stillRenderer.resizeExact(dim.w, dim.h);
  stillRenderer.setMarkState(productMark());
  occupancyBind();
  const style = matrixStyle(sizeKind);
  stillRenderer.setTypeState(style);
  stillRenderer.setHoldPhase(0.18);
  grid.innerHTML = "";
  const lines: string[] = [`${occupancyLabel(model)}  ${format}  ${sizeKind.toUpperCase()}`];
  for (const copy of MATRIX_COPIES) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const shot = document.createElement("canvas");
    shot.width = dim.w;
    shot.height = dim.h;
    stillRenderer.setTypeState({
      ...style,
      sequenceCopies: [copy],
      sequenceSizeModes: [sizeKind === "auto" ? "auto" : "manual"],
      sequenceSizes: [sizeKind === "small" ? 26 : sizeKind === "large" ? 72 : 48],
      sequenceAnchors: ["inherit"],
    });
    stillRenderer.setHoldPhase(0.18);
    stillRenderer.renderFrame();
    const ctx = shot.getContext("2d")!;
    ctx.drawImage(stillCanvas, 0, 0);
    const composed = composeSequenceTypeState(stillRenderer.getTypeState(), copy, 0, dim.w, dim.h, 0);
    const resolved = composed.blocks[0]!.anchor;
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = `${copy.replace(/\n/g, " / ")}\nINHERIT → ${resolved.toUpperCase()}`;
    cell.appendChild(shot);
    cell.appendChild(cap);
    grid.appendChild(cell);
    lines.push(`${copy.replace(/\n/g, " / ")}  inherit → ${resolved}`);
  }

  const piece = PIECES[pieceId];
  const live = typeFor(piece, format);
  const dimLive = stageSize(format);
  lines.push("");
  lines.push(`${piece.label} live anchors`);
  piece.copies.forEach((copy, i) => {
    const raw = piece.anchors[i] ?? "inherit";
    const composed = composeSequenceTypeState(live, copy || " ", i, dimLive.w, dimLive.h, 0);
    lines.push(`0${i + 1}  ${raw}  ${copy.replace(/\n/g, " / ") || "(empty)"}  → ${composed.blocks[0]!.anchor}`);
  });
  const sig = signatureOccupiedRect(dimLive.w, dimLive.h, productMark());
  const inheritMc = resolveInheritOccupancyAnchor({
    model,
    preferred: "mc",
    width: dimLive.w,
    height: dimLive.h,
    copy: "STAY",
    scale: 48,
    mark: productMark(),
  });
  const manualTl = resolveSequenceTypeAnchor({
    raw: "tl",
    model,
    preferred: "mc",
    width: dimLive.w,
    height: dimLive.h,
    copy: "STAY",
    scale: 48,
    mark: productMark(),
  });
  lines.push("");
  lines.push(`signature box  ${sig ? `${sig.l.toFixed(0)},${sig.t.toFixed(0)} → ${sig.r.toFixed(0)},${sig.b.toFixed(0)}` : "none"}`);
  lines.push(`INHERIT STAY  → ${inheritMc}`);
  lines.push(`manual TL     → ${manualTl}  (must stay tl)`);
  hud.textContent = lines.join("\n");
}

function redrawBars(): void {
  modelsBar.innerHTML = "";
  const mlab = document.createElement("span");
  mlab.textContent = "MODEL";
  modelsBar.appendChild(mlab);
  for (const id of ["current", "signature-region", "shared-datum"] as OccupancyModel[]) {
    button(modelsBar, occupancyLabel(id), model === id, () => {
      model = id;
      occupancyBind();
      applyPiece();
      paintMatrix();
      redrawBars();
    });
  }

  piecesBar.innerHTML = "";
  const plab = document.createElement("span");
  plab.textContent = "PIECE";
  piecesBar.appendChild(plab);
  for (const id of ["editorial", "fast", "quiet"] as PieceId[]) {
    button(piecesBar, PIECES[id].label, pieceId === id, () => {
      pieceId = id;
      formatOverride = "piece";
      applyPiece();
      paintMatrix();
      redrawBars();
    });
  }

  optsBar.innerHTML = "";
  const flab = document.createElement("span");
  flab.textContent = "FORMAT";
  optsBar.appendChild(flab);
  for (const id of ["piece", "4:5", "9:16"] as const) {
    button(optsBar, id === "piece" ? `PIECE ${PIECES[pieceId].aspect}` : id, formatOverride === id, () => {
      formatOverride = id;
      applyPiece();
      paintMatrix();
      redrawBars();
    });
  }
  button(optsBar, watchOnly ? "UI OFF" : "UI ON", watchOnly, () => {
    watchOnly = !watchOnly;
    document.body.classList.toggle("watch-only", watchOnly);
    redrawBars();
  });
  button(optsBar, "REPLAY", false, () => {
    renderer.setClockMode("auto");
    renderer.setHoldPhase(0);
    renderer.play();
  });
  button(optsBar, "HOLD 01", false, () => {
    const weights = renderer.getSequenceWeights();
    renderer.setClockMode("hold");
    renderer.setHoldPhase(masterPhaseFromSlotLocal(0, 0.45, weights));
    renderer.renderFrame();
  });

  sizesBar.innerHTML = "";
  const slab = document.createElement("span");
  slab.textContent = "MATRIX SIZE";
  sizesBar.appendChild(slab);
  for (const id of ["auto", "small", "large"] as SizeKind[]) {
    button(sizesBar, id.toUpperCase(), sizeKind === id, () => {
      sizeKind = id;
      paintMatrix();
      redrawBars();
    });
  }
}

function tick(): void {
  strip.syncMarks();
  requestAnimationFrame(tick);
}

void loadSwitzer().then(() => {
  occupancyBind();
  applyPiece();
  paintMatrix();
  redrawBars();
  requestAnimationFrame(tick);
});
