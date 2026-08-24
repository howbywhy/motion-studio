export type MediaKind = "image" | "video";

export interface MediaAsset {
  kind: MediaKind;
  source: CanvasImageSource;
  naturalW: number;
  naturalH: number;
  label: string;
  videoEl?: HTMLVideoElement;
  objectUrl?: string;
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
  return { kind: "image", source: canvas, naturalW: canvas.width, naturalH: canvas.height, label };
}
