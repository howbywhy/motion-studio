/**
 * Isolated UX eval. Product architecture is ground truth.
 * Models only change selection chrome and where state-owned fields are shown.
 */

import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import {
  clampTypeState,
  TYPE_ANCHORS,
  type SequenceTypeAnchor,
  type SequenceTypeSizeMode,
} from "../core/typeState";
import { sequenceCopyPatch } from "../core/typeAuthoring";
import { clampMarkState } from "../core/markState";
import { loadSwitzer } from "../core/typeFont";
import { clampSequenceWeights, sequenceSpans } from "../core/sequenceRhythm";
import { resolveSequenceTypePosition } from "../core/sequenceTypeComposition";
import { buildSequenceRhythmStrip } from "../ui/sequenceRhythmStrip";
import { buildTypePanel } from "../ui/typePanel";
import { mountMarkPanel } from "../ui/markPanel";

type PieceId = "editorial" | "fast" | "quiet";
type UxModel = "current" | "a" | "b";

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
  spare: ["#241018", "#704050"],
};

const REPLACE_KIND = "spare";

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

function typeFor(piece: PieceSpec) {
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

function pad(n: number): string {
  return String(n + 1).padStart(2, "0");
}

function secondsAt(index: number): string {
  const spans = sequenceSpans(renderer.getSequenceWeights());
  const share = spans[index]?.share ?? 0;
  return `${(share * renderer.getLoopSeconds()).toFixed(1)}s`;
}

function compositionFingerprint(): string {
  const type = renderer.getTypeState();
  const mark = renderer.getMarkState();
  const items = renderer.getSequence();
  return JSON.stringify({
    ids: items.map((item) => item.id),
    media: items.map((item) => item.asset.label),
    weights: renderer.getSequenceWeights(),
    copies: type.sequenceCopies,
    sizeModes: type.sequenceSizeModes,
    sizes: type.sequenceSizes,
    anchors: type.sequenceAnchors,
    resolved: type.sequenceAnchors.map((raw) => resolveSequenceTypePosition(raw)),
    mark: { enabled: mark.enabled, scale: mark.scale, anchor: mark.anchor },
    flicker: renderer.getTransitionFlickerEnabled(),
    loop: renderer.getLoopSeconds(),
    typeMode: type.typeMode,
    typeOn: type.enabled,
  });
}

function frameHash(): string {
  renderer.renderFrame();
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 97) {
    h ^= data[i]!;
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
}

function sampleHash(phases: number[]): string {
  const clock = renderer.getClockMode();
  const phase = renderer.getPhase();
  const bits = phases.map((p) => {
    renderer.seekLoopPhase(p);
    return frameHash();
  });
  renderer.seekLoopPhase(phase);
  renderer.setClockMode(clock);
  if (clock === "auto") renderer.play();
  return bits.join(",");
}

const modelsBar = document.getElementById("models")!;
const piecesBar = document.getElementById("pieces")!;
const optsBar = document.getElementById("opts")!;
const actionsBar = document.getElementById("actions")!;
const stage = document.getElementById("stage")!;
const stripHost = document.getElementById("strip")!;
const typeHost = document.getElementById("type-panel")!;
const markHost = document.getElementById("mark-panel")!;
const inspectorHost = document.getElementById("state-inspector")!;
const hud = document.getElementById("hud")!;
const taskHost = document.getElementById("task")!;

const canvas = document.createElement("canvas");
stage.appendChild(canvas);
const renderer = new Renderer(canvas);
renderer.setBehavior(bloomBehavior, bloomParams());
renderer.setPlaybackMode("loop");
renderer.setEndBehaviour({ mode: "off" });
renderer.setClockMode("auto");
renderer.setRegistrationEnabled(true);

let model: UxModel = "current";
let pieceId: PieceId = "editorial";
let formatOverride: "4:5" | "9:16" | "piece" = "piece";
let lastSelectedId: string | null = null;
let lastSelectedIndex = 0;
let surfaceChanges = 0;
let selections = 0;
let contextLost = 0;
let rememberedIndex = false;
let lastHashes = "";
let parityNote = "not sampled";
let lastChromeKey = "";

function formatNow(): "4:5" | "9:16" {
  return formatOverride === "piece" ? PIECES[pieceId].aspect : formatOverride;
}

function selectedIndex(): number {
  const id = renderer.getSelectedId();
  const index = renderer.getSequence().findIndex((item) => item.id === id);
  return index >= 0 ? index : 0;
}

function typeContext() {
  const type = renderer.getTypeState();
  return {
    playbackMode: renderer.getPlaybackMode(),
    sources: renderer.getSequence().map((item) => ({ label: item.asset.label })),
    pairIndex: renderer.getActivePair().pairIndex,
    selectedIndex: selectedIndex(),
    copies: type.sequenceCopies,
    sizeModes: type.sequenceSizeModes,
    sizes: type.sequenceSizes,
    anchors: type.sequenceAnchors,
  };
}

function selectById(id: string, source: "strip" | "type" | "inspector" | "action"): void {
  if (renderer.getSelectedId() === id && source !== "action") {
    syncChrome();
    return;
  }
  selections += 1;
  if (source === "strip" || source === "type" || source === "inspector") surfaceChanges += 1;
  renderer.selectItem(id);
  lastSelectedId = id;
  lastSelectedIndex = selectedIndex();
  strip.syncMarks();
  typeUi.setContext(typeContext());
  syncChrome();
}

function selectByIndex(index: number, source: "type" | "inspector" | "action"): void {
  const item = renderer.getSourceAt(index);
  if (!item) return;
  selectById(item.id, source);
}

function applyPiece(resetClock: boolean): void {
  const piece = PIECES[pieceId];
  const dim = stageSize(formatNow());
  renderer.resizeExact(dim.w, dim.h);
  renderer.setLoopSeconds(piece.loop);
  renderer.setTransitionFlickerEnabled(piece.flicker);
  renderer.setMarkState(productMark());
  renderer.setSequence(
    piece.scenes.map((kind, i) => ({ id: `src-${i}`, asset: sceneAsset(kind) })),
    "src-0",
  );
  renderer.setSequenceWeights(clampSequenceWeights(piece.weights, piece.scenes.length));
  renderer.setTypeState(typeFor(piece));
  lastSelectedId = renderer.getSelectedId();
  lastSelectedIndex = selectedIndex();
  markUi.sync();
  typeUi.sync(renderer.getTypeState());
  typeUi.setContext(typeContext());
  strip.refresh();
  if (resetClock) {
    renderer.setClockMode("auto");
    renderer.play();
  }
  syncChrome();
}

const typeUi = buildTypePanel(typeHost, typeFor(PIECES.editorial), (patch) => {
  renderer.patchTypeState(patch);
  typeUi.sync(renderer.getTypeState());
  typeUi.setContext(typeContext());
  syncChrome();
}, (index) => {
  selectByIndex(index, "type");
});

const markUi = mountMarkPanel(
  markHost,
  () => renderer.getMarkState(),
  (next) => renderer.setMarkState(next),
);

const strip = buildSequenceRhythmStrip(stripHost, {
  getItems: () => renderer.getSequence(),
  getWeights: () => renderer.getSequenceWeights(),
  getSelectedId: () => renderer.getSelectedId(),
  getActiveIndex: () => renderer.getActivePair().pairIndex,
  getLoopSeconds: () => renderer.getLoopSeconds(),
  onSelect: (id) => selectById(id, "strip"),
  onAdd: () => {
    renderer.addSource(sceneAsset("spare"), { select: true });
    lastSelectedId = renderer.getSelectedId();
    lastSelectedIndex = selectedIndex();
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  },
  onReorder: (from, to) => {
    const keep = renderer.getSelectedId();
    renderer.moveSource(from, to);
    if (keep) renderer.selectItem(keep);
    lastSelectedId = renderer.getSelectedId();
    lastSelectedIndex = selectedIndex();
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  },
  onWeights: (weights) => {
    renderer.setSequenceWeights(weights);
    strip.layout();
    syncChrome(true);
  },
  onResetTiming: () => {
    renderer.resetSequenceWeights();
    strip.refresh();
    syncChrome();
  },
  onDropMedia: (id, file) => {
    void file;
    renderer.selectItem(id);
    renderer.replaceSource(id, sceneAsset(REPLACE_KIND));
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  },
});

function setModel(next: UxModel): void {
  const before = compositionFingerprint();
  const beforeFrame = frameHash();
  const phase = renderer.getPhase();
  model = next;
  document.body.classList.toggle("model-current", next === "current");
  document.body.classList.toggle("model-a", next === "a");
  document.body.classList.toggle("model-b", next === "b");
  const after = compositionFingerprint();
  const afterFrame = frameHash();
  parityNote = before === after && beforeFrame === afterFrame
    ? `identical  phase ${phase.toFixed(3)}  frame ${beforeFrame}`
    : `DRIFT  data ${before === after}  frame ${beforeFrame === afterFrame}`;
  lastHashes = afterFrame;
  paintBars();
  typeUi.setContext(typeContext());
  syncChrome();
}

function paintInspector(): void {
  const index = selectedIndex();
  const item = renderer.getSourceAt(index);
  const type = renderer.getTypeState();
  const copy = type.sequenceCopies[index] ?? "";
  const mode = type.sequenceSizeModes[index] ?? "auto";
  const size = type.sequenceSizes[index] ?? 78;
  const raw = type.sequenceAnchors[index] ?? "inherit";
  inspectorHost.innerHTML = "";
  if (model !== "b") return;

  const head = document.createElement("div");
  head.className = "state-head";
  const title = document.createElement("div");
  title.className = "state-index";
  title.textContent = `State ${pad(index)}`;
  const replace = document.createElement("button");
  replace.type = "button";
  replace.className = "replace-btn";
  replace.textContent = "Replace media";
  replace.addEventListener("click", () => {
    if (!item) return;
    selectById(item.id, "inspector");
    renderer.replaceSource(item.id, sceneAsset(REPLACE_KIND));
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  });
  head.appendChild(title);
  head.appendChild(replace);
  inspectorHost.appendChild(head);

  const meta = document.createElement("div");
  meta.className = "state-meta";
  const media = document.createElement("span");
  media.textContent = item?.asset.label ?? "—";
  const dur = document.createElement("span");
  dur.textContent = secondsAt(index);
  meta.appendChild(media);
  meta.appendChild(dur);
  inspectorHost.appendChild(meta);

  const typeLab = document.createElement("label");
  typeLab.textContent = "Type";
  inspectorHost.appendChild(typeLab);
  const ta = document.createElement("textarea");
  ta.value = copy;
  ta.placeholder = "This moment";
  ta.addEventListener("input", () => {
    renderer.patchTypeState(sequenceCopyPatch(type.typeMode, index, ta.value));
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext(typeContext());
    paintHud();
  });
  inspectorHost.appendChild(ta);
  if (!copy.trim()) {
    const blank = document.createElement("div");
    blank.className = "blank-note";
    blank.textContent = "Blank Type. The moment still exists.";
    inspectorHost.appendChild(blank);
  }

  const sizeLab = document.createElement("label");
  sizeLab.textContent = "Type Size";
  inspectorHost.appendChild(sizeLab);
  const sizeRow = document.createElement("div");
  sizeRow.className = "state-row";
  const auto = document.createElement("button");
  auto.textContent = "Auto";
  auto.classList.toggle("active", mode === "auto");
  auto.addEventListener("click", () => {
    renderer.patchTypeState({ sequenceSizeModeAt: { index, mode: "auto" } });
    typeUi.sync(renderer.getTypeState());
    syncChrome();
  });
  const sizeInput = document.createElement("input");
  sizeInput.type = "number";
  sizeInput.min = "0";
  sizeInput.max = "100";
  sizeInput.value = String(size);
  sizeInput.addEventListener("input", () => {
    renderer.patchTypeState({
      sequenceSizeModeAt: { index, mode: "manual" },
      sequenceSizeAt: { index, size: Number(sizeInput.value) },
    });
    typeUi.sync(renderer.getTypeState());
    paintHud();
  });
  sizeRow.appendChild(auto);
  sizeRow.appendChild(sizeInput);
  inspectorHost.appendChild(sizeRow);

  const posLab = document.createElement("label");
  posLab.textContent = "Position";
  inspectorHost.appendChild(posLab);
  const posRow = document.createElement("div");
  posRow.className = "state-row";
  const composition = document.createElement("button");
  composition.textContent = "Composition";
  composition.classList.toggle("active", raw === "inherit");
  composition.addEventListener("click", () => {
    renderer.patchTypeState({ sequenceAnchorAt: { index, anchor: "inherit" } });
    typeUi.sync(renderer.getTypeState());
    syncChrome();
  });
  posRow.appendChild(composition);
  for (const a of TYPE_ANCHORS) {
    const btn = document.createElement("button");
    btn.textContent = a.toUpperCase();
    btn.classList.toggle("active", raw === a);
    btn.addEventListener("click", () => {
      renderer.patchTypeState({ sequenceAnchorAt: { index, anchor: a } });
      typeUi.sync(renderer.getTypeState());
      syncChrome();
    });
    posRow.appendChild(btn);
  }
  inspectorHost.appendChild(posRow);
}

function syncConnectedSurfaces(): void {
  const index = selectedIndex();
  const rows = typeHost.querySelectorAll<HTMLElement>(".type-sequence-slot");
  rows.forEach((row, i) => {
    let dur = row.querySelector<HTMLElement>(".eval-state-dur");
    if (model === "a") {
      const meta = row.querySelector(".type-sequence-slot-meta");
      if (meta && !dur) {
        dur = document.createElement("span");
        dur.className = "eval-state-dur";
        meta.appendChild(dur);
      }
      if (dur) dur.textContent = secondsAt(i);
    } else if (dur) {
      dur.remove();
    }
    if (model === "a" && i === index) {
      const key = `${renderer.getSelectedId()}:${i}`;
      if (key !== lastChromeKey) {
        const host = typeHost.querySelector(".type-sequence-slots");
        if (host instanceof HTMLElement) {
          const top = row.offsetTop - host.clientHeight / 3;
          host.scrollTop = Math.max(0, top);
        }
      }
    }
  });
  lastChromeKey = `${model}:${renderer.getSelectedId()}:${index}`;
}

function paintHud(): void {
  const index = selectedIndex();
  const type = renderer.getTypeState();
  const item = renderer.getSourceAt(index);
  const raw = type.sequenceAnchors[index] ?? "inherit";
  const id = renderer.getSelectedId();
  if (lastSelectedId && id && lastSelectedId !== id && lastSelectedIndex === index) {
    contextLost += 1;
    rememberedIndex = true;
  }
  lastSelectedId = id;
  lastSelectedIndex = index;
  const lines = [
    `MODEL  ${model === "current" ? "CURRENT" : model === "a" ? "A CONNECTED SURFACES" : "B STATE INSPECTOR"}`,
    `PIECE  ${PIECES[pieceId].label}  ${formatNow()}  ${renderer.getLoopSeconds()}s  flicker ${PIECES[pieceId].flicker ? "on" : "off"}`,
    `CANONICAL  renderer.selectedId = ${id ?? "null"}  index ${pad(index)}`,
    `STATE  ${item?.asset.label ?? "—"}  ${secondsAt(index)}  copy ${JSON.stringify(type.sequenceCopies[index] ?? "")}`,
    `SIZE  ${type.sequenceSizeModes[index] ?? "auto"} ${type.sequenceSizes[index] ?? ""}  POS ${raw} → ${resolveSequenceTypePosition(raw)}`,
    `TYPE  ${type.enabled ? "On" : "Off"}  ${type.typeMode}  Pulse uses Global`,
    `SIGNATURE  ${renderer.getMarkState().enabled ? "On" : "Off"}  ${renderer.getMarkState().anchor.toUpperCase()}  scale ${renderer.getMarkState().scale}`,
    `COUNTS  selections ${selections}  surface changes ${surfaceChanges}  index-sticky losses ${contextLost}`,
    `PARITY  ${parityNote}`,
    `REMEMBER  user ${rememberedIndex ? "had to trust an index" : "can follow selectedId"}`,
  ];
  hud.textContent = lines.join("\n");
}

function syncChrome(durationOnly = false): void {
  if (!durationOnly) paintInspector();
  else if (model === "b") {
    const meta = inspectorHost.querySelector(".state-meta span:last-child");
    if (meta) meta.textContent = secondsAt(selectedIndex());
  }
  syncConnectedSurfaces();
  paintHud();
}

function button(parent: HTMLElement, label: string, on: boolean, click: () => void): void {
  const b = document.createElement("button");
  b.textContent = label;
  if (on) b.className = "is-on";
  b.addEventListener("click", click);
  parent.appendChild(b);
}

function paintBars(): void {
  modelsBar.innerHTML = "";
  const mk = document.createElement("span");
  mk.className = "k";
  mk.textContent = "Model";
  modelsBar.appendChild(mk);
  button(modelsBar, "CURRENT", model === "current", () => setModel("current"));
  button(modelsBar, "A Connected", model === "a", () => setModel("a"));
  button(modelsBar, "B Inspector", model === "b", () => setModel("b"));

  piecesBar.innerHTML = "";
  const pk = document.createElement("span");
  pk.className = "k";
  pk.textContent = "Piece";
  piecesBar.appendChild(pk);
  (Object.keys(PIECES) as PieceId[]).forEach((id) => {
    button(piecesBar, PIECES[id].label, pieceId === id, () => {
      pieceId = id;
      applyPiece(true);
      paintBars();
    });
  });

  optsBar.innerHTML = "";
  const ok = document.createElement("span");
  ok.className = "k";
  ok.textContent = "Stage";
  optsBar.appendChild(ok);
  button(optsBar, "Piece format", formatOverride === "piece", () => {
    formatOverride = "piece";
    renderer.resizeExact(stageSize(formatNow()).w, stageSize(formatNow()).h);
    paintBars();
  });
  button(optsBar, "4:5", formatOverride === "4:5", () => {
    formatOverride = "4:5";
    renderer.resizeExact(420, 525);
    paintBars();
  });
  button(optsBar, "9:16", formatOverride === "9:16", () => {
    formatOverride = "9:16";
    renderer.resizeExact(315, 560);
    paintBars();
  });
  button(optsBar, renderer.getClockMode() === "auto" ? "AUTO" : "HOLD", renderer.getClockMode() === "auto", () => {
    const next = renderer.getClockMode() === "auto" ? "hold" : "auto";
    renderer.setClockMode(next);
    if (next === "auto") renderer.play();
    paintBars();
  });
  button(optsBar, renderer.getPlaybackMode() === "loop" ? "Loop" : "Pulse", renderer.getPlaybackMode() === "loop", () => {
    const next = renderer.getPlaybackMode() === "loop" ? "pingpong" : "loop";
    renderer.setPlaybackMode(next);
    typeUi.setContext(typeContext());
    paintBars();
    syncChrome();
  });
  button(optsBar, "Watch", document.body.classList.contains("watch-only"), () => {
    document.body.classList.toggle("watch-only");
    paintBars();
  });

  actionsBar.innerHTML = "";
  const ak = document.createElement("span");
  ak.className = "k";
  ak.textContent = "State";
  actionsBar.appendChild(ak);
  button(actionsBar, "Replace media", false, () => {
    const item = renderer.getSelectedItem();
    if (!item) return;
    renderer.replaceSource(item.id, sceneAsset(REPLACE_KIND));
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  });
  button(actionsBar, "Move → 01", false, () => {
    const from = selectedIndex();
    if (from === 0) return;
    const keep = renderer.getSelectedId();
    renderer.moveSource(from, 0);
    if (keep) renderer.selectItem(keep);
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  });
  button(actionsBar, "Reverse", false, () => {
    const keep = renderer.getSelectedId();
    renderer.reverseSequence();
    if (keep) renderer.selectItem(keep);
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  });
  button(actionsBar, "Add", false, () => {
    renderer.addSource(sceneAsset("spare"), { select: true });
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  });
  button(actionsBar, "Remove", false, () => {
    const id = renderer.getSelectedId();
    if (!id || renderer.getSequence().length <= 1) return;
    renderer.removeSource(id);
    lastSelectedId = renderer.getSelectedId();
    lastSelectedIndex = selectedIndex();
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext(typeContext());
    strip.refresh();
    syncChrome();
  });
  button(actionsBar, "Restore piece", false, () => applyPiece(false));
  button(actionsBar, "Sample parity", false, () => {
    lastHashes = sampleHash([0.12, 0.38, 0.62, 0.88]);
    parityNote = `sampled  ${lastHashes}`;
    paintHud();
  });
}

taskHost.innerHTML = "";
const taskNote = document.createElement("p");
taskNote.className = "lede";
taskNote.textContent = "Authoring task: select 03 → replace media → change copy → manual size → Position TL → drag duration → move state to 01 → select another → reverse → add → remove → restore. Rhythm strip remains the duration editor.";
taskHost.appendChild(taskNote);

renderer.onFrame = () => {
  strip.syncMarks();
  typeUi.setContext(typeContext());
  if (model === "b") {
    const meta = inspectorHost.querySelector(".state-meta span:last-child");
    if (meta) meta.textContent = secondsAt(selectedIndex());
  }
  if (model === "a") syncConnectedSurfaces();
};

void loadSwitzer().then(() => {
  paintBars();
  applyPiece(true);
  lastHashes = sampleHash([0.12, 0.38, 0.62, 0.88]);
  parityNote = `baseline  ${lastHashes}`;
  paintHud();
});
