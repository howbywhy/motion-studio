import { drawCoverFit } from "./coverFit";
import { pingPong } from "./easing";
import { disposeMediaAsset, type MediaAsset } from "./media";
import type { MaskBehavior, ParamValues } from "./types";

export type PlaybackMode = "loop" | "pingpong";
export type MediaSlot = "A" | "B";

const PING_PONG_PERIOD = 6; // seconds — bounce cycle length, independent of behavior speed
const MAX_DPR = 2;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  return c;
}

/**
 * Owns the full compositing pipeline. Media A and Media B (each an image
 * or a video) are cover-fit into same-size offscreen canvases fresh on
 * every single render — this is the single source of truth for
 * "identically cropped, full-frame, aligned", and it's what lets a video
 * source just keep playing on its own: each frame we simply sample
 * whatever frame the <video> element currently shows via drawImage,
 * nothing about the source is ever reloaded or seeked. B is revealed
 * strictly by compositing a fresh mask with `destination-in`, then drawing
 * that over the A layer — so visibility is controlled by the mask alone,
 * and any area the mask doesn't touch simply shows A (never black, since A
 * always fully covers the frame).
 */
export class Renderer {
  private readonly visible: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly videoHost: HTMLDivElement;

  private readonly aLayer = makeCanvas();
  private readonly bLayer = makeCanvas();
  private readonly maskLayer = makeCanvas();
  private readonly bMasked = makeCanvas();

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
  private showMask = false;

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

    for (const c of [this.visible, this.aLayer, this.bLayer, this.maskLayer, this.bMasked]) {
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

  swap(): void {
    this.swapped = !this.swapped;
    this.renderFrame();
  }

  isSwapped(): boolean {
    return this.swapped;
  }

  /** Diagnostic only: render the raw alpha mask over black instead of the
   * usual A/B composite. Purely a display-time branch in renderFrame — it
   * doesn't touch media, playback, or mask generation in any way. */
  setShowMask(show: boolean): void {
    this.showMask = show;
    this.renderFrame();
  }

  isShowingMask(): boolean {
    return this.showMask;
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
    if (asset) drawCoverFit(ctx, asset.source, asset.naturalW, asset.naturalH, this.width, this.height);
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

    const maskCtx = this.maskLayer.getContext("2d")!;
    maskCtx.clearRect(0, 0, width, height);
    if (this.behavior) {
      maskCtx.save();
      this.behavior.renderMask(maskCtx, width, height, this.effectiveTime(), this.params, this.state);
      maskCtx.restore();
    }

    if (this.showMask) {
      // Diagnostic: the mask alone, over black — white where B would show,
      // black where A would show, soft greys wherever the mask itself is
      // partial (blurred edges, Bloom's falloff). Media isn't touched.
      this.ctx.fillStyle = "#000000";
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.drawImage(this.maskLayer, 0, 0);
      this.onFrame?.();
      return;
    }

    const bmCtx = this.bMasked.getContext("2d")!;
    bmCtx.clearRect(0, 0, width, height);
    bmCtx.globalCompositeOperation = "source-over";
    bmCtx.drawImage(this.bLayer, 0, 0);
    bmCtx.globalCompositeOperation = "destination-in";
    bmCtx.drawImage(this.maskLayer, 0, 0);
    bmCtx.globalCompositeOperation = "source-over";

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(this.aLayer, 0, 0);
    this.ctx.drawImage(this.bMasked, 0, 0);

    this.onFrame?.();
  }
}
