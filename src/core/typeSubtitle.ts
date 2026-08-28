import type { TypeBlock, TypeSlot, TypeState } from "./typeState";
import { typePageBeatLocal, type TypePage } from "./typePages";

export { SUBTITLE_YELLOW } from "./typeState";

export const TYPE_SLOT_LABELS: Record<TypeSlot, string> = {
  0: "Type 01",
  1: "Type 02",
  2: "Type 03",
};

/** Model A: every non-empty line is one cue. Blank lines are ignored. */
export function parseSubtitleCues(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function subtitleCueIndex(cueCount: number, beatLocal: number): number {
  const n = Math.max(1, Math.round(cueCount));
  if (n <= 1) return 0;
  const t = Number.isFinite(beatLocal) ? Math.min(1, Math.max(0, beatLocal)) : 0;
  if (t >= 1) return n - 1;
  return Math.min(n - 1, Math.floor(t * n));
}

function blockWithCue(block: TypeBlock, beatLocal: number): TypeBlock {
  if (block.composition !== "subtitle") return block;
  const cues = parseSubtitleCues(block.text);
  if (cues.length === 0) return { ...block, text: "" };
  if (cues.length === 1) return { ...block, text: cues[0]! };
  return { ...block, text: cues[subtitleCueIndex(cues.length, beatLocal)]! };
}

/**
 * Per-state cue sequencing. Global Type-window indexing is unstable when
 * States author different Subtitle documents — a cue index from Start→Stop
 * would land on the wrong sentence after a hard cut. Each State therefore
 * owns its cues and restarts at Cue 01 when that State becomes active.
 */
export function applySubtitleCues(resolved: TypeState, authored: TypeState, phase: number): TypeState {
  if (!resolved.enabled) return resolved;
  const beat = typePageBeatLocal(authored, phase);
  const blocks: TypePage = [
    blockWithCue(resolved.blocks[0], beat),
    blockWithCue(resolved.blocks[1], beat),
    blockWithCue(resolved.blocks[2], beat),
  ];
  return { ...resolved, blocks };
}
