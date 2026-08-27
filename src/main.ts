import "./style.css";
import { Renderer, type BwMode, type DiagnosticMode, type MediaSlot } from "./core/renderer";
import { isDefaultPlaceholderBg, placeholderA, PLACEHOLDER_DEFAULT_BG } from "./core/placeholder";
import { wrapCanvasAsPlaceholder, defaultTransform, type MediaAsset, type MediaKind } from "./core/media";
import { loadMediaFile } from "./ui/mediaInput";
import type { ExportFormat, ExportFps, ExportQuality, ExportSize } from "./core/exportTypes";
import { buildControls } from "./ui/controls";
import { buildXYPad } from "./ui/xyPad";
import { buildPhaseControl } from "./ui/phaseControl";
import { buildLoopLengthControl } from "./ui/loopLengthControl";
import { buildSequenceStrip } from "./ui/sequenceStrip";
import { buildSpreadControl } from "./ui/spreadControl";
import { buildFragmentControl } from "./ui/fragmentControl";
import { buildBloomFieldMap } from "./ui/bloomFieldMap";
import { hideGraphicPanel } from "./ui/graphicPanel";
import { buildTypePanel } from "./ui/typePanel";
import { loadSwitzer } from "./core/typeFont";
import { clampTypeState, defaultTypeState } from "./core/typeState";
import { debugLinePlan, layoutTypography } from "./core/typeLayout";
import { asGraphic, createGraphicAsset } from "./sources/graphicAsset";
import { DEFAULT_FIELD, FIELD_TERRITORIES } from "./sources/field";
import { BEHAVIORS, PRODUCT_BEHAVIORS } from "./behaviors/index";
import { SHIFT_EXPRESSION_COPY } from "./behaviors/shift";
import { defaultParamValues, type MaskBehavior, type ParamDef, type ParamValues, type SelectParamDef } from "./core/types";
import { matchingPreset, presetsForTreatment, type Preset } from "./core/presets";
import { generateRandomisation, newRandomisationSeed } from "./core/randomise";
import type { ClockMode } from "./core/phaseClock";
import {
  createSavedState,
  deleteSavedState,
  duplicateSavedState,
  isAssetReferencedBySavedState,
  listSavedStates,
  renameSavedState,
  type SavedState,
  type SavedStateInput,
} from "./core/savedStates";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand">Motion Studio <span class="brand-sub">—</span></div>
      <div class="topbar-right">
        <div class="behavior-tabs" id="behavior-tabs"></div>
        <button type="button" class="diagnostic-toggle" id="registration-toggle" title="Global surface language: Registration — a quiet material impression over the complete composition">
          Registration
        </button>
        <div class="seg-toggle bw-toggle" id="bw-toggle" title="Selective B&amp;W on the active pair, applied before Bloom">
          <span class="bw-label">B&amp;W</span>
          <button type="button" data-value="off" class="active">Off</button>
          <button type="button" data-value="A">A</button>
          <button type="button" data-value="B">B</button>
          <button type="button" data-value="both">Both</button>
        </div>
      </div>
    </header>
    <main class="workspace">
      <section class="stage-panel">
        <div class="sequence-panel">
          <div id="sequence-strip" class="sequence-strip"></div>
          <div class="source-inspector" id="source-inspector">
            <button type="button" class="load-media-btn" id="btn-replace">Replace</button>
            <div class="source-inspector-meta">
              <span class="media-slot-name" id="source-name">—</span>
              <span class="media-slot-type" id="source-type">—</span>
            </div>
            <button type="button" class="reset-btn" id="source-remove" title="Remove this source">Remove</button>
          </div>
        </div>
        <div class="stage-toolbar">
          <div class="seg-toggle" id="aspect-toggle">
            <button data-value="4:5" class="active">4:5</button>
            <button data-value="9:16">9:16</button>
          </div>
          <div class="seg-toggle" id="playback-toggle">
            <button data-value="loop" class="active">Loop</button>
            <button data-value="pingpong">Ping-pong</button>
          </div>
          <div id="loop-length"></div>
          <div id="phase-control"></div>
          <button type="button" class="diagnostic-toggle" id="pause-all" title="Freeze the entire composition exactly where it is. Independent of HOLD and Video Pause.">Pause All</button>
        </div>
        <div class="stage-frame" id="stage-frame">
          <canvas id="canvas"></canvas>
        </div>
        <div class="stage-controls">
          <button id="play-pause" class="primary" title="Pause or resume source video. Independent of Phase Auto/Hold.">Pause</button>
          <button type="button" class="diagnostic-toggle" id="audio-toggle" title="Hear source video audio, or mute. Independent of HOLD.">Audio</button>
          <button id="swap" title="Reverse the source sequence">Reverse</button>
          <button type="button" id="randomise" title="Curated Bloom variation, frozen as a still">Randomise</button>
          <button type="button" id="randomise-undo" disabled title="Restore the previous composition">Undo</button>
        </div>
        <div class="export-panel" id="export-panel">
          <div class="export-row">
            <span class="export-label">Export</span>
            <div class="seg-toggle" id="export-format">
              <button type="button" data-value="mp4" class="active">MP4</button>
              <button type="button" data-value="webp">WEBP</button>
              <button type="button" data-value="png">PNG</button>
            </div>
            <div class="seg-toggle" id="export-fps">
              <button type="button" data-value="24">24</button>
              <button type="button" data-value="25">25</button>
              <button type="button" data-value="30" class="active">30</button>
            </div>
            <div class="seg-toggle" id="export-size">
              <button type="button" data-value="preview">Preview</button>
              <button type="button" data-value="1080" class="active">1080</button>
              <button type="button" data-value="2160">2160</button>
            </div>
            <div class="seg-toggle" id="export-quality">
              <button type="button" data-value="standard" class="active">Standard</button>
              <button type="button" data-value="high">High</button>
            </div>
          </div>
          <div class="export-row">
            <span class="export-duration" id="export-duration">Loop 12s</span>
            <button type="button" id="export-run" class="primary" title="Deterministic offline export of the current loop">Export</button>
            <button type="button" id="export-cancel" hidden>Cancel</button>
            <span class="export-status" id="export-status"></span>
          </div>
        </div>
      </section>
      <aside class="control-panel">
          <div class="composition-panel" id="composition-panel">
            <div class="panel-label-row">
              <label class="panel-label">Composition</label>
            </div>
            <div id="composition-controls"></div>
            <button type="button" class="reset-btn" id="composition-reset">Reset</button>
            <div class="bg-colour-row" id="bg-colour-row">
              <label for="bg-colour">Background</label>
              <input type="color" id="bg-colour" value="#8a5a3a" title="Placeholder background colour" />
              <button type="button" class="reset-btn" id="bg-colour-reset" title="Restore the default background colour">Reset</button>
            </div>
          </div>
        <div id="type-panel" class="type-panel"></div>
        <div class="graphic-panel" id="graphic-panel" hidden></div>
        <div class="behavior-meta">
          <h2 id="behavior-title"></h2>
          <p id="behavior-desc" class="behavior-desc"></p>
        </div>
        <div class="treatment-panel" id="treatment-panel" hidden>
          <label class="panel-label" id="treatment-label">Treatment</label>
          <div class="seg-toggle treatment-toggle" id="treatment-toggle"></div>
          <button type="button" class="diagnostic-toggle image-aware-toggle" id="image-aware" title="Experimental: bias field placement toward visually information-rich areas of the photograph">
            Image Aware
          </button>
        </div>
        <div class="preset-panel" id="preset-panel" hidden>
          <label class="panel-label" id="preset-label">Preset</label>
          <div class="seg-toggle preset-toggle" id="preset-toggle"></div>
        </div>
        <div class="saved-panel">
          <div class="panel-label-row">
            <label class="panel-label">Saved States</label>
            <button type="button" class="reset-btn" id="save-state-btn">Save Current</button>
          </div>
          <div id="saved-states-list" class="saved-states-list"></div>
          <p class="saved-states-empty" id="saved-states-empty">No saved states yet.</p>
        </div>
        <div id="bloom-field-map" hidden></div>
        <div id="controls"></div>
      </aside>
    </main>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const stageFrame = document.querySelector<HTMLDivElement>("#stage-frame")!;
const behaviorTabs = document.querySelector<HTMLDivElement>("#behavior-tabs")!;
const controlsEl = document.querySelector<HTMLDivElement>("#controls")!;
const titleEl = document.querySelector<HTMLHeadingElement>("#behavior-title")!;
const descEl = document.querySelector<HTMLParagraphElement>("#behavior-desc")!;
const playPauseBtn = document.querySelector<HTMLButtonElement>("#play-pause")!;
const pauseAllBtn = document.querySelector<HTMLButtonElement>("#pause-all")!;
const randomiseBtn = document.querySelector<HTMLButtonElement>("#randomise")!;
const randomiseUndoBtn = document.querySelector<HTMLButtonElement>("#randomise-undo")!;
const audioBtn = document.querySelector<HTMLButtonElement>("#audio-toggle")!;
const swapBtn = document.querySelector<HTMLButtonElement>("#swap")!;
const aspectToggle = document.querySelector<HTMLDivElement>("#aspect-toggle")!;
const playbackToggle = document.querySelector<HTMLDivElement>("#playback-toggle")!;
const sourceInspector = document.querySelector<HTMLDivElement>("#source-inspector")!;
const replaceBtn = document.querySelector<HTMLButtonElement>("#btn-replace")!;
const sourceName = document.querySelector<HTMLSpanElement>("#source-name")!;
const sourceType = document.querySelector<HTMLSpanElement>("#source-type")!;
const sourceRemoveBtn = document.querySelector<HTMLButtonElement>("#source-remove")!;
const registrationBtn = document.querySelector<HTMLButtonElement>("#registration-toggle")!;
const bwToggle = document.querySelector<HTMLDivElement>("#bw-toggle")!;
const treatmentPanel = document.querySelector<HTMLDivElement>("#treatment-panel")!;
const treatmentLabel = document.querySelector<HTMLLabelElement>("#treatment-label")!;
const treatmentToggle = document.querySelector<HTMLDivElement>("#treatment-toggle")!;
const imageAwareBtn = document.querySelector<HTMLButtonElement>("#image-aware")!;
const compositionControlsEl = document.querySelector<HTMLDivElement>("#composition-controls")!;
const compositionResetBtn = document.querySelector<HTMLButtonElement>("#composition-reset")!;
const typePanelEl = document.querySelector<HTMLDivElement>("#type-panel")!;
const bgColourInput = document.querySelector<HTMLInputElement>("#bg-colour")!;
const bgColourResetBtn = document.querySelector<HTMLButtonElement>("#bg-colour-reset")!;
const graphicPanelEl = document.querySelector<HTMLDivElement>("#graphic-panel")!;
const presetPanel = document.querySelector<HTMLDivElement>("#preset-panel")!;
const presetLabel = document.querySelector<HTMLLabelElement>("#preset-label")!;
const presetToggle = document.querySelector<HTMLDivElement>("#preset-toggle")!;
const saveStateBtn = document.querySelector<HTMLButtonElement>("#save-state-btn")!;
const savedStatesListEl = document.querySelector<HTMLDivElement>("#saved-states-list")!;
const savedStatesEmptyEl = document.querySelector<HTMLParagraphElement>("#saved-states-empty")!;
const exportRunBtn = document.querySelector<HTMLButtonElement>("#export-run")!;
const exportCancelBtn = document.querySelector<HTMLButtonElement>("#export-cancel")!;
const exportStatusEl = document.querySelector<HTMLSpanElement>("#export-status")!;
const exportDurationEl = document.querySelector<HTMLSpanElement>("#export-duration")!;
const exportFormatToggle = document.querySelector<HTMLDivElement>("#export-format")!;
const exportFpsToggle = document.querySelector<HTMLDivElement>("#export-fps")!;
const exportSizeToggle = document.querySelector<HTMLDivElement>("#export-size")!;
const exportQualityToggle = document.querySelector<HTMLDivElement>("#export-quality")!;

const renderer = new Renderer(canvas);
let placeholderBg = PLACEHOLDER_DEFAULT_BG;
void loadSwitzer().then(() => renderer.renderFrame());

const typeUi = buildTypePanel(typePanelEl, renderer.getTypeState(), (patch) => {
  renderer.patchTypeState(patch);
});

const phaseUi = buildPhaseControl(
  document.querySelector<HTMLDivElement>("#phase-control")!,
  (mode) => {
    renderer.setClockMode(mode);
    phaseUi.setDisplayedPhase(renderer.getPhase());
  },
  (phase) => {
    renderer.setHoldPhase(phase);
  }
);

const bloomFieldMap = buildBloomFieldMap(document.querySelector<HTMLDivElement>("#bloom-field-map")!);

const lastMediaById = new Map<string, MediaAsset>();
let currentAspect = "4:5";

function aspectParts(): { w: number; h: number } {
  const [w, h] = currentAspect.split(":").map(Number);
  return { w: w || 4, h: h || 5 };
}

function selectedItem() {
  return renderer.getSelectedItem();
}

function showSourceMeta(label: string, kind: MediaKind, error?: boolean): void {
  sourceName.textContent = label;
  sourceName.classList.toggle("has-error", Boolean(error));
  sourceType.classList.toggle("type-image", kind === "image");
  sourceType.classList.toggle("type-video", kind === "video");
  sourceType.classList.toggle("type-graphic", kind === "graphic");
  sourceType.textContent = kind === "graphic" ? "FIELD" : kind === "image" ? "IMAGE" : "VIDEO";
}

function syncSourceInspector(): void {
  const item = selectedItem();
  sourceInspector.classList.toggle("source-graphic", item?.asset.kind === "graphic");
  if (!item) {
    showSourceMeta("—", "image");
    return;
  }
  showSourceMeta(item.asset.label, item.asset.kind);
  sourceRemoveBtn.disabled = renderer.getSequence().length <= 1;
}

function rebuildGraphicPanel(): void {
  hideGraphicPanel(graphicPanelEl);
}

function setSourceKind(id: string, mode: "media" | "field"): void {
  const item = renderer.getSequence().find((s) => s.id === id);
  if (!item) return;
  const current = item.asset;
  if (mode === "field") {
    if (current.kind !== "graphic") lastMediaById.set(id, current);
    if (asGraphic(current)) {
      syncSourceInspector();
      rebuildGraphicPanel();
      rebuildCompositionPanel();
      return;
    }
    const { w, h } = aspectParts();
    const index = renderer.getSequence().findIndex((s) => s.id === id);
    const asset = createGraphicAsset(w, h, `Field ${String(index + 1).padStart(2, "0")}`, { ...DEFAULT_FIELD });
    const disposePrevious = current.kind === "graphic" ? !isAssetReferencedBySavedState(current) : false;
    renderer.replaceSource(id, asset, { disposePrevious });
    syncSourceInspector();
    rebuildGraphicPanel();
    rebuildCompositionPanel();
    sequenceStrip.refresh();
    return;
  }

  const restored = lastMediaById.get(id) ?? makePlaceholder("Media");
  const disposePrevious = current ? !isAssetReferencedBySavedState(current) : true;
  renderer.replaceSource(id, restored, { disposePrevious });
  syncSourceInspector();
  rebuildGraphicPanel();
  rebuildCompositionPanel();
  sequenceStrip.refresh();
}

function loadSourceAsset(id: string, asset: MediaAsset, displayLabel?: string): void {
  const prev = renderer.getSource(id);
  const disposePrevious = prev ? !isAssetReferencedBySavedState(prev) : true;
  renderer.replaceSource(id, asset, { disposePrevious });
  if (displayLabel) asset.label = displayLabel;
  if (asset.kind !== "graphic") lastMediaById.set(id, asset);
  syncSourceInspector();
  rebuildGraphicPanel();
  rebuildCompositionPanel();
  sequenceStrip.refresh();
  syncAudioButton();
}

function makePlaceholder(label: string): MediaAsset {
  return wrapCanvasAsPlaceholder(placeholderA(placeholderBg), label);
}

function syncBgColourUi(): void {
  bgColourInput.value = isDefaultPlaceholderBg(placeholderBg) ? PLACEHOLDER_DEFAULT_BG : placeholderBg;
}

function rebuildPlaceholderAssets(): void {
  for (const item of renderer.getSequence()) {
    if (!item.asset.placeholder) continue;
    const next = makePlaceholder(item.asset.label);
    next.transform = { ...item.asset.transform };
    const disposePrevious = !isAssetReferencedBySavedState(item.asset);
    renderer.replaceSource(item.id, next, { disposePrevious });
  }
  sequenceStrip.refresh();
}

function addPlaceholderSource(): void {
  const n = renderer.getSequence().length + 1;
  const asset = makePlaceholder(`Media ${String(n).padStart(2, "0")}`);
  renderer.addSource(asset, { select: true });
  syncSourceInspector();
  rebuildGraphicPanel();
  rebuildCompositionPanel();
  sequenceStrip.refresh();
}

const replaceInput = document.createElement("input");
replaceInput.type = "file";
replaceInput.accept = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov";
replaceInput.hidden = true;
sourceInspector.appendChild(replaceInput);
replaceBtn.addEventListener("click", () => replaceInput.click());
replaceInput.addEventListener("change", () => {
  const file = replaceInput.files?.[0];
  const item = selectedItem();
  if (file && item) {
    loadMediaFile(
      file,
      renderer.getVideoHost(),
      (asset) => loadSourceAsset(item.id, asset),
      (message) => showSourceMeta(message, item.asset.kind, true),
    );
  }
  replaceInput.value = "";
});

sourceRemoveBtn.addEventListener("click", () => {
  const item = selectedItem();
  if (!item || renderer.getSequence().length <= 1) return;
  const dispose = !isAssetReferencedBySavedState(item.asset);
  lastMediaById.delete(item.id);
  renderer.removeSource(item.id, { dispose });
  syncSourceInspector();
  rebuildGraphicPanel();
  rebuildCompositionPanel();
  sequenceStrip.refresh();
  syncAudioButton();
});

const sequenceStrip = buildSequenceStrip(document.querySelector<HTMLDivElement>("#sequence-strip")!, {
  getItems: () => renderer.getSequence(),
  getSelectedId: () => renderer.getSelectedId(),
  getActiveIds: () => {
    const pair = renderer.getActivePair();
    return { aId: pair.aId, bId: pair.bId };
  },
  onSelect: (id) => {
    renderer.selectItem(id);
    syncSourceInspector();
    rebuildGraphicPanel();
    rebuildCompositionPanel();
    sequenceStrip.refresh();
  },
  onAdd: () => addPlaceholderSource(),
  onReorder: (from, to) => {
    renderer.moveSource(from, to);
    sequenceStrip.refresh();
  },
  onDropMedia: (id, file) => {
    renderer.selectItem(id);
    loadMediaFile(
      file,
      renderer.getVideoHost(),
      (asset) => loadSourceAsset(id, asset),
      (message) => showSourceMeta(message, "image", true),
    );
  },
});

const loopLengthUi = buildLoopLengthControl(
  document.querySelector<HTMLDivElement>("#loop-length")!,
  (seconds) => {
    renderer.setLoopSeconds(seconds);
    syncExportDuration();
  },
);

renderer.onFrame = () => {
  if (renderer.getClockMode() === "auto") phaseUi.setDisplayedPhase(renderer.getPhase());
  const pair = renderer.getActivePair();
  phaseUi.setPairCount(Math.max(1, pair.pairCount));
  sequenceStrip.syncMarks();
  bloomFieldMap.sync();
};

const transformParamDefs: ParamDef[] = [
  { type: "range", key: "scale", label: "Scale", min: 100, max: 250, step: 1, default: 100, unit: "%" },
  { type: "range", key: "x", label: "Position X", min: -100, max: 100, step: 1, default: 0, unit: "%" },
  { type: "range", key: "y", label: "Position Y", min: -100, max: 100, step: 1, default: 0, unit: "%" },
];

function compositionValues(): ParamValues {
  const item = selectedItem();
  const t = item ? renderer.getItemTransform(item.id) : { scale: 1, x: 0, y: 0 };
  return { scale: Math.round(t.scale * 100), x: Math.round(t.x * 100), y: Math.round(t.y * 100) };
}

function onCompositionChange(patch: ParamValues): void {
  const item = selectedItem();
  if (!item) return;
  const merged = { ...compositionValues(), ...patch };
  renderer.setItemTransform(item.id, {
    scale: (merged.scale as number) / 100,
    x: (merged.x as number) / 100,
    y: (merged.y as number) / 100,
  });
}

function rebuildCompositionPanel(): void {
  const item = selectedItem();
  const isField = Boolean(asGraphic(item?.asset ?? null));
  compositionControlsEl.hidden = isField;
  compositionResetBtn.hidden = isField;
  if (isField) return;
  buildControls(compositionControlsEl, transformParamDefs, compositionValues(), onCompositionChange);
}

compositionResetBtn.addEventListener("click", () => {
  const item = selectedItem();
  if (!item) return;
  renderer.resetItemTransform(item.id);
  rebuildCompositionPanel();
});

bgColourInput.addEventListener("input", () => {
  placeholderBg = bgColourInput.value;
  rebuildPlaceholderAssets();
});

bgColourResetBtn.addEventListener("click", () => {
  placeholderBg = PLACEHOLDER_DEFAULT_BG;
  syncBgColourUi();
  rebuildPlaceholderAssets();
});

rebuildCompositionPanel();

canvas.style.cursor = "grab";
canvas.style.touchAction = "none";

let dragState: { pointerId: number; startClientX: number; startClientY: number; startX: number; startY: number } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  const item = selectedItem();
  if (!item || asGraphic(item.asset)) return;
  const t = renderer.getItemTransform(item.id);
  dragState = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startX: t.x, startY: t.y };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  const item = selectedItem();
  if (!item) return;
  const rect = canvas.getBoundingClientRect();
  const dxNorm = ((e.clientX - dragState.startClientX) / rect.width) * 2;
  const dyNorm = ((e.clientY - dragState.startClientY) / rect.height) * 2;
  const t = renderer.getItemTransform(item.id);
  renderer.setItemTransform(item.id, {
    scale: t.scale,
    x: Math.min(1, Math.max(-1, dragState.startX - dxNorm)),
    y: Math.min(1, Math.max(-1, dragState.startY - dyNorm)),
  });
  rebuildCompositionPanel();
});

function endDrag(e: PointerEvent): void {
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  dragState = null;
  canvas.style.cursor = "grab";
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener(
  "wheel",
  (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const item = selectedItem();
    if (!item || asGraphic(item.asset)) return;
    e.preventDefault();
    const t = renderer.getItemTransform(item.id);
    const nextScale = Math.min(2.5, Math.max(1, t.scale - e.deltaY * 0.003));
    renderer.setItemTransform(item.id, { ...t, scale: nextScale });
    rebuildCompositionPanel();
  },
  { passive: false }
);

// --- behavior tabs ---
let currentParams: ParamValues = {};
let currentBehavior: MaskBehavior<unknown> = BEHAVIORS[0];
let visibleKeysCache = "";

// Shift's Direction+Overlap are really one polar displacement quantity --
// see ui/xyPad.ts. This is the one prototype control group called for
// before any wider propagation of the visual-control system; every other
// behavior still renders through the plain generic panel.
function appendFamily(parent: HTMLElement, title: string): HTMLElement {
  const fam = document.createElement("div");
  fam.className = "control-family";
  const lab = document.createElement("div");
  lab.className = "control-family-label";
  lab.textContent = title;
  fam.appendChild(lab);
  const body = document.createElement("div");
  fam.appendChild(body);
  parent.appendChild(fam);
  return body;
}

function renderControlDefs(container: HTMLElement, defs: ParamDef[], values: ParamValues, onChange: (patch: ParamValues) => void): void {
  container.innerHTML = "";
  if (currentBehavior.id === "shift") {
    const fragmentDef = defs.find((d) => d.key === "fragment");
    const spreadDef = defs.find((d) => d.key === "spread");
    const angleDef = defs.find((d) => d.key === "direction");
    const radiusDef = defs.find((d) => d.key === "overlap");
    const rest = defs.filter((d) => d.key !== "fragment" && d.key !== "spread" && d.key !== "direction" && d.key !== "overlap");

    const structure = appendFamily(container, "Structure");
    if (fragmentDef && fragmentDef.type === "range") buildFragmentControl(structure, fragmentDef, values, onChange);
    if (spreadDef && spreadDef.type === "range") buildSpreadControl(structure, spreadDef, values, onChange);

    if (angleDef && angleDef.type === "range" && radiusDef && radiusDef.type === "range") {
      const displacement = appendFamily(container, "Displacement");
      buildXYPad(displacement, angleDef, radiusDef, values, onChange);
    }

    const time = appendFamily(container, "Time");
    buildControls(time, rest, values, onChange);
    return;
  }

  if (currentBehavior.id === "bloom") {
    const fieldKeys = new Set(["fieldCount", "fieldSize", "softness", "drift", "overlap"]);
    const revealKeys = new Set(["revealAmount", "resolveAmount"]);
    const fieldDefs = defs.filter((d) => fieldKeys.has(d.key));
    const revealDefs = defs.filter((d) => revealKeys.has(d.key));
    const rest = defs.filter((d) => !fieldKeys.has(d.key) && !revealKeys.has(d.key));
    buildControls(container, fieldDefs, values, onChange);
    const reveal = appendFamily(container, "Reveal");
    buildControls(reveal, revealDefs, values, onChange);
    const time = appendFamily(container, "Time");
    buildControls(time, rest, values, onChange);
    return;
  }

  buildControls(container, defs, values, onChange);
}

function rebuildControlsPanel(): void {
  if (currentBehavior.id !== "bloom") {
    controlsEl.innerHTML = "";
    visibleKeysCache = "";
    return;
  }
  const defs = currentBehavior.visibleParams ? currentBehavior.visibleParams(currentParams) : currentBehavior.params;
  visibleKeysCache = defs.map((d) => d.key).join(",");
  renderControlDefs(controlsEl, defs, currentParams, onParamsChange);
}

// `patch` carries only the one key that changed (see ui/controls.ts) —
// merged here, once, against `currentParams` (the single live source of
// truth for this behavior's params) so it can never be clobbered by a
// stale snapshot from elsewhere. Every caller (control panel, treatment
// toggle, Image Aware button) goes through this same merge.
function onParamsChange(patch: ParamValues): void {
  if (currentBehavior.id === "shift" && patch.treatment !== undefined && patch.treatment !== currentParams.treatment) {
    switchShiftExpression(String(patch.treatment));
    return;
  }
  currentParams = { ...currentParams, ...patch };
  renderer.setParams(currentParams);
  if (currentBehavior.visibleParams) {
    const defs = currentBehavior.visibleParams(currentParams);
    const key = defs.map((d) => d.key).join(",");
    if (key !== visibleKeysCache) {
      visibleKeysCache = key;
      renderControlDefs(controlsEl, defs, currentParams, onParamsChange);
    }
  }
  syncTreatmentUI();
  syncPresetUI();
}

const SHIFT_EXPRESSIONS = new Set(["slice", "drift", "diffuse"]);
const lastParamsByExpression = new Map<string, ParamValues>();

function rememberCurrentExpression(): void {
  if (currentBehavior.id !== "shift") return;
  const treatment = currentParams.treatment as string;
  if (SHIFT_EXPRESSIONS.has(treatment)) lastParamsByExpression.set(treatment, { ...currentParams });
}

function defaultsForShiftExpression(treatment: string): ParamValues {
  const shift = BEHAVIORS.find((b) => b.id === "shift") ?? currentBehavior;
  return { ...defaultParamValues(shift.params), treatment };
}

function switchShiftExpression(next: string): void {
  rememberCurrentExpression();
  currentParams = lastParamsByExpression.get(next) ?? defaultsForShiftExpression(next);
  lastParamsByExpression.set(next, { ...currentParams });
  renderer.setParams(currentParams);
  rebuildControlsPanel();
  syncTreatmentUI();
  syncPresetUI();
}

/** Any behavior can offer a segmented "expression/treatment" selector by
 * declaring a `select`-typed param named "treatment" — Bloom's
 * Clean/Refraction/Registration and Shift's Diffuse/Slice both work
 * this way, so the panel itself needs no per-behavior knowledge. Image
 * Aware stays specific to Bloom (Shift's rebuild has no equivalent).
 * Drift is implemented but omitted from Shift's declared options; a saved
 * state that still holds treatment=drift is restored without conversion,
 * and Drift is injected into the toggle only while that state is active. */
function findTreatmentDef(behavior: MaskBehavior<unknown>): SelectParamDef | null {
  const def = behavior.params.find((d) => d.key === "treatment");
  return def && def.type === "select" ? def : null;
}

function visibleTreatmentOptions(def: SelectParamDef, treatment: string): SelectParamDef["options"] {
  const opts = [...def.options];
  if (treatment === "drift" && !opts.some((o) => o.value === "drift")) {
    opts.push({ value: "drift", label: "Drift" });
  }
  if (treatment === "refraction" && !opts.some((o) => o.value === "refraction")) {
    opts.push({ value: "refraction", label: "Refraction" });
  }
  return opts;
}

function rebuildTreatmentToggle(def: SelectParamDef, treatment: string): void {
  treatmentToggle.innerHTML = "";
  for (const opt of visibleTreatmentOptions(def, treatment)) {
    const btn = document.createElement("button");
    btn.textContent = opt.label;
    btn.setAttribute("data-value", opt.value);
    treatmentToggle.appendChild(btn);
  }
}

function behaviorCopy(behavior: MaskBehavior<unknown>, params: ParamValues): string {
  if (behavior.id === "shift") {
    const t = String(params.treatment ?? "diffuse");
    return SHIFT_EXPRESSION_COPY[t] ?? SHIFT_EXPRESSION_COPY.diffuse;
  }
  return behavior.description;
}

function syncTreatmentUI(): void {
  const productBloom = currentBehavior.id === "bloom";
  const treatmentDef = findTreatmentDef(currentBehavior);
  treatmentPanel.hidden = productBloom || !treatmentDef;
  if (!productBloom && treatmentDef) {
    treatmentLabel.textContent = treatmentDef.label;
    const treatment = currentParams.treatment as string;
    rebuildTreatmentToggle(treatmentDef, treatment);
    treatmentToggle.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-value") === treatment);
    });
  }
  descEl.textContent = behaviorCopy(currentBehavior, currentParams);

  const isBloom = currentBehavior.id === "bloom";
  imageAwareBtn.hidden = !isBloom;
  if (!isBloom) return;
  const imageAwareOn = currentParams.imageAware === "on";
  imageAwareBtn.classList.toggle("active", imageAwareOn);
  imageAwareBtn.textContent = imageAwareOn ? "Image Aware: On" : "Image Aware";
}

// --- presets: curated starting points, scoped per treatment/expression.
// Selecting one loads its values in full (a full panel rebuild, since many
// keys change at once); editing anything afterward naturally falls
// through to "Custom" the next time this resyncs, since matchingPreset
// requires an EXACT match on every key the preset declares — there is no
// separate "was this edited" flag to keep in sync. ---
let presetTreatmentCache = "";

function rebuildPresetToggle(treatment: string): void {
  presetToggle.innerHTML = "";
  for (const preset of presetsForTreatment(treatment)) {
    const btn = document.createElement("button");
    btn.textContent = preset.label;
    btn.setAttribute("data-preset-id", preset.id);
    presetToggle.appendChild(btn);
  }
  presetTreatmentCache = treatment;
}

function syncPresetUI(): void {
  const productBloom = currentBehavior.id === "bloom";
  presetPanel.hidden = !productBloom;
  if (!productBloom) return;
  const treatment = "clean";
  if (treatment !== presetTreatmentCache) rebuildPresetToggle(treatment);
  const matched = matchingPreset(treatment, currentParams);
  presetToggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", matched !== null && b.getAttribute("data-preset-id") === matched.id);
  });
  presetLabel.textContent = matched ? "Preset" : "Preset · Custom";
}

function selectPreset(preset: Preset): void {
  currentParams = { ...currentParams, ...preset.values };
  rememberCurrentExpression();
  renderer.setParams(currentParams);
  rebuildControlsPanel();
  syncTreatmentUI();
  syncPresetUI();
}

presetToggle.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("button");
  if (!target) return;
  const id = target.getAttribute("data-preset-id");
  const treatment = currentBehavior.id === "bloom" ? "clean" : String(currentParams.treatment);
  const preset = presetsForTreatment(treatment).find((p) => p.id === id);
  if (preset) selectPreset(preset);
});

// Remembers each behavior's live param values across a switch away and
// back, so returning to a behavior restores what was left there rather
// than silently reverting to its defaults.
const lastParamsByBehavior = new Map<string, ParamValues>();

// `paramsOverride`, when given (Saved State restoration), replaces both
// the behavior's live and remembered params outright rather than falling
// back to whatever was last left there — loading a saved state should
// reproduce exactly what it captured, not blend with in-session state.
function selectBehavior(id: string, paramsOverride?: ParamValues): void {
  const behavior = BEHAVIORS.find((b) => b.id === id) ?? BEHAVIORS[0];
  if (currentBehavior && Object.keys(currentParams).length > 0) {
    rememberCurrentExpression();
    lastParamsByBehavior.set(currentBehavior.id, currentParams);
  }
  currentBehavior = behavior;
  currentParams = paramsOverride ?? lastParamsByBehavior.get(behavior.id) ?? defaultParamValues(behavior.params);
  if (paramsOverride) lastParamsByBehavior.set(behavior.id, currentParams);
  if (behavior.id === "shift") {
    const treatment = currentParams.treatment as string;
    if (SHIFT_EXPRESSIONS.has(treatment)) lastParamsByExpression.set(treatment, { ...currentParams });
  }
  renderer.setBehavior(behavior, currentParams);
  bloomFieldMap.setVisible(false);

  titleEl.textContent = `${behavior.index} — ${behavior.name}`;
  descEl.textContent = behaviorCopy(behavior, currentParams);

  rebuildControlsPanel();
  syncTreatmentUI();
  syncPresetUI();

  const activeDiagnostic = renderer.getDiagnostic();
  if (activeDiagnostic === "boundary" && !behavior.renderBoundary) renderer.setDiagnostic("mask");

  behaviorTabs.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-value") === id);
  });
}

for (const behavior of PRODUCT_BEHAVIORS) {
  const btn = document.createElement("button");
  btn.textContent = `${behavior.index} ${behavior.name}`;
  btn.setAttribute("data-value", behavior.id);
  btn.addEventListener("click", () => selectBehavior(behavior.id));
  behaviorTabs.appendChild(btn);
}
selectBehavior("bloom");

treatmentToggle.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("button");
  if (!target) return;
  onParamsChange({ treatment: target.getAttribute("data-value")! });
});

imageAwareBtn.addEventListener("click", () => {
  const next = currentParams.imageAware === "on" ? "off" : "on";
  onParamsChange({ imageAware: next });
});

// --- transport ---
function updatePlayPauseLabel(): void {
  playPauseBtn.textContent = renderer.isPlaying() ? "Pause" : "Play";
}

function syncAudioButton(): void {
  const has = renderer.hasVideoSource();
  audioBtn.disabled = !has;
  audioBtn.classList.toggle("active", has && renderer.isAudioEnabled());
  audioBtn.classList.toggle("demoted", !has);
}

playPauseBtn.addEventListener("click", () => {
  if (renderer.isPlaying()) renderer.pause();
  else {
    renderer.unlockAudio();
    renderer.play();
  }
  updatePlayPauseLabel();
  syncAudioButton();
});

audioBtn.addEventListener("click", () => {
  if (!renderer.hasVideoSource()) return;
  renderer.unlockAudio();
  renderer.setAudioEnabled(!renderer.isAudioEnabled());
  syncAudioButton();
});

swapBtn.addEventListener("click", () => renderer.swap());

interface ExploreSnapshot {
  params: ParamValues;
  clockMode: ClockMode;
  holdPhase: number;
  elapsed: number;
  graphicElapsed: number;
  frozen: boolean;
  playing: boolean;
  randomisationSeed: number;
}

let randomisationSeed = 0;
let undoSnapshot: ExploreSnapshot | null = null;

function captureExploreSnapshot(): ExploreSnapshot {
  return {
    params: { ...currentParams },
    clockMode: renderer.getClockMode(),
    holdPhase: renderer.getLoopPhase(),
    elapsed: renderer.getElapsed(),
    graphicElapsed: renderer.getGraphicElapsed(),
    frozen: renderer.isFrozen(),
    playing: renderer.isPlaying(),
    randomisationSeed,
  };
}

function syncFreezeButton(): void {
  pauseAllBtn.classList.toggle("active", renderer.isFrozen());
}

function restoreClockUi(mode: ClockMode, phase: number): void {
  phaseUi.setMode(mode);
  phaseUi.setDisplayedPhase(phase);
}

function applyExploreSnapshot(snap: ExploreSnapshot): void {
  currentParams = { ...snap.params };
  lastParamsByBehavior.set(currentBehavior.id, currentParams);
  rememberCurrentExpression();
  renderer.setBehavior(currentBehavior, currentParams);
  renderer.setGraphicElapsed(snap.graphicElapsed);
  renderer.restoreClock(snap.clockMode, snap.holdPhase, snap.elapsed);
  if (snap.playing) renderer.play();
  else renderer.pause();
  renderer.setFrozen(snap.frozen);
  randomisationSeed = snap.randomisationSeed;
  restoreClockUi(snap.clockMode, renderer.getPhase());
  rebuildControlsPanel();
  rebuildGraphicPanel();
  syncTreatmentUI();
  syncPresetUI();
  syncFreezeButton();
  updatePlayPauseLabel();
  renderer.renderExploreFrame();
}

function applyRandomise(): void {
  if (currentBehavior.id !== "bloom") return;
  undoSnapshot = captureExploreSnapshot();
  randomiseUndoBtn.disabled = false;
  const seed = newRandomisationSeed();
  randomisationSeed = seed;
  const pair = renderer.getActivePair();
  const result = generateRandomisation({
    seed,
    params: currentParams,
    loopSeconds: renderer.getLoopSeconds(),
    pairIndex: pair.pairIndex,
    pairCount: Math.max(1, pair.pairCount),
  });
  currentParams = result.params;
  lastParamsByBehavior.set(currentBehavior.id, currentParams);
  rememberCurrentExpression();
  renderer.setBehavior(currentBehavior, currentParams);
  renderer.setGraphicElapsed(result.graphicElapsed);
  renderer.setHoldPhase(result.holdPhase);
  renderer.setFrozen(true);
  restoreClockUi("hold", result.holdPhase);
  rebuildControlsPanel();
  rebuildGraphicPanel();
  syncTreatmentUI();
  syncPresetUI();
  syncFreezeButton();
  renderer.renderExploreFrame();
}

function undoRandomise(): boolean {
  if (!undoSnapshot) return false;
  const snap = undoSnapshot;
  undoSnapshot = null;
  randomiseUndoBtn.disabled = true;
  applyExploreSnapshot(snap);
  return true;
}

pauseAllBtn.addEventListener("click", () => {
  renderer.setFrozen(!renderer.isFrozen());
  syncFreezeButton();
});

randomiseBtn.addEventListener("click", () => {
  applyRandomise();
});

randomiseUndoBtn.addEventListener("click", () => {
  undoRandomise();
});

function parseBwMode(value: string | null): BwMode {
  if (value === "A" || value === "B" || value === "both" || value === "off") return value;
  return "off";
}

function syncBwToggle(): void {
  const mode = renderer.getBwMode();
  bwToggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-value") === mode);
  });
}

function resolveSavedBwMode(state: { bwMode?: BwMode; bwOn: boolean }): BwMode {
  if (state.bwMode) return state.bwMode;
  return state.bwOn ? "both" : "off";
}

// --- global output-layer toggles: Registration, selective B&W. ---
registrationBtn.classList.toggle("active", renderer.isRegistrationEnabled());
registrationBtn.addEventListener("click", () => {
  renderer.setRegistrationEnabled(!renderer.isRegistrationEnabled());
  registrationBtn.classList.toggle("active", renderer.isRegistrationEnabled());
});

syncBwToggle();
bwToggle.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b || !bwToggle.contains(b)) return;
  renderer.setBwMode(parseBwMode(b.getAttribute("data-value")));
  syncBwToggle();
});

// --- aspect ratio ---

function setAspect(value: string): void {
  currentAspect = value;
  const [aw, ah] = value.split(":").map(Number);
  stageFrame.style.aspectRatio = `${aw} / ${ah}`;
  aspectToggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-value") === value);
  });
  renderer.forEachSource((item) => item.asset.graphic?.setAspect(aw, ah));
  renderer.touchMedia();
  // aspect-ratio change resizes the box synchronously in layout, but let the
  // browser settle one frame before we measure, so the resize observer
  // (below) doesn't grab a stale intermediate size.
  requestAnimationFrame(resizeToStage);
}

aspectToggle.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("button");
  if (!target) return;
  setAspect(target.getAttribute("data-value")!);
});

// --- loop / ping-pong ---
let currentPlaybackMode: "loop" | "pingpong" = "loop";

function setPlaybackModeUI(mode: "loop" | "pingpong"): void {
  currentPlaybackMode = mode;
  renderer.setPlaybackMode(mode);
  playbackToggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-value") === mode);
  });
}

playbackToggle.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("button");
  if (!target) return;
  setPlaybackModeUI(target.getAttribute("data-value") as "loop" | "pingpong");
});

// --- saved states: a lightweight, session-only library of configurations
// a designer wants to come back to. Captures everything needed to
// reproduce the output (behavior, params, both global toggles, media
// transforms) but references loaded media by identity rather than cloning
// it — see core/savedStates.ts for how disposal safety is preserved when
// an asset is still referenced by a saved state. ---
function gatherCurrentSaveInput(name: string): SavedStateInput {
  return {
    name,
    behaviorId: currentBehavior.id,
    params: { ...currentParams },
    registrationOn: renderer.isRegistrationEnabled(),
    bwOn: renderer.getBwMode() === "both",
    bwMode: renderer.getBwMode(),
    placeholderBg,
    aspect: currentAspect,
    playbackMode: currentPlaybackMode,
    loopSeconds: renderer.getLoopSeconds(),
    selectedId: renderer.getSelectedId(),
    audioEnabled: renderer.isAudioEnabled(),
    clockMode: renderer.getClockMode(),
    holdPhase: renderer.getLoopPhase(),
    elapsed: renderer.getElapsed(),
    graphicElapsed: renderer.getGraphicElapsed(),
    frozen: renderer.isFrozen(),
    playing: renderer.isPlaying(),
    randomisationSeed,
    type: { ...renderer.getTypeState() },
    sources: renderer.getSequence().map((item) => ({
      id: item.id,
      asset: item.asset,
      transform: { ...item.asset.transform },
      label: item.asset.label,
    })),
  };
}

function loadSavedState(state: SavedState): void {
  selectBehavior(state.behaviorId, { ...state.params });

  renderer.setRegistrationEnabled(state.registrationOn);
  registrationBtn.classList.toggle("active", state.registrationOn);
  renderer.setTypeState(clampTypeState(state.type));
  typeUi.sync(renderer.getTypeState());
  renderer.setBwMode(resolveSavedBwMode(state));
  syncBwToggle();
  if (state.placeholderBg) {
    placeholderBg = state.placeholderBg;
    syncBgColourUi();
  }

  setAspect(state.aspect);
  setPlaybackModeUI(state.playbackMode);
  renderer.setLoopSeconds(state.loopSeconds);
  loopLengthUi.setSeconds(renderer.getLoopSeconds());

  renderer.setSequence(
    state.sources.map((s) => {
      s.asset.transform = { ...s.transform };
      s.asset.label = s.label;
      return { id: s.id, asset: s.asset };
    }),
    state.selectedId,
  );
  renderer.setAudioEnabled(state.audioEnabled !== false);
  syncAudioButton();
  if (state.graphicElapsed != null) renderer.setGraphicElapsed(state.graphicElapsed);
  if (state.clockMode === "hold") {
    renderer.restoreClock("hold", state.holdPhase ?? renderer.getLoopPhase(), state.elapsed ?? renderer.getElapsed());
  } else if (state.clockMode === "auto") {
    renderer.restoreClock("auto", state.holdPhase ?? renderer.getLoopPhase(), state.elapsed ?? renderer.getElapsed());
  }
  if (state.playing === false) renderer.pause();
  else if (state.playing === true) renderer.play();
  renderer.setFrozen(state.frozen === true);
  randomisationSeed = state.randomisationSeed ?? 0;
  restoreClockUi(renderer.getClockMode(), renderer.getPhase());
  syncFreezeButton();
  updatePlayPauseLabel();
  syncSourceInspector();
  rebuildGraphicPanel();
  rebuildCompositionPanel();
  sequenceStrip.refresh();
}

function renderSavedStatesList(): void {
  const states = listSavedStates();
  savedStatesEmptyEl.hidden = states.length > 0;
  savedStatesListEl.innerHTML = "";

  for (const state of states) {
    const row = document.createElement("div");
    row.className = "saved-state-row";

    const nameEl = document.createElement("div");
    nameEl.className = "saved-state-name";
    nameEl.textContent = state.name;
    row.appendChild(nameEl);

    const actions = document.createElement("div");
    actions.className = "saved-state-actions";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.addEventListener("click", () => loadSavedState(state));
    actions.appendChild(loadBtn);

    const dupBtn = document.createElement("button");
    dupBtn.textContent = "Dup";
    dupBtn.addEventListener("click", () => {
      duplicateSavedState(state.id);
      renderSavedStatesList();
    });
    actions.appendChild(dupBtn);

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = state.name;
      input.className = "saved-state-rename-input";
      row.replaceChild(input, nameEl);
      input.focus();
      input.select();
      const commit = () => {
        const value = input.value.trim();
        if (value) renameSavedState(state.id, value);
        renderSavedStatesList();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") input.blur();
        if (ev.key === "Escape") {
          input.value = state.name;
          input.blur();
        }
      });
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Del";
    deleteBtn.addEventListener("click", () => {
      deleteSavedState(state.id);
      renderSavedStatesList();
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    savedStatesListEl.appendChild(row);
  }
}

saveStateBtn.addEventListener("click", () => {
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const name = `${currentBehavior.name} · ${stamp}`;
  createSavedState(gatherCurrentSaveInput(name));
  renderSavedStatesList();
});

renderSavedStatesList();

function activeSeg(root: HTMLElement): string {
  return root.querySelector("button.active")?.getAttribute("data-value") ?? "";
}

function wireSeg(root: HTMLElement, onChange?: () => void): void {
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b || !root.contains(b)) return;
    root.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    onChange?.();
  });
}

function syncExportDuration(): void {
  const s = renderer.getLoopSeconds();
  exportDurationEl.textContent = `Loop ${s}s`;
}

wireSeg(exportFormatToggle);
wireSeg(exportFpsToggle);
wireSeg(exportSizeToggle);
wireSeg(exportQualityToggle);

function downloadBlobDirectly(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

let exportAbort: AbortController | null = null;
let lastExportResult: {
  filename: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  videoCodec: string | null;
  audioCodec: string | null;
  bytes: number;
  renderMs: number;
  encodeMs: number;
  audioOmittedReason?: string;
} | null = null;

async function runCurrentExport(): Promise<void> {
  if (renderer.isExporting()) return;
  const format = (activeSeg(exportFormatToggle) || "mp4") as ExportFormat;
  const fps = (Number(activeSeg(exportFpsToggle) || 30) || 30) as ExportFps;
  const size = (activeSeg(exportSizeToggle) || "1080") as ExportSize;
  const quality = (activeSeg(exportQualityToggle) || "standard") as ExportQuality;
  exportAbort = new AbortController();
  exportRunBtn.disabled = true;
  exportCancelBtn.hidden = false;
  exportStatusEl.textContent = "EXPORTING 0%";
  try {
    const { runExport } = await import("./core/exportSession");
    const result = await runExport(
      renderer,
      {
        format,
        fps,
        size,
        quality,
        aspect: currentAspect,
        includeAudio: format === "mp4" && renderer.isAudioEnabled(),
      },
      {
        behaviorId: currentBehavior.id,
        treatment: String(currentParams.treatment ?? "export"),
      },
      (p) => {
        exportStatusEl.textContent = p.label;
      },
      exportAbort.signal,
    );
    lastExportResult = {
      filename: result.filename,
      width: result.width,
      height: result.height,
      fps: result.fps,
      duration: result.duration,
      videoCodec: result.videoCodec,
      audioCodec: result.audioCodec,
      bytes: result.bytes,
      renderMs: result.renderMs,
      encodeMs: result.encodeMs,
      audioOmittedReason: result.audioOmittedReason,
    };
    downloadBlobDirectly(result.blob, result.filename);
    exportStatusEl.textContent = result.audioOmittedReason ? `DONE — ${result.audioOmittedReason}` : "DONE";
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    exportStatusEl.textContent = aborted ? "Cancelled" : err instanceof Error ? err.message : "Export failed";
  } finally {
    exportAbort = null;
    exportRunBtn.disabled = false;
    exportCancelBtn.hidden = true;
    resizeToStage();
  }
}

exportRunBtn.addEventListener("click", () => {
  void runCurrentExport();
});
exportCancelBtn.addEventListener("click", () => exportAbort?.abort());
syncExportDuration();

// --- responsive stage sizing (resize preserves alignment: renderer
// recomputes cover-fit for both A and B against the new pixel size) ---
function resizeToStage(): void {
  if (renderer.isExporting()) return;
  const rect = stageFrame.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
}

new ResizeObserver(() => resizeToStage()).observe(stageFrame);
resizeToStage();

renderer.play();
updatePlayPauseLabel();
syncAudioButton();
syncFreezeButton();

/** Product default: two media placeholders, Bloom restrained-to-medium,
 * Registration on, B&W off. Not an extreme showcase. */
const BLOOM_OPENING: ParamValues = {
  fieldCount: 3,
  fieldSize: 38,
  softness: 80,
  drift: 8,
  overlap: 52,
  revealAmount: 62,
  resolveAmount: 46,
  speed: 0.85,
  treatment: "clean",
  imageAware: "off",
};

function applyProductDefault(): void {
  const bloom = BEHAVIORS.find((b) => b.id === "bloom")!;
  selectBehavior("bloom", { ...defaultParamValues(bloom.params), ...BLOOM_OPENING });
  const mediaA = makePlaceholder("01");
  const mediaB = makePlaceholder("02");
  renderer.setSequence(
    [
      { id: renderer.nextSourceId(), asset: mediaA },
      { id: renderer.nextSourceId(), asset: mediaB },
    ],
    undefined,
  );
  renderer.setLoopSeconds(12);
  loopLengthUi.setSeconds(12);
  syncExportDuration();
  syncSourceInspector();
  rebuildGraphicPanel();
  rebuildCompositionPanel();
  sequenceStrip.refresh();
  renderer.setRegistrationEnabled(true);
  registrationBtn.classList.toggle("active", true);
  renderer.setBwMode("off");
  syncBwToggle();
  placeholderBg = PLACEHOLDER_DEFAULT_BG;
  syncBgColourUi();
  renderer.setAudioEnabled(true);
  syncAudioButton();
  renderer.setTypeState(defaultTypeState());
  typeUi.sync(renderer.getTypeState());
}

applyProductDefault();

window.addEventListener("pagehide", () => {
  renderer.pause();
});

Object.assign(window, {
  __motionStudio: {
    setProfiling: (on: boolean) => renderer.setProfiling(on),
    lastProfile: () => renderer.lastProfile,
    getPhase: () => renderer.getPhase(),
    setHoldPhase: (phase: number) => {
      renderer.setHoldPhase(phase);
      phaseUi.setMode("hold");
      phaseUi.setDisplayedPhase(phase);
    },
    setClockMode: (mode: "auto" | "hold") => {
      renderer.setClockMode(mode);
      phaseUi.setMode(mode);
      phaseUi.setDisplayedPhase(renderer.getPhase());
    },
    getClockMode: () => renderer.getClockMode(),
    isPlaying: () => renderer.isPlaying(),
    isFrozen: () => renderer.isFrozen(),
    setFrozen: (on: boolean) => {
      renderer.setFrozen(on);
      syncFreezeButton();
    },
    getGraphicElapsed: () => renderer.getGraphicElapsed(),
    getElapsed: () => renderer.getElapsed(),
    getRandomisationSeed: () => randomisationSeed,
    randomise: () => {
      applyRandomise();
      return { seed: randomisationSeed, phase: renderer.getLoopPhase(), frozen: renderer.isFrozen(), params: { ...currentParams } };
    },
    undoRandomise: () => undoRandomise(),
    canvasSha: async () => {
      const img = renderer.getVisibleImageData();
      const digest = await crypto.subtle.digest("SHA-256", img.data);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    },
    getParams: () => ({ ...currentParams }),
    setParams: (patch: ParamValues) => onParamsChange(patch),
    selectBehavior: (id: string) => selectBehavior(id),
    treatmentOptions: () =>
      [...treatmentToggle.querySelectorAll("button")].map((b) => ({
        value: b.getAttribute("data-value"),
        label: b.textContent?.trim() ?? "",
        active: b.classList.contains("active"),
      })),
    setRegistration: (on: boolean) => {
      renderer.setRegistrationEnabled(on);
      registrationBtn.classList.toggle("active", on);
    },
    setTypeBeforeRegistration: (on: boolean) => renderer.setTypeBeforeRegistration(on),
    setRegistrationStrategy: (mode: "tonal" | "offset" | "edge") => renderer.setRegistrationStrategy(mode),
    getRegistrationStrategy: () => renderer.getRegistrationStrategy(),
    setBW: (on: boolean) => {
      renderer.setBwMode(on ? "both" : "off");
      syncBwToggle();
    },
    setBwMode: (mode: BwMode) => {
      renderer.setBwMode(mode);
      syncBwToggle();
    },
    getBwMode: () => renderer.getBwMode(),
    setDiagnostic: (mode: DiagnosticMode) => renderer.setDiagnostic(mode),
    getDiagnostic: () => renderer.getDiagnostic(),
    setPreviewDprCap: (cap: number) => renderer.setPreviewDprCap(cap),
    getPreviewDprCap: () => renderer.getPreviewDprCap(),
    setPlaceholderBg: (hex: string) => {
      placeholderBg = hex;
      syncBgColourUi();
      rebuildPlaceholderAssets();
    },
    getPlaceholderBg: () => placeholderBg,
    getTypeState: () => ({ ...renderer.getTypeState() }),
    setTypeState: (patch: Record<string, unknown>) => {
      renderer.patchTypeState(clampTypeState({ ...renderer.getTypeState(), ...patch }));
      typeUi.sync(renderer.getTypeState());
    },
    debugTypeLayout: (w?: number, h?: number) => {
      const size = renderer.getCanvasSize();
      const cw = w ?? size.width;
      const ch = h ?? size.height;
      const state = renderer.getTypeState();
      const layout = layoutTypography(state, cw, ch);
      return {
        lines: debugLinePlan(state, cw, ch),
        fontSize: layout?.fontSize ?? 0,
        canvas: { w: cw, h: ch },
        opacity: layout?.opacity ?? 0,
        offsetX: layout?.offsetX ?? 0,
        offsetY: layout?.offsetY ?? 0,
        placed: layout?.lines.map((l) => ({ text: l.text, x: l.x, y: l.y, width: l.width, height: l.height })) ?? [],
      };
    },
    lastFieldInk: () => renderer.lastFieldInk(),
    setAspect: (value: string) => setAspect(value),
    lastExportResult: () => lastExportResult,
    renderExportFrame: (timeSec: number) => renderer.renderExportFrame(timeSec),
    beginExport: (w: number, h: number) => renderer.beginExport(w, h),
    endExport: () => renderer.endExport(),
    getVisibleImageData: () => {
      const img = renderer.getVisibleImageData();
      return { width: img.width, height: img.height, data: Array.from(img.data.subarray(0, 64)) };
    },
    runExport: async (req: {
      format: ExportFormat;
      fps?: ExportFps;
      size?: ExportSize;
      quality?: ExportQuality;
      includeAudio?: boolean;
    }) => {
      const { runExport } = await import("./core/exportSession");
      exportAbort = new AbortController();
      (window as unknown as { __exportPct: number }).__exportPct = 0;
      return runExport(
        renderer,
        {
          format: req.format,
          fps: req.fps ?? 30,
          size: req.size ?? "preview",
          quality: req.quality ?? "standard",
          aspect: currentAspect,
          includeAudio: req.includeAudio ?? (req.format === "mp4" && renderer.isAudioEnabled()),
        },
        {
          behaviorId: currentBehavior.id,
          treatment: String(currentParams.treatment ?? "export"),
        },
        (p) => {
          (window as unknown as { __exportPct: number }).__exportPct = p.ratio;
        },
        exportAbort.signal,
      ).then((r) => {
        lastExportResult = {
          filename: r.filename,
          width: r.width,
          height: r.height,
          fps: r.fps,
          duration: r.duration,
          videoCodec: r.videoCodec,
          audioCodec: r.audioCodec,
          bytes: r.bytes,
          renderMs: r.renderMs,
          encodeMs: r.encodeMs,
          audioOmittedReason: r.audioOmittedReason,
        };
        (window as unknown as { __motionStudioLastBlob: Blob }).__motionStudioLastBlob = r.blob;
        const prevUrl = (window as unknown as { __motionStudioLastBlobUrl?: string }).__motionStudioLastBlobUrl;
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        const blobUrl = URL.createObjectURL(r.blob);
        (window as unknown as { __motionStudioLastBlobUrl?: string }).__motionStudioLastBlobUrl = blobUrl;
        return { ...lastExportResult, blobUrl };
      }).finally(() => {
        exportAbort = null;
      });
    },
    abortExport: () => exportAbort?.abort(),
    isExporting: () => renderer.isExporting(),
    compareHoldExport: async (phase: number) => {
      renderer.pause();
      renderer.setHoldPhase(phase);
      phaseUi.setMode("hold");
      phaseUi.setDisplayedPhase(phase);
      renderer.renderFrame();
      const live = renderer.getVisibleImageData();
      const copy = new Uint8ClampedArray(live.data);
      const { width, height } = live;
      renderer.beginExport(width, height);
      await renderer.renderExportFrame(phase * renderer.getLoopSeconds());
      const exp = renderer.getVisibleImageData();
      renderer.endExport();
      renderer.setHoldPhase(phase);
      let mad = 0;
      let disagree = 0;
      const n = copy.length;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(copy[i]! - exp.data[i]!);
        mad += d;
        if (d > 2) disagree++;
      }
      return { phase, width, height, mad: mad / n, disagree: disagree / n };
    },
    mediaInfo: () => renderer.mediaInfo(),
    getCanvasSize: () => renderer.getCanvasSize(),
    getSequence: () =>
      renderer.getSequence().map((item, index) => ({
        id: item.id,
        index,
        kind: item.asset.kind,
        label: item.asset.label,
        selected: item.id === renderer.getSelectedId(),
      })),
    getActivePair: () => renderer.getActivePair(),
    setAudio: (on: boolean) => {
      renderer.unlockAudio();
      renderer.setAudioEnabled(on);
      syncAudioButton();
    },
    isAudioEnabled: () => renderer.isAudioEnabled(),
    setSeamCandidate: (mode: "A" | "B" | "C") => renderer.setSeamCandidate(mode),
    getSeamCandidate: () => renderer.getSeamCandidate(),
    setPlaybackMode: (mode: "loop" | "pingpong") => renderer.setPlaybackMode(mode),
    getPlaybackMode: () => renderer.getPlaybackMode(),
    getLoopSeconds: () => renderer.getLoopSeconds(),
    setLoopSeconds: (seconds: number) => {
      renderer.setLoopSeconds(seconds);
      loopLengthUi.setSeconds(renderer.getLoopSeconds());
      syncExportDuration();
    },
    selectSource: (index: number) => {
      const item = renderer.getSourceAt(index);
      if (!item) return;
      renderer.selectItem(item.id);
      syncSourceInspector();
      rebuildGraphicPanel();
      rebuildCompositionPanel();
      sequenceStrip.refresh();
    },
    addSource: (mode: "media" | "field" = "media") => {
      addPlaceholderSource();
      const item = selectedItem();
      if (item && mode === "field") setSourceKind(item.id, "field");
    },
    removeSource: (index: number) => {
      const item = renderer.getSourceAt(index);
      if (!item) return;
      renderer.selectItem(item.id);
      sourceRemoveBtn.click();
    },
    reverseSequence: () => {
      renderer.reverseSequence();
      sequenceStrip.refresh();
    },
    setSlotSource: (slot: MediaSlot, mode: "media" | "field") => {
      const item = renderer.getSourceAt(slot === "A" ? 0 : 1);
      if (!item) return;
      renderer.selectItem(item.id);
      setSourceKind(item.id, mode);
    },
    setSourceKind: (index: number, mode: "media" | "field") => {
      const item = renderer.getSourceAt(index);
      if (!item) return;
      renderer.selectItem(item.id);
      setSourceKind(item.id, mode);
    },
    patchField: (slot: MediaSlot | number, patch: Record<string, unknown>) => {
      const index = slot === "A" ? 0 : slot === "B" ? 1 : slot;
      const g = asGraphic(renderer.getSourceAt(index)?.asset ?? null);
      if (!g) return;
      g.patchField(patch as never);
      renderer.touchMedia();
      sequenceStrip.refresh();
    },
    setFieldTerritory: (slot: MediaSlot | number, name: "quiet" | "core" | "dense") => {
      const index = slot === "A" ? 0 : slot === "B" ? 1 : slot;
      const g = asGraphic(renderer.getSourceAt(index)?.asset ?? null);
      if (!g) return;
      g.patchField({ ...FIELD_TERRITORIES[name] });
      renderer.touchMedia();
      rebuildGraphicPanel();
      sequenceStrip.refresh();
    },
    getGraphic: (slot: MediaSlot | number) => {
      const index = slot === "A" ? 0 : slot === "B" ? 1 : slot;
      const g = asGraphic(renderer.getSourceAt(index)?.asset ?? null);
      if (!g) return null;
      return { field: { ...g.getField() } };
    },
    loadImageDataUrl: (slot: MediaSlot | number, dataUrl: string, label: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const index = slot === "A" ? 0 : slot === "B" ? 1 : slot;
          let item = renderer.getSourceAt(index);
          if (!item) {
            addPlaceholderSource();
            item = selectedItem();
          }
          if (!item) {
            reject(new Error("No sequence item"));
            return;
          }
          loadSourceAsset(item.id, {
            kind: "image",
            source: img,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            label,
            transform: defaultTransform(),
          });
          resolve();
        };
        img.onerror = () => reject(new Error(`Could not decode ${label}`));
        img.src = dataUrl;
      }),
    loadImageAt: (index: number, dataUrl: string, label: string) =>
      (window as unknown as { __motionStudio: { loadImageDataUrl: (s: number, u: string, l: string) => Promise<void> } })
        .__motionStudio.loadImageDataUrl(index, dataUrl, label),
    loadVideoUrl: (index: number, url: string, label: string) =>
      new Promise<void>((resolve, reject) => {
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.volume = 1;
        video.preload = "auto";
        renderer.getVideoHost().appendChild(video);
        video.addEventListener(
          "loadeddata",
          () => {
            while (renderer.getSequence().length <= index) addPlaceholderSource();
            const item = renderer.getSourceAt(index);
            if (!item) {
              reject(new Error("No sequence item"));
              return;
            }
            loadSourceAsset(item.id, {
              kind: "video",
              source: video,
              naturalW: video.videoWidth,
              naturalH: video.videoHeight,
              label,
              videoEl: video,
              objectUrl: url,
              transform: defaultTransform(),
            });
            resolve();
          },
          { once: true },
        );
        video.addEventListener("error", () => reject(new Error(`Could not decode ${label}`)), { once: true });
        video.src = url;
      }),
    play: () => {
      renderer.unlockAudio();
      renderer.play();
      updatePlayPauseLabel();
      syncAudioButton();
    },
    pause: () => {
      renderer.pause();
      updatePlayPauseLabel();
    },
  },
});
