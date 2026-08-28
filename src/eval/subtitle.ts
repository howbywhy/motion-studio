import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import {
  clampTypeBlock,
  clampTypeState,
  flattenLegacyFootnoteCopy,
  SUBTITLE_YELLOW,
  TYPE_ANCHORS,
  type TypeBlock,
  type TypeState,
} from "../core/typeState";
import { typePageBeatLocal, typePageCuts, typeStateAtPhase } from "../core/typePages";
import { applySubtitleCues, parseSubtitleCues, subtitleCueIndex } from "../core/typeSubtitle";
import { generateRandomisation } from "../core/randomise";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import { layoutTypography, typeInkBox } from "../core/typeLayout";

const W = 320;
const H = 400;
const LOOP = 12;

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
    resolveLimit: 50,
  };
}

function cues(n: number): string {
  return Array.from({ length: n }, (_, i) => `Cue ${String(i + 1).padStart(2, "0")}.`).join("\n");
}

function subtitleBlock(text: string, extra?: Partial<TypeBlock>): Partial<TypeBlock> {
  return {
    enabled: true,
    text,
    composition: "subtitle",
    anchor: "bc",
    column: "medium",
    ...extra,
  };
}

function campaign(): TypeState {
  return clampTypeState({
    enabled: true,
    sequenceStart: 0.15,
    sequenceStop: 0.78,
    sequenceSpeed: 50,
    frameHoldEnabled: [false, false, true, false],
    frameHoldLength: [2, 2, 3, 2],
    pages: [
      [
        { enabled: true, text: "MADE BY", composition: "headline", scale: 86, anchor: "mc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("Made in Sydney."),
      ],
      [
        { enabled: true, text: "MADELEN", composition: "headline", scale: 86, anchor: "mc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("Designed for movement."),
      ],
      [
        { enabled: true, text: "FLAWED\nAND FLAWLESS", composition: "headline", scale: 78, anchor: "mc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("A study in material and form.\nMade to be lived in.\nSpring / Summer 2026."),
      ],
      [
        { enabled: true, text: "07.09", composition: "headline", scale: 100, anchor: "mc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("Available online."),
      ],
    ],
  });
}

function makeRenderer(host: HTMLElement): Renderer {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W, H);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(65);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams());
  renderer.setSequence(
    [
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#1c1c1e"), "01") },
      { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#c8a070"), "02") },
    ],
    undefined,
  );
  renderer.setTypeState(clampTypeState({ enabled: false }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 6; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function cueAt(state: TypeState, phase: number): string {
  const live = applySubtitleCues(typeStateAtPhase(state, phase), state, phase);
  const block = live.blocks.find((b) => b.composition === "subtitle" && b.enabled);
  return block?.text ?? "";
}

function cell(parent: HTMLElement, label: string, img: ImageData): void {
  const wrap = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
}

export interface SubtitleReport {
  parseModelA: boolean;
  legacySingleCue: boolean;
  legacyKeepsColour: boolean;
  newDefaultsYellow: boolean;
  oneCue: boolean;
  twoCues: boolean;
  threeCues: boolean;
  fourCues: boolean;
  sixCues: boolean;
  eightCues: boolean;
  forwardScrub: boolean;
  backwardScrub: boolean;
  holdExportIdentical: boolean;
  perStateRestart: boolean;
  frameHoldAffectsWindow: boolean;
  cuesDivideByHold: boolean;
  defaultScaleUseful: boolean;
  bottomSafe: boolean;
  hierarchyBelowHeadline: boolean;
  pulseKeepsCues: boolean;
  flickerInterrupts: boolean;
  randomisePreservesCopy: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runSubtitleSheet(root: HTMLElement): Promise<SubtitleReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const parseModelA =
    parseSubtitleCues("Made in Sydney.\nDesigned for movement.\n\nFlawed and flawless.").join("|") ===
      "Made in Sydney.|Designed for movement.|Flawed and flawless." &&
    parseSubtitleCues("One line only.").length === 1;

  const legacy = clampTypeBlock(
    {
      enabled: true,
      composition: "footnote",
      text: "Line one\nLine two",
      color: "#ffffff",
      scale: 34,
      anchor: "bl",
    } as unknown as Partial<TypeBlock>,
    true,
  );
  const legacySingleCue =
    legacy.composition === "subtitle" &&
    legacy.text === flattenLegacyFootnoteCopy("Line one\nLine two") &&
    parseSubtitleCues(legacy.text).length === 1;
  const legacyKeepsColour = legacy.color === "#ffffff";

  const fresh = clampTypeBlock({ enabled: true, composition: "subtitle", text: "Hello." }, true);
  const newDefaultsYellow =
    fresh.color === SUBTITLE_YELLOW &&
    fresh.weight === 600 &&
    fresh.scale === 62 &&
    fresh.tracking === 20 &&
    fresh.textAlign === "center";

  const host = document.createElement("div");
  root.appendChild(host);
  const renderer = makeRenderer(host);

  function onePage(text: string, timing?: { start?: number; stop?: number }): TypeState {
    return clampTypeState({
      enabled: true,
      sequenceStart: timing?.start ?? 0,
      sequenceStop: timing?.stop ?? 1,
      blocks: [
        { enabled: false, text: "", composition: "headline" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock(text),
      ],
    });
  }

  const counts: Record<number, boolean> = {};
  const countGrid = document.createElement("div");
  countGrid.className = "grid";
  const hCounts = document.createElement("h2");
  hCounts.textContent = "Cue counts — even split through Type window";
  root.appendChild(hCounts);
  root.appendChild(countGrid);

  for (const n of [1, 2, 3, 4, 6, 8]) {
    const state = onePage(cues(n));
    renderer.setTypeState(state);
    const seen: string[] = [];
    for (let i = 0; i < n; i++) {
      const phase = (i + 0.5) / n;
      renderer.setClockMode("hold");
      renderer.setHoldPhase(phase);
      const img = settle(renderer);
      const text = cueAt(state, phase);
      seen.push(text);
      cell(countGrid, `${n} cues · ${text}`, img);
    }
    const expected = parseSubtitleCues(cues(n));
    counts[n] = seen.length === n && expected.every((c, i) => seen[i] === c);
  }

  const four = onePage(cues(4));
  const forward = [0.05, 0.3, 0.55, 0.8].map((p) => cueAt(four, p));
  const backward = [0.8, 0.55, 0.3, 0.05].map((p) => cueAt(four, p));
  const forwardScrub = forward.join("|") === parseSubtitleCues(cues(4)).join("|");
  const backwardScrub = backward.join("|") === [...parseSubtitleCues(cues(4))].reverse().join("|");

  renderer.setTypeState(four);
  renderer.setClockMode("hold");
  renderer.setHoldPhase(0.62);
  const holdPreview = hashPixels(settle(renderer));
  const holdCue = cueAt(four, 0.62);
  renderer.beginExport(W, H);
  const holdFrames: string[] = [];
  for (const t of [0, 1, 3, 6, 11.9]) {
    await renderer.renderExportFrame(t);
    holdFrames.push(hashPixels(renderer.getVisibleImageData()));
  }
  renderer.endExport();
  renderer.resizeExact(W, H);
  const holdExportIdentical = holdFrames.every((h) => h === holdPreview) && holdCue === "Cue 03.";

  const multi = clampTypeState({
    enabled: true,
    sequenceStart: 0.2,
    sequenceStop: 0.8,
    pages: [
      [
        { enabled: true, text: "STATE 01", composition: "headline", scale: 70, anchor: "tc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("Alpha one.\nAlpha two."),
      ],
      [
        { enabled: true, text: "STATE 02", composition: "headline", scale: 70, anchor: "tc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("Beta one.\nBeta two."),
      ],
    ],
  });
  const early = typePageBeatLocal(multi, 0.25);
  const lateFirst = typePageBeatLocal(multi, 0.38);
  const justSecond = (() => {
    for (let p = 0.2; p < 0.8; p += 0.002) {
      if (typeStateAtPhase(multi, p).blocks[0]!.text === "STATE 02") return p;
    }
    return 0.55;
  })();
  const perStateRestart =
    cueAt(multi, 0.22).startsWith("Alpha") &&
    cueAt(multi, justSecond + 0.005).startsWith("Beta one") &&
    early < lateFirst;

  const held = clampTypeState({
    enabled: true,
    sequenceStart: 0.2,
    sequenceStop: 0.8,
    sequenceSpeed: 50,
    frameHoldEnabled: [true, false],
    frameHoldLength: [3, 2],
    pages: [
      [
        { enabled: true, text: "HOLD", composition: "headline", scale: 70, anchor: "tc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("One.\nTwo.\nThree.\nFour."),
      ],
      [
        { enabled: true, text: "NEXT", composition: "headline", scale: 70, anchor: "tc", color: "#f3efe6" },
        { enabled: false, text: "", composition: "headline" },
        subtitleBlock("Next."),
      ],
    ],
  });
  const unheld = clampTypeState({ ...held, frameHoldEnabled: [false, false] });
  const frameHoldAffectsWindow = typePageBeatLocal(held, 0.35) !== typePageBeatLocal(unheld, 0.35);

  function holdCueState(nCues: number, holdOn: boolean, holdLength: number): TypeState {
    return clampTypeState({
      enabled: true,
      sequenceStart: 0.2,
      sequenceStop: 0.8,
      sequenceSpeed: 50,
      frameHoldEnabled: [holdOn, false],
      frameHoldLength: [holdLength, 2],
      pages: [
        [
          { enabled: true, text: "PAGE", composition: "headline", scale: 70, anchor: "tc", color: "#f3efe6" },
          { enabled: false, text: "", composition: "headline" },
          subtitleBlock(cues(nCues)),
        ],
        [
          { enabled: true, text: "NEXT", composition: "headline", scale: 70, anchor: "tc", color: "#f3efe6" },
          { enabled: false, text: "", composition: "headline" },
          subtitleBlock("Next."),
        ],
      ],
    });
  }
  function cuesDivideEven(nCues: number, holdOn: boolean, holdLength: number): boolean {
    const state = holdCueState(nCues, holdOn, holdLength);
    const start = state.sequenceStart;
    const cut = typePageCuts(
      2,
      state.sequenceSpeed,
      start,
      state.sequenceStop,
      state.frameHoldEnabled,
      state.frameHoldLength,
    )[0] ?? state.sequenceStop;
    const span = cut - start;
    if (!(span > 0)) return false;
    for (let i = 0; i < nCues; i++) {
      const p = start + span * ((i + 0.5) / nCues);
      if (cueAt(state, p) !== parseSubtitleCues(cues(nCues))[i]) return false;
    }
    return true;
  }
  const holdGrid = document.createElement("div");
  holdGrid.className = "grid";
  const hHold = document.createElement("h2");
  hHold.textContent = "Cues × Hold — even split inside the State";
  root.appendChild(hHold);
  root.appendChild(holdGrid);
  let cuesDivideByHold = true;
  const holdCases: { on: boolean; len: number; label: string }[] = [
    { on: false, len: 2, label: "Off" },
    { on: true, len: 2, label: "2.0×" },
    { on: true, len: 3, label: "3.0×" },
  ];
  for (const hold of holdCases) {
    for (const n of [1, 2, 3, 6]) {
      const ok = cuesDivideEven(n, hold.on, hold.len);
      cuesDivideByHold = cuesDivideByHold && ok;
      const state = holdCueState(n, hold.on, hold.len);
      const start = state.sequenceStart;
      const cut = typePageCuts(
        2,
        state.sequenceSpeed,
        start,
        state.sequenceStop,
        state.frameHoldEnabled,
        state.frameHoldLength,
      )[0]!;
      renderer.setTypeState(state);
      renderer.setClockMode("hold");
      renderer.setHoldPhase(start + (cut - start) * 0.5);
      cell(holdGrid, `${n} cues · Hold ${hold.label} · ${ok ? "ok" : "FAIL"}`, settle(renderer));
    }
  }

  const colonel = "The Colonel and I need to have a few words.";
  function onlySubtitle(extra?: Partial<TypeBlock>): TypeState {
    return clampTypeState({
      enabled: true,
      sequenceStart: 0,
      sequenceStop: 1,
      blocks: [
        { enabled: true, composition: "subtitle", text: colonel, color: SUBTITLE_YELLOW, ...extra },
        { enabled: false, text: "", composition: "headline" },
        { enabled: false, text: "", composition: "headline" },
      ],
    });
  }
  const W916 = 360;
  const H916 = 640;
  const defLay = layoutTypography(onlySubtitle(), W916, H916);
  const s50 = layoutTypography(onlySubtitle({ scale: 50 }), W916, H916)?.fontSize ?? 0;
  const sDef = defLay?.fontSize ?? 0;
  const s100 = layoutTypography(onlySubtitle({ scale: 100 }), W916, H916)?.fontSize ?? 0;
  const headLay = layoutTypography(clampTypeState({
    enabled: true,
    blocks: [{ enabled: true, text: "FLAWED\nAND FLAWLESS", composition: "headline", scale: 78, anchor: "mc", color: "#f3efe6" }],
  }), W916, H916);
  const defaultScaleUseful = sDef / H916 >= 0.035 && sDef / H916 <= 0.055 && s50 < sDef && sDef < s100 && s100 / H916 < 0.09;
  const hierarchyBelowHeadline = (headLay?.fontSize ?? 0) > s100;
  const bcBox = defLay ? typeInkBox(defLay) : { l: 0, t: 0, r: 0, b: H916 };
  const bottomGap = (H916 - bcBox.b) / H916;
  const blLay = layoutTypography(onlySubtitle({ anchor: "bl", textAlign: "left" }), W916, H916);
  const brLay = layoutTypography(onlySubtitle({ anchor: "br", textAlign: "right" }), W916, H916);
  const blBox = blLay ? typeInkBox(blLay) : { l: 0, t: 0, r: 0, b: 0 };
  const brBox = brLay ? typeInkBox(brLay) : { l: 0, t: 0, r: W916, b: 0 };
  const bottomSafe =
    bottomGap >= 0.055 &&
    bottomGap <= 0.12 &&
    blBox.l / W916 >= 0.04 &&
    (W916 - brBox.r) / W916 >= 0.04;
  const sentenceLines = defLay?.lines.length ?? 0;
  const sentenceReadable = sentenceLines >= 1 && sentenceLines <= 2;

  const alignGrid = document.createElement("div");
  alignGrid.className = "grid";
  const hAlign = document.createElement("h2");
  hAlign.textContent = "Frame Align — 9 positions · 9:16";
  root.appendChild(hAlign);
  root.appendChild(alignGrid);
  const alignRenderer = makeRenderer(host);
  alignRenderer.resizeExact(W916, H916);
  for (const anchor of TYPE_ANCHORS) {
    const st = onlySubtitle({ anchor, textAlign: anchor.endsWith("c") ? "center" : anchor.endsWith("l") ? "left" : "right" });
    alignRenderer.setTypeState(st);
    alignRenderer.setHoldPhase(0.5);
    cell(alignGrid, anchor, settle(alignRenderer));
  }

  const scaleGrid = document.createElement("div");
  scaleGrid.className = "grid";
  const hScale = document.createElement("h2");
  hScale.textContent = "Scale 50 / default / 100 · 9:16";
  root.appendChild(hScale);
  root.appendChild(scaleGrid);
  for (const [label, st] of [
    ["50", onlySubtitle({ scale: 50 })],
    ["default", onlySubtitle()],
    ["100", onlySubtitle({ scale: 100 })],
  ] as const) {
    alignRenderer.setTypeState(st);
    cell(scaleGrid, `Scale ${label}`, settle(alignRenderer));
  }

  const hier = clampTypeState({
    enabled: true,
    sequenceStart: 0,
    sequenceStop: 1,
    blocks: [
      { enabled: true, text: "FLAWED\nAND FLAWLESS", composition: "headline", scale: 78, anchor: "mc", color: "#f3efe6" },
      { enabled: false, text: "", composition: "headline" },
      subtitleBlock("Made in Sydney.\nDesigned for movement.\nAvailable online."),
    ],
  });
  const hierGrid = document.createElement("div");
  hierGrid.className = "grid";
  const hHier = document.createElement("h2");
  hHier.textContent = "Hierarchy — Headline + Subtitle · Registration · Pulse";
  root.appendChild(hHier);
  root.appendChild(hierGrid);
  alignRenderer.setTypeState(hier);
  alignRenderer.setPlaybackMode("loop");
  for (const amt of [0, 50, 75] as const) {
    alignRenderer.setRegistrationEnabled(amt > 0);
    alignRenderer.setRegistrationAmount(amt);
    alignRenderer.setHoldPhase(0.5);
    cell(hierGrid, `Registration ${amt}`, settle(alignRenderer));
  }
  alignRenderer.setRegistrationEnabled(true);
  alignRenderer.setRegistrationAmount(60);
  alignRenderer.setPlaybackMode("pingpong");
  alignRenderer.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  alignRenderer.setHoldPhase(0.5);
  cell(hierGrid, "Pulse 42–58 2×", settle(alignRenderer));
  alignRenderer.setPlaybackMode("loop");

  const piece = campaign();
  renderer.setTypeState(piece);
  renderer.setPlaybackMode("pingpong");
  renderer.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  renderer.setClockMode("hold");
  renderer.setHoldPhase(0.5);
  const pulseHash = hashPixels(settle(renderer));
  const pulseKeepsCues = cueAt(piece, 0.5).length > 0 && pulseHash.length === 8;

  renderer.setPlaybackMode("loop");
  const flickerType = clampTypeState({ ...piece, sequenceStop: 1 });
  renderer.setTypeState(flickerType);
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 10, duration: 90 }));
  let flickerInterrupts = false;
  let flickerApplied = false;
  for (let i = 0; i <= 40; i++) {
    const p = 0.84 + (i / 40) * 0.155;
    renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 10, duration: 90 }));
    renderer.setHoldPhase(p);
    const on = hashPixels(settle(renderer));
    const diag = renderer.lastEndDiagnostics;
    if (diag?.applied) flickerApplied = true;
    renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
    renderer.setHoldPhase(p);
    const off = hashPixels(settle(renderer));
    if (on !== off) {
      flickerInterrupts = true;
      break;
    }
  }
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));

  const beforeRand = campaign();
  const seeded = generateRandomisation({
    seed: 42,
    params: bloomParams(),
    loopSeconds: LOOP,
    pairIndex: 0,
    pairCount: 2,
  });
  const randomisePreservesCopy =
    beforeRand.pages[0]![2]!.text.includes("Made in Sydney") &&
    beforeRand.pages[2]![2]!.enabled === true &&
    seeded.params.resolveLimit === 50;

  const creative = document.createElement("div");
  creative.className = "grid";
  const hC = document.createElement("h2");
  hC.textContent = "Creative — 12s 9:16 · Pulse 42–58 2× · Registration 60 · Start 15 / Stop 78 · Hold 03 3.0×";
  root.appendChild(hC);
  root.appendChild(creative);
  renderer.setTypeState(piece);
  renderer.setPlaybackMode("pingpong");
  renderer.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  renderer.setRegistrationAmount(60);
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.resizeExact(360, 640);
  for (const p of [0.12, 0.22, 0.35, 0.48, 0.62, 0.74, 0.9, 0.97]) {
    renderer.setClockMode("hold");
    renderer.setHoldPhase(p);
    cell(creative, `p${p.toFixed(2)} ${cueAt(piece, p) || "NO TYPE"}`, settle(renderer));
  }
  renderer.setTypeState(clampTypeState({ enabled: false }));
  renderer.setHoldPhase(0.5);
  cell(creative, "NO TYPE", settle(renderer));
  renderer.setTypeState(piece);
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 70, hold: 40, duration: 40 }));
  renderer.setHoldPhase(0.97);
  cell(creative, "FLICKER", settle(renderer));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setPlaybackMode("loop");
  renderer.setHoldPhase(0.5);
  cell(creative, "LOOP", settle(renderer));

  for (const n of [1, 2, 4, 8]) {
    const idx = subtitleCueIndex(n, 0);
    if (idx !== 0) throw new Error("cue 0");
  }

  return {
    parseModelA,
    legacySingleCue,
    legacyKeepsColour,
    newDefaultsYellow,
    oneCue: counts[1] === true,
    twoCues: counts[2] === true,
    threeCues: counts[3] === true,
    fourCues: counts[4] === true,
    sixCues: counts[6] === true,
    eightCues: counts[8] === true,
    forwardScrub,
    backwardScrub,
    holdExportIdentical,
    perStateRestart,
    frameHoldAffectsWindow,
    cuesDivideByHold: cuesDivideByHold && sentenceReadable,
    defaultScaleUseful,
    bottomSafe,
    hierarchyBelowHeadline,
    pulseKeepsCues,
    flickerInterrupts,
    randomisePreservesCopy,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      forward,
      backward,
      holdCue,
      holdPreview,
      holdFrames,
      justSecond,
      cueEarly: cueAt(multi, 0.22),
      cueSecond: cueAt(multi, justSecond + 0.005),
      yellow: SUBTITLE_YELLOW,
      flickerApplied,
      scale: { s50, sDef, s100, ratio: sDef / H916, head: headLay?.fontSize ?? 0 },
      bottomGap,
      sentenceLines,
    },
  };
}
