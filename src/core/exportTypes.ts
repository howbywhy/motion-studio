export type ExportFormat = "mp4" | "webp" | "png";
export type ExportFps = 24 | 25 | 30;
export type ExportSize = "preview" | "1080" | "2160";
export type ExportQuality = "standard" | "high";

export interface ExportRequest {
  format: ExportFormat;
  fps: ExportFps;
  size: ExportSize;
  quality: ExportQuality;
  aspect: string;
  includeAudio: boolean;
}

export interface ExportProgress {
  ratio: number;
  label: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  videoCodec: string | null;
  audioCodec: string | null;
  bytes: number;
  renderMs: number;
  encodeMs: number;
  audioOmittedReason?: string;
}

export function even(n: number): number {
  return Math.max(2, n & ~1);
}

export function exportPixelSize(
  aspect: string,
  size: ExportSize,
  preview: { width: number; height: number },
): { width: number; height: number } {
  if (size === "preview") return { width: even(preview.width), height: even(preview.height) };
  const short = size === "2160" ? 2160 : 1080;
  if (aspect === "9:16") return { width: short, height: even(Math.round((short * 16) / 9)) };
  return { width: short, height: even(Math.round((short * 5) / 4)) };
}

export function webpQuality(quality: ExportQuality): number {
  return quality === "high" ? 0.8 : 0.58;
}

export function exportFilename(format: ExportFormat, behaviorId: string, treatment: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = format === "mp4" ? "mp4" : format === "webp" ? "webp" : "png";
  return `motion-studio-${behaviorId}-${treatment}-${stamp}.${ext}`;
}
