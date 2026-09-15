import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState } from "../core/typeState";
import { clampMarkState } from "../core/markState";
import { loadSwitzer } from "../core/typeFont";
import { clampSequenceWeights } from "../core/sequenceRhythm";
import { bindEvalIdentityFinal } from "../core/identityFinal";
import { bindEvalIdentityTexture } from "../core/identityTexture";
import {
  bindEvalTypeIncoming,
  typeIncomingTimeline,
  TYPE_INCOMING_STRATEGIES,
  type TypeIncomingStrategy,
} from "../core/sequenceTypeIncoming";
import { lastSequenceTypePaint, lastTypeBloomPaintMs } from "../core/sequenceType";
import { lastIdentityTextureMs } from "../core/identityTexture";
import { runExport } from "../core/exportSession";
import { loadMediaFile } from "../ui/mediaInput";

const STILLS = [
  "/eval/stress-media/01-fence-cat.jpg",
  "/eval/stress-media/03-booth.jpg",
  "/eval/stress-media/04-speaker.jpg",
];
const VIDEOS = [
  "/eval/stress-media/02-turn.mp4",
  "/eval/stress-media/05-organic.mp4",
];

const EDITORIAL_COPY = [
  "STAY",
  "She turns",
  "Reserved\nfor members",
  "LISTEN",
  "The room keeps\nthe last record",
];
const EDITORIAL_SIZE_MODES = ["auto", "manual", "auto", "manual", "auto"] as const;
const EDITORIAL_SIZES = [48, 32, 48, 62, 48];
const EDITORIAL_ANCHORS = ["inherit", "inherit", "tl", "inherit", "inherit"] as const;

const RHYTHMS: Record<string, number[]> = {
  even: [1, 1, 1, 1, 1],
  build: [1, 2, 3, 4, 5],
  punch: [1, 1, 1, 1, 6],
  "long-short": [4, 1, 4, 1, 4],
  editorial: [1.2, 2.4, 2.0, 2.8, 4.0],
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
const textureBar = document.getElementById("texture")!;
const incomingBar = document.getElementById("incoming")!;
const optsBar = document.getElementById("opts")!;
const hud = document.getElementById("hud")!;
const proofEl = document.getElementById("proof")!;

const canvas = document.createElement("canvas");
stage.appendChild(canvas);
const renderer = new Renderer(canvas);
renderer.setBehavior(bloomBehavior, bloomParams());
renderer.setPlaybackMode("loop");
renderer.setLoopSeconds(12);
renderer.setEndBehaviour({ mode: "off" });
renderer.setClockMode("auto");
renderer.setProfiling(true);

let textureOn = true;
let incoming: TypeIncomingStrategy = "current";
let flickerOn = false;
let aspect: "4:5" | "9:16" = "4:5";
let rhythm = "editorial";
let mediaKind: "stills" | "mixed" | "upload" = "mixed";
let cut: "auto" | "internal" | "wrap" = "auto";
let loopsLeft = 0;
let lastPhase = 0;
let exportStatus = "";

function size(): { w: number; h: number } {
  return aspect === "9:16" ? { w: 315, h: 560 } : { w: 420, h: 525 };
}

function bind(): void {
  bindEvalIdentityTexture(renderer, textureOn);
  bindEvalTypeIncoming(renderer, incoming);
  bindEvalIdentityFinal(renderer, { treatment: "static", typeYield: "coexist" });
  renderer.setTransitionFlickerEnabled(flickerOn);
  renderer.setMarkState(clampMarkState({
    enabled: true,
    mode: "intro",
    scale: 40,
    sequenceStart: 0,
    sequenceStop: 1,
  }));
  renderer.setRegistrationEnabled(false);
  const type = renderer.getTypeState();
  renderer.setTypeState(clampTypeState({
    ...type,
    enabled: true,
    typeMode: "sequence",
  }));
  renderer.renderFrame();
}

function applyRhythm(): void {
  const n = renderer.getSequence().length;
  renderer.setSequenceWeights(clampSequenceWeights(RHYTHMS[rhythm] ?? RHYTHMS.editorial!, n));
}

function applyCut(): void {
  if (cut === "auto") {
    renderer.setClockMode("auto");
    renderer.play();
    return;
  }
  renderer.setClockMode("hold");
  renderer.setHoldPhase(cut === "wrap" ? 0.992 : 0.48);
  renderer.renderFrame();
}

async function buildMedia(): Promise<void> {
  const host = renderer.getVideoHost();
  const items: { id: string; asset: MediaAsset }[] = [];
  if (mediaKind === "stills") {
    items.push({ id: "src-0", asset: await loadImage(STILLS[0]!, "still-fence") });
    items.push({ id: "src-1", asset: await loadImage(STILLS[1]!, "still-booth") });
    items.push({ id: "src-2", asset: await loadImage(STILLS[2]!, "still-speaker") });
    items.push({ id: "src-3", asset: await loadImage(STILLS[0]!, "still-fence-2") });
    items.push({ id: "src-4", asset: await loadImage(STILLS[1]!, "still-booth-2") });
  } else {
    items.push({ id: "src-0", asset: await loadImage(STILLS[0]!, "still-fence") });
    items.push({ id: "src-1", asset: await loadVideo(VIDEOS[0]!, "video-turn", host) });
    items.push({ id: "src-2", asset: await loadImage(STILLS[1]!, "still-booth") });
    items.push({ id: "src-3", asset: await loadVideo(VIDEOS[1]!, "video-organic", host) });
    items.push({ id: "src-4", asset: await loadImage(STILLS[2]!, "still-speaker") });
  }
  const dim = size();
  renderer.resizeExact(dim.w, dim.h);
  renderer.setSequence(items, items[0]!.id);
  applyRhythm();
  renderer.setTypeState(clampTypeState({
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: EDITORIAL_COPY.slice(),
    sequenceSizeModes: EDITORIAL_SIZE_MODES.slice(),
    sequenceSizes: EDITORIAL_SIZES.slice(),
    sequenceAnchors: EDITORIAL_ANCHORS.slice(),
    blocks: [{ enabled: true, text: "", scale: 48, composition: "headline", textAlign: "center", anchor: "bc" }],
  }));
  bind();
  applyCut();
}

function button(parent: HTMLElement, label: string, on: boolean, click: () => void): void {
  const b = document.createElement("button");
  b.textContent = label;
  if (on) b.className = "is-on";
  b.addEventListener("click", click);
  parent.appendChild(b);
}

function redrawBars(): void {
  textureBar.innerHTML = "";
  const tlab = document.createElement("span");
  tlab.textContent = "TEXTURE";
  textureBar.appendChild(tlab);
  button(textureBar, "OFF", !textureOn, () => {
    textureOn = false;
    bind();
    redrawBars();
  });
  button(textureBar, "RESTORED", textureOn, () => {
    textureOn = true;
    bind();
    redrawBars();
  });

  incomingBar.innerHTML = "";
  const ilab = document.createElement("span");
  ilab.textContent = "TYPE INCOMING";
  incomingBar.appendChild(ilab);
  for (const id of TYPE_INCOMING_STRATEGIES) {
    button(incomingBar, id === "current" ? "CURRENT" : id === "ownership" ? "OWNERSHIP" : "ANTICIPATED FLICK", incoming === id, () => {
      incoming = id;
      bind();
      redrawBars();
    });
  }

  optsBar.innerHTML = "";
  const clab = document.createElement("span");
  clab.textContent = "CUT";
  optsBar.appendChild(clab);
  for (const id of ["auto", "internal", "wrap"] as const) {
    button(optsBar, id.toUpperCase(), cut === id, () => {
      cut = id;
      applyCut();
      redrawBars();
    });
  }

  const rlab = document.createElement("span");
  rlab.textContent = "RHYTHM";
  optsBar.appendChild(rlab);
  for (const id of Object.keys(RHYTHMS)) {
    button(optsBar, id.toUpperCase(), rhythm === id, () => {
      rhythm = id;
      applyRhythm();
      bind();
      redrawBars();
    });
  }

  button(optsBar, aspect, true, () => {
    aspect = aspect === "4:5" ? "9:16" : "4:5";
    const dim = size();
    renderer.resizeExact(dim.w, dim.h);
    bind();
    redrawBars();
  });
  button(optsBar, mediaKind === "stills" ? "STILLS" : mediaKind === "mixed" ? "MIXED VIDEO" : "UPLOAD", true, () => {
    mediaKind = mediaKind === "stills" ? "mixed" : mediaKind === "mixed" ? "stills" : "mixed";
    void buildMedia().then(redrawBars);
  });
  button(optsBar, flickerOn ? "FLICKER ON" : "FLICKER OFF", flickerOn, () => {
    flickerOn = !flickerOn;
    bind();
    redrawBars();
  });
  button(optsBar, "REPLAY", false, () => {
    renderer.setClockMode("auto");
    renderer.setHoldPhase(0);
    renderer.play();
    cut = "auto";
    redrawBars();
  });
  button(optsBar, "LOOP ×3", loopsLeft > 0, () => {
    loopsLeft = 3;
    lastPhase = renderer.getLoopPhase();
    renderer.setClockMode("auto");
    renderer.play();
    cut = "auto";
    redrawBars();
  });
  button(optsBar, "HOLD", renderer.getClockMode() === "hold", () => {
    renderer.setClockMode("hold");
    renderer.renderFrame();
    redrawBars();
  });
  button(optsBar, "EXPORT", false, () => {
    void exportCurrent().catch((err) => {
      exportStatus = err instanceof Error ? err.message : "Export failed";
    });
  });

  const upload = document.createElement("input");
  upload.type = "file";
  upload.accept = "image/*,video/*";
  upload.hidden = true;
  optsBar.appendChild(upload);
  button(optsBar, "UPLOAD", mediaKind === "upload", () => upload.click());
  upload.addEventListener("change", () => {
    const file = upload.files?.[0];
    upload.value = "";
    if (!file) return;
    mediaKind = "upload";
    const selected = renderer.getSelectedItem() ?? renderer.getSequence()[0];
    if (!selected) return;
    loadMediaFile(file, renderer.getVideoHost(), (asset) => {
      renderer.replaceSource(selected.id, asset, { disposePrevious: true });
      bind();
      redrawBars();
    }, (err) => {
      exportStatus = err;
    });
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportCurrent(label = `unity-${textureOn ? "tex" : "off"}-${incoming}-${flickerOn ? "flick" : "quiet"}-${aspect.replace(":", "x")}`): Promise<string> {
  const result = await runExport(
    renderer,
    {
      format: "mp4",
      fps: 30,
      size: "preview",
      quality: "standard",
      aspect,
      includeAudio: false,
    },
    { behaviorId: "bloom", treatment: label },
    (p) => {
      exportStatus = `${label}  ${p.label}`;
    },
    new AbortController().signal,
  );
  downloadBlob(result.blob, result.filename);
  try {
    await fetch(`http://127.0.0.1:8765/${result.filename}`, { method: "POST", body: result.blob });
  } catch {
    /* local eval receiver is optional */
  }
  exportStatus = `Saved ${result.filename} (${Math.round(result.bytes / 1024)}kb)`;
  const dim = size();
  renderer.resizeExact(dim.w, dim.h);
  bind();
  return result.filename;
}

function framePixels(): Uint8ClampedArray {
  const live = renderer.getVisibleCanvas();
  const ctx = live.getContext("2d", { willReadFrequently: true })!;
  return ctx.getImageData(0, 0, live.width, live.height).data;
}

function pixelEnergy(data: Uint8ClampedArray): { mean: number; hf: number } {
  let sum = 0;
  let hf = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722;
    sum += y;
    if (i >= 16) {
      const py = data[i - 16]! * 0.2126 + data[i - 15]! * 0.7152 + data[i - 14]! * 0.0722;
      hf += Math.abs(y - py);
    }
  }
  return { mean: sum / n, hf: hf / Math.max(1, n - 4) };
}

function pixelMad(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 4) {
    sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
  }
  return sum / (n * 0.75);
}

function holdAt(phase: number): void {
  renderer.setClockMode("hold");
  renderer.setHoldPhase(phase);
  renderer.renderFrame();
}

async function textureProof(): Promise<Record<string, { mad: number; onHf: number; offHf: number }>> {
  const phases = { hold: 0.08, mid: 0.42, late: 0.78, wrap: 0.992 };
  const out: Record<string, { mad: number; onHf: number; offHf: number }> = {};
  const prevTex = textureOn;
  const prevCut = cut;
  for (const [name, phase] of Object.entries(phases)) {
    textureOn = false;
    bind();
    holdAt(phase);
    const off = framePixels();
    const offE = pixelEnergy(off);
    textureOn = true;
    bind();
    holdAt(phase);
    const on = framePixels();
    const onE = pixelEnergy(on);
    out[name] = { mad: pixelMad(on, off), onHf: onE.hf, offHf: offE.hf };
  }
  textureOn = prevTex;
  cut = prevCut;
  bind();
  applyCut();
  return out;
}

function sampleIncoming(strategy: TypeIncomingStrategy, slotSeconds: number): ReturnType<typeof typeIncomingTimeline> {
  return typeIncomingTimeline({
    strategy,
    slotSeconds,
    ownershipFlipLocal: 0.58,
    typeAGoneLocal: 0.72,
  });
}

function incomingTables(): ReturnType<typeof typeIncomingTimeline>[] {
  const slots = [1.2, 2.0, 2.8, 4.0];
  const rows: ReturnType<typeof typeIncomingTimeline>[] = [];
  for (const slot of slots) {
    for (const strategy of TYPE_INCOMING_STRATEGIES) rows.push(sampleIncoming(strategy, slot));
  }
  rows.push(sampleIncoming(incoming, 0.8));
  return rows;
}

function formatTables(rows: ReturnType<typeof typeIncomingTimeline>[]): string {
  return [
    "STRATEGY            SLOT   A-LAST   B-FIRST  OWN   FLICK-START  FLICK-PEAK  GAP-F  GAP-MS",
    ...rows.map((r) =>
      [
        r.strategy.padEnd(18),
        r.slotSeconds.toFixed(1).padStart(5),
        (r.typeALastLocal ?? -1).toFixed(2).padStart(7),
        (r.typeBFirstLocal ?? -1).toFixed(2).padStart(8),
        (r.ownershipFlipLocal ?? -1).toFixed(2).padStart(5),
        (r.flickerStartLocal ?? -1).toFixed(2).padStart(12),
        r.flickerPeakLocal.toFixed(2).padStart(11),
        r.emptyGapFrames.toFixed(1).padStart(6),
        Math.round(r.emptyGapSec * 1000).toString().padStart(7),
      ].join(" "),
    ),
  ].join("\n");
}

async function runProof(): Promise<string> {
  const tex = await textureProof();
  const tables = incomingTables();
  const profile = renderer.lastProfile;
  const info = renderer.mediaInfo();
  const text = [
    "TEXTURE PIXEL PROOF  (ON vs OFF mean-abs + high-frequency)",
    ...Object.entries(tex).map(([k, v]) =>
      `${k.padEnd(8)} mad=${v.mad.toFixed(2)}  hfOn=${v.onHf.toFixed(2)}  hfOff=${v.offHf.toFixed(2)}  ${v.mad > 0.4 ? "PASS" : "FAIL"}`,
    ),
    "",
    formatTables(tables),
    "",
    `profile total=${profile?.totalMs.toFixed(1) ?? "?"} texture=${profile?.textureMs.toFixed(1) ?? "?"} prep=${profile?.printPrepMs.toFixed(1) ?? "?"} typeBloom=${lastTypeBloomPaintMs.toFixed(1)} paintTex=${lastIdentityTextureMs.toFixed(1)}`,
    `ownership ${info.ownership} copy ${info.ownershipCopyIndex} contrib ${info.ownershipContribution.toFixed(2)}`,
    `typePaint A=${lastSequenceTypePaint.paintedA} B=${lastSequenceTypePaint.paintedB} in=${lastSequenceTypePaint.incoming} ${lastSequenceTypePaint.strategy}`,
  ].join("\n");
  proofEl.textContent = text;
  return text;
}

function tickHud(): void {
  const info = renderer.getSequenceTiming();
  const flick = renderer.lastTransitionDiagnostics;
  const v = renderer.mediaInfo();
  const profile = renderer.lastProfile;
  hud.textContent = [
    `phase ${renderer.getLoopPhase().toFixed(3)}`,
    `slot ${info.index}`,
    `local ${info.localPhase.toFixed(2)}`,
    `own ${v.ownership}`,
    `tex ${textureOn ? "ON" : "OFF"}`,
    `in ${incoming}`,
    `flick ${((flick?.envelope ?? 0) * 100).toFixed(0)}`,
    `A/B ${lastSequenceTypePaint.paintedA ? "A" : "-"}${lastSequenceTypePaint.paintedB ? "B" : "-"}`,
    v.A?.kind === "video" ? `vid ${Number(v.A.currentTime ?? 0).toFixed(2)}` : "",
    profile ? `${profile.totalMs.toFixed(1)}ms` : "",
    loopsLeft ? `loops ${loopsLeft}` : "",
    exportStatus,
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
    __finalUnity: {
      renderer,
      bind,
      buildMedia,
      texture: () => textureOn,
      setTexture(on: boolean) {
        textureOn = on;
        bind();
        redrawBars();
      },
      incoming: () => incoming,
      setIncoming(next: TypeIncomingStrategy) {
        incoming = next;
        bind();
        redrawBars();
      },
      setFlicker(on: boolean) {
        flickerOn = on;
        bind();
        redrawBars();
      },
      setAspect(next: "4:5" | "9:16") {
        aspect = next;
        const dim = size();
        renderer.resizeExact(dim.w, dim.h);
        bind();
        redrawBars();
      },
      setRhythm(next: string) {
        rhythm = next;
        applyRhythm();
        bind();
      },
      setMedia(next: "stills" | "mixed") {
        mediaKind = next;
        return buildMedia().then(redrawBars);
      },
      hold(phase: number) {
        holdAt(phase);
      },
      play() {
        cut = "auto";
        applyCut();
        redrawBars();
      },
      exportCurrent,
      textureProof,
      incomingTables,
      runProof,
      hud: () => ({
        phase: renderer.getLoopPhase(),
        timing: renderer.getSequenceTiming(),
        flick: renderer.lastTransitionDiagnostics,
        type: lastSequenceTypePaint,
        media: renderer.mediaInfo(),
        profile: renderer.lastProfile,
        mark: renderer.lastMarkDiagnostics,
      }),
    },
  });
});
