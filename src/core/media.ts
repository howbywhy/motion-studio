export type MediaKind = "image" | "video" | "graphic";
export type GraphicMotion = "static" | "live";

/** Renderer-facing handle. Generated FIELD occupies a media slot and is
 * sampled like any other CanvasImageSource; behaviours never see this. */
export interface GraphicDriver {
  dirty: boolean;
  paintedAt: number;
  paint(time: number): void;
  getMotion(): GraphicMotion;
  setAspect(aspectW: number, aspectH: number): void;
  /** Match the output raster so the screen is generated at native pixels,
   * never by upscaling a smaller FIELD texture. */
  setRasterSize(width: number, height: number, dpr?: number): void;
}

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
  graphic?: GraphicDriver;
  /** Sticky soundtrack probe. Videos start unknown so they can own
   *  audio immediately; silent files flip to "no" after a short play. */
  soundtrack?: "unknown" | "yes" | "no";
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

/** Animated WebP is an image container, not a seekable timed source in Chromium. */
export function isAnimatedWebP(bytes: ArrayBuffer): boolean {
  const u8 = new Uint8Array(bytes);
  if (u8.length < 16) return false;
  const tag = (i: number) => String.fromCharCode(u8[i]!, u8[i + 1]!, u8[i + 2]!, u8[i + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return false;
  let p = 12;
  while (p + 8 <= u8.length) {
    const fourcc = tag(p);
    const size = u8[p + 4]! | (u8[p + 5]! << 8) | (u8[p + 6]! << 16) | (u8[p + 7]! << 24);
    if (fourcc === "ANIM" || fourcc === "ANMF") return true;
    p += 8 + size + (size & 1);
    if (size < 0) break;
  }
  return false;
}

type VideoAudioProbe = HTMLVideoElement & {
  mozHasAudio?: boolean;
  audioTracks?: { length: number };
  webkitAudioDecodedByteCount?: number;
};

/** FIELD and stills never own sound. A video may own sound until playback
 * proves it has no soundtrack — then it must not steal the previous owner. */
export function videoMayOwnAudio(asset: MediaAsset | null | undefined): boolean {
  if (!asset?.videoEl) return false;
  refreshSoundtrack(asset);
  return asset.soundtrack !== "no";
}

export function refreshSoundtrack(asset: MediaAsset): void {
  const video = asset.videoEl as VideoAudioProbe | undefined;
  if (!video) {
    asset.soundtrack = "no";
    return;
  }
  if (asset.soundtrack === "yes" || asset.soundtrack === "no") return;
  if (video.audioTracks && video.audioTracks.length > 0) {
    asset.soundtrack = "yes";
    return;
  }
  if (video.mozHasAudio === true) {
    asset.soundtrack = "yes";
    return;
  }
  if (typeof video.webkitAudioDecodedByteCount === "number" && video.webkitAudioDecodedByteCount > 0) {
    asset.soundtrack = "yes";
    return;
  }
  if (!video.paused && video.readyState >= 2 && video.currentTime > 0.4) {
    if (video.mozHasAudio === false || video.webkitAudioDecodedByteCount === 0 || video.audioTracks?.length === 0) {
      asset.soundtrack = "no";
    }
  }
}

/** Pause and mute a video that is leaving the active sequence but must
 * remain loaded (saved state / Media↔FIELD toggle). Does not revoke URLs. */
export function parkMediaAsset(asset: MediaAsset | null | undefined): void {
  const video = asset?.videoEl;
  if (!video) return;
  video.pause();
  video.muted = true;
}

/** Releases everything a loaded asset holds — the decoded video element
 * (paused and detached) and its object URL. Safe to call on placeholders
 * (no videoEl/objectUrl) or null. */
export function disposeMediaAsset(asset: MediaAsset | null | undefined): void {
  if (!asset) return;
  parkMediaAsset(asset);
  if (asset.videoEl) {
    asset.videoEl.removeAttribute("src");
    asset.videoEl.load();
    asset.videoEl.remove();
  }
  if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
}

export function wrapCanvasAsPlaceholder(canvas: HTMLCanvasElement, label: string): MediaAsset {
  return { kind: "image", source: canvas, naturalW: canvas.width, naturalH: canvas.height, label, transform: defaultTransform() };
}
