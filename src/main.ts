import "./style.css";
import { Renderer, type DiagnosticMode, type MediaSlot } from "./core/renderer";
import { placeholderA, placeholderB } from "./core/placeholder";
import { wrapCanvasAsPlaceholder, type MediaAsset } from "./core/media";
import { wireMediaDropZone } from "./ui/mediaInput";
import { buildControls } from "./ui/controls";
import { BEHAVIORS } from "./behaviors/index";
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
      <div class="brand">Motion Studio <span class="brand-sub">— masking prototype</span></div>
      <div class="topbar-right">
        <div class="behavior-tabs" id="behavior-tabs"></div>
        <button type="button" class="diagnostic-toggle" id="registration-toggle" title="Global output layer: the Registration print-separation texture over the complete composition, whatever behaviour is active">
          Registration
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
        <div class="media-panel">
          <div class="media-slot" id="slot-a">
            <div class="media-slot-row">
              <span class="media-slot-badge">A</span>
              <span class="media-slot-type" id="type-a">—</span>
            </div>
            <button type="button" class="load-media-btn" id="btn-a">Load Media A</button>
            <div class="media-slot-name" id="name-a">No file selected</div>
            <div class="media-slot-hint">or drop an image / video here</div>
          </div>
          <div class="media-slot" id="slot-b">
            <div class="media-slot-row">
              <span class="media-slot-badge">B</span>
              <span class="media-slot-type" id="type-b">—</span>
            </div>
            <button type="button" class="load-media-btn" id="btn-b">Load Media B</button>
            <div class="media-slot-name" id="name-b">No file selected</div>
            <div class="media-slot-hint">or drop an image / video here</div>
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
        </div>
        <div class="stage-frame" id="stage-frame">
          <canvas id="canvas"></canvas>
        </div>
        <div class="stage-controls">
          <button id="play-pause" class="primary">Pause</button>
          <button id="swap">Swap A / B</button>
          <button id="export-png" title="Save a PNG of the exact current frame — no UI, full render resolution">Export PNG</button>
        </div>
      </section>
      <aside class="control-panel">
        <div class="composition-panel">
          <div class="panel-label-row">
            <label class="panel-label">Composition</label>
            <div class="seg-toggle edit-target-toggle" id="edit-target-toggle">
              <button data-value="A" class="active">A</button>
              <button data-value="B">B</button>
            </div>
          </div>
          <div id="composition-controls"></div>
          <button type="button" class="reset-btn" id="composition-reset">Reset</button>
        </div>
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
const swapBtn = document.querySelector<HTMLButtonElement>("#swap")!;
const aspectToggle = document.querySelector<HTMLDivElement>("#aspect-toggle")!;
const playbackToggle = document.querySelector<HTMLDivElement>("#playback-toggle")!;
const slotA = document.querySelector<HTMLDivElement>("#slot-a")!;
const slotB = document.querySelector<HTMLDivElement>("#slot-b")!;
const typeA = document.querySelector<HTMLSpanElement>("#type-a")!;
const typeB = document.querySelector<HTMLSpanElement>("#type-b")!;
const nameA = document.querySelector<HTMLDivElement>("#name-a")!;
const nameB = document.querySelector<HTMLDivElement>("#name-b")!;
const showMaskBtn = document.querySelector<HTMLButtonElement>("#show-mask")!;
const registrationBtn = document.querySelector<HTMLButtonElement>("#registration-toggle")!;
const bwBtn = document.querySelector<HTMLButtonElement>("#bw-toggle")!;
const treatmentPanel = document.querySelector<HTMLDivElement>("#treatment-panel")!;
const treatmentLabel = document.querySelector<HTMLLabelElement>("#treatment-label")!;
const treatmentToggle = document.querySelector<HTMLDivElement>("#treatment-toggle")!;
const imageAwareBtn = document.querySelector<HTMLButtonElement>("#image-aware")!;
const editTargetToggle = document.querySelector<HTMLDivElement>("#edit-target-toggle")!;
const compositionControlsEl = document.querySelector<HTMLDivElement>("#composition-controls")!;
const compositionResetBtn = document.querySelector<HTMLButtonElement>("#composition-reset")!;
const presetPanel = document.querySelector<HTMLDivElement>("#preset-panel")!;
const presetLabel = document.querySelector<HTMLLabelElement>("#preset-label")!;
const presetToggle = document.querySelector<HTMLDivElement>("#preset-toggle")!;
const saveStateBtn = document.querySelector<HTMLButtonElement>("#save-state-btn")!;
const savedStatesListEl = document.querySelector<HTMLDivElement>("#saved-states-list")!;
const savedStatesEmptyEl = document.querySelector<HTMLParagraphElement>("#saved-states-empty")!;
const exportPngBtn = document.querySelector<HTMLButtonElement>("#export-png")!;

const renderer = new Renderer(canvas);

// --- default placeholder imagery so the mask is testable immediately ---
renderer.setMedia("A", wrapCanvasAsPlaceholder(placeholderA(), "Placeholder A"));
renderer.setMedia("B", wrapCanvasAsPlaceholder(placeholderB(), "Placeholder B"));

function showSlotMeta(nameEl: HTMLDivElement, typeEl: HTMLSpanElement, label: string, kind: "image" | "video"): void {
  nameEl.textContent = label;
  nameEl.classList.remove("has-error");
  typeEl.textContent = kind === "image" ? "IMAGE" : "VIDEO";
  typeEl.classList.toggle("type-image", kind === "image");
  typeEl.classList.toggle("type-video", kind === "video");
}

function showSlotError(nameEl: HTMLDivElement, message: string): void {
  nameEl.textContent = message;
  nameEl.classList.add("has-error");
}

/** Loads `asset` into `slot`, updating the slot's meta display. Checks
 * whether the OUTGOING asset is still referenced by a Saved State first —
 * if so, tells the renderer not to dispose it (see Renderer.setMedia),
 * since a saved state that still points at it needs to find it alive when
 * loaded later. */
function loadMediaAsset(slot: MediaSlot, asset: MediaAsset, displayLabel?: string): void {
  const prevAsset = renderer.getMedia(slot);
  const disposePrevious = prevAsset ? !isAssetReferencedBySavedState(prevAsset) : true;
  renderer.setMedia(slot, asset, { disposePrevious });
  const nameEl = slot === "A" ? nameA : nameB;
  const typeEl = slot === "A" ? typeA : typeB;
  showSlotMeta(nameEl, typeEl, displayLabel ?? asset.label, asset.kind);
}

wireMediaDropZone(
  slotA,
  renderer.getVideoHost(),
  (asset) => loadMediaAsset("A", asset),
  (message) => showSlotError(nameA, message)
);

wireMediaDropZone(
  slotB,
  renderer.getVideoHost(),
  (asset) => loadMediaAsset("B", asset),
  (message) => showSlotError(nameB, message)
);

// --- composition: per-media scale/position, independent of masking/
// treatment entirely (see Renderer — it's baked into aLayer/bLayer before
// anything else touches them). "A"/"B" here always mean the load slot,
// never the swapped visual order — separate from Swap A/B on purpose. ---
let editTarget: MediaSlot = "A";

const transformParamDefs: ParamDef[] = [
  { type: "range", key: "scale", label: "Scale", min: 100, max: 250, step: 1, default: 100, unit: "%" },
  { type: "range", key: "x", label: "Position X", min: -100, max: 100, step: 1, default: 0, unit: "%" },
  { type: "range", key: "y", label: "Position Y", min: -100, max: 100, step: 1, default: 0, unit: "%" },
];

function compositionValues(slot: MediaSlot): ParamValues {
  const t = renderer.getTransform(slot);
  return { scale: Math.round(t.scale * 100), x: Math.round(t.x * 100), y: Math.round(t.y * 100) };
}

// `patch` carries only the one key the control that fired actually owns
// (see ui/controls.ts) — merge it against the renderer's own live
// transform (the authoritative source, never a locally-cached copy) so an
// edit to one control can never clobber another.
function onCompositionChange(patch: ParamValues): void {
  const merged = { ...compositionValues(editTarget), ...patch };
  renderer.setTransform(editTarget, {
    scale: (merged.scale as number) / 100,
    x: (merged.x as number) / 100,
    y: (merged.y as number) / 100,
  });
}

function rebuildCompositionPanel(): void {
  buildControls(compositionControlsEl, transformParamDefs, compositionValues(editTarget), onCompositionChange);
}

editTargetToggle.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("button");
  if (!target) return;
  editTarget = target.getAttribute("data-value") as MediaSlot;
  editTargetToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === target));
  rebuildCompositionPanel();
});

compositionResetBtn.addEventListener("click", () => {
  renderer.resetTransform(editTarget);
  rebuildCompositionPanel();
});

rebuildCompositionPanel();

// --- direct manipulation on the canvas: drag to reposition the currently
// selected edit target, ctrl/cmd + wheel (trackpad pinch synthesizes this)
// to scale it. Compositing order (Swap A/B) is never touched here. ---
canvas.style.cursor = "grab";
canvas.style.touchAction = "none";

let dragState: { pointerId: number; startClientX: number; startClientY: number; startX: number; startY: number } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  const t = renderer.getTransform(editTarget);
  dragState = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startX: t.x, startY: t.y };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  const rect = canvas.getBoundingClientRect();
  // Content follows the cursor (grab-and-drag), so a rightward drag must
  // decrease x (which is defined as increasing the crop window's source
  // position — see coverFitTransformedRect) to shift visible content right.
  const dxNorm = ((e.clientX - dragState.startClientX) / rect.width) * 2;
  const dyNorm = ((e.clientY - dragState.startClientY) / rect.height) * 2;
  const t = renderer.getTransform(editTarget);
  renderer.setTransform(editTarget, {
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
    if (!(e.ctrlKey || e.metaKey)) return; // require a modifier so page/trackpad scroll is untouched otherwise
    e.preventDefault();
    const t = renderer.getTransform(editTarget);
    const nextScale = Math.min(2.5, Math.max(1, t.scale - e.deltaY * 0.003));
    renderer.setTransform(editTarget, { ...t, scale: nextScale });
    rebuildCompositionPanel();
  },
  { passive: false }
);

// --- behavior tabs ---
let currentParams: ParamValues = {};
let currentBehavior: MaskBehavior<unknown> = BEHAVIORS[0];
let visibleKeysCache = "";

function rebuildControlsPanel(): void {
  const defs = currentBehavior.visibleParams ? currentBehavior.visibleParams(currentParams) : currentBehavior.params;
  visibleKeysCache = defs.map((d) => d.key).join(",");
  buildControls(controlsEl, defs, currentParams, onParamsChange);
}

// `patch` carries only the one key that changed (see ui/controls.ts) —
// merged here, once, against `currentParams` (the single live source of
// truth for this behavior's params) so it can never be clobbered by a
// stale snapshot from elsewhere. Every caller (control panel, treatment
// toggle, Image Aware button) goes through this same merge.
function onParamsChange(patch: ParamValues): void {
  currentParams = { ...currentParams, ...patch };
  renderer.setParams(currentParams);
  // Only Bloom declares visibleParams, and only its own structural params
  // (treatment) change which controls should be visible — a plain slider
  // drag never changes the visible set, so this never rebuilds mid-drag.
  if (currentBehavior.visibleParams) {
    const defs = currentBehavior.visibleParams(currentParams);
    const key = defs.map((d) => d.key).join(",");
    if (key !== visibleKeysCache) {
      visibleKeysCache = key;
      buildControls(controlsEl, defs, currentParams, onParamsChange);
    }
  }
  syncTreatmentUI();
  syncPresetUI();
}

/** Any behavior can offer a segmented "expression/treatment" selector by
 * declaring a `select`-typed param named "treatment" — Bloom's
 * Clean/Refraction/Registration and Shift's Slice/Drift/Diffuse both work
 * this way, so the panel itself needs no per-behavior knowledge. Image
 * Aware stays specific to Bloom (Shift's rebuild has no equivalent). */
function findTreatmentDef(behavior: MaskBehavior<unknown>): SelectParamDef | null {
  const def = behavior.params.find((d) => d.key === "treatment");
  return def && def.type === "select" ? def : null;
}

function rebuildTreatmentToggle(def: SelectParamDef): void {
  treatmentToggle.innerHTML = "";
  for (const opt of def.options) {
    const btn = document.createElement("button");
    btn.textContent = opt.label;
    btn.setAttribute("data-value", opt.value);
    treatmentToggle.appendChild(btn);
  }
}

function syncTreatmentUI(): void {
  const treatmentDef = findTreatmentDef(currentBehavior);
  treatmentPanel.hidden = !treatmentDef;
  if (treatmentDef) {
    treatmentLabel.textContent = treatmentDef.label;
    const treatment = currentParams.treatment as string;
    treatmentToggle.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-value") === treatment);
    });
  }

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
    lastParamsByBehavior.set(currentBehavior.id, currentParams);
  }
  currentBehavior = behavior;
  currentParams = paramsOverride ?? lastParamsByBehavior.get(behavior.id) ?? defaultParamValues(behavior.params);
  if (paramsOverride) lastParamsByBehavior.set(behavior.id, currentParams);
  renderer.setBehavior(behavior, currentParams);

  titleEl.textContent = `${behavior.index} — ${behavior.name}`;
  descEl.textContent = behavior.description;

  rebuildControlsPanel();
  const treatmentDef = findTreatmentDef(behavior);
  if (treatmentDef) rebuildTreatmentToggle(treatmentDef);
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

playPauseBtn.addEventListener("click", () => {
  if (renderer.isPlaying()) renderer.pause();
  else renderer.play();
  updatePlayPauseLabel();
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
let currentAspect = "4:5";

function setAspect(value: string): void {
  currentAspect = value;
  const [w, h] = value.split(":").map(Number);
  stageFrame.style.aspectRatio = `${w} / ${h}`;
  aspectToggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-value") === value);
  });
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
  const mediaAAsset = renderer.getMedia("A");
  const mediaBAsset = renderer.getMedia("B");
  return {
    name,
    behaviorId: currentBehavior.id,
    params: { ...currentParams },
    registrationOn: renderer.isRegistrationEnabled(),
    bwOn: renderer.isBWEnabled(),
    swapped: renderer.isSwapped(),
    aspect: currentAspect,
    playbackMode: currentPlaybackMode,
    mediaA: mediaAAsset
      ? { asset: mediaAAsset, transform: { ...renderer.getTransform("A") }, label: nameA.textContent ?? mediaAAsset.label }
      : null,
    mediaB: mediaBAsset
      ? { asset: mediaBAsset, transform: { ...renderer.getTransform("B") }, label: nameB.textContent ?? mediaBAsset.label }
      : null,
  };
}

function loadSavedState(state: SavedState): void {
  selectBehavior(state.behaviorId, { ...state.params });

  renderer.setRegistrationEnabled(state.registrationOn);
  registrationBtn.classList.toggle("active", state.registrationOn);
  renderer.setBWEnabled(state.bwOn);
  bwBtn.classList.toggle("active", state.bwOn);

  if (renderer.isSwapped() !== state.swapped) renderer.swap();

  setAspect(state.aspect);
  setPlaybackModeUI(state.playbackMode);

  if (state.mediaA) {
    loadMediaAsset("A", state.mediaA.asset, state.mediaA.label);
    renderer.setTransform("A", { ...state.mediaA.transform });
  }
  if (state.mediaB) {
    loadMediaAsset("B", state.mediaB.asset, state.mediaB.label);
    renderer.setTransform("B", { ...state.mediaB.transform });
  }
  rebuildCompositionPanel();
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
    ? (treatmentDef.options.find((o) => o.value === currentParams.treatment)?.label ?? "")
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
// 2x device pixel ratio), not just its on-screen CSS size. ---
exportPngBtn.addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `motion-studio-${currentBehavior.id}-${currentParams.treatment ?? "export"}-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
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
