import "./style.css";
import { Renderer, type DiagnosticMode, type MediaSlot } from "./core/renderer";
import { placeholderA, placeholderB } from "./core/placeholder";
import { wrapCanvasAsPlaceholder } from "./core/media";
import { wireMediaDropZone } from "./ui/mediaInput";
import { buildControls } from "./ui/controls";
import { BEHAVIORS } from "./behaviors/index";
import { defaultParamValues, type MaskBehavior, type ParamDef, type ParamValues, type SelectParamDef } from "./core/types";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand">Motion Studio <span class="brand-sub">— masking prototype</span></div>
      <div class="topbar-right">
        <div class="behavior-tabs" id="behavior-tabs"></div>
        <button type="button" class="diagnostic-toggle" id="show-mask" title="Diagnostic: display the raw alpha mask instead of the composited media">
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
const treatmentPanel = document.querySelector<HTMLDivElement>("#treatment-panel")!;
const treatmentLabel = document.querySelector<HTMLLabelElement>("#treatment-label")!;
const treatmentToggle = document.querySelector<HTMLDivElement>("#treatment-toggle")!;
const imageAwareBtn = document.querySelector<HTMLButtonElement>("#image-aware")!;
const editTargetToggle = document.querySelector<HTMLDivElement>("#edit-target-toggle")!;
const compositionControlsEl = document.querySelector<HTMLDivElement>("#composition-controls")!;
const compositionResetBtn = document.querySelector<HTMLButtonElement>("#composition-reset")!;

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

wireMediaDropZone(
  slotA,
  renderer.getVideoHost(),
  (asset) => {
    renderer.setMedia("A", asset);
    showSlotMeta(nameA, typeA, asset.label, asset.kind);
  },
  (message) => showSlotError(nameA, message)
);

wireMediaDropZone(
  slotB,
  renderer.getVideoHost(),
  (asset) => {
    renderer.setMedia("B", asset);
    showSlotMeta(nameB, typeB, asset.label, asset.kind);
  },
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

function onCompositionChange(values: ParamValues): void {
  renderer.setTransform(editTarget, {
    scale: (values.scale as number) / 100,
    x: (values.x as number) / 100,
    y: (values.y as number) / 100,
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

function onParamsChange(values: ParamValues): void {
  currentParams = values;
  renderer.setParams(values);
  // Only Bloom declares visibleParams, and only its own structural params
  // (treatment) change which controls should be visible — a plain slider
  // drag never changes the visible set, so this never rebuilds mid-drag.
  if (currentBehavior.visibleParams) {
    const defs = currentBehavior.visibleParams(values);
    const key = defs.map((d) => d.key).join(",");
    if (key !== visibleKeysCache) {
      visibleKeysCache = key;
      buildControls(controlsEl, defs, currentParams, onParamsChange);
    }
  }
  syncTreatmentUI();
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

function selectBehavior(id: string): void {
  const behavior = BEHAVIORS.find((b) => b.id === id) ?? BEHAVIORS[0];
  currentBehavior = behavior;
  currentParams = defaultParamValues(behavior.params);
  renderer.setBehavior(behavior, currentParams);

  titleEl.textContent = `${behavior.index} — ${behavior.name}`;
  descEl.textContent = behavior.description;

  rebuildControlsPanel();
  const treatmentDef = findTreatmentDef(behavior);
  if (treatmentDef) rebuildTreatmentToggle(treatmentDef);
  syncTreatmentUI();

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
  onParamsChange({ ...currentParams, treatment: target.getAttribute("data-value")! });
});

imageAwareBtn.addEventListener("click", () => {
  const next = currentParams.imageAware === "on" ? "off" : "on";
  onParamsChange({ ...currentParams, imageAware: next });
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

// --- aspect ratio ---
function setAspect(value: string): void {
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
playbackToggle.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("button");
  if (!target) return;
  const mode = target.getAttribute("data-value") as "loop" | "pingpong";
  renderer.setPlaybackMode(mode);
  playbackToggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b === target);
  });
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
