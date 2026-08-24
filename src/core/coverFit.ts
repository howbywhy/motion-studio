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

/** Draws `img` onto `ctx` covering the full ctx canvas, cropped/centered. */
export function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): void {
  const r = coverFitSourceRect(srcW, srcH, dstW, dstH);
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, dstW, dstH);
}
