import "./style.css";
import { Renderer, type DiagnosticMode, type MediaSlot } from "./core/renderer";
import { placeholderA } from "./core/placeholder";
import { wrapCanvasAsPlaceholder, defaultTransform, type MediaAsset, type MediaKind } from "./core/media";
import { loadMediaFile } from "./ui/mediaInput";
import { buildControls } from "./ui/controls";
import { buildXYPad } from "./ui/xyPad";
import { buildPhaseControl } from "./ui/phaseControl";
import { buildLoopLengthControl } from "./ui/loopLengthControl";
import { buildSequenceStrip } from "./ui/sequenceStrip";
import { buildSpreadControl } from "./ui/spreadControl";
import { buildFragmentControl } from "./ui/fragmentControl";
import { buildBloomFieldMap } from "./ui/bloomFieldMap";
import { buildGraphicPanel, hideGraphicPanel } from "./ui/graphicPanel";
import { asGraphic, createGraphicAsset } from "./sources/graphicAsset";
import { DEFAULT_FIELD, FIELD_TERRITORIES } from "./sources/field";
import { BEHAVIORS } from "./behaviors/index";
import { SHIFT_EXPRESSION_COPY } from "./behaviors/shift";
import { defaultParamValues, type MaskBehavior, type ParamDef, type ParamValues, type SelectParamDef } from "./core/types";
import { matchingPreset, presetsForTreatment, type Preset } from "./core/presets";
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
        <button type="button" class="diagnostic-toggle" id="registration-toggle" title="Global output layer: Print — the misregistered ink surface over the complete composition, whatever behaviour is active">
          Print
        </button>
        <button type="button" class="diagnostic-toggle" id="bw-toggle" title="Global output layer: render the final composition in monochrome">
          B&amp;W
        </button>
        <span class="topbar-divider" aria-hidden="true"></span>
        <button type="button" class="diagnostic-toggle demoted" id="show-mask" title="Diagnostic: display the raw alpha mask instead of the composited media">
          Show Mask
        </button>
      </div>
    </header>
    <main class="workspace">
      <section class="stage-panel">
        <div class="sequence-panel">
          <div id="sequence-strip" class="sequence-strip"></div>
          <div class="source-inspector" id="source-inspector">
            <div class="seg-toggle source-kind-toggle" id="source-kind">
              <button type="button" data-value="media" class="active">Media</button>
              <button type="button" data-value="field">Field</button>
            </div>
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
        </div>
        <div class="stage-frame" id="stage-frame">
          <canvas id="canvas"></canvas>
        </div>
        <div class="stage-controls">
          <button id="play-pause" class="primary" title="Pause or resume source video. Independent of Phase Auto/Hold.">Pause</button>
          <button type="button" class="diagnostic-toggle" id="audio-toggle" title="Hear source video audio, or mute. Independent of HOLD.">Audio</button>
          <button id="swap" title="Reverse the source sequence">Reverse</button>
          <button id="export-png" title="Save a PNG of the exact current frame — no UI, full render resolution">Export PNG</button>
        </div>
      </section>
      <aside class="control-panel">
          <div class="composition-panel" id="composition-panel">
            <div class="panel-label-row">
              <label class="panel-label">Composition</label>
            </div>
            <div id="composition-controls"></div>
            <button type="button" class="reset-btn" id="composition-reset">Reset</button>
          </div>
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
const audioBtn = document.querySelector<HTMLButtonElement>("#audio-toggle")!;
const swapBtn = document.querySelector<HTMLButtonElement>("#swap")!;
const aspectToggle = document.querySelector<HTMLDivElement>("#aspect-toggle")!;
const playbackToggle = document.querySelector<HTMLDivElement>("#playback-toggle")!;
const sourceInspector = document.querySelector<HTMLDivElement>("#source-inspector")!;
const sourceKindToggle = document.querySelector<HTMLDivElement>("#source-kind")!;
const replaceBtn = document.querySelector<HTMLButtonElement>("#btn-replace")!;
const sourceName = document.querySelector<HTMLSpanElement>("#source-name")!;
const sourceType = document.querySelector<HTMLSpanElement>("#source-type")!;
const sourceRemoveBtn = document.querySelector<HTMLButtonElement>("#source-remove")!;
const showMaskBtn = document.querySelector<HTMLButtonElement>("#show-mask")!;
const registrationBtn = document.querySelector<HTMLButtonElement>("#registration-toggle")!;
const bwBtn = document.querySelector<HTMLButtonElement>("#bw-toggle")!;
const treatmentPanel = document.querySelector<HTMLDivElement>("#treatment-panel")!;
const treatmentLabel = document.querySelector<HTMLLabelElement>("#treatment-label")!;
const treatmentToggle = document.querySelector<HTMLDivElement>("#treatment-toggle")!;
const imageAwareBtn = document.querySelector<HTMLButtonElement>("#image-aware")!;
const compositionPanel = document.querySelector<HTMLDivElement>("#composition-panel")!;
const compositionControlsEl = document.querySelector<HTMLDivElement>("#composition-controls")!;
const compositionResetBtn = document.querySelector<HTMLButtonElement>("#composition-reset")!;
const graphicPanelEl = document.querySelector<HTMLDivElement>("#graphic-panel")!;
const presetPanel = document.querySelector<HTMLDivElement>("#preset-panel")!;
const presetLabel = document.querySelector<HTMLLabelElement>("#preset-label")!;
const presetToggle = document.querySelector<HTMLDivElement>("#preset-toggle")!;
const saveStateBtn = document.querySelector<HTMLButtonElement>("#save-state-btn")!;
const savedStatesListEl = document.querySelector<HTMLDivElement>("#saved-states-list")!;
const savedStatesEmptyEl = document.querySelector<HTMLParagraphElement>("#saved-states-empty")!;
const exportPngBtn = document.querySelector<HTMLButtonElement>("#export-png")!;

const renderer = new Renderer(canvas);

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
  const graphic = asGraphic(item?.asset ?? null);
  sourceInspector.classList.toggle("source-graphic", Boolean(graphic));
  replaceBtn.hidden = Boolean(graphic);
  sourceKindToggle.querySelectorAll("button").forEach((b) => {
    const v = b.getAttribute("data-value");
    b.classList.toggle("active", graphic ? v === "field" : v === "media");
  });
  if (!item) {
    showSourceMeta("—", "image");
    return;
  }
  showSourceMeta(item.asset.label, item.asset.kind);
  sourceRemoveBtn.disabled = renderer.getSequence().length <= 1;
}

function rebuildGraphicPanel(): void {
  const item = selectedItem();
  const driver = asGraphic(item?.asset ?? null);
  if (!driver) {
    hideGraphicPanel(graphicPanelEl);
    return;
  }
  buildGraphicPanel(graphicPanelEl, driver, () => {
    if (item) {
      item.asset.label = `Field ${String(renderer.getSequence().findIndex((s) => s.id === item.id) + 1).padStart(2, "0")}`;
      showSourceMeta(item.asset.label, "graphic");
    }
    renderer.touchMedia();
    sequenceStrip.refresh();
  });
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

  const restored = lastMediaById.get(id) ?? wrapCanvasAsPlaceholder(placeholderA(), "Media");
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

function addPlaceholderSource(): void {
  const n = renderer.getSequence().length + 1;
  const asset = wrapCanvasAsPlaceholder(placeholderA(), `Media ${String(n).padStart(2, "0")}`);
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

sourceKindToggle.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const item = selectedItem();
  if (!item) return;
  setSourceKind(item.id, b.getAttribute("data-value") as "media" | "field");
});

sourceRemoveBtn.addEventListener("click", () => {
  const item = selectedItem();
  if (!item || renderer.getSequence().length <= 1) return;
  const dispose = !isAssetReferencedBySavedState(item.asset);
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
  (seconds) => renderer.setLoopSeconds(seconds),
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
  compositionPanel.hidden = isField;
  if (isField) return;
  buildControls(compositionControlsEl, transformParamDefs, compositionValues(), onCompositionChange);
}

compositionResetBtn.addEventListener("click", () => {
  const item = selectedItem();
  if (!item) return;
  renderer.resetItemTransform(item.id);
  rebuildCompositionPanel();
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
  const treatmentDef = findTreatmentDef(currentBehavior);
  treatmentPanel.hidden = !treatmentDef;
  if (treatmentDef) {
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
  const treatmentDef = findTreatmentDef(currentBehavior);
  presetPanel.hidden = !treatmentDef;
  if (!treatmentDef) return;
  const treatment = currentParams.treatment as string;
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
  const treatment = currentParams.treatment as string;
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
  bloomFieldMap.setVisible(behavior.id === "bloom");

  titleEl.textContent = `${behavior.index} — ${behavior.name}`;
  descEl.textContent = behaviorCopy(behavior, currentParams);

  rebuildControlsPanel();
  syncTreatmentUI();
  syncPresetUI();

  const activeDiagnostic = renderer.getDiagnostic();
  updateDiagnosticLabel(activeDiagnostic === "boundary" && !behavior.renderBoundary ? "mask" : activeDiagnostic);

  behaviorTabs.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-value") === id);
  });
}

for (const behavior of BEHAVIORS) {
  const btn = document.createElement("button");
  btn.textContent = `${behavior.index} ${behavior.name}`;
  btn.setAttribute("data-value", behavior.id);
  btn.addEventListener("click", () => selectBehavior(behavior.id));
  behaviorTabs.appendChild(btn);
}
selectBehavior(BEHAVIORS[0].id);

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

// --- diagnostic: cycle off -> mask -> boundary -> off. Boundary is only
// meaningful for a behavior that defines renderBoundary (Bloom); for one
// that doesn't (Shift) that state is skipped entirely. ---
function updateDiagnosticLabel(mode: DiagnosticMode): void {
  showMaskBtn.classList.toggle("active", mode !== "off");
  showMaskBtn.textContent = mode === "off" ? "Show Mask" : mode === "mask" ? "Showing Mask" : "Showing Boundary";
}

showMaskBtn.addEventListener("click", () => {
  let mode = renderer.cycleDiagnostic();
  if (mode === "boundary" && !currentBehavior.renderBoundary) {
    mode = renderer.cycleDiagnostic();
  }
  updateDiagnosticLabel(mode);
});

// --- global output-layer toggles: Registration, B&W. Deliberately binary
// (no strength slider), applied after whatever behavior/treatment is
// active, unaffected by behavior switching, media type, or Swap A/B — see
// Renderer.finalizeOutput. ---
registrationBtn.classList.toggle("active", renderer.isRegistrationEnabled());
registrationBtn.addEventListener("click", () => {
  renderer.setRegistrationEnabled(!renderer.isRegistrationEnabled());
  registrationBtn.classList.toggle("active", renderer.isRegistrationEnabled());
});

bwBtn.classList.toggle("active", renderer.isBWEnabled());
bwBtn.addEventListener("click", () => {
  renderer.setBWEnabled(!renderer.isBWEnabled());
  bwBtn.classList.toggle("active", renderer.isBWEnabled());
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
    bwOn: renderer.isBWEnabled(),
    aspect: currentAspect,
    playbackMode: currentPlaybackMode,
    loopSeconds: renderer.getLoopSeconds(),
    selectedId: renderer.getSelectedId(),
    audioEnabled: renderer.isAudioEnabled(),
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
  renderer.setBWEnabled(state.bwOn);
  bwBtn.classList.toggle("active", state.bwOn);

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
  const treatmentDef = findTreatmentDef(currentBehavior);
  const treatmentLabelText = treatmentDef
    ? (visibleTreatmentOptions(treatmentDef, String(currentParams.treatment)).find((o) => o.value === currentParams.treatment)?.label ?? "")
    : "";
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const name = `${currentBehavior.name}${treatmentLabelText ? " · " + treatmentLabelText : ""} · ${stamp}`;
  createSavedState(gatherCurrentSaveInput(name));
  renderSavedStatesList();
});

renderSavedStatesList();

// --- export: PNG still of the exact current frame. The visible canvas IS
// the finished output (behavior -> persistent registration -> reactive
// registration -> B&W already happened before this pixel ever reached it
// — see Renderer.finalizeOutput), so exporting it directly guarantees the
// file matches what's on screen with no separate render path to drift out
// of sync, and captures the canvas's own backing-store resolution (up to
// 2x device pixel ratio), not just its on-screen CSS size.
//
// canvas.toBlob() takes its pixel snapshot SYNCHRONOUSLY at the moment
// it's called (the HTML spec requires the bitmap to be copied before
// control returns to the caller; only the encoding happens off-thread
// afterward) — so whatever is still animating on screen after this line
// runs can never affect the exported bytes.
//
// The plain `<a download>` path below is the correct, complete
// implementation for a normal deployed browser. It does nothing when this
// app is opened as a published Claude Artifact, though: that viewer never
// grants a page direct download access (a deliberate sandbox boundary,
// not a bug here), so a programmatic download click there is silently
// inert. When `window.claude.use` is present (i.e. running inside that
// artifact runtime), route the save through its `downloads` capability
// instead, which prompts the viewer directly; fall back to `<a download>`
// whenever that capability isn't there, including every normal browser
// deployment where `window.claude` doesn't exist at all. ---
interface ClaudeDownloadsNamespace {
  save(request: { filename: string; data: Blob }): Promise<{ status: "saved" }>;
}
interface ClaudeGlobal {
  use<T = unknown>(name: string): Promise<T | null>;
}
declare global {
  interface Window {
    claude?: ClaudeGlobal;
  }
}

function exportFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `motion-studio-${currentBehavior.id}-${currentParams.treatment ?? "export"}-${stamp}.png`;
}

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

function setExportStatus(text: string, revertAfterMs?: number): void {
  const original = "Export PNG";
  exportPngBtn.textContent = text;
  if (revertAfterMs) {
    setTimeout(() => {
      exportPngBtn.textContent = original;
    }, revertAfterMs);
  }
}

async function exportCurrentFrameAsPng(): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    setExportStatus("Export failed", 2000);
    return;
  }
  const filename = exportFilename();

  if (window.claude?.use) {
    try {
      const downloads = await window.claude.use<ClaudeDownloadsNamespace>("downloads");
      if (downloads) {
        await downloads.save({ filename, data: blob });
        setExportStatus("Saved", 1500);
        return;
      }
    } catch {
      // Declined, rate-limited, or unavailable after all — fall through to
      // the direct browser download rather than leaving the click with no
      // visible result.
    }
  }

  downloadBlobDirectly(blob, filename);
  setExportStatus("Download started", 1500);
}

exportPngBtn.addEventListener("click", () => {
  void exportCurrentFrameAsPng();
});

// --- responsive stage sizing (resize preserves alignment: renderer
// recomputes cover-fit for both A and B against the new pixel size) ---
function resizeToStage(): void {
  const rect = stageFrame.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
}

new ResizeObserver(() => resizeToStage()).observe(stageFrame);
resizeToStage();

renderer.play();
updatePlayPauseLabel();
syncAudioButton();

/** Product default: Media A × Field Core B, Bloom restrained-to-medium,
 * Print on, B&W off. Not an extreme showcase. */
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

/** Product default: 01 Media × 02 Field Core, Bloom restrained-to-medium,
 * Print on, B&W off. Shown as the first two sequence items. */
function applyProductDefault(): void {
  const bloom = BEHAVIORS.find((b) => b.id === "bloom")!;
  selectBehavior("bloom", { ...defaultParamValues(bloom.params), ...BLOOM_OPENING });
  const { w, h } = aspectParts();
  const media = wrapCanvasAsPlaceholder(placeholderA(), "01");
  const field = createGraphicAsset(w, h, "02 Field", { ...FIELD_TERRITORIES.core });
  renderer.setSequence(
    [
      { id: renderer.nextSourceId(), asset: media },
      { id: renderer.nextSourceId(), asset: field },
    ],
    undefined,
  );
  const fieldItem = renderer.getSourceAt(1);
  if (fieldItem) renderer.selectItem(fieldItem.id);
  renderer.setLoopSeconds(12);
  loopLengthUi.setSeconds(12);
  syncSourceInspector();
  rebuildGraphicPanel();
  rebuildCompositionPanel();
  sequenceStrip.refresh();
  renderer.setRegistrationEnabled(true);
  registrationBtn.classList.toggle("active", true);
  renderer.setBWEnabled(false);
  bwBtn.classList.toggle("active", false);
  renderer.setAudioEnabled(true);
  syncAudioButton();
}

applyProductDefault();

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
    setBW: (on: boolean) => {
      renderer.setBWEnabled(on);
      bwBtn.classList.toggle("active", on);
    },
    lastFieldInk: () => renderer.lastFieldInk(),
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
