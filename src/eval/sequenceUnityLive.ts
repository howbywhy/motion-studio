import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { wrapCanvasAsPlaceholder, defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { clampTypeState, cloneTypeState } from "../core/typeState";
import {
  applySequenceWeightChange,
  bindEvalSequenceWeights,
  clampSequenceWeights,
  resetSequenceWeights,
  sequenceVideoTime,
  setEvalSequenceWeights,
} from "../core/sequenceRhythm";
import {
  bindEvalSequenceType,
  sequenceTypeCopyForPair,
  sequenceTypeEnvelope,
  setEvalSequenceType,
  sharedSequenceTypeStyle,
} from "../core/sequenceType";
import {
  bindEvalSequenceUnity,
  connectionUsesBloom,
  connectionUsesFlicker,
  setEvalSequenceUnity,
  typeBloomPresence,
  TYPE_CONNECTION_MODES,
  type FlickerSwap,
  type FlickerWrapMode,
  type TypeConnectionMode,
} from "../core/sequenceTypeConnection";
import { flickerComparePhases, transitionFlickerHalfSpan } from "../core/transitionFlicker";
import { variantIdForPair } from "../core/bloomPairVariant";
import { buildSequenceRhythmStrip } from "../ui/sequenceRhythmStrip";
import { loadMediaFile } from "../ui/mediaInput";
import { buildTypePanel } from "../ui/typePanel";
import { runExport } from "../core/exportSession";

const LOOP = 12;
const SCENES = ["flat", "cool", "contrast", "warm", "portrait", "texture", "edge", "grain"];
const PRESETS: Record<string, number[]> = {
  even: [1, 1, 1, 1],
  build: [1, 2, 3, 5],
  punch: [1, 1, 1, 6],
  longshort: [4, 1, 4, 1],
  editorial: [2, 1, 3, 2, 3],
};
const EDITORIAL_COPY = [
  "MADE FOR\nMOVEMENT",
  "BETWEEN\nSTATES",
  "RHYTHM CHANGES\nEVERYTHING",
  "AGAIN",
  "BACK TO THE\nBEGINNING",
];
const EDITORIAL_WEIGHTS = [2, 1, 3, 2, 3];
const TWO_SOURCE_COPY = ["MADE FOR\nMOVEMENT", "BACK TO THE\nBEGINNING"];

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
    flat: ["#7a7468", "#4a443c"],
  };
  const [a, b] = fills[kind] ?? ["#333", "#888"];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(w * 0.12, h * 0.18, w * 0.28, h * 0.22);
  return c;
}

function paintClock(canvas: HTMLCanvasElement, time: number, duration: number, label: string): void {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#141820";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const t = Number.isFinite(time) ? time : 0;
  const held = duration > 0 && t >= duration - 1 / 60;
  ctx.fillStyle = held ? "#5a4030" : "#2a4058";
  ctx.fillRect(0, 0, canvas.width * Math.min(1, duration > 0 ? t / duration : 0), canvas.height);
  ctx.fillStyle = "#f3efe6";
  ctx.font = "28px sans-serif";
  ctx.fillText(`${label}  ${t.toFixed(2)}s`, 24, canvas.height * 0.4);
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

function addBar(parent: HTMLElement, label: string): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "bar";
  const tag = document.createElement("span");
  tag.textContent = label;
  bar.appendChild(tag);
  parent.appendChild(bar);
  return bar;
}

function addBtn(bar: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  bar.appendChild(b);
  return b;
}

function markOn(bar: HTMLElement, value: string): void {
  bar.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b.textContent === value));
}

function wrap01(phase: number): number {
  let t = phase % 1;
  if (t < 0) t += 1;
  return t;
}

function connectionLabel(mode: TypeConnectionMode): string {
  return mode.toUpperCase().replace("-", " + ");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function mountUnityReview(root: HTMLElement): Renderer {
  const box = document.createElement("section");
  box.className = "live";
  const h = document.createElement("h2");
  h.textContent = "Watch the piece";
  box.appendChild(h);
  const brief = document.createElement("p");
  brief.textContent = "Judge whether image, video, Bloom, Type, Flicker and rhythm feel like one event. A/B switches treatment without restarting.";
  box.appendChild(brief);

  const stage = document.createElement("div");
  stage.className = "stage";
  const canvas = document.createElement("canvas");
  stage.appendChild(canvas);
  box.appendChild(stage);

  const stripHost = document.createElement("div");
  stripHost.className = "strip-host";
  box.appendChild(stripHost);

  const controls = document.createElement("div");
  controls.className = "review-controls";
  box.appendChild(controls);

  const typeHost = document.createElement("div");
  typeHost.className = "type-host";
  box.appendChild(typeHost);

  const exportStatus = document.createElement("p");
  exportStatus.className = "export-status";
  box.appendChild(exportStatus);

  const qa = document.createElement("details");
  qa.className = "qa";
  const qaSum = document.createElement("summary");
  qaSum.textContent = "QA diagnostics";
  qa.appendChild(qaSum);
  const hud = document.createElement("pre");
  hud.className = "hud";
  qa.appendChild(hud);
  box.appendChild(qa);

  const renderer = new Renderer(canvas);
  renderer.setProfiling(true);
  renderer.setTypeState(clampTypeState({
    ...sharedSequenceTypeStyle(),
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: EDITORIAL_COPY.slice(),
  }));
  let count = 5;
  let loopSeconds = LOOP;
  let weights = EDITORIAL_WEIGHTS.slice();
  let mixed = true;
  let aspect: "4:5" | "9:16" = "4:5";
  let connection: TypeConnectionMode = "flicker";
  let flickerWrap: FlickerWrapMode = "include-wrap";
  let flickerSwap: FlickerSwap = "centre";
  let compareOn = false;
  let compareSlot: "A" | "B" = "A";
  const modeA: TypeConnectionMode = "flicker";
  const modeB: TypeConnectionMode = "bloom-flicker";
  let cutMode: "auto" | "internal" | "wrap" = "auto";
  let cutRaf = 0;
  let loopTarget = 0;
  let loopsSeen = 0;
  let lastPhase = 0;
  let desiredCopies: string[] | null = EDITORIAL_COPY.slice();

  const activeConnection = (): TypeConnectionMode => {
    if (!compareOn) return connection;
    return compareSlot === "A" ? modeA : modeB;
  };

  const copiesNow = (): string[] => {
    const state = renderer.getTypeState();
    const authored = state.sequenceCopies.some((copy) => copy.trim());
    const src = authored ? state.sequenceCopies : EDITORIAL_COPY;
    return Array.from({ length: count }, (_, i) => src[i] ?? "");
  };

  const stageSize = (): { w: number; h: number } => (aspect === "9:16" ? { w: 270, h: 480 } : { w: 360, h: 450 });

  const bind = (): void => {
    const mode = activeConnection();
    const copies = copiesNow();
    setEvalSequenceWeights(weights);
    bindEvalSequenceWeights(renderer, weights);
    const typeBind = {
      copies,
      motion: "connected" as const,
      arrival: "soft-crop" as const,
      connection: mode,
    };
    setEvalSequenceType(typeBind);
    bindEvalSequenceType(renderer, typeBind);
    const unity = { connection: mode, flickerWrap, flickerSwap };
    setEvalSequenceUnity(unity);
    bindEvalSequenceUnity(renderer, unity);
    renderer.setTransitionFlickerEnabled(connectionUsesFlicker(mode));
    renderer.renderFrame();
  };

  const demoItems = (): { id: string; asset: MediaAsset }[] => {
    const items = [];
    for (let i = 0; i < count; i++) {
      const clock = mixed && (i === 1 || i === count - 1);
      const asset = clock
        ? makeClockAsset(String(i + 1).padStart(2, "0"), i === 1 ? 1.2 : 6)
        : wrapCanvasAsPlaceholder(paintScene(SCENES[i] ?? "portrait", 640, 800), String(i + 1).padStart(2, "0"));
      items.push({ id: renderer.nextSourceId(), asset });
    }
    return items;
  };

  const typeUi = buildTypePanel(typeHost, clampTypeState({
    ...sharedSequenceTypeStyle(),
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: EDITORIAL_COPY.slice(),
  }), (patch) => {
    renderer.patchTypeState(patch);
    if (
      patch.selected !== undefined ||
      patch.typeMode !== undefined ||
      patch.sequenceCopyAt !== undefined ||
      patch.composition !== undefined
    ) {
      typeUi.sync(renderer.getTypeState());
    }
    typeUi.setContext({
      playbackMode: "loop",
      sources: renderer.getSequence().map((item) => ({ label: item.asset.label })),
      pairIndex: renderer.getSequenceTiming().index,
      selectedIndex: renderer.getSequenceTiming().index,
      copies: renderer.getTypeState().sequenceCopies,
      sizeModes: renderer.getTypeState().sequenceSizeModes,
      sizes: renderer.getTypeState().sequenceSizes,
      anchors: renderer.getTypeState().sequenceAnchors,
    });
    bind();
  });

  const wire = (rebuildMedia: boolean): void => {
    renderer.pause();
    const size = stageSize();
    renderer.resizeExact(size.w, size.h);
    renderer.setLoopSeconds(loopSeconds);
    renderer.setPlaybackMode("loop");
    renderer.setRegistrationEnabled(true);
    renderer.setRegistrationAmount(60);
    renderer.setBehavior(bloomBehavior, bloomParams());
    if (rebuildMedia) {
      renderer.setSequence(demoItems(), undefined);
      const copies = desiredCopies
        ? Array.from({ length: count }, (_, i) => desiredCopies![i] ?? "")
        : copiesNow();
      desiredCopies = null;
      renderer.setTypeState(clampTypeState({
        ...sharedSequenceTypeStyle(),
        ...cloneTypeState(renderer.getTypeState()),
        enabled: true,
        typeMode: "sequence",
        sequenceCopies: copies,
      }));
    }
    weights = clampSequenceWeights(weights, renderer.getSequence().length);
    count = renderer.getSequence().length;
    renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
    typeUi.sync(renderer.getTypeState());
    typeUi.setContext({
      playbackMode: "loop",
      sources: renderer.getSequence().map((item) => ({ label: item.asset.label })),
      pairIndex: 0,
      selectedIndex: 0,
      copies: renderer.getTypeState().sequenceCopies,
      sizeModes: renderer.getTypeState().sequenceSizeModes,
      sizes: renderer.getTypeState().sequenceSizes,
      anchors: renderer.getTypeState().sequenceAnchors,
    });
    bind();
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
      wire(true);
      strip.refresh();
    },
    onReorder: (from, to) => {
      renderer.moveSource(from, to);
      strip.refresh();
      bind();
    },
    onWeights: (next) => {
      weights = next;
      setEvalSequenceWeights(weights);
      bindEvalSequenceWeights(renderer, weights);
      strip.layout();
      renderer.renderFrame();
    },
    onResetTiming: () => {
      weights = resetSequenceWeights(count);
      bind();
      strip.refresh();
    },
    onDropMedia: (id, file) => {
      loadMediaFile(file, renderer.getVideoHost(), (asset) => {
        renderer.replaceSource(id, asset, { disposePrevious: true });
        strip.refresh();
        bind();
      }, (err) => {
        exportStatus.textContent = err;
      });
    },
  });

  const stopCutLoop = (): void => {
    if (cutRaf) cancelAnimationFrame(cutRaf);
    cutRaf = 0;
  };

  const cutCenter = (): number => {
    const phases = flickerComparePhases(count, loopSeconds, weights);
    if (cutMode === "wrap") return 0;
    const selected = renderer.getSelectedItem();
    if (selected) {
      const index = renderer.getSequence().findIndex((item) => item.id === selected.id);
      if (index >= 0 && index < count - 1) {
        let acc = 0;
        const total = weights.reduce((s, w) => s + w, 0);
        for (let i = 0; i <= index; i++) acc += (weights[i] ?? 1) / total;
        return acc;
      }
      if (index === count - 1) return 0;
    }
    return phases.internalPeak;
  };

  const startCutLoop = (): void => {
    stopCutLoop();
    if (cutMode === "auto") {
      renderer.setClockMode("auto");
      renderer.play();
      return;
    }
    renderer.pause();
    const origin = performance.now();
    const tick = (ts: number): void => {
      const windowSec = Math.max(0.6, transitionFlickerHalfSpan(loopSeconds) * loopSeconds * 8);
      const t = ((ts - origin) / 1000) % windowSec;
      const half = windowSec / 2 / loopSeconds;
      renderer.setHoldPhase(wrap01(cutCenter() - half + (t / windowSec) * half * 2));
      cutRaf = requestAnimationFrame(tick);
    };
    cutRaf = requestAnimationFrame(tick);
  };

  const replayTransition = (): void => {
    stopCutLoop();
    renderer.pause();
    const center = cutCenter();
    const windowSec = 0.8;
    const origin = performance.now();
    const tick = (ts: number): void => {
      const elapsed = (ts - origin) / 1000;
      const half = windowSec / 2 / loopSeconds;
      if (elapsed >= windowSec) {
        renderer.setHoldPhase(wrap01(center + half));
        return;
      }
      renderer.setHoldPhase(wrap01(center - half + (elapsed / windowSec) * half * 2));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const syncCompare = (): void => {
    if (!compareOn) {
      markOn(compareBar, "OFF");
      return;
    }
    compareBar.querySelectorAll("button").forEach((b) => {
      const text = b.textContent ?? "";
      b.classList.toggle("is-on", text === "A/B" || (compareSlot === "A" && text.startsWith("A  ")) || (compareSlot === "B" && text.startsWith("B  ")));
    });
  };

  const connBar = addBar(controls, "TYPE CONNECTION");
  for (const mode of TYPE_CONNECTION_MODES) {
    addBtn(connBar, connectionLabel(mode), () => {
      connection = mode;
      compareOn = false;
      bind();
      markOn(connBar, connectionLabel(mode));
      syncCompare();
    });
  }
  markOn(connBar, "FLICKER");

  const compareBar = addBar(controls, "COMPARE");
  addBtn(compareBar, "OFF", () => {
    compareOn = false;
    bind();
    markOn(connBar, connectionLabel(connection));
    syncCompare();
  });
  addBtn(compareBar, "A/B", () => {
    compareOn = true;
    bind();
    markOn(connBar, connectionLabel(activeConnection()));
    syncCompare();
  });
  addBtn(compareBar, "A  FLICKER", () => {
    compareOn = true;
    compareSlot = "A";
    bind();
    markOn(connBar, connectionLabel(activeConnection()));
    syncCompare();
  });
  addBtn(compareBar, "B  BLOOM + FLICKER", () => {
    compareOn = true;
    compareSlot = "B";
    bind();
    markOn(connBar, connectionLabel(activeConnection()));
    syncCompare();
  });
  syncCompare();

  const cutBar = addBar(controls, "CUT");
  addBtn(cutBar, "AUTO", () => {
    cutMode = "auto";
    startCutLoop();
    markOn(cutBar, "AUTO");
  });
  addBtn(cutBar, "INTERNAL", () => {
    cutMode = "internal";
    startCutLoop();
    markOn(cutBar, "INTERNAL");
  });
  addBtn(cutBar, "WRAP", () => {
    cutMode = "wrap";
    startCutLoop();
    markOn(cutBar, "WRAP");
  });
  addBtn(cutBar, "REPLAY TRANSITION", () => replayTransition());
  addBtn(cutBar, "LOOP ×3", () => {
    cutMode = "auto";
    startCutLoop();
    loopTarget = 3;
    loopsSeen = 0;
    lastPhase = renderer.getLoopPhase();
    markOn(cutBar, "AUTO");
  });
  markOn(cutBar, "AUTO");

  const swapBar = addBar(qa, "FLICKER SWAP");
  for (const swap of ["early", "centre", "late"] as const) {
    addBtn(swapBar, swap.toUpperCase(), () => {
      flickerSwap = swap;
      bind();
      markOn(swapBar, swap.toUpperCase());
    });
  }
  markOn(swapBar, "CENTRE");

  const rhythm = addBar(controls, "RHYTHM");
  for (const [name, preset] of Object.entries(PRESETS)) {
    addBtn(rhythm, name.toUpperCase(), () => {
      count = preset.length;
      weights = preset.slice();
      if (name === "editorial") desiredCopies = EDITORIAL_COPY.slice();
      wire(true);
      strip.refresh();
      markOn(rhythm, name.toUpperCase());
    });
  }
  addBtn(rhythm, "2 SOURCE", () => {
    count = 2;
    weights = [1, 1];
    mixed = false;
    desiredCopies = TWO_SOURCE_COPY.slice();
    wire(true);
    strip.refresh();
    markOn(rhythm, "2 SOURCE");
    markOn(media, "DEMO");
  });
  markOn(rhythm, "EDITORIAL");

  const dur = addBar(controls, "DURATION");
  addBtn(dur, "8s", () => {
    loopSeconds = 8;
    renderer.setLoopSeconds(8);
    strip.refresh();
    markOn(dur, "8s");
  });
  addBtn(dur, "12s", () => {
    loopSeconds = 12;
    renderer.setLoopSeconds(12);
    strip.refresh();
    markOn(dur, "12s");
  });
  markOn(dur, "12s");

  const format = addBar(controls, "FORMAT");
  addBtn(format, "4:5", () => {
    aspect = "4:5";
    const size = stageSize();
    renderer.resizeExact(size.w, size.h);
    markOn(format, "4:5");
  });
  addBtn(format, "9:16", () => {
    aspect = "9:16";
    const size = stageSize();
    renderer.resizeExact(size.w, size.h);
    markOn(format, "9:16");
  });
  markOn(format, "4:5");

  const media = addBar(controls, "MEDIA");
  addBtn(media, "DEMO", () => {
    mixed = false;
    wire(true);
    strip.refresh();
    markOn(media, "DEMO");
  });
  addBtn(media, "MIXED VIDEO", () => {
    mixed = true;
    wire(true);
    strip.refresh();
    markOn(media, "MIXED VIDEO");
  });
  const upload = document.createElement("input");
  upload.type = "file";
  upload.accept = "image/*,video/*";
  upload.hidden = true;
  box.appendChild(upload);
  addBtn(media, "UPLOAD", () => upload.click());
  upload.addEventListener("change", () => {
    const file = upload.files?.[0];
    upload.value = "";
    if (!file) return;
    const selected = renderer.getSelectedItem() ?? renderer.getSequence()[0];
    if (!selected) return;
    loadMediaFile(file, renderer.getVideoHost(), (asset) => {
      renderer.replaceSource(selected.id, asset, { disposePrevious: true });
      strip.refresh();
      bind();
    }, (err) => {
      exportStatus.textContent = err;
    });
  });
  markOn(media, "MIXED VIDEO");

  const exp = addBar(controls, "EXPORT");
  const exportOne = async (mode: TypeConnectionMode): Promise<string> => {
    const prev = connection;
    const prevCompare = compareOn;
    compareOn = false;
    connection = mode;
    bind();
    const result = await runExport(
      renderer,
      {
        format: "webp",
        fps: 25,
        size: "preview",
        quality: "standard",
        aspect,
        includeAudio: false,
      },
      { behaviorId: "bloom", treatment: `unity-${mode}` },
      (p) => {
        exportStatus.textContent = `${connectionLabel(mode)}  ${p.label}`;
      },
      new AbortController().signal,
    );
    downloadBlob(result.blob, result.filename);
    connection = prev;
    compareOn = prevCompare;
    bind();
    const size = stageSize();
    renderer.resizeExact(size.w, size.h);
    return result.filename;
  };
  addBtn(exp, "EXPORT CURRENT", () => {
    void exportOne(activeConnection()).catch((err) => {
      exportStatus.textContent = err instanceof Error ? err.message : "Export failed";
    });
  });
  addBtn(exp, "EXPORT 4 TREATMENTS", () => {
    void (async () => {
      const names: string[] = [];
      for (const mode of TYPE_CONNECTION_MODES) names.push(await exportOne(mode));
      exportStatus.textContent = `Saved ${names.join("  ·  ")}`;
    })().catch((err) => {
      exportStatus.textContent = err instanceof Error ? err.message : "Export failed";
    });
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
    const mode = activeConnection();
    const bloom = typeBloomPresence(timing.localPhase, mode);
    const flicker = renderer.lastTransitionDiagnostics;
    const copies = copiesNow();
    const prof = renderer.lastProfile;
    hud.textContent = [
      `${mode}   ${compareOn ? `COMPARE ${compareSlot}` : ""}   swap ${flickerSwap}   cut ${cutMode}`,
      `MASTER ${renderer.getLoopPhase().toFixed(3)}   ${loopSeconds}s   ${aspect}`,
      `SLOT ${String(timing.index + 1).padStart(2, "0")}  “${sequenceTypeCopyForPair(copies, timing.index).replace(/\n/g, " / ")}"`,
      `LOCAL ${timing.localPhase.toFixed(2)}   ${timing.durationSeconds.toFixed(2)}s`,
      `TYPE ${connectionUsesBloom(mode) ? `${bloom.stage} ${bloom.presence.toFixed(2)}` : `${typeEnv.stage} ${typeEnv.presence.toFixed(2)}`}`,
      `BLOOM ${variantIdForPair(pair.pairIndex, pair.pairCount)}   VIDEO ${item?.asset.kind === "video" ? `${videoTime.toFixed(2)}s` : "—"}`,
      `FLICKER ${flicker?.applied ? `ON  cut ${flicker.cut.toFixed(2)}  env ${flicker.envelope.toFixed(2)}` : "off"}`,
      prof ? `FRAME ${prof.totalMs.toFixed(1)}ms   type ${prof.typeMs.toFixed(1)}ms` : "",
    ].filter(Boolean).join("\n");
    typeUi.setActivePair(timing.index);
    strip.syncMarks();
    const p = renderer.getLoopPhase();
    if (loopTarget > 0) {
      if (p + 0.02 < lastPhase) loopsSeen += 1;
      lastPhase = p;
      if (loopsSeen >= loopTarget) {
        loopTarget = 0;
        renderer.pause();
        renderer.setClockMode("hold");
      }
    }
  };

  wire(true);
  strip.refresh();
  root.appendChild(box);
  (window as unknown as { __UNITY_REVIEW__: Record<string, unknown> }).__UNITY_REVIEW__ = {
    renderer,
    phase: () => renderer.getLoopPhase(),
    hold: (p: number) => {
      stopCutLoop();
      renderer.setHoldPhase(wrap01(p));
    },
    play: () => {
      cutMode = "auto";
      startCutLoop();
    },
    connection: () => activeConnection(),
    exportOne,
  };
  return renderer;
}
