import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import type { MediaAsset } from "./media";
import { loopPhaseFromElapsed } from "./sequence";
import type { Renderer } from "./renderer";

const SAMPLE_RATE = 48000;
const decoded = new Map<string, AudioBuffer | null>();

export interface MixExportAudioResult {
  buffer: AudioBuffer | null;
  reason: string | null;
}

async function decodeAssetAudio(
  asset: MediaAsset,
  untilSec: number,
): Promise<{ buffer: AudioBuffer | null; error: string | null }> {
  if (!asset.videoEl || !asset.objectUrl) return { buffer: null, error: null };
  const cacheKey = `${asset.objectUrl}|${Math.ceil(untilSec)}`;
  const cached = decoded.get(cacheKey);
  if (cached !== undefined) return { buffer: cached, error: null };
  let input: Input | null = null;
  try {
    const blob = await (await fetch(asset.objectUrl)).blob();
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      decoded.set(cacheKey, null);
      return { buffer: null, error: null };
    }
    asset.soundtrack = "yes";
    const trackDur = await track.computeDuration();
    const end = Math.min(trackDur, untilSec) + 0.05;
    const sink = new AudioBufferSink(track);
    const chunks: AudioBuffer[] = [];
    for await (const wrapped of sink.buffers(0, end)) chunks.push(wrapped.buffer);
    const stitched = stitch(chunks);
    decoded.set(cacheKey, stitched);
    return { buffer: stitched, error: stitched ? null : "Source soundtrack decoded empty." };
  } catch (err) {
    decoded.set(cacheKey, null);
    const message = err instanceof Error ? err.message : String(err);
    return { buffer: null, error: `Could not decode source audio (${asset.label}): ${message}` };
  } finally {
    input?.dispose();
  }
}

function stitch(chunks: AudioBuffer[]): AudioBuffer | null {
  if (!chunks.length) return null;
  const rate = chunks[0]!.sampleRate;
  const channels = Math.max(...chunks.map((c) => c.numberOfChannels));
  let frames = 0;
  for (const c of chunks) frames += c.length;
  const ac = new OfflineAudioContext(channels, Math.max(1, frames), rate);
  const out = ac.createBuffer(channels, Math.max(1, frames), rate);
  let o = 0;
  for (const c of chunks) {
    for (let ch = 0; ch < channels; ch++) {
      const src = c.getChannelData(Math.min(ch, c.numberOfChannels - 1));
      out.getChannelData(ch).set(src, o);
    }
    o += c.length;
  }
  return out;
}

function sampleAt(buffer: AudioBuffer, channel: number, timeSec: number): number {
  const ch = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
  if (!ch.length || buffer.duration <= 0) return 0;
  let t = timeSec % buffer.duration;
  if (t < 0) t += buffer.duration;
  const i = Math.min(ch.length - 1, Math.max(0, Math.floor(t * buffer.sampleRate)));
  return ch[i] ?? 0;
}

/** Mix sequence-owned video audio into one buffer for the export loop. */
export async function mixExportAudio(renderer: Renderer, durationSec: number): Promise<MixExportAudioResult> {
  const sources: { asset: MediaAsset; buffer: AudioBuffer }[] = [];
  let decodeError: string | null = null;
  for (const item of renderer.getSequence()) {
    const { buffer, error } = await decodeAssetAudio(item.asset, durationSec);
    if (error) decodeError = error;
    if (buffer && buffer.duration > 0.04) sources.push({ asset: item.asset, buffer });
  }
  if (!sources.length) {
    return {
      buffer: null,
      reason: decodeError ?? "No sequence-owned video soundtrack to export.",
    };
  }

  const length = Math.max(1, Math.round(durationSec * SAMPLE_RATE));
  const out = new OfflineAudioContext(2, length, SAMPLE_RATE).createBuffer(2, length, SAMPLE_RATE);
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  renderer.resetExportAudioCursor();
  let lastOwner: MediaAsset | null = null;
  let lastBuffer: AudioBuffer | null = null;
  let ownedSamples = 0;
  const hop = 512;
  for (let i = 0; i < length; i += hop) {
    const t = i / SAMPLE_RATE;
    const phase = loopPhaseFromElapsed(t, renderer.getLoopSeconds());
    const owner = renderer.audioOwnerAt(phase);
    if (owner !== lastOwner) {
      lastOwner = owner;
      lastBuffer = owner ? (sources.find((s) => s.asset === owner)?.buffer ?? null) : null;
    }
    const end = Math.min(length, i + hop);
    if (!lastBuffer) {
      for (let s = i; s < end; s++) {
        L[s] = 0;
        R[s] = 0;
      }
      continue;
    }
    const buf = lastBuffer;
    ownedSamples += end - i;
    for (let s = i; s < end; s++) {
      const srcT = s / SAMPLE_RATE;
      L[s] = sampleAt(buf, 0, srcT);
      R[s] = sampleAt(buf, buf.numberOfChannels > 1 ? 1 : 0, srcT);
    }
  }
  if (ownedSamples === 0) {
    return {
      buffer: null,
      reason: "Sequence audio ownership produced silence for this loop (FIELD/stills never own sound).",
    };
  }
  return { buffer: out, reason: null };
}
