export type MediaKind = "image" | "video";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** User-adjustable framing applied on top of the cover-fit baseline, before
 * anything else (masking, treatments, Image Aware) ever sees the media.
 * `scale` 1 = the plain cover-fit crop; increasing it zooms further into
 * the media from there. `x`/`y` are normalized -1..1 pan within whatever
 * slack that scale opens up — by construction that range can never expose
 * empty canvas, at any scale. Lives on the asset itself (not the slot), so
 * it travels with the media through a swap and resets only when that
 * asset is replaced. */
export interface MediaTransform {
  scale: number;
  x: number;
  y: number;
}

export function defaultTransform(): MediaTransform {
  return { scale: 1, x: 0, y: 0 };
}

export function clampTransform(t: MediaTransform): MediaTransform {
  return {
    scale: Math.min(2.5, Math.max(1, t.scale)),
    x: Math.min(1, Math.max(-1, t.x)),
    y: Math.min(1, Math.max(-1, t.y)),
  };
}

export interface MediaAsset {
  kind: MediaKind;
  source: CanvasImageSource;
  naturalW: number;
  naturalH: number;
  label: string;
  videoEl?: HTMLVideoElement;
  objectUrl?: string;
  transform: MediaTransform;
}

let sampleCanvas: HTMLCanvasElement | null = null;

/** Cheap average-color estimate: draw the source into a tiny canvas and
 * read it back. Pure/uncached — callers that run this every frame (a
 * treatment sampling the live cover-fit layer, which can be video) should
 * throttle their own call rate. */
export function sampleAverageColor(source: CanvasImageSource, fallback: RGB = { r: 150, g: 150, b: 150 }): RGB {
  if (!sampleCanvas) sampleCanvas = document.createElement("canvas");
  const SIZE = 12;
  sampleCanvas.width = SIZE;
  sampleCanvas.height = SIZE;
  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;
  try {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(source, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (n > 0) return { r: r / n, g: g / n, b: b / n };
  } catch {
    // A video with no decoded frame yet, or a cross-origin source, can
    // throw here — fall back to the neutral default.
  }
  return fallback;
}

export function detectMediaKind(file: File): MediaKind | null {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  // Some browsers report an empty/unreliable MIME type for certain
  // containers (notably .mov) — fall back to the file extension.
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(name)) return "image";
  if (/\.(mp4|mov|webm)$/.test(name)) return "video";
  return null;
}

/** Releases everything a loaded asset holds — the decoded video element
 * (paused and detached) and its object URL. Safe to call on placeholders
 * (no videoEl/objectUrl) or null. */
export function disposeMediaAsset(asset: MediaAsset | null | undefined): void {
  if (!asset) return;
  if (asset.videoEl) {
    asset.videoEl.pause();
    asset.videoEl.removeAttribute("src");
    asset.videoEl.load();
    asset.videoEl.remove();
  }
  if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
}

export function wrapCanvasAsPlaceholder(canvas: HTMLCanvasElement, label: string): MediaAsset {
  return { kind: "image", source: canvas, naturalW: canvas.width, naturalH: canvas.height, label, transform: defaultTransform() };
}
