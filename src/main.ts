import "./style.css";
import { Renderer } from "./core/renderer";
import { placeholderA, placeholderB } from "./core/placeholder";
import { wrapCanvasAsPlaceholder } from "./core/media";
import { wireMediaDropZone } from "./ui/mediaInput";
import { buildControls } from "./ui/controls";
import { BEHAVIORS } from "./behaviors/index";
import { defaultParamValues, type ParamValues } from "./core/types";

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
        <div class="behavior-meta">
          <h2 id="behavior-title"></h2>
          <p id="behavior-desc" class="behavior-desc"></p>
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

// --- behavior tabs ---
let currentParams: ParamValues = {};

function selectBehavior(id: string): void {
  const behavior = BEHAVIORS.find((b) => b.id === id) ?? BEHAVIORS[0];
  currentParams = defaultParamValues(behavior.params);
  renderer.setBehavior(behavior, currentParams);

  titleEl.textContent = `${behavior.index} — ${behavior.name}`;
  descEl.textContent = behavior.description;

  buildControls(controlsEl, behavior.params, currentParams, (values) => {
    currentParams = values;
    renderer.setParams(values);
  });

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

// --- diagnostic: show raw mask instead of composited media ---
showMaskBtn.addEventListener("click", () => {
  renderer.setShowMask(!renderer.isShowingMask());
  showMaskBtn.classList.toggle("active", renderer.isShowingMask());
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
