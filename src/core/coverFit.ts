import type { MediaTransform } from "./media";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes the source crop rect (in source pixel space) that fills a
 * destination of size (dstW x dstH) with no gaps and no distortion —
 * equivalent to CSS `background-size: cover`, centered.
 *
 * This is what guarantees Image A and Image B are always "full-frame,
 * identically cropped": both images are independently cover-fit to the
 * exact same destination rect (0,0,dstW,dstH), so regardless of their
 * own native resolution/aspect ratio, they occupy identical frame
 * coordinates with zero letterboxing.
 */
export function coverFitSourceRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Rect {
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  let w = srcW;
  let h = srcH;

  if (srcAspect > dstAspect) {
    // source is relatively wider than destination -> crop left/right
    w = srcH * dstAspect;
    h = srcH;
  } else {
    // source is relatively taller than destination -> crop top/bottom
    w = srcW;
    h = srcW / dstAspect;
  }

  const x = (srcW - w) / 2;
  const y = (srcH - h) / 2;
  return { x, y, w, h };
}

/**
 * The cover-fit rect further scaled/panned by a user transform. `scale` 1
 * reproduces the plain cover-fit rect exactly (the documented "100% =
 * current cover crop" baseline); increasing it shrinks the crop window
 * toward its own center, zooming in. `x`/`y` then pan that window within
 * whatever slack the zoom opened up, as a -1..1 fraction of it — since the
 * window's size is always `base/scale` and its position is always
 * `base.origin + slack * fraction` with `fraction` clamped to [-1,1], the
 * window can never leave the bounds of the base cover-fit rect, which
 * itself never leaves the source image. No separate clamping is needed
 * for "never expose empty canvas" — it falls out of this construction.
 */
export function coverFitTransformedRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  transform: MediaTransform
): Rect {
  const base = coverFitSourceRect(srcW, srcH, dstW, dstH);
  const scale = Math.max(1, transform.scale);
  const w = base.w / scale;
  const h = base.h / scale;
  const slackW = base.w - w;
  const slackH = base.h - h;
  const panX = Math.min(1, Math.max(-1, transform.x));
  const panY = Math.min(1, Math.max(-1, transform.y));
  const x = base.x + (slackW / 2) * (1 + panX);
  const y = base.y + (slackH / 2) * (1 + panY);
  return { x, y, w, h };
}

/** Draws `img` onto `ctx` covering the full ctx canvas, cover-fit and then
 * further scaled/panned per `transform` (identity reproduces plain
 * cover-fit). */
export function drawTransformedCoverFit(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  transform: MediaTransform
): void {
  const r = coverFitTransformedRect(srcW, srcH, dstW, dstH, transform);
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, dstW, dstH);
}
