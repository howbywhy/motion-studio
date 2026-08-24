import { drawCoverFit } from "./coverFit";
import { pingPong } from "./easing";
import type { MaskBehavior, ParamValues } from "./types";

export type PlaybackMode = "loop" | "pingpong";

const PING_PONG_PERIOD = 6; // seconds — bounce cycle length, independent of behavior speed
const MAX_DPR = 2;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  return c;
}

/**
 * Owns the full compositing pipeline. Image A and Image B are each drawn,
 * independently, cover-fit into same-size offscreen canvases whenever they
 * change or the frame resizes — this is the single source of truth for
 * "identically cropped, full-frame, aligned". Every animation frame only
 * the mask is redrawn; A and B pixel content never moves, resizes, or
 * shifts on its own. B is revealed strictly by compositing a fresh mask
 * with `destination-in`, then drawing that over the static A layer — so
 * visibility is controlled by the mask alone, and any area the mask
 * doesn't touch simply shows A (never black, since A always fully covers
 * the frame).
 */
export class Renderer {
  private readonly visible: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private readonly aLayer = makeCanvas();
  private readonly bLayer = makeCanvas();
  private readonly maskLayer = makeCanvas();
  private readonly bMasked = makeCanvas();

  private width = 0;
  private height = 0;
  private dpr = 1;

  private imgA: CanvasImageSource | null = null;
  private imgB: CanvasImageSource | null = null;
  private imgASize: { w: number; h: number } | null = null;
  private imgBSize: { w: number; h: number } | null = null;

  private behavior: MaskBehavior<unknown> | null = null;
  private params: ParamValues = {};
  private state: unknown = null;

  private playing = false;
  private elapsed = 0;
  private lastTs = 0;
  private rafId = 0;
  private playbackMode: PlaybackMode = "loop";

  private swapped = false;

  onFrame: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.visible = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
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

    this.redrawStaticLayers();
    this.renderFrame(); // repaint immediately so resize never shows a stale/blank frame
  }

  setImageA(img: CanvasImageSource, naturalW: number, naturalH: number): void {
    this.imgA = img;
    this.imgASize = { w: naturalW, h: naturalH };
    this.redrawStaticLayers();
    this.renderFrame();
  }

  setImageB(img: CanvasImageSource, naturalW: number, naturalH: number): void {
    this.imgB = img;
    this.imgBSize = { w: naturalW, h: naturalH };
    this.redrawStaticLayers();
    this.renderFrame();
  }

  swap(): void {
    this.swapped = !this.swapped;
    this.redrawStaticLayers();
    this.renderFrame();
  }

  isSwapped(): boolean {
    return this.swapped;
  }

  private redrawStaticLayers(): void {
    if (this.width === 0 || this.height === 0) return;

    const bottomImg = this.swapped ? this.imgB : this.imgA;
    const bottomSize = this.swapped ? this.imgBSize : this.imgASize;
    const topImg = this.swapped ? this.imgA : this.imgB;
    const topSize = this.swapped ? this.imgASize : this.imgBSize;

    const actx = this.aLayer.getContext("2d")!;
    actx.clearRect(0, 0, this.width, this.height);
    if (bottomImg && bottomSize) {
      drawCoverFit(actx, bottomImg, bottomSize.w, bottomSize.h, this.width, this.height);
    }

    const bctx = this.bLayer.getContext("2d")!;
    bctx.clearRect(0, 0, this.width, this.height);
    if (topImg && topSize) {
      drawCoverFit(bctx, topImg, topSize.w, topSize.h, this.width, this.height);
    }
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

  /** Renders exactly one frame at the current time without advancing playback. */
  renderFrame(): void {
    const { width, height } = this;
    if (width === 0 || height === 0) return;

    const maskCtx = this.maskLayer.getContext("2d")!;
    maskCtx.clearRect(0, 0, width, height);
    if (this.behavior) {
      maskCtx.save();
      this.behavior.renderMask(maskCtx, width, height, this.effectiveTime(), this.params, this.state);
      maskCtx.restore();
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
