import { drawTransformedCoverFit } from "./coverFit";
import { pingPong } from "./easing";
import { clampTransform, disposeMediaAsset, type MediaAsset, type MediaTransform } from "./media";
import { BASE_REGISTRATION_AMOUNT, REACTIVE_REGISTRATION_AMOUNT, paintPersistentRegistration, paintReactiveRegistration } from "./registrationInk";
import type { MaskBehavior, ParamValues } from "./types";

export type PlaybackMode = "loop" | "pingpong";
export type MediaSlot = "A" | "B";
export type DiagnosticMode = "off" | "mask" | "boundary";

const PING_PONG_PERIOD = 6; // seconds — bounce cycle length, independent of behavior speed
const MAX_DPR = 2;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  return c;
}

/**
 * Owns the full compositing pipeline. Media A and Media B (each an image
 * or a video) are cover-fit — then further scaled/panned by that asset's
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

  private behavior: MaskBehavior<unknown> | null = null;
  private params: ParamValues = {};
  private state: unknown = null;

  private playing = false;
  private elapsed = 0;
  private lastTs = 0;
  private rafId = 0;
  private playbackMode: PlaybackMode = "loop";

  private swapped = false;
  private diagnostic: DiagnosticMode = "off";
  private registrationOn = false;
  private bwOn = false;

  onFrame: (() => void) | null = null;

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

    this.renderFrame(); // repaint immediately so resize never shows a stale/blank frame
  }

  /** Loads a new asset into slot A or B. Mask behavior/params/state are
   * untouched — media and mask animation are fully independent. */
  setMedia(slot: MediaSlot, asset: MediaAsset): void {
    const prev = slot === "A" ? this.mediaA : this.mediaB;
    if (slot === "A") this.mediaA = asset;
    else this.mediaB = asset;
    this.renderFrame();
    if (prev && prev !== asset) disposeMediaAsset(prev);
  }

  getMedia(slot: MediaSlot): MediaAsset | null {
    return slot === "A" ? this.mediaA : this.mediaB;
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
    this.renderFrame();
  }

  resetTransform(slot: MediaSlot): void {
    this.setTransform(slot, { scale: 1, x: 0, y: 0 });
  }

  swap(): void {
    this.swapped = !this.swapped;
    this.renderFrame();
  }

  isSwapped(): boolean {
    return this.swapped;
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
    this.renderFrame();
  }

  isRegistrationEnabled(): boolean {
    return this.registrationOn;
  }

  setBWEnabled(on: boolean): void {
    this.bwOn = on;
    this.renderFrame();
  }

  isBWEnabled(): boolean {
    return this.bwOn;
  }

  setBehavior<T>(behavior: MaskBehavior<T>, params: ParamValues): void {
    this.behavior = behavior as MaskBehavior<unknown>;
    this.params = params;
    this.state = behavior.createState(params);
  }

  setParams(params: ParamValues): void {
    if (!this.behavior) return;
    if (this.behavior.needsNewState(this.params, params)) {
      this.state = this.behavior.createState(params);
    }
    this.params = params;
  }

  setPlaybackMode(mode: PlaybackMode): void {
    this.playbackMode = mode;
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private tick = (ts: number): void => {
    const dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    this.elapsed += dt;
    this.renderFrame();
    if (this.playing) this.rafId = requestAnimationFrame(this.tick);
  };

  private effectiveTime(): number {
    if (this.playbackMode === "pingpong") {
      return pingPong(this.elapsed, PING_PONG_PERIOD / 2) * PING_PONG_PERIOD;
    }
    return this.elapsed;
  }

  private drawMediaLayer(ctx: CanvasRenderingContext2D, asset: MediaAsset | null): void {
    ctx.clearRect(0, 0, this.width, this.height);
    if (asset) {
      drawTransformedCoverFit(ctx, asset.source, asset.naturalW, asset.naturalH, this.width, this.height, asset.transform);
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

    const bottom = this.swapped ? this.mediaB : this.mediaA;
    const top = this.swapped ? this.mediaA : this.mediaB;
    this.drawMediaLayer(this.aLayer.getContext("2d")!, bottom);
    this.drawMediaLayer(this.bLayer.getContext("2d")!, top);

    const time = this.effectiveTime();
    const maskCtx = this.maskLayer.getContext("2d")!;
    maskCtx.clearRect(0, 0, width, height);
    if (this.behavior) {
      maskCtx.save();
      this.behavior.renderMask(maskCtx, width, height, time, this.params, this.state, this.bLayer, this.aLayer);
      maskCtx.restore();
    }

    // The boundary layer is only ever consumed by the diagnostic view — no
    // treatment reads this canvas, each derives its own ring geometry
    // directly from the fields it already has — so skip the extra pass
    // entirely unless it's actually about to be displayed.
    const hasBoundary = !!this.behavior?.renderBoundary;
    const needsBoundary = hasBoundary && this.diagnostic === "boundary";
    if (needsBoundary) {
      const boundaryCtx = this.boundaryLayer.getContext("2d")!;
      boundaryCtx.clearRect(0, 0, width, height);
      boundaryCtx.save();
      this.behavior!.renderBoundary!(boundaryCtx, width, height, time, this.params, this.state);
      boundaryCtx.restore();
    }

    if (this.diagnostic !== "off") {
      // Diagnostic: the raw field alone, over black — white = fully active,
      // black = inactive, soft greys wherever the field itself is partial
      // (blurred mask edges, the boundary ring). Media isn't touched.
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
        // Boundary is only ever (re)computed for the diagnostic view (see
        // above) — this branch never runs while that's showing, so there's
        // no fresh boundary canvas to hand a treatment here. No current
        // treatment needs it (each derives its own ring geometry from the
        // fields it already has); a future one that does would need this
        // reworked to compute boundary unconditionally again.
        null,
        width,
        height,
        time,
        this.params,
        this.state
      );
      this.finalizeOutput(width, height);
      return;
    }

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

    this.finalizeOutput(width, height);
  }

  /** Applies the global, behavior-agnostic output-layer states on top of
   * whatever the behavior just composed into `composedLayer`, then copies
   * the result onto the visible canvas. With both states off this is a
   * byte-for-byte copy — no filter, no extra pass — so the visible frame is
   * pixel-identical to drawing the behavior's composite straight to the
   * visible canvas, as before this indirection existed. */
  private finalizeOutput(width: number, height: number): void {
    const composedCtx = this.composedLayer.getContext("2d")!;
    if (this.registrationOn) {
      // Persistent base first (unmasked, subtle, present everywhere) --
      // then the reactive layer on top (mask-gated, pronounced), so
      // activity intensifies the same surface language rather than
      // introducing it from zero.
      paintPersistentRegistration(composedCtx, this.bLayer, width, height, BASE_REGISTRATION_AMOUNT);
      paintReactiveRegistration(composedCtx, this.bLayer, this.maskLayer, width, height, REACTIVE_REGISTRATION_AMOUNT);
    }

    this.ctx.clearRect(0, 0, width, height);
    if (this.bwOn) {
      this.ctx.filter = "grayscale(1)";
      this.ctx.drawImage(this.composedLayer, 0, 0);
      this.ctx.filter = "none";
    } else {
      this.ctx.drawImage(this.composedLayer, 0, 0);
    }

    this.onFrame?.();
  }
}
