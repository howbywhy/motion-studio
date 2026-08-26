/** Mux canvas frames into an animated WebP. No audio. Each frame is encoded
 * with the browser's still-WebP encoder, then wrapped as ANMF. */

function fourcc(id: string): Uint8Array {
  return new Uint8Array([id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3)]);
}

function u32le(n: number): Uint8Array {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
}

function u24le(n: number): Uint8Array {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function chunk(id: string, payload: Uint8Array): Uint8Array {
  const pad = payload.length & 1 ? new Uint8Array([0]) : new Uint8Array(0);
  return concat([fourcc(id), u32le(payload.length), payload, pad]);
}

function tagAt(buf: Uint8Array, i: number): string {
  return String.fromCharCode(buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!);
}

/** VP8 / VP8L / ALPH chunks from a still WebP, including headers. */
function stillBitstream(buf: Uint8Array): Uint8Array {
  if (tagAt(buf, 0) !== "RIFF" || tagAt(buf, 8) !== "WEBP") {
    throw new Error("Not a WebP frame");
  }
  const parts: Uint8Array[] = [];
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = tagAt(buf, p);
    const size = buf[p + 4]! | (buf[p + 5]! << 8) | (buf[p + 6]! << 16) | (buf[p + 7]! << 24);
    const padded = size + (size & 1);
    if (id === "VP8 " || id === "VP8L" || id === "ALPH") {
      parts.push(buf.subarray(p, p + 8 + padded));
    }
    p += 8 + padded;
  }
  if (!parts.length) throw new Error("WebP frame has no bitstream");
  return concat(parts);
}

function anmfChunk(width: number, height: number, durationMs: number, bitstream: Uint8Array): Uint8Array {
  const header = concat([
    u24le(0),
    u24le(0),
    u24le(Math.max(0, width - 1)),
    u24le(Math.max(0, height - 1)),
    u24le(Math.max(1, durationMs)),
    new Uint8Array([2]), // blending method 1: do not blend; full-frame replace
  ]);
  return chunk("ANMF", concat([header, bitstream]));
}

export async function encodeCanvasWebP(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("WebP frame encode failed");
  return new Uint8Array(await blob.arrayBuffer());
}

export function muxAnimatedWebP(width: number, height: number, frames: { bytes: Uint8Array; durationMs: number }[]): Uint8Array {
  if (!frames.length) throw new Error("No WebP frames");
  const vp8xFlags = 0x02; // animation
  const vp8x = chunk(
    "VP8X",
    concat([
      new Uint8Array([vp8xFlags, 0, 0, 0]),
      u24le(Math.max(0, width - 1)),
      u24le(Math.max(0, height - 1)),
    ]),
  );
  const anim = chunk("ANIM", concat([new Uint8Array([0, 0, 0, 0]), new Uint8Array([0, 0])]));
  const framesChunks = frames.map((f) => anmfChunk(width, height, f.durationMs, stillBitstream(f.bytes)));
  const body = concat([fourcc("WEBP"), vp8x, anim, ...framesChunks]);
  return concat([fourcc("RIFF"), u32le(body.length), body]);
}

export function frameDurationMs(index: number, fps: number): number {
  return Math.max(1, Math.round(((index + 1) * 1000) / fps) - Math.round((index * 1000) / fps));
}
