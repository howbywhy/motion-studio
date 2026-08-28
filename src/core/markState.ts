import { TYPE_ANCHORS, type TypeAnchor } from "./typeState";

/** Isolated identity-event document. Not a Type State. */

export type MarkMode = "intro" | "interrupt" | "end";
export type MarkSource = "stacked" | "horizontal" | "emblem";

export interface MarkState {
  enabled: boolean;
  mode: MarkMode;
  source: MarkSource;
  sequenceStart: number;
  sequenceStop: number;
  scale: number;
  anchor: TypeAnchor;
}

export const MARK_WINDOW_MIN = 0.08;
export const MARK_SCALE_DEFAULT = 72;

export const MARK_MODE_WINDOW: Record<MarkMode, { start: number; stop: number }> = {
  intro: { start: 0, stop: 0.18 },
  interrupt: { start: 0.44, stop: 0.58 },
  end: { start: 0.78, stop: 0.96 },
};

const MODES: MarkMode[] = ["intro", "interrupt", "end"];
const SOURCES: MarkSource[] = ["stacked", "horizontal", "emblem"];

function clamp01(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function clamp100(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

export function clampMarkWindow(startRaw: unknown, stopRaw: unknown): { start: number; stop: number } {
  let start = clamp01(startRaw, 0);
  let stop = clamp01(stopRaw, 1);
  if (stop < start) {
    const t = start;
    start = stop;
    stop = t;
  }
  if (stop - start < MARK_WINDOW_MIN) {
    const mid = (start + stop) / 2;
    start = mid - MARK_WINDOW_MIN / 2;
    stop = mid + MARK_WINDOW_MIN / 2;
    if (start < 0) {
      start = 0;
      stop = MARK_WINDOW_MIN;
    }
    if (stop > 1) {
      stop = 1;
      start = 1 - MARK_WINDOW_MIN;
    }
  }
  return { start, stop };
}

export function parseMarkMode(raw: unknown, fallback: MarkMode = "intro"): MarkMode {
  return typeof raw === "string" && (MODES as string[]).includes(raw) ? (raw as MarkMode) : fallback;
}

export function parseMarkSource(raw: unknown, fallback: MarkSource = "stacked"): MarkSource {
  return typeof raw === "string" && (SOURCES as string[]).includes(raw) ? (raw as MarkSource) : fallback;
}

export function parseMarkAnchor(raw: unknown, fallback: TypeAnchor = "mc"): TypeAnchor {
  return typeof raw === "string" && (TYPE_ANCHORS as string[]).includes(raw) ? (raw as TypeAnchor) : fallback;
}

export function defaultMarkState(): MarkState {
  const win = MARK_MODE_WINDOW.intro;
  return {
    enabled: false,
    mode: "intro",
    source: "stacked",
    sequenceStart: win.start,
    sequenceStop: win.stop,
    scale: MARK_SCALE_DEFAULT,
    anchor: "mc",
  };
}

export function clampMarkState(raw: Partial<MarkState> | Record<string, unknown> | undefined | null): MarkState {
  const base = defaultMarkState();
  if (!raw || typeof raw !== "object") return base;
  const mode = parseMarkMode((raw as MarkState).mode, base.mode);
  const win = clampMarkWindow(
    (raw as MarkState).sequenceStart ?? MARK_MODE_WINDOW[mode].start,
    (raw as MarkState).sequenceStop ?? MARK_MODE_WINDOW[mode].stop,
  );
  return {
    enabled: (raw as MarkState).enabled === true,
    mode,
    source: parseMarkSource((raw as MarkState).source, base.source),
    sequenceStart: win.start,
    sequenceStop: win.stop,
    scale: clamp100((raw as MarkState).scale, base.scale),
    anchor: parseMarkAnchor((raw as MarkState).anchor, base.anchor),
  };
}

export function cloneMarkState(state: MarkState): MarkState {
  return { ...clampMarkState(state) };
}

export function markWindowForMode(mode: MarkMode): { start: number; stop: number } {
  return { ...MARK_MODE_WINDOW[mode] };
}
