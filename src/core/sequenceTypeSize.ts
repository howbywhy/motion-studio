/**
 * Sequence Type Size — deterministic AUTO fit from copy + global style.
 * Never reads Bloom, Flicker, ownership, video, or master phase.
 */

import {
  clampTypeState,
  type SequenceTypeAnchor,
  type SequenceTypeSizeMode,
  type TypeState,
} from "./typeState";
import { layoutTypeDocument, typeInkBox } from "./typeLayout";

export type { SequenceTypeAnchor, SequenceTypeSizeMode };

export const SEQUENCE_TYPE_SIZE_MIN = 28;
export const SEQUENCE_TYPE_SIZE_MAX = 100;
/** Typical headline used to share one legal-max across Sequence Type copies. */
export const SEQUENCE_TYPE_SIZE_REF = "MIDNIGHT SNACK";
/** Keep AUTO inside this fraction of the canvas. */
export const SEQUENCE_TYPE_MAX_WIDTH = 0.82;
export const SEQUENCE_TYPE_MAX_HEIGHT = 0.34;

const cache = new Map<string, number>();

function clampSize(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(SEQUENCE_TYPE_SIZE_MAX, Math.max(0, Math.round(n)));
}

function trial(style: TypeState, copy: string, scale: number): TypeState {
  const block0 = { ...style.blocks[0]!, enabled: copy.trim().length > 0, text: copy, scale };
  const next = clampTypeState({
    ...style,
    enabled: true,
    sequenceStart: 0,
    sequenceStop: 1,
    blocks: [block0, { ...style.blocks[1], enabled: false, text: "" }, { ...style.blocks[2], enabled: false, text: "" }],
    pages: [[block0, { ...style.blocks[1], enabled: false, text: "" }, { ...style.blocks[2], enabled: false, text: "" }]],
  });
  return { ...next, sequenceLegalCopy: SEQUENCE_TYPE_SIZE_REF };
}

function authoredRows(copy: string): number {
  return copy.replace(/\s+$/g, "").split(/\n/).filter((row) => row.trim().length > 0).length;
}

function measureBox(style: TypeState, copy: string, scale: number, width: number, height: number): { w: number; h: number; lines: number } {
  const laid = layoutTypeDocument(trial(style, copy, scale), width, height);
  if (laid.length === 0) return { w: 0, h: 0, lines: 0 };
  let l = width;
  let t = height;
  let r = 0;
  let b = 0;
  let lines = 0;
  for (const item of laid) {
    lines += item.layout.lines.length;
    const box = typeInkBox(item.layout);
    l = Math.min(l, box.l + item.layout.offsetX);
    t = Math.min(t, box.t + item.layout.offsetY);
    r = Math.max(r, box.r + item.layout.offsetX);
    b = Math.max(b, box.b + item.layout.offsetY);
  }
  return { w: r - l, h: b - t, lines };
}

function fits(style: TypeState, copy: string, scale: number, width: number, height: number, maxW: number, maxH: number): boolean {
  const box = measureBox(style, copy, scale, width, height);
  if (box.lines > authoredRows(copy)) return false;
  return box.w <= maxW + 0.5 && box.h <= maxH + 0.5;
}

/**
 * Resolve the Type Size for one authored state.
 * Manual returns the stored value.
 * AUTO starts from the global Type Size and only reduces when the
 * measured block exceeds the authored bounds. Never enlarges short copy.
 */
export function resolveSequenceTypeSize(
  style: TypeState | Partial<TypeState>,
  copy: string,
  mode: SequenceTypeSizeMode,
  stored: number,
  width: number,
  height: number,
): number {
  const base = clampTypeState(style);
  const preferred = clampSize(base.blocks[0]?.scale ?? 48, 48);
  const manual = clampSize(stored, preferred);
  if (mode === "manual") return manual;
  if (!copy.trim()) return preferred;

  const key = [
    copy,
    preferred,
    base.blocks[0]!.weight,
    base.blocks[0]!.tracking,
    base.blocks[0]!.leading,
    base.blocks[0]!.textAlign,
    Math.round(width),
    Math.round(height),
  ].join("|");
  const hit = cache.get(key);
  if (hit != null) return hit;

  const maxW = width * SEQUENCE_TYPE_MAX_WIDTH;
  const maxH = height * SEQUENCE_TYPE_MAX_HEIGHT;
  let scale = preferred;
  if (!fits(base, copy, scale, width, height, maxW, maxH)) {
    let lo = SEQUENCE_TYPE_SIZE_MIN;
    let hi = scale;
    for (let i = 0; i < 12; i++) {
      const mid = Math.round((lo + hi) / 2);
      if (fits(base, copy, mid, width, height, maxW, maxH)) hi = mid;
      else lo = mid + 1;
    }
    scale = fits(base, copy, hi, width, height, maxW, maxH) ? hi : SEQUENCE_TYPE_SIZE_MIN;
  }
  cache.set(key, scale);
  return scale;
}

export function clearSequenceTypeSizeCache(): void {
  cache.clear();
}
