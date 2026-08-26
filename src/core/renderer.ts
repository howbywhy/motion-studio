import { drawTransformedCoverFit } from "./coverFit";
import { timeFromPhase, type ClockMode } from "./phaseClock";
import { getSeamCandidate, sequenceEnvelope, setSeamCandidate, type SeamCandidate } from "./sequencePhase";
import { clampTransform, disposeMediaAsset, videoMayOwnAudio, type MediaAsset, type MediaTransform } from "./media";
import { BASE_REGISTRATION_AMOUNT, REACTIVE_REGISTRATION_AMOUNT, paintPersistentRegistration, paintReactiveRegistration, prepareGlobalPrintInk } from "./registrationInk";
import {
  applyFieldInk,
  deriveFieldInk,
  lastFieldInk,
  resetFieldInkSmoothing,
  type FieldInk,
} from "./fieldInk";
import {
  clampLoopPhase,
  clampLoopSeconds,
  LOOP_SECONDS_DEFAULT,
  loopPhaseFromElapsed,
  moveIndex,
  resolveActivePair,
  type PairMapping,
  type PlaybackMode,
  type SequenceItem,
} from "./sequence";
import type { MaskBehavior, ParamValues } from "./types";

export type { PlaybackMode, SequenceItem };
export type MediaSlot = "A" | "B";
export type DiagnosticMode = "off" | "mask" | "boundary";

export interface FrameProfile {
  graphicMs: number;
  mediaMs: number;
  fieldInkMs: number;
  maskMs: number;
  compositeMs: number;
  resolveMs: number;
  printPrepMs: number;
  registrationMs: number;
  outputMs: number;
  totalMs: number;
}

const MAX_DPR = 2;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  return c;
}

function seekVideoFrame(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return Promise.resolve();
  let t = timeSec % duration;
  if (t < 0) t += duration;
  if (t >= duration) t = Math.max(0, duration - 1 / 120);
  video.pause();
  if (video.readyState >= 2 && Math.abs(video.currentTime - t) < 1 / 120) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onSeeked);
      window.clearTimeout(timer);
      const rvfc = (video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
        cancelVideoFrameCallback?: (id: number) => void;
      });
      if (typeof rvfc.requestVideoFrameCallback === "function") {
        const id = rvfc.requestVideoFrameCallback(() => resolve());
        window.setTimeout(() => {
          rvfc.cancelVideoFrameCallback?.(id);
          resolve();
        }, 90);
        return;
      }
      resolve();
    };
    const onSeeked = (): void => finish();
    const timer = window.setTimeout(finish, 1800);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onSeeked);
    try {
      video.currentTime = t;
    } catch {
      finish();
    }
  });
}

/**
 * Owns the full compositing pipeline. Media A and Media B (each an image,
 * a video, or a generated graphic canvas) are cover-fit — then further scaled/panned by that asset's
 * own MediaTransform — into same-size offscreen canvases fresh on every
 * single render. This is the single source of truth for "identically
 * cropped, full-frame, aligned" (both always fill the destination exactly,
 * whatever their framing), and it's what lets a video source just keep
 * playing on its own: each frame we simply sample whatever frame the
 * <video> element currently shows via drawImage, nothing about the source
 * is ever reloaded or seeked. Because the transform is baked into aLayer/
 * bLayer at this one point, everything downstream — the mask, Image
 * Aware's sampling of bLayer, every treatment — sees only the
 * already-framed media and needs no awareness that framing exists. B is revealed
 * strictly by compositing a fresh mask with `destination-in`, then drawing
 * that over the A layer — so visibility is controlled by the mask alone,
 * and any area the mask doesn't touch simply shows A (never black, since A
 * always fully covers the frame).
 *
 * Sequence → active pair A/B → existing behaviour → Print → B&W → Output.
 * Behaviours never see the sequence array. They still receive two layers.
 *
 * Whichever behavior produces the composite, it always renders into
 * `composedLayer` (an intermediate canvas) rather than the visible canvas
 * directly — `finalizeOutput` then applies the global, behavior-agnostic
 * output-layer states on top of that, before copying the result onto the
 * visible canvas: behavior render -> persistent registration -> reactive
 * registration -> B&W (if enabled) -> visible canvas. This is what lets
 * Registration/B&W sit "after" any behavior's own composite as a common
 * surface language, without any behavior needing to know they exist. The
 * Show Mask diagnostic bypasses this entirely (it shows the raw field, not
 * a composed photograph, so neither output-layer state applies to it).
 */
export class Renderer {
  private readonly visible: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly videoHost: HTMLDivElement;

  private readonly aLayer = makeCanvas();
  private readonly bLayer = makeCanvas();
  private readonly maskLayer = makeCanvas();
  private readonly boundaryLayer = makeCanvas();
  private readonly bMasked = makeCanvas();
  private readonly composedLayer = makeCanvas();

  private width = 0;
  private height = 0;
  private dpr = 1;

  private mediaA: MediaAsset | null = null;
  private mediaB: MediaAsset | null = null;
  private items: SequenceItem[] = [];
  private selectedId: string | null = null;
  private idSeq = 1;
  private loopSeconds = LOOP_SECONDS_DEFAULT;
  private lastPairKey = "";

  private behavior: MaskBehavior<unknown> | null = null;
  private params: ParamValues = {};
  private state: unknown = null;

  private playing = false;
  private elapsed = 0;
  private lastTs = 0;
  private playbackMode: PlaybackMode = "loop";
  private diagnostic: DiagnosticMode = "off";
  private registrationOn = false;
  private bwOn = false;

  onFrame: (() => void) | null = null;

  private clockMode: ClockMode = "auto";
  private holdPhase = 0;
  private profiling = false;
  private loopActive = false;
  private printInkDirty = true;
  private audioEnabled = true;
  /** Set by a user Play / Audio click. Boot autoplay stays muted so the
   * browser does not block video.play() before a gesture. */
  private audioUnlocked = false;
  /** Last video granted editorial audio. May outlive the active pair
   * (VIDEO → FIELD keeps the video audible). Never two at once. */
  private audioAsset: MediaAsset | null = null;
  private audioHysteresis: "hold" | "incoming" = "hold";
  private lastAudioPairKey = "";
  /** Independent of behaviour HOLD and of video Pause. Live FIELD topology
   * and Live frequency modulation both read this clock — HOLD does not
   * freeze it. Live FIELD is source motion, not behaviour motion. */
  private graphicElapsed = 0;
  lastProfile: FrameProfile | null = null;
  private exporting = false;
  private exportClock: { loopPhase: number; graphicTime: number } | null = null;
  private exportRestore: {
    cssWidth: number;
    cssHeight: number;
    clockMode: ClockMode;
    holdPhase: number;
    elapsed: number;
    graphicElapsed: number;
    playing: boolean;
    videos: { el: HTMLVideoElement; time: number; paused: boolean }[];
  } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.visible = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;

    // Loaded <video> elements live here — visually hidden, but attached
    // to the document so browsers keep decoding/playing them. They are
    // never drawn directly; only sampled into aLayer/bLayer each frame.
    this.videoHost = document.createElement("div");
    this.videoHost.setAttribute("aria-hidden", "true");
    this.videoHost.style.position = "fixed";
    this.videoHost.style.top = "0";
    this.videoHost.style.left = "0";
    this.videoHost.style.width = "1px";
    this.videoHost.style.height = "1px";
    this.videoHost.style.overflow = "hidden";
    this.videoHost.style.opacity = "0";
    this.videoHost.style.pointerEvents = "none";
    (canvas.parentElement ?? document.body).appendChild(this.videoHost);
  }

  getVideoHost(): HTMLElement {
    return this.videoHost;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (w === this.width && h === this.height && dpr === this.dpr) return;

    this.width = w;
    this.height = h;
    this.dpr = dpr;

    for (const c of [this.visible, this.aLayer, this.bLayer, this.maskLayer, this.boundaryLayer, this.bMasked, this.composedLayer]) {
      c.width = w;
      c.height = h;
    }
    this.visible.style.width = `${cssWidth}px`;
    this.visible.style.height = `${cssHeight}px`;

    this.syncGraphicRasters();
    this.invalidatePrintInk();
    this.renderFrame(); // repaint immediately so resize never shows a stale/blank frame
  }

  nextSourceId(): string {
    return `src-${this.idSeq++}`;
  }

  getSequence(): SequenceItem[] {
    return this.items;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  getSelectedItem(): SequenceItem | null {
    if (!this.selectedId) return this.items[0] ?? null;
    return this.items.find((item) => item.id === this.selectedId) ?? this.items[0] ?? null;
  }

  selectItem(id: string | null): void {
    this.selectedId = id;
  }

  setSequence(items: SequenceItem[], selectedId?: string | null): void {
    this.items = items;
    for (const item of items) {
      const n = Number.parseInt(item.id.replace(/^src-/, ""), 10);
      if (Number.isFinite(n)) this.idSeq = Math.max(this.idSeq, n + 1);
    }
    this.selectedId = selectedId ?? items[0]?.id ?? null;
    this.syncGraphicRasters();
    this.bindActivePair();
    this.invalidatePrintInk();
    this.renderFrame();
  }

  addSource(asset: MediaAsset, options?: { select?: boolean }): SequenceItem {
    const item: SequenceItem = { id: this.nextSourceId(), asset };
    this.items = [...this.items, item];
    if (options?.select !== false) this.selectedId = item.id;
    this.syncGraphicRasters();
    this.syncOneVideo(asset);
    this.bindActivePair();
    this.invalidatePrintInk();
    this.renderFrame();
    return item;
  }

  removeSource(id: string, options?: { dispose?: boolean }): SequenceItem | null {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const [removed] = this.items.splice(index, 1);
    if (!removed) return null;
    if (this.selectedId === id) this.selectedId = this.items[Math.min(index, this.items.length - 1)]?.id ?? null;
    this.bindActivePair();
    this.invalidatePrintInk();
    this.renderFrame();
    if (options?.dispose !== false) disposeMediaAsset(removed.asset);
    return removed;
  }

  moveSource(from: number, to: number): void {
    this.items = moveIndex(this.items, from, to);
    this.bindActivePair();
    this.invalidatePrintInk();
    this.renderFrame();
  }

  /** Reverse sequence order. Replaces Swap A/B now that slots are not permanent. */
  reverseSequence(): void {
    this.items = this.items.slice().reverse();
    this.bindActivePair();
    this.invalidatePrintInk();
    this.renderFrame();
  }

  replaceSource(id: string, asset: MediaAsset, options?: { disposePrevious?: boolean }): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const prev = this.items[index]!.asset;
    this.items[index] = { id, asset };
    this.syncGraphicRasters();
    this.syncOneVideo(asset);
    this.bindActivePair();
    this.invalidatePrintInk();
    this.renderFrame();
    const shouldDispose = options?.disposePrevious ?? true;
    if (prev && prev !== asset && shouldDispose) disposeMediaAsset(prev);
  }

  getSource(id: string): MediaAsset | null {
    return this.items.find((item) => item.id === id)?.asset ?? null;
  }

  getSourceAt(index: number): SequenceItem | null {
    return this.items[index] ?? null;
  }

  /** Replace sequence index 0 (A) or 1 (B). Not the moving active pair. */
  setMedia(slot: MediaSlot, asset: MediaAsset, options?: { disposePrevious?: boolean }): void {
    const index = slot === "A" ? 0 : 1;
    const item = this.items[index];
    if (item) {
      this.replaceSource(item.id, asset, options);
      return;
    }
    this.addSource(asset);
  }

  getMedia(slot: MediaSlot): MediaAsset | null {
    this.bindActivePair();
    return slot === "A" ? this.mediaA : this.mediaB;
  }

  getLoopSeconds(): number {
    return this.loopSeconds;
  }

  setLoopSeconds(seconds: number): void {
    const next = clampLoopSeconds(seconds);
    if (this.clockMode === "hold") {
      this.loopSeconds = next;
    } else {
      const phase = this.getLoopPhase();
      this.loopSeconds = next;
      this.elapsed = phase * this.loopSeconds;
    }
    this.renderFrame();
  }

  getActivePair(): PairMapping & { aId: string | null; bId: string | null } {
    const mapping = this.pairMapping();
    return {
      ...mapping,
      aId: this.items[mapping.aIndex]?.id ?? null,
      bId: this.items[mapping.bIndex]?.id ?? null,
    };
  }

  /** Framing lives on the asset itself (see MediaTransform), so reading it
   * back and writing to it are keyed by slot but never touch which asset
   * is loaded — swap, behavior, and playback state are all untouched. */
  getTransform(slot: MediaSlot): MediaTransform {
    const asset = slot === "A" ? this.mediaA : this.mediaB;
    return asset?.transform ?? { scale: 1, x: 0, y: 0 };
  }

  setTransform(slot: MediaSlot, transform: MediaTransform): void {
    const asset = slot === "A" ? this.mediaA : this.mediaB;
    if (!asset) return;
    asset.transform = clampTransform(transform);
    this.invalidatePrintInk();
    this.renderFrame();
  }

  getItemTransform(id: string): MediaTransform {
    const asset = this.getSource(id);
    return asset?.transform ?? { scale: 1, x: 0, y: 0 };
  }

  setItemTransform(id: string, transform: MediaTransform): void {
    const asset = this.getSource(id);
    if (!asset) return;
    asset.transform = clampTransform(transform);
    this.invalidatePrintInk();
    this.renderFrame();
  }

  resetTransform(slot: MediaSlot): void {
    this.setTransform(slot, { scale: 1, x: 0, y: 0 });
  }

  resetItemTransform(id: string): void {
    this.setItemTransform(id, { scale: 1, x: 0, y: 0 });
  }

  swap(): void {
    this.reverseSequence();
  }

  isSwapped(): boolean {
    return false;
  }

  /** Diagnostic only: render the raw mask or boundary field over black
   * instead of the usual composite. Purely a display-time branch in
   * renderFrame — it doesn't touch media, playback, or field generation in
   * any way. Cycles off -> mask -> boundary -> off; a behavior without
   * `renderBoundary` (Slabs) just falls back to the mask for that state. */
  cycleDiagnostic(): DiagnosticMode {
    const order: DiagnosticMode[] = ["off", "mask", "boundary"];
    this.diagnostic = order[(order.indexOf(this.diagnostic) + 1) % order.length];
    this.renderFrame();
    return this.diagnostic;
  }

  getDiagnostic(): DiagnosticMode {
    return this.diagnostic;
  }

  /** Global output-layer states — applied in `finalizeOutput` after
   * whichever behavior has already composed the frame, identically
   * whatever behavior/treatment/media combination is active. Neither
   * touches media, mask, or behavior state in any way. */
  setRegistrationEnabled(on: boolean): void {
    this.registrationOn = on;
    this.invalidatePrintInk();
    this.renderFrame();
  }

  isRegistrationEnabled(): boolean {
    return this.registrationOn;
  }

  setBWEnabled(on: boolean): void {
    this.bwOn = on;
    this.invalidatePrintInk();
    this.renderFrame();
  }

  isBWEnabled(): boolean {
    return this.bwOn;
  }

  lastFieldInk(): FieldInk | null {
    return lastFieldInk();
  }

  setBehavior<T>(behavior: MaskBehavior<T>, params: ParamValues): void {
    this.behavior = behavior as MaskBehavior<unknown>;
    this.params = params;
    this.state = behavior.createState(params);
    this.renderFrame();
  }

  setParams(params: ParamValues): void {
    if (!this.behavior) return;
    if (this.behavior.needsNewState(this.params, params)) {
      this.state = this.behavior.createState(params);
    }
    this.params = params;
    this.renderFrame();
  }

  setClockMode(mode: ClockMode): void {
    if (mode === this.clockMode) return;
    if (mode === "hold") {
      this.holdPhase = this.getLoopPhase();
    } else {
      this.elapsed = this.holdPhase * this.loopSeconds;
      this.lastTs = performance.now();
    }
    this.clockMode = mode;
    this.renderFrame();
  }

  getClockMode(): ClockMode {
    return this.clockMode;
  }

  setHoldPhase(phase: number): void {
    this.clockMode = "hold";
    this.holdPhase = clampLoopPhase(phase);
    this.renderFrame();
  }

  /** Global sequence position 0..1. Behaviours receive pair-local phase. */
  getPhase(): number {
    return this.getLoopPhase();
  }

  getLoopPhase(): number {
    if (this.exportClock) return this.exportClock.loopPhase;
    if (this.clockMode === "hold") return this.holdPhase;
    return loopPhaseFromElapsed(this.elapsed, this.loopSeconds);
  }

  getLocalPhase(): number {
    return this.pairMapping().localPhase;
  }

  setProfiling(on: boolean): void {
    this.profiling = on;
    if (!on) this.lastProfile = null;
  }

  setPlaybackMode(mode: PlaybackMode): void {
    this.playbackMode = mode;
    this.bindActivePair();
    this.renderFrame();
  }

  getPlaybackMode(): PlaybackMode {
    return this.playbackMode;
  }

  setAudioEnabled(on: boolean): void {
    this.audioEnabled = on;
    this.syncAudio();
  }

  unlockAudio(): void {
    this.audioUnlocked = true;
    this.syncAudio();
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  isAudioUnlocked(): boolean {
    return this.audioUnlocked;
  }

  hasVideoSource(): boolean {
    return this.items.some((item) => Boolean(item.asset.videoEl));
  }

  setSeamCandidate(mode: SeamCandidate): void {
    setSeamCandidate(mode);
    this.renderFrame();
  }

  getSeamCandidate(): SeamCandidate {
    return getSeamCandidate();
  }

  play(): void {
    this.playing = true;
    this.syncActiveVideos();
    this.syncAudio();
    this.startLoop();
  }

  pause(): void {
    this.playing = false;
    this.setVideoPaused(true);
    this.syncAudio();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCanvasSize(): { width: number; height: number; dpr: number } {
    return { width: this.width, height: this.height, dpr: this.dpr };
  }

  isExporting(): boolean {
    return this.exporting;
  }

  getVisibleCanvas(): HTMLCanvasElement {
    return this.visible;
  }

  getVisibleImageData(): ImageData {
    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  /** Pixel backing store for offline export. dpr is 1 so 1080 means 1080. */
  resizeExact(pixelW: number, pixelH: number): void {
    const w = Math.max(2, pixelW & ~1);
    const h = Math.max(2, pixelH & ~1);
    this.width = w;
    this.height = h;
    this.dpr = 1;
    for (const c of [this.visible, this.aLayer, this.bLayer, this.maskLayer, this.boundaryLayer, this.bMasked, this.composedLayer]) {
      c.width = w;
      c.height = h;
    }
    this.syncGraphicRasters();
    this.invalidatePrintInk();
  }

  beginExport(pixelW: number, pixelH: number): void {
    if (this.exporting) this.endExport();
    const videos: { el: HTMLVideoElement; time: number; paused: boolean }[] = [];
    for (const item of this.items) {
      const el = item.asset.videoEl;
      if (!el) continue;
      videos.push({ el, time: el.currentTime, paused: el.paused });
      el.pause();
    }
    this.exportRestore = {
      cssWidth: parseFloat(this.visible.style.width) || this.width / this.dpr,
      cssHeight: parseFloat(this.visible.style.height) || this.height / this.dpr,
      clockMode: this.clockMode,
      holdPhase: this.holdPhase,
      elapsed: this.elapsed,
      graphicElapsed: this.graphicElapsed,
      playing: this.playing,
      videos,
    };
    this.exporting = true;
    this.playing = false;
    this.exportClock = { loopPhase: 0, graphicTime: 0 };
    this.lastAudioPairKey = "";
    this.audioHysteresis = "hold";
    this.audioAsset = null;
    resetFieldInkSmoothing();
    if (pixelW !== this.width || pixelH !== this.height) this.resizeExact(pixelW, pixelH);
  }

  endExport(): void {
    const snap = this.exportRestore;
    this.exporting = false;
    this.exportClock = null;
    this.exportRestore = null;
    if (!snap) return;
    this.clockMode = snap.clockMode;
    this.holdPhase = snap.holdPhase;
    this.elapsed = snap.elapsed;
    this.graphicElapsed = snap.graphicElapsed;
    this.playing = snap.playing;
    for (const v of snap.videos) {
      try {
        v.el.currentTime = v.time;
        if (!v.paused && snap.playing) void v.el.play().catch(() => undefined);
        else v.el.pause();
      } catch {
        /* seek restore is best-effort */
      }
    }
    this.resize(snap.cssWidth, snap.cssHeight);
    if (snap.playing) {
      this.syncActiveVideos();
      this.syncAudio();
    }
    this.renderFrame();
  }

  async renderExportFrame(timeSec: number): Promise<void> {
    this.exportClock = {
      loopPhase: loopPhaseFromElapsed(timeSec, this.loopSeconds),
      graphicTime: Math.max(0, timeSec),
    };
    this.bindActivePair();
    await this.seekActivePairVideos(timeSec);
    this.renderFrame();
  }

  audioOwnerAt(loopPhase: number): MediaAsset | null {
    const prev = this.exportClock;
    this.exportClock = { loopPhase, graphicTime: loopPhase * this.loopSeconds };
    this.bindActivePair();
    const mapping = this.pairMapping();
    const owner = mapping.untreated
      ? videoMayOwnAudio(this.mediaA)
        ? this.mediaA
        : this.items.find((item) => videoMayOwnAudio(item.asset))?.asset ?? null
      : this.pickAudioAsset(mapping.localPhase);
    this.exportClock = prev;
    return owner;
  }

  resetExportAudioCursor(): void {
    this.lastAudioPairKey = "";
    this.audioHysteresis = "hold";
    this.audioAsset = null;
  }

  private async seekActivePairVideos(timeSec: number): Promise<void> {
    const active = new Set<HTMLVideoElement>();
    for (const asset of [this.mediaA, this.mediaB]) {
      if (asset?.videoEl) active.add(asset.videoEl);
    }
    for (const item of this.items) {
      const el = item.asset.videoEl;
      if (el && !active.has(el)) el.pause();
    }
    await Promise.all([...active].map((el) => seekVideoFrame(el, timeSec)));
  }

  mediaInfo(): {
    swapped: boolean;
    playing: boolean;
    sequenceLength: number;
    loopPhase: number;
    localPhase: number;
    behaviorPhase: number;
    pairIndex: number;
    resolve: number;
    seam: string;
    audioLabel: string | null;
    audioUnlocked: boolean;
    A: { kind: string; label: string; w: number; h: number; paused: boolean | null; currentTime: number | null; muted: boolean | null; motion: string | null } | null;
    B: { kind: string; label: string; w: number; h: number; paused: boolean | null; currentTime: number | null; muted: boolean | null; motion: string | null } | null;
  } {
    const mapping = this.pairMapping();
    const slot = (asset: MediaAsset | null) =>
      asset
        ? {
            kind: asset.kind,
            label: asset.label,
            w: asset.naturalW,
            h: asset.naturalH,
            paused: asset.videoEl ? asset.videoEl.paused : null,
            currentTime: asset.videoEl ? asset.videoEl.currentTime : null,
            muted: asset.videoEl ? asset.videoEl.muted : null,
            motion: asset.graphic?.getMotion() ?? null,
          }
        : null;
    const env = sequenceEnvelope(
      this.behavior?.id,
      this.params.treatment as string | undefined,
      mapping.localPhase,
    );
    return {
      swapped: false,
      playing: this.playing,
      sequenceLength: this.items.length,
      loopPhase: this.getLoopPhase(),
      localPhase: mapping.localPhase,
      behaviorPhase: env.behaviorPhase,
      pairIndex: mapping.pairIndex,
      resolve: env.resolve,
      seam: getSeamCandidate(),
      audioLabel: this.audioAsset?.label ?? null,
      audioUnlocked: this.audioUnlocked,
      A: slot(this.mediaA),
      B: slot(this.mediaB),
    };
  }

  /** Source pixels changed (graphic params, etc.) — Print ink must rebuild. */
  touchMedia(): void {
    this.invalidatePrintInk();
    this.renderFrame();
  }

  forEachSource(fn: (item: SequenceItem) => void): void {
    for (const item of this.items) fn(item);
  }

  private invalidatePrintInk(): void {
    this.printInkDirty = true;
  }

  private syncGraphicRasters(): void {
    if (this.width < 1 || this.height < 1) return;
    for (const item of this.items) {
      const g = item.asset.graphic;
      if (!g) continue;
      g.setRasterSize(this.width, this.height, this.dpr);
    }
  }

  private pairMapping(): PairMapping {
    return resolveActivePair(this.items.length, this.getLoopPhase(), this.playbackMode);
  }

  private bindActivePair(): void {
    const mapping = this.pairMapping();
    const a = this.items[mapping.aIndex]?.asset ?? null;
    const b = mapping.untreated ? a : this.items[mapping.bIndex]?.asset ?? null;
    this.mediaA = a;
    this.mediaB = b;
    const key = `${mapping.aIndex}/${mapping.bIndex}/${mapping.untreated ? "u" : "p"}`;
    if (key !== this.lastPairKey) {
      this.lastPairKey = key;
      this.printInkDirty = true;
      if (!this.exporting) this.syncActiveVideos();
    }
  }

  private hasLiveSource(): boolean {
    return [this.mediaA, this.mediaB].some(
      (a) => Boolean(a?.videoEl) || a?.graphic?.getMotion() === "live",
    );
  }

  private paintGraphics(): void {
    const selected = this.getSelectedItem()?.asset ?? null;
    const seen = new Set<MediaAsset>();
    for (const asset of [this.mediaA, this.mediaB, selected]) {
      if (!asset || seen.has(asset)) continue;
      seen.add(asset);
      const g = asset.graphic;
      if (!g) continue;
      const live = g.getMotion() === "live";
      const t = live ? (this.exportClock?.graphicTime ?? this.graphicElapsed) : 0;
      if (!g.dirty && !live) continue;
      g.paint(t);
      g.paintedAt = t;
      g.dirty = false;
      this.printInkDirty = true;
    }
  }

  private syncOneVideo(asset: MediaAsset): void {
    if (!asset.videoEl) return;
    if (this.playing) void asset.videoEl.play().catch(() => undefined);
    else asset.videoEl.pause();
  }

  /** Keep every sequence video decoding while Play is on. Pair changes
   * only retarget mute — they must not pause/play, which clicks and can
   * reset decoder state. */
  private syncActiveVideos(): void {
    for (const item of this.items) {
      const video = item.asset.videoEl;
      if (!video) continue;
      if (this.playing) void video.play().catch(() => undefined);
      else video.pause();
    }
  }

  private startLoop(): void {
    if (this.loopActive) return;
    this.loopActive = true;
    this.lastTs = performance.now();
    requestAnimationFrame(this.tick);
  }

  private tick = (ts: number): void => {
    if (this.exporting) {
      this.lastTs = ts;
      if (this.loopActive) requestAnimationFrame(this.tick);
      return;
    }
    const dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (this.clockMode === "auto") this.elapsed += dt;
    if (this.playing) this.graphicElapsed += dt;
    this.graphicElapsed += dt;
    this.renderFrame();
    this.syncAudio();
    if (this.loopActive) requestAnimationFrame(this.tick);
  };

  private setVideoPaused(paused: boolean): void {
    if (paused) {
      for (const item of this.items) {
        item.asset.videoEl?.pause();
      }
      return;
    }
    this.syncActiveVideos();
  }

  /** Pair progress 0→1 is remapped onto the behaviour's native phase so a
   * pair ends at peak B (not the native return to A). Next pair's A is this
   * pair's B — dominant source continues. */
  private effectiveTime(): number {
    const env = sequenceEnvelope(
      this.behavior?.id,
      this.params.treatment as string | undefined,
      this.pairMapping().localPhase,
    );
    return timeFromPhase(this.behavior?.id, env.behaviorPhase, this.params);
  }

  /**
   * Editorial audio owner — not visual-mask fluctuation.
   *
   * A source with a video track may own sound when it is the incoming /
   * dominant editorial source (localPhase ≥ 0.55 with hysteresis at 0.45).
   * FIELD and stills never take ownership. If the visually dominant source
   * has no audio, keep the most recently relevant video in the sequence.
   * Pair changes do not restart a continuing video. Never two unmuted.
   */
  private pickAudioAsset(progress: number): MediaAsset | null {
    const a = this.mediaA;
    const b = this.mediaB;
    const aVid = videoMayOwnAudio(a) ? a : null;
    const bVid = videoMayOwnAudio(b) ? b : null;
    if (this.lastPairKey !== this.lastAudioPairKey) {
      this.lastAudioPairKey = this.lastPairKey;
      this.audioHysteresis = "hold";
      if (this.audioAsset && this.audioAsset !== a && this.audioAsset !== b) {
        // Previous owner left the pair. Keep it until an incoming video
        // becomes editorially dominant — unless neither slot has video.
        if (!aVid && !bVid && this.items.some((item) => item.asset === this.audioAsset)) {
          return this.audioAsset;
        }
      }
    }
    if (this.audioHysteresis === "hold" && progress >= 0.55 && bVid) this.audioHysteresis = "incoming";
    else if (this.audioHysteresis === "incoming" && progress < 0.45) this.audioHysteresis = "hold";

    const incoming = this.audioHysteresis === "incoming" ? bVid : null;
    if (incoming) {
      this.audioAsset = incoming;
      return incoming;
    }
    if (aVid) {
      this.audioAsset = aVid;
      return aVid;
    }
    if (videoMayOwnAudio(this.audioAsset) && this.items.some((item) => item.asset === this.audioAsset)) {
      return this.audioAsset;
    }
    if (bVid) {
      this.audioAsset = bVid;
      return bVid;
    }
    this.audioAsset = null;
    return null;
  }

  private syncAudio(): void {
    this.bindActivePair();
    const mapping = this.pairMapping();
    const owner = mapping.untreated
      ? videoMayOwnAudio(this.mediaA)
        ? this.mediaA
        : this.items.find((item) => videoMayOwnAudio(item.asset))?.asset ?? null
      : this.pickAudioAsset(mapping.localPhase);
    const wantSound = this.playing && this.audioEnabled && this.audioUnlocked && Boolean(owner?.videoEl);
    for (const item of this.items) {
      const video = item.asset.videoEl;
      if (!video) continue;
      video.muted = !(wantSound && item.asset === owner);
    }
  }

  private photoInkKey(asset: MediaAsset): string {
    const t = asset.transform;
    return `${asset.kind}:${asset.label}:${t.scale}:${t.x}:${t.y}:${this.bwOn ? "bw" : "c"}`;
  }

  private applyPhotographicFieldInk(): void {
    const a = this.mediaA;
    const b = this.mediaB;
    if (!a || !b) return;
    const aField = a.kind === "graphic";
    const bField = b.kind === "graphic";
    const aPhoto = a.kind !== "graphic";
    const bPhoto = b.kind !== "graphic";
    if (aField && bPhoto) {
      applyFieldInk(this.aLayer, deriveFieldInk(this.bLayer, this.photoInkKey(b), Boolean(b.videoEl), this.bwOn));
    }
    if (bField && aPhoto) {
      applyFieldInk(this.bLayer, deriveFieldInk(this.aLayer, this.photoInkKey(a), Boolean(a.videoEl), this.bwOn));
    }
  }

  private drawMediaLayer(ctx: CanvasRenderingContext2D, asset: MediaAsset | null): void {
    ctx.clearRect(0, 0, this.width, this.height);
    if (asset) {
      ctx.imageSmoothingEnabled = asset.kind !== "graphic";
      drawTransformedCoverFit(ctx, asset.source, asset.naturalW, asset.naturalH, this.width, this.height, asset.transform);
      ctx.imageSmoothingEnabled = true;
    }
  }

  /** Renders exactly one frame at the current time without advancing
   * playback. Media layers are redrawn fresh every call (cheap cover-fit
   * draws) so a live video source is always sampled at its current
   * frame — this is what keeps video playback fully decoupled from the
   * mask animation loop. */
  renderFrame(): void {
    const { width, height } = this;
    if (width === 0 || height === 0) return;

    const t0 = this.profiling ? performance.now() : 0;
    const mark = (): number => (this.profiling ? performance.now() : 0);

    this.bindActivePair();
    this.paintGraphics();
    const tGraphic = mark();

    const mapping = this.pairMapping();
    this.drawMediaLayer(this.aLayer.getContext("2d")!, this.mediaA);
    this.drawMediaLayer(this.bLayer.getContext("2d")!, this.mediaB);
    const tMedia = mark();
    this.applyPhotographicFieldInk();
    const tInk = mark();

    if (mapping.untreated) {
      const maskCtx = this.maskLayer.getContext("2d")!;
      maskCtx.clearRect(0, 0, width, height);
      const composedCtx = this.composedLayer.getContext("2d")!;
      composedCtx.clearRect(0, 0, width, height);
      composedCtx.drawImage(this.aLayer, 0, 0);
      this.finalizeOutput(composedCtx, width, height, t0, tGraphic, tMedia, tInk, tInk, tInk, mark());
      return;
    }

    const time = this.effectiveTime();
    const maskCtx = this.maskLayer.getContext("2d")!;
    maskCtx.clearRect(0, 0, width, height);
    if (this.behavior) {
      maskCtx.save();
      this.behavior.renderMask(maskCtx, width, height, time, this.params, this.state, this.bLayer, this.aLayer);
      maskCtx.restore();
    }

    const hasBoundary = !!this.behavior?.renderBoundary;
    const needsBoundary = hasBoundary && this.diagnostic === "boundary";
    if (needsBoundary) {
      const boundaryCtx = this.boundaryLayer.getContext("2d")!;
      boundaryCtx.clearRect(0, 0, width, height);
      boundaryCtx.save();
      this.behavior!.renderBoundary!(boundaryCtx, width, height, time, this.params, this.state);
      boundaryCtx.restore();
    }
    const tMask = mark();

    if (this.diagnostic !== "off") {
      const showBoundary = this.diagnostic === "boundary" && hasBoundary;
      this.ctx.fillStyle = "#000000";
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.drawImage(showBoundary ? this.boundaryLayer : this.maskLayer, 0, 0);
      this.onFrame?.();
      return;
    }

    const composedCtx = this.composedLayer.getContext("2d")!;

    if (this.behavior?.renderComposite) {
      this.behavior.renderComposite(
        composedCtx,
        this.aLayer,
        this.bLayer,
        this.maskLayer,
        null,
        width,
        height,
        time,
        this.params,
        this.state
      );
    } else {
      const bmCtx = this.bMasked.getContext("2d")!;
      bmCtx.clearRect(0, 0, width, height);
      bmCtx.globalCompositeOperation = "source-over";
      bmCtx.drawImage(this.bLayer, 0, 0);
      bmCtx.globalCompositeOperation = "destination-in";
      bmCtx.drawImage(this.maskLayer, 0, 0);
      bmCtx.globalCompositeOperation = "source-over";

      composedCtx.clearRect(0, 0, width, height);
      composedCtx.drawImage(this.aLayer, 0, 0);
      composedCtx.drawImage(this.bMasked, 0, 0);
    }
    const tComposite = mark();
    const env = sequenceEnvelope(
      this.behavior?.id,
      this.params.treatment as string | undefined,
      mapping.localPhase,
    );
    this.applySequenceResolve(composedCtx, env.resolve);
    const tResolve = mark();
    this.finalizeOutput(composedCtx, width, height, t0, tGraphic, tMedia, tInk, tMask, tComposite, tResolve);
  }

  /** Sequence-only: expand B through a dilation of the existing behaviour
   * mask. Isolated from Bloom's HOLD language. Not a full-frame opacity
   * crossfade. */
  private applySequenceResolve(composedCtx: CanvasRenderingContext2D, resolve: number): void {
    if (resolve < 0.008) return;
    const { width, height } = this;
    const radius = resolve * 0.2 * Math.min(width, height);
    const dctx = this.bMasked.getContext("2d")!;
    dctx.clearRect(0, 0, width, height);
    dctx.globalCompositeOperation = "source-over";
    dctx.drawImage(this.maskLayer, 0, 0);
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      dctx.drawImage(this.maskLayer, Math.cos(a) * radius, Math.sin(a) * radius);
    }
    dctx.globalCompositeOperation = "source-in";
    dctx.drawImage(this.bLayer, 0, 0);
    dctx.globalCompositeOperation = "source-over";
    composedCtx.drawImage(this.bMasked, 0, 0);
  }

  private finalizeOutput(
    composedCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t0: number,
    tGraphic: number,
    tMedia: number,
    tInk: number,
    tMask: number,
    tComposite: number,
    tResolve = tComposite,
  ): void {
    const mark = (): number => (this.profiling ? performance.now() : 0);

    const tPrep0 = mark();
    if (this.registrationOn) {
      if (this.hasLiveSource() || this.printInkDirty) {
        prepareGlobalPrintInk(
          this.bLayer,
          width,
          height,
          this.dpr,
          this.composedLayer,
          this.hasLiveSource(),
          this.bwOn,
        );
        if (!this.hasLiveSource()) this.printInkDirty = false;
      }
    }
    const tPrep = mark();
    if (this.registrationOn) {
      const reactive =
        this.behavior?.id === "shift" && this.params.treatment === "diffuse"
          ? REACTIVE_REGISTRATION_AMOUNT * 0.55
          : REACTIVE_REGISTRATION_AMOUNT;
      paintPersistentRegistration(composedCtx, this.bLayer, width, height, BASE_REGISTRATION_AMOUNT);
      paintReactiveRegistration(composedCtx, this.bLayer, this.maskLayer, width, height, reactive);
    }
    const tReg = mark();

    this.ctx.clearRect(0, 0, width, height);
    if (this.bwOn) {
      this.ctx.filter = "grayscale(1)";
      this.ctx.drawImage(this.composedLayer, 0, 0);
      this.ctx.filter = "none";
    } else {
      this.ctx.drawImage(this.composedLayer, 0, 0);
    }
    const tOut = mark();

    if (this.profiling) {
      this.lastProfile = {
        graphicMs: tGraphic - t0,
        mediaMs: tMedia - tGraphic,
        fieldInkMs: tInk - tMedia,
        maskMs: tMask - tInk,
        compositeMs: tComposite - tMask,
        resolveMs: tResolve - tComposite,
        printPrepMs: tPrep - tPrep0,
        registrationMs: tReg - tPrep,
        outputMs: tOut - tReg,
        totalMs: tOut - t0,
      };
    }

    this.onFrame?.();
  }
}
