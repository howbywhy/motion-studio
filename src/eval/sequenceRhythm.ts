import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { wrapCanvasAsPlaceholder, defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { clampTypeState } from "../core/typeState";
import { loadSwitzer } from "../core/typeFont";
import { resolveActivePair } from "../core/sequence";
import {
  applySequenceWeightChange,
  bindEvalSequenceWeights,
  clampSequenceWeights,
  equalSequenceWeights,
  minSlotSeconds,
  resetSequenceWeights,
  resolveSequenceTiming,
  sequenceSpans,
  sequenceVideoTime,
  SEQUENCE_SLOT_MIN_SECONDS,
  SEQUENCE_TYPE_READABILITY_SECONDS,
  transitionCutsFromWeights,
  weightedPairMapping,
} from "../core/sequenceRhythm";
import { sequenceTypeEnvelope, sharedSequenceTypeStyle } from "../core/sequenceType";
import { transitionPairCuts } from "../core/transitionFlicker";
import { variantIdForPair } from "../core/bloomPairVariant";
import { buildSequenceRhythmStrip } from "../ui/sequenceRhythmStrip";

const W = 288;
const H = 360;
const LOOP = 12;
const SCENES = ["portrait", "texture", "contrast", "edge", "warm", "cool", "grain", "flat"];

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

function note(root: HTMLElement, text: string): void {
  const p = document.createElement("p");
  p.textContent = text;
  root.appendChild(p);
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
  };
  const videoEl = clock as unknown as HTMLVideoElement;
  paintClock(canvas, 0, duration, label);
  return {
    kind: "video",
    source: canvas,
    naturalW: 640,
    naturalH: 800,
    label,
    videoEl,
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

function sequenceCopies(n: number): string[] {
  const words = ["MOVE", "Made for movement", "Rhythm changes\neverything", "HOLD", "Again", "Return", "Quiet", "Now"];
  return Array.from({ length: n }, (_, i) => words[i] ?? `SLOT ${String(i + 1).padStart(2, "0")}`);
}

const PRESETS: Record<string, number[]> = {
  even: [1, 1, 1, 1],
  build: [1, 2, 3, 5],
  punch: [1, 1, 1, 6],
  longshort: [4, 1, 4, 1],
};

function makeRenderer(
  host: HTMLElement,
  count: number,
  opts?: { mixed?: boolean; weights?: number[] },
): Renderer {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W, H);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(60);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams());
  const items = [];
  for (let i = 0; i < count; i++) {
    const clock = opts?.mixed && (i === 1 || i === 3);
    const asset = clock
      ? makeClockAsset(String(i + 1).padStart(2, "0"), i === 1 ? 1.2 : 8)
      : wrapCanvasAsPlaceholder(paintScene(SCENES[i] ?? "portrait", 640, 800), String(i + 1).padStart(2, "0"));
    items.push({ id: renderer.nextSourceId(), asset });
  }
  renderer.setSequence(items, undefined);
  const weights = clampSequenceWeights(opts?.weights ?? equalSequenceWeights(count), count);
  bindEvalSequenceWeights(renderer, weights);
  renderer.setTypeState(clampTypeState({
    ...sharedSequenceTypeStyle(),
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: sequenceCopies(count),
  }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setTransitionFlickerEnabled(false);
  renderer.setClockMode("hold");
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  refreshClockAssets(renderer);
  for (let i = 0; i < 4; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

export interface SequenceRhythmReport {
  equalMatchesLegacy: boolean;
  weightedMovesBoundary: boolean;
  wrapUsesLastSlot: boolean;
  flickerFollowsWeights: boolean;
  videoHoldsLastFrame: boolean;
  videoRestartsOnWrap: boolean;
  bloomVariantIgnoresDuration: boolean;
  previewExportMatch: boolean;
  addRemoveKeepsRhythm: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

function addBar(parent: HTMLElement, label: string): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "bar";
  const tag = document.createElement("span");
  tag.textContent = label;
  bar.appendChild(tag);
  parent.appendChild(bar);
  return bar;
}

function addBtn(bar: HTMLElement, text: string, onClick: () => void): void {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  bar.appendChild(b);
}

function mountLive(root: HTMLElement): void {
  const box = document.createElement("section");
  box.className = "live";
  const h = document.createElement("h2");
  h.textContent = "Live instrument — weighted sequence rhythm";
  box.appendChild(h);
  note(box, "Eval only. Drag the seams to change duration. Internal tile drag reorders the authored state (media + time + copy). External file drop replaces media only.");

  const stage = document.createElement("div");
  stage.className = "stage";
  const canvas = document.createElement("canvas");
  stage.appendChild(canvas);
  box.appendChild(stage);

  const stripHost = document.createElement("div");
  stripHost.className = "strip-host";
  box.appendChild(stripHost);

  const hud = document.createElement("pre");
  hud.className = "hud";
  box.appendChild(hud);

  const typeSlots = document.createElement("div");
  typeSlots.className = "type-slots";
  box.appendChild(typeSlots);

  const renderer = new Renderer(canvas);
  let count = 4;
  let loopSeconds = LOOP;
  let weights = equalSequenceWeights(count);
  let mixed = false;
  let flicker = false;

  const wire = (): void => {
    renderer.pause();
    renderer.resizeExact(360, 450);
    renderer.setLoopSeconds(loopSeconds);
    renderer.setPlaybackMode("loop");
    renderer.setRegistrationEnabled(true);
    renderer.setRegistrationAmount(60);
    renderer.setBehavior(bloomBehavior, bloomParams());
    const items = [];
    for (let i = 0; i < count; i++) {
      const clock = mixed && (i === 1 || i === count - 1);
      const asset = clock
        ? makeClockAsset(String(i + 1).padStart(2, "0"), i === 1 ? 1.2 : 6)
        : wrapCanvasAsPlaceholder(paintScene(SCENES[i] ?? "portrait", 640, 800), String(i + 1).padStart(2, "0"));
      items.push({ id: renderer.nextSourceId(), asset });
    }
    renderer.setSequence(items, undefined);
    weights = clampSequenceWeights(weights, count);
    bindEvalSequenceWeights(renderer, weights);
    renderer.setTypeState(clampTypeState({
      ...sharedSequenceTypeStyle(),
      enabled: true,
      typeMode: "sequence",
      sequenceCopies: sequenceCopies(count),
    }));
    renderer.setTransitionFlickerEnabled(flicker);
    renderer.setClockMode("auto");
    renderer.play();
  };

  const strip = buildSequenceRhythmStrip(stripHost, {
    getItems: () => renderer.getSequence(),
    getWeights: () => weights,
    getSelectedId: () => renderer.getSelectedId(),
    getActiveIndex: () => renderer.getSequenceTiming().index,
    getLoopSeconds: () => loopSeconds,
    onSelect: (id) => {
      renderer.selectItem(id);
      strip.syncMarks();
    },
    onAdd: () => {
      count = Math.min(8, count + 1);
      weights = applySequenceWeightChange(weights, count, { kind: "add" });
      wire();
      strip.refresh();
    },
    onReorder: (from, to) => {
      renderer.moveSource(from, to);
      strip.refresh();
    },
    onWeights: (next) => {
      weights = next;
      bindEvalSequenceWeights(renderer, weights);
      strip.layout();
      renderer.renderFrame();
    },
    onResetTiming: () => {
      weights = resetSequenceWeights(count);
      bindEvalSequenceWeights(renderer, weights);
      strip.refresh();
    },
  });

  const rhythm = addBar(box, "RHYTHM");
  for (const [name, preset] of Object.entries(PRESETS)) {
    addBtn(rhythm, name.toUpperCase(), () => {
      count = preset.length;
      weights = preset.slice();
      wire();
      strip.refresh();
    });
  }
  addBtn(rhythm, "RESET TIMING", () => {
    weights = resetSequenceWeights(count);
    bindEvalSequenceWeights(renderer, weights);
    strip.refresh();
  });

  const countBar = addBar(box, "SLOTS");
  for (const n of [2, 3, 4, 5, 6, 8]) {
    addBtn(countBar, String(n), () => {
      count = n;
      weights = applySequenceWeightChange(weights, count, { kind: "resize" });
      wire();
      strip.refresh();
    });
  }

  const dur = addBar(box, "DURATION");
  addBtn(dur, "8s", () => {
    loopSeconds = 8;
    renderer.setLoopSeconds(8);
    strip.refresh();
  });
  addBtn(dur, "12s", () => {
    loopSeconds = 12;
    renderer.setLoopSeconds(12);
    strip.refresh();
  });

  const media = addBar(box, "MEDIA");
  addBtn(media, "STILLS", () => {
    mixed = false;
    wire();
    strip.refresh();
  });
  addBtn(media, "MIXED VIDEO", () => {
    mixed = true;
    wire();
    strip.refresh();
  });
  addBtn(media, "FLICKER", () => {
    flicker = !flicker;
    renderer.setTransitionFlickerEnabled(flicker);
  });

  const hold = addBar(box, "CLOCK");
  addBtn(hold, "AUTO", () => renderer.setClockMode("auto"));
  addBtn(hold, "HOLD 0.18", () => {
    renderer.setClockMode("hold");
    renderer.setHoldPhase(0.18);
  });
  addBtn(hold, "HOLD 0.50", () => {
    renderer.setClockMode("hold");
    renderer.setHoldPhase(0.5);
  });
  addBtn(hold, "WRAP 0.99", () => {
    renderer.setClockMode("hold");
    renderer.setHoldPhase(0.99);
  });

  renderer.onFrame = () => {
    refreshClockAssets(renderer);
    const timing = renderer.getSequenceTiming();
    const pair = renderer.getActivePair();
    const item = renderer.getSequence()[timing.index];
    const videoDur = item?.asset.videoEl?.duration ?? 0;
    const videoTime = item?.asset.kind === "video"
      ? sequenceVideoTime(timing.localPhase, timing.durationSeconds, videoDur)
      : 0;
    const typeEnv = sequenceTypeEnvelope(timing.localPhase, timing.durationSeconds);
    hud.textContent = [
      `MASTER ${renderer.getLoopPhase().toFixed(3)}    ${loopSeconds}s    ${count} slots    flicker ${flicker ? "ON" : "off"}`,
      ``,
      `SLOT ${String(timing.index + 1).padStart(2, "0")}`,
      `START ${timing.startPhase.toFixed(2)}`,
      `END ${timing.endPhase.toFixed(2)}`,
      `LOCAL ${timing.localPhase.toFixed(2)}`,
      ``,
      `SLOT DURATION ${timing.durationSeconds.toFixed(2)}s`,
      `VIDEO TIME ${item?.asset.kind === "video" ? `${videoTime.toFixed(2)}s` : "—"}`,
      `TYPE ${typeEnv.stage}  bloom ${variantIdForPair(pair.pairIndex, pair.pairCount)}  pair ${pair.pairIndex}`,
    ].join("\n");
    const copies = sequenceCopies(count);
    if (typeSlots.childElementCount !== count) {
      typeSlots.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const row = document.createElement("div");
        row.className = "type-slot";
        row.textContent = `${String(i + 1).padStart(2, "0")}  ${copies[i]!.replace(/\n/g, " / ")}`;
        typeSlots.appendChild(row);
      }
    }
    typeSlots.querySelectorAll(".type-slot").forEach((row, i) => {
      row.classList.toggle("is-active", i === timing.index);
    });
    strip.syncMarks();
  };

  wire();
  strip.refresh();
  root.appendChild(box);
}

export async function runSequenceRhythmSheet(root: HTMLElement): Promise<SequenceRhythmReport> {
  const t0 = performance.now();
  await loadSwitzer();
  root.innerHTML = "";
  const hidden = document.createElement("div");
  hidden.style.display = "none";
  root.appendChild(hidden);

  note(root, "QA only. Product remains equal slots. Weighted timing is additive: missing weights = [1,1,1,…].");
  mountLive(root);

  const mins = [
    ["slots", "8s min", "12s min", "equal 8s", "equal 12s"],
    ...[2, 4, 5, 8].map((n) => [
      String(n),
      minSlotSeconds(8, n).toFixed(2),
      minSlotSeconds(12, n).toFixed(2),
      (8 / n).toFixed(2),
      (12 / n).toFixed(2),
    ]),
  ];
  const minBox = document.createElement("pre");
  minBox.className = "sheet";
  minBox.textContent = [
    `Technical minimum ${SEQUENCE_SLOT_MIN_SECONDS}s, floored by 40% of an equal share when the loop is already tight.`,
    `Practical visual minimum is about 1s — narrower than that the thumb reads as a sliver.`,
    `Sequence Type readability ${SEQUENCE_TYPE_READABILITY_SECONDS}s (8s/5 = 1.6s). Not clamped.`,
    mins.map((r) => r.join("\t")).join("\n"),
  ].join("\n");
  root.appendChild(minBox);

  const equal = makeRenderer(hidden, 4, { weights: [1, 1, 1, 1] });
  const legacy = makeRenderer(hidden, 4);
  bindEvalSequenceWeights(legacy, null);
  let equalMatchesLegacy = true;
  for (const p of [0, 0.12, 0.25, 0.49, 0.5, 0.75, 0.99]) {
    equal.setHoldPhase(p);
    legacy.setHoldPhase(p);
    if (hashPixels(settle(equal)) !== hashPixels(settle(legacy))) equalMatchesLegacy = false;
    const a = weightedPairMapping(4, p, "loop", [1, 1, 1, 1], LOOP);
    const b = resolveActivePair(4, p, "loop");
    if (a.pairIndex !== b.pairIndex || Math.abs(a.localPhase - b.localPhase) > 1e-9) equalMatchesLegacy = false;
  }

  const punch = [1, 1, 1, 6];
  const evenCut = resolveSequenceTiming(0.5, [1, 1, 1, 1], LOOP);
  const punchCut = resolveSequenceTiming(0.5, punch, LOOP);
  const weightedMovesBoundary = evenCut.index !== punchCut.index || Math.abs(evenCut.localPhase - punchCut.localPhase) > 0.05;

  const wrap = resolveSequenceTiming(0.995, punch, LOOP);
  const wrapUsesLastSlot = wrap.index === 3 && wrap.localPhase > 0.9;

  const equalCuts = transitionPairCuts(4).map((n) => n.toFixed(6)).join(",");
  const uniformCuts = transitionPairCuts(4, [2, 2, 2, 2]).map((n) => n.toFixed(6)).join(",");
  const punchCuts = transitionCutsFromWeights(punch);
  const flickerFollowsWeights =
    equalCuts === uniformCuts &&
    punchCuts.length === 3 &&
    Math.abs(punchCuts[2]! - sequenceSpans(punch)[2]!.end) < 1e-9 &&
    punchCuts[2]! !== 0.75;

  const holdLast = sequenceVideoTime(1, 4, 1.2);
  const playMid = sequenceVideoTime(0.25, 4, 1.2);
  const longSlot = sequenceVideoTime(1, 2, 8);
  const videoHoldsLastFrame = holdLast >= 1.2 - 1 / 60 && playMid === 1 && Math.abs(longSlot - 2) < 1e-9;
  const wrapVideo = sequenceVideoTime(0, 3, 8);
  const videoRestartsOnWrap = wrapVideo === 0;

  const bloomVariantIgnoresDuration =
    variantIdForPair(1, 4) === variantIdForPair(1, 4) &&
    variantIdForPair(0, 4) !== variantIdForPair(1, 4);

  const mixed = makeRenderer(hidden, 4, { mixed: true, weights: [2, 1, 2, 1] });
  mixed.setHoldPhase(0.2);
  const holdHash = hashPixels(settle(mixed));
  mixed.beginExport(W, H);
  await mixed.renderExportFrame(0.2 * LOOP, { graphicTime: mixed.getGraphicElapsed() });
  const expHash = hashPixels(mixed.getVisibleImageData());
  mixed.endExport();
  mixed.resizeExact(W, H);
  const previewExportMatch = holdHash === expHash;

  const added = applySequenceWeightChange([1, 2, 1], 4, { kind: "add" });
  const removed = applySequenceWeightChange([1, 2, 3, 4], 3, { kind: "remove", index: 1 });
  const addRemoveKeepsRhythm =
    added.length === 4 &&
    added[0] === 1 &&
    added[1] === 2 &&
    removed.join(",") === "1,3,4";

  return {
    equalMatchesLegacy,
    weightedMovesBoundary,
    wrapUsesLastSlot,
    flickerFollowsWeights,
    videoHoldsLastFrame,
    videoRestartsOnWrap,
    bloomVariantIgnoresDuration,
    previewExportMatch,
    addRemoveKeepsRhythm,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      mins: { "12/4": minSlotSeconds(12, 4), "8/5": minSlotSeconds(8, 5), "8/8": minSlotSeconds(8, 8) },
      readability: SEQUENCE_TYPE_READABILITY_SECONDS,
      punchCuts,
      evenCut,
      punchCut,
      wrap,
      video: { holdLast, playMid, longSlot, wrapVideo },
      added,
      removed,
    },
  };
}
