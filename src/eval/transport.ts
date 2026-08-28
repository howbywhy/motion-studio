import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { clampTypeState, type TypeBlock, type TypeState } from "../core/typeState";
import { typePageIndexForState, typeVisibleForState } from "../core/typePages";
import { previewClockDelta } from "../core/playbackClock";
import { mbmById } from "./mbmCopy";

const W = 160;
const H = 200;
const LOOP = 12;
const FRAME = 16;

function bloomParams(): ParamValues {
  const found = presetsForTreatment("clean").find((p) => p.label === "Expressive");
  if (!found) throw new Error("Missing Bloom Expressive");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...found.values,
    resolveLimit: 60,
  };
}

function page(a: Partial<TypeBlock>, b?: Partial<TypeBlock>): Partial<TypeBlock>[] {
  return [
    { enabled: true, color: "#f3efe6", ...a },
    b ? { enabled: true, color: "#f3efe6", ...b } : { enabled: false, text: "", composition: "subtitle" },
  ];
}

function campaignType(): TypeState {
  return clampTypeState({
    enabled: true,
    sequenceStart: 0.2,
    sequenceStop: 0.75,
    sequenceSpeed: 50,
    frameHoldEnabled: [false, true, false, false, false, false],
    frameHoldLength: [2, 2.25, 2, 2, 2, 2],
    pages: [
      page({ text: "07.09", composition: "headline", scale: 100, anchor: "tl" }),
      page({ text: mbmById("name-break").text, composition: "headline", scale: 78, anchor: "mc" }),
      page({ text: "FLAWED", composition: "headline", scale: 86, anchor: "bl" }),
      page({ text: "AND FLAWLESS", composition: "headline", scale: 64, anchor: "bl" }),
      page({ text: "2026", composition: "headline", scale: 100, anchor: "br" }),
      page({ text: "MADELEN", composition: "headline", scale: 78, anchor: "tl" }),
    ],
  });
}

const TYPE = campaignType();

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
  renderer.setRegistrationEnabled(false);
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
  renderer.setClockMode("auto");
  renderer.seekLoopPhase(0);
  return renderer;
}

function drive(renderer: Renderer, fromTs: number, toTs: number, step = FRAME, hidden = false): void {
  for (let t = fromTs; t <= toTs; t += step) renderer.applyPreviewFrame(t, { hidden });
}

function near(a: number, b: number, eps = 0.002): boolean {
  return Math.abs(a - b) <= eps;
}

function hashPixels(img: ImageData): string {
  let h = 2166136261;
  const d = img.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface TransportReport {
  pauseFreezesPhase: boolean;
  resumeContinuesPhase: boolean;
  pauseDurationIgnored: boolean;
  rapidPauseResumeStable: boolean;
  singleRafLoop: boolean;
  scrubWhilePausedRebases: boolean;
  loopWrapAfterPause: boolean;
  pulseResumeDeterministic: boolean;
  typeResumeDeterministic: boolean;
  flickerResumeDeterministic: boolean;
  exportDoesNotCorruptPreviewClock: boolean;
  tabHiddenSuspends: boolean;
  firstFrameSafety: boolean;
  zeroWaitResume: boolean;
  lengthChangeKeepsPhase: boolean;
  modeSwitchKeepsMaster: boolean;
  pauseDoesNotMutateHold: boolean;
  phaseFinite: boolean;
  clockDeltaRebasesGaps: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runTransportSheet(root: HTMLElement): Promise<TransportReport> {
  const t0 = performance.now();
  root.innerHTML = "";
  const intro = document.createElement("p");
  intro.textContent =
    "Pause All freezes master phase. Resume continues from that phase. Hidden-tab gaps never enter elapsed.";
  root.appendChild(intro);
  const host = document.createElement("div");
  root.appendChild(host);

  const r = makeRenderer(host);
  drive(r, 1000, 1000 + 0.33 * LOOP * 1000);
  const at33 = r.getLoopPhase();
  const elapsed33 = r.getElapsed();
  r.setFrozen(true);
  const frozenPhase = r.getLoopPhase();
  drive(r, 5000, 8000);
  const stillFrozen = r.getLoopPhase();
  const elapsedFrozen = r.getElapsed();
  r.setFrozen(false);
  r.applyPreviewFrame(8000);
  const resumedSame = r.getLoopPhase();
  r.applyPreviewFrame(8000 + FRAME);
  r.applyPreviewFrame(8000 + FRAME * 2);
  const afterResume = r.getLoopPhase();
  const pauseFreezesPhase = near(at33, 0.33, 0.02) && near(frozenPhase, stillFrozen) && elapsedFrozen === elapsed33;
  const resumeContinuesPhase =
    near(resumedSame, stillFrozen) && afterResume > stillFrozen && afterResume - stillFrozen < 0.01;

  const r5 = makeRenderer(host);
  drive(r5, 0, 3000);
  const p5 = r5.getLoopPhase();
  r5.setFrozen(true);
  drive(r5, 3000, 8000);
  r5.setFrozen(false);
  r5.applyPreviewFrame(8000);
  r5.applyPreviewFrame(8000 + FRAME);
  const after5 = r5.getLoopPhase();
  const r30 = makeRenderer(host);
  drive(r30, 0, 3000);
  r30.setFrozen(true);
  drive(r30, 3000, 33000);
  r30.setFrozen(false);
  r30.applyPreviewFrame(33000);
  r30.applyPreviewFrame(33000 + FRAME);
  const after30 = r30.getLoopPhase();
  const pauseDurationIgnored = near(after5, after30, 0.003) && after5 - p5 < 0.01;

  const rapid = makeRenderer(host);
  drive(rapid, 0, 2000);
  const beforeRapid = rapid.getLoopPhase();
  let ts = 2000;
  for (let i = 0; i < 20; i++) {
    rapid.setFrozen(true);
    ts += 50;
    rapid.applyPreviewFrame(ts);
    rapid.setFrozen(false);
    ts += FRAME;
    rapid.applyPreviewFrame(ts);
  }
  const afterRapid = rapid.getLoopPhase();
  const rapidPauseResumeStable = afterRapid >= beforeRapid && afterRapid - beforeRapid < 0.05;

  const loopR = makeRenderer(host);
  loopR.play();
  loopR.play();
  const diag = loopR.getPreviewClockDiagnostics();
  const singleRafLoop = diag.loopActive && diag.rafStarts === 1;
  loopR.pause();
  loopR.setFrozen(true);

  const scrub = makeRenderer(host);
  drive(scrub, 0, 0.25 * LOOP * 1000);
  scrub.setFrozen(true);
  scrub.beginPhaseScrub();
  scrub.seekLoopPhase(0.62);
  scrub.endPhaseScrub();
  const scrubbed = scrub.getLoopPhase();
  scrub.setFrozen(false);
  scrub.applyPreviewFrame(9000);
  scrub.applyPreviewFrame(9000 + FRAME);
  const afterScrub = scrub.getLoopPhase();
  const scrubWhilePausedRebases = near(scrubbed, 0.62) && afterScrub >= 0.62 && afterScrub - 0.62 < 0.01;

  const wrap = makeRenderer(host);
  wrap.seekLoopPhase(0.98);
  drive(wrap, 20000, 20000);
  wrap.setFrozen(true);
  drive(wrap, 25000, 28000);
  wrap.setFrozen(false);
  wrap.applyPreviewFrame(28000);
  for (let i = 1; i <= 40; i++) wrap.applyPreviewFrame(28000 + i * FRAME);
  const wrapPhase = wrap.getLoopPhase();
  const loopWrapAfterPause = wrapPhase < 0.1;

  const pulse = makeRenderer(host);
  pulse.setPlaybackMode("pingpong");
  pulse.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  pulse.seekLoopPhase(0.2);
  const bloomBefore = pulse.getBloomSamplePhase();
  pulse.setFrozen(true);
  drive(pulse, 100, 20000);
  const bloomPaused = pulse.getBloomSamplePhase();
  pulse.setFrozen(false);
  pulse.applyPreviewFrame(20000);
  pulse.applyPreviewFrame(20000 + FRAME);
  const bloomAfter = pulse.getBloomSamplePhase();
  const pulseResumeDeterministic =
    near(bloomBefore, bloomPaused) && bloomAfter !== bloomPaused && Math.abs(bloomAfter - bloomBefore) < 0.05;

  const typeR = makeRenderer(host);
  typeR.setTypeState(TYPE);
  typeR.seekLoopPhase(0.32);
  const typeAt = TYPE;
  const idxBefore = typePageIndexForState(typeAt, typeR.getLoopPhase());
  const visBefore = typeVisibleForState(typeAt, typeR.getLoopPhase());
  typeR.setFrozen(true);
  drive(typeR, 0, 20000);
  const idxPaused = typePageIndexForState(typeAt, typeR.getLoopPhase());
  typeR.setFrozen(false);
  typeR.applyPreviewFrame(20000);
  const idxResume = typePageIndexForState(typeAt, typeR.getLoopPhase());
  const typeResumeDeterministic = visBefore && idxBefore === idxPaused && idxPaused === idxResume;

  const flick = makeRenderer(host);
  flick.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }));
  flick.seekLoopPhase(0.96);
  flick.renderFrame();
  const flickHash = hashPixels(flick.getVisibleImageData());
  const flickKind = flick.lastEndDiagnostics?.flickerState;
  flick.setFrozen(true);
  drive(flick, 1, 15000);
  flick.renderFrame();
  const flickPausedHash = hashPixels(flick.getVisibleImageData());
  flick.setFrozen(false);
  flick.applyPreviewFrame(15000);
  const flickResumeHash = hashPixels(flick.getVisibleImageData());
  const flickerResumeDeterministic =
    flickKind != null && flickHash === flickPausedHash && flickResumeHash === flickHash;

  const exp = makeRenderer(host);
  drive(exp, 0, 4000);
  const expElapsed = exp.getElapsed();
  const expPhase = exp.getLoopPhase();
  exp.setFrozen(true);
  exp.beginExport(W, H);
  await exp.renderExportFrame(0);
  await exp.renderExportFrame(6);
  exp.endExport();
  const exportDoesNotCorruptPreviewClock =
    exp.isFrozen() &&
    near(exp.getElapsed(), expElapsed) &&
    near(exp.getLoopPhase(), expPhase) &&
    !exp.isExporting();
  exp.setFrozen(false);
  exp.applyPreviewFrame(4000);
  exp.applyPreviewFrame(4000 + FRAME);
  const afterExport = exp.getLoopPhase();
  const exportResumeOk = afterExport >= expPhase && afterExport - expPhase < 0.01;

  const hide = makeRenderer(host);
  drive(hide, 0, 2000);
  const hidePhase = hide.getLoopPhase();
  drive(hide, 2000, 12000, FRAME, true);
  const stillHidden = hide.getLoopPhase();
  hide.noteClockDiscontinuity();
  hide.applyPreviewFrame(12000, { hidden: false });
  hide.applyPreviewFrame(12000 + FRAME, { hidden: false });
  const afterShow = hide.getLoopPhase();
  const tabHiddenSuspends = near(hidePhase, stillHidden) && afterShow >= hidePhase && afterShow - hidePhase < 0.01;

  const first = makeRenderer(host);
  first.setFrozen(true);
  first.applyPreviewFrame(50);
  first.setFrozen(false);
  first.applyPreviewFrame(50);
  first.applyPreviewFrame(50 + FRAME);
  const firstFrameSafety = first.getLoopPhase() >= 0 && first.getLoopPhase() < 0.01;

  const zero = makeRenderer(host);
  drive(zero, 0, 1500);
  const z0 = zero.getLoopPhase();
  zero.setFrozen(true);
  zero.setFrozen(false);
  zero.applyPreviewFrame(1500);
  const zeroWaitResume = near(zero.getLoopPhase(), z0);

  const len = makeRenderer(host);
  len.seekLoopPhase(0.5);
  len.setFrozen(true);
  len.setLoopSeconds(4);
  const at4 = len.getLoopPhase();
  len.setLoopSeconds(8);
  const at8 = len.getLoopPhase();
  len.setFrozen(false);
  const lengthChangeKeepsPhase = near(at4, 0.5) && near(at8, 0.5);

  const mode = makeRenderer(host);
  mode.seekLoopPhase(0.41);
  mode.setFrozen(true);
  mode.setPlaybackMode("pingpong");
  const pulseMaster = mode.getLoopPhase();
  mode.setPlaybackMode("loop");
  const loopMaster = mode.getLoopPhase();
  const modeSwitchKeepsMaster = near(pulseMaster, 0.41) && near(loopMaster, 0.41);

  const hold = makeRenderer(host);
  hold.setHoldPhase(0.44);
  hold.setFrozen(true);
  drive(hold, 0, 5000);
  hold.setFrozen(false);
  hold.applyPreviewFrame(5000);
  const pauseDoesNotMutateHold = hold.getClockMode() === "hold" && near(hold.getLoopPhase(), 0.44);

  const nanR = makeRenderer(host);
  nanR.applyPreviewFrame(Number.NaN);
  nanR.applyPreviewFrame(Number.POSITIVE_INFINITY);
  const phaseFinite = Number.isFinite(nanR.getLoopPhase()) && nanR.getLoopPhase() >= 0 && nanR.getLoopPhase() < 1;

  const gap = previewClockDelta(1000, 40000);
  const okFrame = previewClockDelta(1000, 1016);
  const clockDeltaRebasesGaps = gap.rebase && gap.dt === 0 && !okFrame.rebase && near(okFrame.dt, 0.016, 0.001);

  return {
    pauseFreezesPhase,
    resumeContinuesPhase,
    pauseDurationIgnored,
    rapidPauseResumeStable,
    singleRafLoop,
    scrubWhilePausedRebases,
    loopWrapAfterPause,
    pulseResumeDeterministic,
    typeResumeDeterministic,
    flickerResumeDeterministic,
    exportDoesNotCorruptPreviewClock: exportDoesNotCorruptPreviewClock && exportResumeOk,
    tabHiddenSuspends,
    firstFrameSafety,
    zeroWaitResume,
    lengthChangeKeepsPhase,
    modeSwitchKeepsMaster,
    pauseDoesNotMutateHold,
    phaseFinite,
    clockDeltaRebasesGaps,
    elapsedMs: performance.now() - t0,
    details: {
      at33,
      stillFrozen,
      afterResume,
      after5,
      after30,
      wrapPhase,
      bloomBefore,
      bloomAfter,
      idxBefore,
      singleRaf: diag,
    },
  };
}
