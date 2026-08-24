import "./style.css";
import { Renderer } from "./core/renderer";
import { placeholderA, placeholderB } from "./core/placeholder";
import { wireImageInput } from "./ui/imageInput";
import { buildControls } from "./ui/controls";
import { BEHAVIORS } from "./behaviors/index";
import { defaultParamValues, type ParamValues } from "./core/types";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand">Motion Studio <span class="brand-sub">— masking prototype</span></div>
      <div class="behavior-tabs" id="behavior-tabs"></div>
    </header>
    <main class="workspace">
      <section class="stage-panel">
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
          <button class="corner-drop corner-a" id="dropzone-a" title="Drop or click to set Image A">A</button>
          <button class="corner-drop corner-b" id="dropzone-b" title="Drop or click to set Image B">B</button>
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
const dropA = document.querySelector<HTMLButtonElement>("#dropzone-a")!;
const dropB = document.querySelector<HTMLButtonElement>("#dropzone-b")!;

const renderer = new Renderer(canvas);

// --- default placeholder imagery so the mask is testable immediately ---
const phA = placeholderA();
const phB = placeholderB();
renderer.setImageA(phA, phA.width, phA.height);
renderer.setImageB(phB, phB.width, phB.height);

wireImageInput(dropA, (img, w, h) => renderer.setImageA(img, w, h));
wireImageInput(dropB, (img, w, h) => renderer.setImageB(img, w, h));

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
