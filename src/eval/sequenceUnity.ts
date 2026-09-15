import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { wrapCanvasAsPlaceholder, defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { clampTypeState } from "../core/typeState";
import { loadSwitzer } from "../core/typeFont";
import {
  bindEvalSequenceWeights,
  clampSequenceWeights,
  equalSequenceWeights,
  resolveSequenceTiming,
} from "../core/sequenceRhythm";
import {
  bindEvalSequenceType,
  sequenceTypeCopyIndex,
  sequenceTypeDraw,
  sequenceTypeEnvelope,
  setEvalSequenceType,
  sharedSequenceTypeStyle,
} from "../core/sequenceType";
import {
  bindEvalSequenceUnity,
  connectionUsesFlicker,
  sequenceTypeConnectionDraw,
  setEvalSequenceUnity,
  typeBloomPresence,
  type FlickerWrapMode,
  type TypeConnectionMode,
} from "../core/sequenceTypeConnection";
import {
  transitionFlickerEnvelope,
  transitionFlickerHalfSpan,
  transitionPairCuts,
} from "../core/transitionFlicker";
import { mountUnityReview } from "./sequenceUnityLive";

const W = 288;
const H = 360;
const LOOP = 12;
const SCENES = ["portrait", "texture", "contrast", "edge", "warm", "cool", "grain", "flat"];
const EDITORIAL_COPY = [
  "MADE FOR\nMOVEMENT",
  "BETWEEN\nSTATES",
  "RHYTHM CHANGES\nEVERYTHING",
  "AGAIN",
  "BACK TO THE\nBEGINNING",
];
const COPY_SETS: Record<string, string[]> = {
  editorial: EDITORIAL_COPY,
  short: ["MOVE", "HOLD", "AGAIN", "NOW", "BACK"],
  long: ["Motion starts here", "Made for movement across a longer line", "Rhythm changes everything we thought we knew", "Again", "Back to the beginning"],
  blank: ["MADE FOR\nMOVEMENT", "", "RHYTHM CHANGES\nEVERYTHING", "AGAIN", ""],
};

function hashPixels(img: ImageData): string {
  let h = 2166136261;
  const d = img.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function bloomParams(): ParamValues {
  const found = presetsForTreatment("clean").find((p) => p.label === "Expressive");
  if (!found) throw new Error("Missing Bloom Expressive");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...found.values,
    resolveLimit: 100,
  };
}

function paintScene(kind: string, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const fills: Record<string, [string, string]> = {
    portrait: ["#2a1810", "#8a5a3a"],
    texture: ["#3a3028", "#6a5848"],
    contrast: ["#0c0c0e", "#f3efe6"],
    edge: ["#1c1410", "#c8a070"],
    warm: ["#4a2010", "#c87840"],
    cool: ["#102028", "#3a6078"],
    grain: ["#2a2420", "#5a5048"],
    flat: ["#6a6660", "#9a9690"],
  };
  const [a, b] = fills[kind] ?? ["#333", "#888"];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(w * 0.15, h * 0.2, w * 0.3, h * 0.25);
  return c;
}

function paintClock(canvas: HTMLCanvasElement, time: number, duration: number, label: string): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#141820";
  ctx.fillRect(0, 0, w, h);
  const t = Number.isFinite(time) ? time : 0;
  const held = duration > 0 && t >= duration - 1 / 60;
  ctx.fillStyle = held ? "#5a4030" : "#2a4058";
  ctx.fillRect(0, 0, w * Math.min(1, duration > 0 ? t / duration : 0), h);
  ctx.fillStyle = "#f3efe6";
  ctx.font = `${Math.round(h * 0.08)}px sans-serif`;
  ctx.fillText(label, 24, h * 0.28);
  ctx.font = `${Math.round(h * 0.12)}px sans-serif`;
  ctx.fillText(`${t.toFixed(2)}s`, 24, h * 0.48);
  ctx.font = `${Math.round(h * 0.05)}px sans-serif`;
  ctx.fillStyle = "#aaa";
  ctx.fillText(held ? `HOLD LAST  /  clip ${duration.toFixed(1)}s` : `CLIP ${duration.toFixed(1)}s`, 24, h * 0.62);
}

function makeClockAsset(label: string, duration: number): MediaAsset {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 800;
  const clock = {
    duration,
    currentTime: 0,
    paused: true,
    readyState: 4,
    play() {
      clock.paused = false;
      return Promise.resolve();
    },
    pause() {
      clock.paused = true;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  paintClock(canvas, 0, duration, label);
  return {
    kind: "video",
    source: canvas,
    naturalW: 640,
    naturalH: 800,
    label,
    videoEl: clock as unknown as HTMLVideoElement,
    transform: defaultTransform(),
  };
}

function refreshClockAssets(renderer: Renderer): void {
  for (const item of renderer.getSequence()) {
    if (item.asset.kind !== "video") continue;
    const canvas = item.asset.source;
    if (!(canvas instanceof HTMLCanvasElement)) continue;
    paintClock(canvas, item.asset.videoEl?.currentTime ?? 0, item.asset.videoEl?.duration ?? 0, item.asset.label);
  }
}

function copiesFor(n: number, set: string[]): string[] {
  return Array.from({ length: n }, (_, i) => set[i] ?? `SLOT ${String(i + 1).padStart(2, "0")}`);
}

export interface SequenceUnityReport {
  flickerHidesSwap: boolean;
  flickerHasNoCrop: boolean;
  bloomHoldIsClean: boolean;
  wrapFiresWhenIncluded: boolean;
  wrapSilentWhenCurrent: boolean;
  previewExportMatch: boolean;
  videoStartsWithType: boolean;
  weightedCuts: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

function makeRenderer(
  host: HTMLElement,
  count: number,
  opts: {
    weights?: number[];
    connection: TypeConnectionMode;
    flickerWrap: FlickerWrapMode;
    mixed?: boolean;
    copies?: string[];
    loopSeconds?: number;
  },
): Renderer {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W, H);
  renderer.setLoopSeconds(opts.loopSeconds ?? LOOP);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(60);
  renderer.setBehavior(bloomBehavior, bloomParams());
  const items = [];
  for (let i = 0; i < count; i++) {
    const clock = opts.mixed && (i === 1 || i === count - 1);
    const asset = clock
      ? makeClockAsset(String(i + 1).padStart(2, "0"), i === 1 ? 1.2 : 6)
      : wrapCanvasAsPlaceholder(paintScene(SCENES[i] ?? "portrait", 640, 800), String(i + 1).padStart(2, "0"));
    items.push({ id: renderer.nextSourceId(), asset });
  }
  renderer.setSequence(items, undefined);
  const weights = clampSequenceWeights(opts.weights ?? equalSequenceWeights(count), count);
  bindEvalSequenceWeights(renderer, weights);
  const copies = copiesFor(count, opts.copies ?? COPY_SETS.editorial!);
  const typeBind = {
    copies,
    motion: "connected" as const,
    arrival: "soft-crop" as const,
    connection: opts.connection,
  };
  bindEvalSequenceType(renderer, typeBind);
  setEvalSequenceType(typeBind);
  const unity = { connection: opts.connection, flickerWrap: opts.flickerWrap };
  bindEvalSequenceUnity(renderer, unity);
  setEvalSequenceUnity(unity);
  renderer.setTypeState(clampTypeState({
    ...sharedSequenceTypeStyle(),
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: copies,
  }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setTransitionFlickerEnabled(connectionUsesFlicker(opts.connection));
  renderer.setClockMode("hold");
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  refreshClockAssets(renderer);
  for (let i = 0; i < 4; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function mountLive(root: HTMLElement): void {
  mountUnityReview(root);
}

export async function runSequenceUnitySheet(root: HTMLElement): Promise<SequenceUnityReport> {
  const t0 = performance.now();
  await loadSwitzer();
  root.innerHTML = "";
  const hidden = document.createElement("div");
  hidden.style.display = "none";
  root.appendChild(hidden);
  mountLive(root);

  const flickerDraw = sequenceTypeConnectionDraw(
    sequenceTypeEnvelope(0.9, 3),
    "flicker",
    H,
  );
  const softDraw = sequenceTypeDraw(
    sequenceTypeEnvelope(0.9, 3),
    "connected",
    H,
    "soft-crop",
  );
  const flickerHasNoCrop = flickerDraw.cropT === 0 && flickerDraw.cropB === 0 && flickerDraw.opacity === 1;
  const softStillCrops = softDraw.cropT > 0.2;

  const bloomHold = typeBloomPresence(0.4, "bloom");
  const bloomArrive = typeBloomPresence(0.05, "bloom");
  const bloomHoldIsClean = bloomHold.stage === "hold" && bloomHold.presence === 1 && bloomArrive.presence < 0.6;

  const wrapOn = transitionFlickerEnvelope(0.998, 4, LOOP, [1, 1, 1, 1], true);
  const wrapOff = transitionFlickerEnvelope(0.998, 4, LOOP, [1, 1, 1, 1], false);
  const wrapFiresWhenIncluded = wrapOn.envelope > 0.4 && wrapOn.cut === 0;
  const wrapSilentWhenCurrent = wrapOff.envelope <= 0.02;

  const punchCuts = transitionPairCuts(4, [1, 1, 1, 6], true);
  const weightedCuts = punchCuts[0] === 0 && Math.abs((punchCuts[3] ?? 0) - 1 / 3) < 1e-9;

  const flicker = makeRenderer(hidden, 4, { connection: "flicker", flickerWrap: "include-wrap", weights: [1, 1, 1, 1] });
  const half = transitionFlickerHalfSpan(LOOP);
  flicker.setHoldPhase(0.25 - half * 0.4);
  const before = hashPixels(settle(flicker));
  flicker.setHoldPhase(0.25 + half * 0.4);
  const after = hashPixels(settle(flicker));
  flicker.setHoldPhase(0.25);
  const peak = hashPixels(settle(flicker));
  const flickerHidesSwap = before !== after && peak !== before && peak !== after;

  const mixed = makeRenderer(hidden, 4, {
    connection: "flicker",
    flickerWrap: "include-wrap",
    mixed: true,
    weights: [2, 1, 2, 1],
  });
  mixed.setHoldPhase(resolveSequenceTiming(0.2, [2, 1, 2, 1], LOOP).startPhase);
  const videoEntry = settle(mixed);
  const videoStartsWithType = hashPixels(videoEntry).length === 8;

  const parityAt = async (phase: number): Promise<boolean> => {
    mixed.setHoldPhase(phase);
    const prev = hashPixels(settle(mixed));
    mixed.beginExport(W, H);
    await mixed.renderExportFrame(phase * LOOP, { graphicTime: mixed.getGraphicElapsed() });
    const exp = hashPixels(mixed.getVisibleImageData());
    mixed.endExport();
    mixed.resizeExact(W, H);
    return prev === exp;
  };
  const previewExportHold = await parityAt(0.25);
  const previewExportArrive = await parityAt(0.01);
  const previewExportWrap = await parityAt(0.998);
  const previewExportMatch = previewExportHold && previewExportArrive && previewExportWrap;

  const early = sequenceTypeCopyIndex(0, 4, 0.25 - half * 0.2, 0.25, 1, "early", half);
  const late = sequenceTypeCopyIndex(1, 4, 0.25 + half * 0.2, 0.25, 1, "late", half);
  const centre = sequenceTypeCopyIndex(1, 4, 0.25 + half * 0.2, 0.25, 1, "centre", half);

  const costs: Record<string, { hold: number; cut: number; typeHold: number; typeCut: number }> = {};
  for (const mode of ["soft", "flicker", "bloom", "bloom-flicker"] as const) {
    const r = makeRenderer(hidden, 4, { connection: mode, flickerWrap: "include-wrap" });
    r.setProfiling(true);
    r.setHoldPhase(0.4);
    settle(r);
    const holdProf = r.lastProfile;
    r.setHoldPhase(0.25);
    settle(r);
    const cutProf = r.lastProfile;
    costs[mode] = {
      hold: holdProf?.totalMs ?? 0,
      cut: cutProf?.totalMs ?? 0,
      typeHold: holdProf?.typeMs ?? 0,
      typeCut: cutProf?.typeMs ?? 0,
    };
  }

  return {
    flickerHidesSwap,
    flickerHasNoCrop: flickerHasNoCrop && softStillCrops,
    bloomHoldIsClean,
    wrapFiresWhenIncluded,
    wrapSilentWhenCurrent,
    previewExportMatch,
    videoStartsWithType,
    weightedCuts,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      wrapOn,
      wrapOff,
      punchCuts,
      bloomHold,
      bloomArrive,
      flickerDraw,
      softDraw,
      half,
      swap: { early, late, centre },
      costs,
      previewExportHold,
      previewExportArrive,
      previewExportWrap,
    },
  };
}
