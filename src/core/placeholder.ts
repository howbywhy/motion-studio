/**
 * Generates a default placeholder "photo" purely from canvas drawing
 * (gradients + soft geometric shapes, no text/logos) so the tool has
 * visible, non-black content to test masking correctness against before
 * any real images are dropped in.
 *
 * Colour is the only user-facing variation. The default hex is the
 * existing midpoint stop; that path keeps the original three-stop
 * gradient byte-for-byte. A custom colour rebuilds the same overlays
 * over a ramp derived from the chosen hex.
 */
export const PLACEHOLDER_DEFAULT_BG = "#8a5a3a";

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colourRamp(hex: string): { dark: string; mid: string; light: string } {
  const rgb = parseHex(hex) ?? { r: 138, g: 90, b: 58 };
  return {
    dark: toHex(mix(rgb.r, 20, 0.55), mix(rgb.g, 16, 0.55), mix(rgb.b, 12, 0.55)),
    mid: toHex(rgb.r, rgb.g, rgb.b),
    light: toHex(mix(rgb.r, 255, 0.42), mix(rgb.g, 230, 0.42), mix(rgb.b, 180, 0.42)),
  };
}

function paintOverlays(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 6; i++) {
    const rg = ctx.createRadialGradient(
      (i * 197) % w,
      (i * 331) % h,
      0,
      (i * 197) % w,
      (i * 331) % h,
      Math.max(w, h) * 0.35,
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
}

export function isDefaultPlaceholderBg(hex: string | undefined | null): boolean {
  if (!hex) return true;
  return hex.trim().toLowerCase() === PLACEHOLDER_DEFAULT_BG;
}

export function placeholderA(bg: string = PLACEHOLDER_DEFAULT_BG): HTMLCanvasElement {
  const w = 1200;
  const h = 1500;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;

  const g = ctx.createLinearGradient(0, 0, w, h);
  if (isDefaultPlaceholderBg(bg)) {
    g.addColorStop(0, "#3a2a20");
    g.addColorStop(0.5, "#8a5a3a");
    g.addColorStop(1, "#d9a05b");
  } else {
    const ramp = colourRamp(bg);
    g.addColorStop(0, ramp.dark);
    g.addColorStop(0.5, ramp.mid);
    g.addColorStop(1, ramp.light);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  paintOverlays(ctx, w, h);
  return c;
}
