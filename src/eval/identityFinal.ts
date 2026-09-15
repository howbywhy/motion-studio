import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState } from "../core/typeState";
import { clampMarkState, MARK_MODE_WINDOW } from "../core/markState";
import { loadSwitzer } from "../core/typeFont";
import { clampSequenceWeights } from "../core/sequenceRhythm";
import {
  bindEvalIdentityFinal,
  IDENTITY_FINAL_TREATMENTS,
  identityFinalLabel,
  type IdentityFinalTreatment,
  type IdentityTypeYield,
} from "../core/identityFinal";

const STILLS = [
  "/eval/stress-media/01-fence-cat.jpg",
  "/eval/stress-media/03-booth.jpg",
  "/eval/stress-media/04-speaker.jpg",
];
const VIDEOS = [
  "/eval/stress-media/02-turn.mp4",
  "/eval/stress-media/05-organic.mp4",
];
const TWO_COPY = ["Stay", "She turns"];
const FIVE_COPY = ["Stay", "She turns", "Reserved", "Listen", "The room keeps\nthe last record playing"];
const EVEN_FIVE = [1, 1, 1, 1, 1];
const EDITORIAL_FIVE = [1, 3, 2, 4, 2.5];
const HOSTILE_FIVE = [4, 0.8, 2.4, 2.4, 2.4];

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

function fallback(label: string, fill: string): MediaAsset {
  const c = document.createElement("canvas");
  c.width = 420;
  c.height = 525;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 420, 525);
  ctx.fillStyle = "#f3efe6";
  ctx.font = "36px sans-serif";
  ctx.fillText(label, 24, 64);
  return { kind: "image", source: c, naturalW: 420, naturalH: 525, label, transform: defaultTransform() };
}

async function loadImage(url: string, label: string): Promise<MediaAsset> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error(url));
      img.src = url;
    });
    return {
      kind: "image",
      source: img,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      label,
      transform: defaultTransform(),
    };
  } catch {
    return fallback(label, "#3a3028");
  }
}

async function loadVideo(url: string, label: string, host: HTMLElement): Promise<MediaAsset> {
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    host.appendChild(video);
    await new Promise<void>((res, rej) => {
      video.addEventListener("loadeddata", () => res(), { once: true });
      video.addEventListener("error", () => rej(new Error(url)), { once: true });
      video.src = url;
    });
    return {
      kind: "video",
      source: video,
      naturalW: video.videoWidth,
      naturalH: video.videoHeight,
      label,
      transform: defaultTransform(),
      videoEl: video,
    };
  } catch {
    return fallback(label, "#1a1814");
  }
}

const stage = document.getElementById("stage")!;
const treatBar = document.getElementById("treat")!;
const optsBar = document.getElementById("opts")!;
const hud = document.getElementById("hud")!;

const canvas = document.createElement("canvas");
stage.appendChild(canvas);
const renderer = new Renderer(canvas);
renderer.setBehavior(bloomBehavior, bloomParams());
renderer.setPlaybackMode("loop");
renderer.setLoopSeconds(12);
renderer.setEndBehaviour({ mode: "off" });
renderer.setClockMode("auto");

let treatment: IdentityFinalTreatment = "current";
let typeYield: IdentityTypeYield = "coexist";
let flickerOn = false;
let typeOn = true;
let states = 5;
let editorial = true;
let aspect: "4:5" | "9:16" = "4:5";
let loopsLeft = 0;
let lastPhase = 0;

function size(): { w: number; h: number } {
  return aspect === "9:16" ? { w: 270, h: 480 } : { w: 336, h: 420 };
}

function bind(): void {
  bindEvalIdentityFinal(renderer, { treatment, typeYield });
  renderer.setTransitionFlickerEnabled(flickerOn);
  const win = treatment === "current"
    ? MARK_MODE_WINDOW.intro
    : { start: 0, stop: 1 };
  renderer.setMarkState(clampMarkState({
    enabled: true,
    mode: "intro",
    scale: treatment === "current" ? 48 : 36,
    sequenceStart: win.start,
    sequenceStop: win.stop,
  }));
  const type = renderer.getTypeState();
  renderer.setTypeState(clampTypeState({
    ...type,
    enabled: typeOn,
    typeMode: "sequence",
  }));
  renderer.renderFrame();
}

async function buildMedia(): Promise<void> {
  const host = renderer.getVideoHost();
  const items: { id: string; asset: MediaAsset }[] = [];
  if (states === 2) {
    items.push({ id: "src-0", asset: await loadImage(STILLS[0]!, "still-fence") });
    items.push({ id: "src-1", asset: await loadVideo(VIDEOS[0]!, "video-turn", host) });
  } else {
    items.push({ id: "src-0", asset: await loadImage(STILLS[0]!, "still-fence") });
    items.push({ id: "src-1", asset: await loadVideo(VIDEOS[0]!, "video-turn", host) });
    items.push({ id: "src-2", asset: await loadImage(STILLS[1]!, "still-booth") });
    items.push({ id: "src-3", asset: await loadVideo(VIDEOS[1]!, "video-organic", host) });
    items.push({ id: "src-4", asset: await loadImage(STILLS[2]!, "still-speaker") });
  }
  const copies = states === 2 ? TWO_COPY : FIVE_COPY;
  const weights = states === 2 ? [1, 3] : editorial ? EDITORIAL_FIVE : EVEN_FIVE;
  const dim = size();
  renderer.resizeExact(dim.w, dim.h);
  renderer.setSequence(items, items[0]!.id);
  renderer.setSequenceWeights(clampSequenceWeights(weights, items.length));
  renderer.setTypeState(clampTypeState({
    enabled: typeOn,
    typeMode: "sequence",
    sequenceCopies: copies,
    blocks: [{ enabled: true, text: "", scale: 42, composition: "headline", textAlign: "center", anchor: "bc" }],
  }));
  bind();
}

function button(parent: HTMLElement, label: string, on: boolean, click: () => void): void {
  const b = document.createElement("button");
  b.textContent = label;
  if (on) b.className = "is-on";
  b.addEventListener("click", click);
  parent.appendChild(b);
}

function redrawBars(): void {
  treatBar.innerHTML = "";
  const tlab = document.createElement("span");
  tlab.textContent = "TREATMENT";
  treatBar.appendChild(tlab);
  for (const id of IDENTITY_FINAL_TREATMENTS) {
    button(treatBar, identityFinalLabel(id), treatment === id, () => {
      treatment = id;
      bind();
      redrawBars();
    });
  }
  optsBar.innerHTML = "";
  button(optsBar, flickerOn ? "FLICKER ON" : "FLICKER OFF", flickerOn, () => {
    flickerOn = !flickerOn;
    bind();
    redrawBars();
  });
  button(optsBar, typeOn ? "TYPE ON" : "TYPE OFF", typeOn, () => {
    typeOn = !typeOn;
    bind();
    redrawBars();
  });
  button(optsBar, "HIDE TYPE", typeYield === "hide", () => {
    typeYield = "hide";
    bind();
    redrawBars();
  });
  button(optsBar, "COEXIST", typeYield === "coexist", () => {
    typeYield = "coexist";
    bind();
    redrawBars();
  });
  button(optsBar, "YIELD STRONG", typeYield === "yield-strong", () => {
    typeYield = "yield-strong";
    bind();
    redrawBars();
  });
  button(optsBar, states === 2 ? "2 STATES" : "5 STATES", true, () => {
    states = states === 2 ? 5 : 2;
    void buildMedia().then(redrawBars);
  });
  button(optsBar, editorial ? "EDITORIAL" : "EVEN", true, () => {
    editorial = !editorial;
    void buildMedia().then(redrawBars);
  });
  button(optsBar, aspect, true, () => {
    aspect = aspect === "4:5" ? "9:16" : "4:5";
    const dim = size();
    renderer.resizeExact(dim.w, dim.h);
    bind();
    redrawBars();
  });
  button(optsBar, "AUTO", renderer.getClockMode() === "auto", () => {
    renderer.setClockMode("auto");
    renderer.play();
    redrawBars();
  });
  button(optsBar, "WRAP", false, () => {
    renderer.setClockMode("hold");
    renderer.setHoldPhase(0.992);
    renderer.renderFrame();
  });
  button(optsBar, "HOSTILE", false, () => {
    renderer.setSequenceWeights(clampSequenceWeights(HOSTILE_FIVE, renderer.getSequence().length));
    bind();
  });
  button(optsBar, "LOOP ×3", loopsLeft > 0, () => {
    loopsLeft = 3;
    lastPhase = renderer.getLoopPhase();
    renderer.setClockMode("auto");
    renderer.play();
  });
}

function tickHud(): void {
  const info = renderer.getSequenceTiming();
  const mark = renderer.lastMarkDiagnostics;
  const flick = renderer.lastTransitionDiagnostics;
  const v = renderer.mediaInfo?.() ?? null;
  const video = v && "A" in v ? v.A : null;
  hud.textContent = [
    `phase ${renderer.getLoopPhase().toFixed(3)}`,
    `slot ${info.index}`,
    `local ${info.localPhase.toFixed(2)}`,
    `mark ${mark?.kind ?? "off"} x:${Math.round(mark?.madeLenX ?? 0)} hide:${mark?.hideType ? "Y" : "n"}`,
    `flick ${((flick?.envelope ?? 0) * 100).toFixed(0)}`,
    video && video.kind === "video" ? `vid ${Number(video.currentTime ?? 0).toFixed(2)}` : "",
    loopsLeft ? `loops ${loopsLeft}` : "",
  ].filter(Boolean).join(" · ");
  const p = renderer.getLoopPhase();
  if (loopsLeft > 0 && lastPhase > 0.8 && p < 0.2) loopsLeft -= 1;
  lastPhase = p;
  requestAnimationFrame(tickHud);
}

void loadSwitzer().then(async () => {
  await buildMedia();
  renderer.play();
  redrawBars();
  tickHud();
  Object.assign(window, {
    __identityFinal: {
      renderer,
      treatment: () => treatment,
      setTreatment(id: IdentityFinalTreatment) {
        treatment = id;
        bind();
        redrawBars();
      },
      setFlicker(on: boolean) {
        flickerOn = on;
        bind();
        redrawBars();
      },
      setType(on: boolean) {
        typeOn = on;
        bind();
        redrawBars();
      },
      setYield(mode: IdentityTypeYield) {
        typeYield = mode;
        bind();
        redrawBars();
      },
      setStates(n: 2 | 5) {
        states = n;
        return buildMedia().then(redrawBars);
      },
      setEditorial(on: boolean) {
        editorial = on;
        return buildMedia().then(redrawBars);
      },
      setAspect(next: "4:5" | "9:16") {
        aspect = next;
        const dim = size();
        renderer.resizeExact(dim.w, dim.h);
        bind();
        redrawBars();
      },
      hold(phase: number) {
        renderer.setClockMode("hold");
        renderer.setHoldPhase(phase);
        renderer.renderFrame();
      },
      play() {
        renderer.setClockMode("auto");
        renderer.play();
      },
      hud: () => ({
        phase: renderer.getLoopPhase(),
        mark: renderer.lastMarkDiagnostics,
        flick: renderer.lastTransitionDiagnostics,
        type: renderer.getTypeState().enabled,
        timing: renderer.getSequenceTiming(),
        video: renderer.mediaInfo(),
      }),
    },
  });
});
