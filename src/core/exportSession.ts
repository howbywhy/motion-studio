import { resetFieldInkSmoothing } from "./fieldInk";
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import type { Renderer } from "./renderer";
import { mixExportAudio, clearExportAudioCache } from "./exportAudio";
import { encodeCanvasWebP, frameDurationMs, muxAnimatedWebP } from "./webpAnim";
import {
  exportFilename,
  exportPixelSize,
  webpQuality,
  type ExportProgress,
  type ExportRequest,
  type ExportResult,
} from "./exportTypes";

export type { ExportFormat, ExportFps, ExportProgress, ExportQuality, ExportRequest, ExportResult, ExportSize } from "./exportTypes";
export { exportPixelSize } from "./exportTypes";

function yieldUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function stampName(renderer: Renderer, format: ExportRequest["format"], behaviorId: string, treatment: string): string {
  void renderer;
  return exportFilename(format, behaviorId, treatment);
}

export async function runExport(
  renderer: Renderer,
  request: ExportRequest,
  meta: { behaviorId: string; treatment: string },
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const preview = renderer.getCanvasSize();
  const { width, height } = exportPixelSize(request.aspect, request.size, preview);
  const duration = renderer.getLoopSeconds();
  const fps = request.format === "png" ? 1 : request.fps;
  const frameCount = request.format === "png" ? 1 : Math.max(1, Math.round(duration * fps));
  const quality = new Quality(request.quality === "high" ? "high" : "medium");
  const filename = stampName(renderer, request.format, meta.behaviorId, meta.treatment);
  const holdPhase = renderer.getLoopPhase();
  const graphicElapsed = renderer.getGraphicElapsed();

  const throwIfAborted = (): void => {
    if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
  };

  const t0 = performance.now();
  let encodeMs = 0;

  if (request.format === "png" && request.size === "preview") {
    onProgress({ ratio: 0.15, label: "EXPORTING 15%" });
    throwIfAborted();
    const live = renderer.getVisibleCanvas();
    const blob = await new Promise<Blob | null>((resolve) => live.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encode failed");
    encodeMs = performance.now() - t0;
    onProgress({ ratio: 1, label: "DONE" });
    return {
      blob,
      filename,
      width: live.width,
      height: live.height,
      fps: 0,
      duration: 0,
      videoCodec: "png",
      audioCodec: null,
      bytes: blob.size,
      renderMs: encodeMs,
      encodeMs,
    };
  }

  renderer.beginExport(width, height);
  try {
    if (request.format === "png") {
      onProgress({ ratio: 0.15, label: "EXPORTING 15%" });
      await renderer.renderExportFrame(holdPhase * duration, { graphicTime: graphicElapsed });
      throwIfAborted();
      const blob = await new Promise<Blob | null>((resolve) => renderer.getVisibleCanvas().toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG encode failed");
      encodeMs = performance.now() - t0;
      onProgress({ ratio: 1, label: "DONE" });
      return {
        blob,
        filename,
        width,
        height,
        fps: 0,
        duration: 0,
        videoCodec: "png",
        audioCodec: null,
        bytes: blob.size,
        renderMs: encodeMs,
        encodeMs,
      };
    }

    if (request.format === "webp") {
      const frames: { bytes: Uint8Array; durationMs: number }[] = [];
      const q = webpQuality(request.quality);
      for (let i = 0; i < frameCount; i++) {
        throwIfAborted();
        const t = i / fps;
        await renderer.renderExportFrame(t);
        frames.push({ bytes: await encodeCanvasWebP(renderer.getVisibleCanvas(), q), durationMs: frameDurationMs(i, fps) });
        if (i % 2 === 0) {
          onProgress({ ratio: (i + 1) / frameCount, label: `EXPORTING ${Math.round(((i + 1) / frameCount) * 100)}%` });
          await yieldUi();
        }
      }
      const tEnc = performance.now();
      const bytes = muxAnimatedWebP(width, height, frames);
      encodeMs = performance.now() - tEnc;
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/webp" });
      onProgress({ ratio: 1, label: "DONE" });
      return {
        blob,
        filename,
        width,
        height,
        fps,
        duration,
        videoCodec: "webp",
        audioCodec: null,
        bytes: blob.size,
        renderMs: tEnc - t0,
        encodeMs,
      };
    }

    const avcOk = await canEncodeVideo("avc", { width, height, quality });
    if (!avcOk) throw new Error("This browser cannot encode H.264 for MP4 export.");

    let audioBuffer: AudioBuffer | null = null;
    let audioCodecName: "aac" | null = null;
    let audioOmittedReason: string | undefined;
    if (request.includeAudio) {
      onProgress({ ratio: 0.02, label: "EXPORTING 2%" });
      const mix = await mixExportAudio(renderer, duration, signal);
      audioBuffer = mix.buffer;
      if (!audioBuffer) {
        audioOmittedReason = mix.reason ?? "No sequence-owned video soundtrack to export.";
      } else {
        const aacOk = await canEncodeAudio("aac", {
          numberOfChannels: audioBuffer.numberOfChannels,
          sampleRate: audioBuffer.sampleRate,
          quality,
        });
        if (aacOk) {
          audioCodecName = "aac";
        } else {
          audioOmittedReason =
            "AAC encoding is unavailable in this browser; MP4 is video-only rather than silently muxing an incompatible codec.";
          audioBuffer = null;
        }
      }
    }

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    try {
      const videoSource = new CanvasSource(renderer.getVisibleCanvas(), {
        codec: "avc",
        quality,
        keyFrameInterval: 2,
      });
      output.addVideoTrack(videoSource, { frameRate: fps });
      let audioSource: AudioBufferSource | null = null;
      if (audioBuffer && audioCodecName) {
        audioSource = new AudioBufferSource({ codec: audioCodecName, quality });
        output.addAudioTrack(audioSource);
      }
      await output.start();
      if (audioSource && audioBuffer) await audioSource.add(audioBuffer);
      audioSource?.close();

      renderer.resetExportAudioCursor();
      resetFieldInkSmoothing();
      for (let i = 0; i < frameCount; i++) {
        throwIfAborted();
        const t = i / fps;
        await renderer.renderExportFrame(t);
        await videoSource.add(t, 1 / fps);
        if (i % 2 === 0) {
          onProgress({ ratio: (i + 1) / frameCount, label: `EXPORTING ${Math.round(((i + 1) / frameCount) * 100)}%` });
          await yieldUi();
        }
      }
      videoSource.close();
      const tEnc = performance.now();
      await output.finalize();
      encodeMs = performance.now() - tEnc;
      const buffer = target.buffer;
      if (!buffer) throw new Error("MP4 mux produced no data");
      const blob = new Blob([buffer], { type: "video/mp4" });
      onProgress({ ratio: 1, label: "DONE" });
      return {
        blob,
        filename,
        width,
        height,
        fps,
        duration,
        videoCodec: "avc1",
        audioCodec: audioBuffer && audioCodecName ? audioCodecName : null,
        bytes: blob.size,
        renderMs: tEnc - t0,
        encodeMs,
        audioOmittedReason,
      };
    } catch (err) {
      await output.cancel().catch(() => undefined);
      throw err;
    }
  } finally {
    clearExportAudioCache();
    renderer.endExport();
  }
}
