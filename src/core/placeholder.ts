/**
 * Generates a default placeholder "photo" purely from canvas drawing
 * (gradients + soft geometric shapes, no text/logos) so the tool has
 * visible, non-black content to test masking correctness against before
 * any real images are dropped in.
 */
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function placeholderA(): HTMLCanvasElement {
  const w = 1200;
  const h = 1500;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#3a2a20");
  g.addColorStop(0.5, "#8a5a3a");
  g.addColorStop(1, "#d9a05b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 6; i++) {
    const rg = ctx.createRadialGradient(
      (i * 197) % w,
      (i * 331) % h,
      0,
      (i * 197) % w,
      (i * 331) % h,
      Math.max(w, h) * 0.35
    );
    rg.addColorStop(0, "#ffe6c2");
    rg.addColorStop(1, "rgba(255,230,194,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  return c;
}
