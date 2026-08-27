import { switzerFont, SWITZER_FAMILY } from "./typeFont";
import type { TypeState } from "./typeState";

export interface TypeLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TypeLayout {
  lines: TypeLine[];
  fontSize: number;
  weight: number;
  lineHeight: number;
  canvasW: number;
  canvasH: number;
  color: string;
  opacity: number;
  align: TypeState["align"];
  offsetX: number;
  offsetY: number;
}

interface BreakCache {
  key: string;
  lines: string[];
}

interface CacheEntry {
  key: string;
  layout: TypeLayout;
}

const UNIT = 1000;
let breakCache: BreakCache | null = null;
let cache: CacheEntry | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function measureContext(): CanvasRenderingContext2D {
  if (measureCtx) return measureCtx;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  measureCtx = ctx;
  return ctx;
}

function measureWidth(text: string, font: string): number {
  const ctx = measureContext();
  ctx.font = font;
  const w = ctx.measureText(text).width;
  return Number.isFinite(w) ? w : 0;
}

function tokenize(raw: string): string[][] {
  const blocks = raw.replace(/\r\n/g, "\n").split("\n");
  return blocks.map((block) => block.trim().split(/\s+/).filter(Boolean));
}

function joinWords(words: string[], from: number, to: number): string {
  return words.slice(from, to).join(" ");
}

/** Max lines the engine may introduce inside one hard-broken block. */
function maxLinesForCopy(chars: number, words: number): number {
  if (words <= 1) return 1;
  if (chars <= 5) return 1;
  if (chars <= 14) return 2;
  if (chars <= 30) return 3;
  return Math.min(6, Math.max(3, Math.ceil(chars / 18)));
}

function partitions(words: string[], maxLines: number): string[][] {
  const out: string[][] = [];
  const n = words.length;
  if (n === 0) return out;
  const cap = Math.min(maxLines, n);
  const rec = (start: number, remain: number, acc: string[]): void => {
    if (remain === 1) {
      out.push([...acc, joinWords(words, start, n)]);
      return;
    }
    const takeMax = n - start - (remain - 1);
    for (let take = 1; take <= takeMax; take++) {
      rec(start + take, remain - 1, [...acc, joinWords(words, start, start + take)]);
    }
  };
  for (let k = 1; k <= cap; k++) rec(0, k, []);
  return out;
}

function widthFill(scale: number): number {
  const t = Math.min(1, Math.max(0, scale / 100));
  return 0.70 + t * 0.56;
}

function overscanV(scale: number): number {
  return (Math.min(1, Math.max(0, scale / 100))) * 0.05;
}

const BREAK_FILL = 1;

function sizeForLines(lines: string[], weight: number, maxW: number): number {
  const probe = 100;
  const font = switzerFont(weight, probe);
  let longest = 1;
  for (const line of lines) {
    longest = Math.max(longest, measureWidth(line, font));
  }
  const size = (maxW / longest) * probe;
  if (!Number.isFinite(size)) return 12;
  return Math.max(12, size);
}

function scoreCandidate(lines: string[], fontSize: number, unitW: number, weight: number): number {
  const n = lines.length;
  const font = switzerFont(weight, 100);
  const widths = lines.map((l) => measureWidth(l, font));
  const maxW = Math.max(...widths, 1);
  const minW = Math.min(...widths);
  const fill = Math.min(1.2, (fontSize * (maxW / 100)) / Math.max(1, unitW));
  const balance = 1 - (maxW - minW) / maxW;
  let weak = 0;
  let singles = 0;
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 1) singles++;
    if (n > 1 && words.length === 1 && line.length <= 3) weak++;
  }
  const stackedSingles = n >= 3 && singles === n ? 1 : 0;
  const tiny = fontSize < unitW * 0.1 ? 1 : 0;
  return (
    (fontSize / unitW) * 260 +
    fill * 10 +
    balance * 3 +
    (4 - Math.min(4, n)) * 5 -
    weak * 32 -
    tiny * 40 -
    stackedSingles * 28 -
    Math.max(0, n - 3) * 12
  );
}

function blockCandidates(words: string[]): string[][] {
  if (words.length === 0) return [];
  if (words.length === 1) return [[words[0]]];
  const chars = words.join(" ").length;
  return partitions(words, maxLinesForCopy(chars, words.length));
}

function cartesianLines(groups: string[][][]): string[][] {
  if (groups.length === 0) return [];
  let acc: string[][] = [[]];
  for (const group of groups) {
    const next: string[][] = [];
    for (const prefix of acc) {
      for (const cand of group) {
        next.push([...prefix, ...cand]);
      }
    }
    acc = next;
    if (acc.length > 80) break;
  }
  return acc;
}

function breakCopy(blocks: string[][], weight: number, maxW: number, unitW: number): string[] {
  const groups = blocks
    .map((words) => {
      const chars = words.join(" ").length;
      if (blocks.length > 1 && chars <= 24) return [[words.join(" ")]];
      return blockCandidates(words);
    })
    .filter((g) => g.length > 0);
  const candidates = cartesianLines(groups);
  let best = candidates[0] ?? blocks.map((b) => b.join(" "));
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const size = sizeForLines(cand, weight, maxW);
    const s = scoreCandidate(cand, size, unitW, weight);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  return best;
}

function breakKey(state: TypeState): string {
  return ["v6b", state.text, state.mode, state.weight].join("\t");
}

function placeKey(state: TypeState, aspectKey: number): string {
  return [
    "v6p",
    aspectKey,
    state.text,
    state.align,
    state.valign,
    state.mode,
    state.scale,
    state.spread,
    state.rhythm,
    state.weight,
  ].join("\t");
}

function lineX(
  lineW: number,
  frameW: number,
  align: TypeState["align"],
  index: number,
  count: number,
  rhythm: number,
): number {
  const base =
    align === "left" ? 0 : align === "right" ? frameW - lineW : (frameW - lineW) / 2;
  if (count < 2 || rhythm <= 0.5) return base;
  const amp = (rhythm / 100) * frameW * 0.42;
  const t = index / Math.max(1, count - 1);
  if (align === "left") return base + t * amp;
  if (align === "right") return base - t * amp;
  return base + t * amp;
}

function lineYs(
  count: number,
  fontSize: number,
  frameH: number,
  valign: TypeState["valign"],
  spread: number,
  vBleed: number,
): number[] {
  const n = Math.max(1, count);
  const ascent = fontSize * 0.8;
  const top = -frameH * vBleed;
  const bottom = frameH * (1 + vBleed);
  const minGap = fontSize * 0.04;
  if (n === 1) {
    if (valign === "top") return [top + ascent];
    if (valign === "bottom") return [bottom - fontSize * 0.12];
    return [frameH / 2 + fontSize * 0.28];
  }
  const s = spread / 100;
  const maxGap = Math.max(minGap, (bottom - top - n * fontSize) / (n - 1));
  const gap = minGap + (maxGap - minGap) * s;
  const blockH = n * fontSize + (n - 1) * gap;
  let origin = top;
  if (valign === "center") origin = (frameH - blockH) / 2;
  else if (valign === "bottom") origin = bottom - blockH;
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    ys.push(origin + i * (fontSize + gap) + ascent);
  }
  return ys;
}

function scaleFixed(scale: number, unitW: number, unitH: number): number {
  const t = Math.min(1, Math.max(0, scale / 100));
  return Math.max(12, Math.min(unitH * 0.2, unitW * 0.16) * (0.45 + t * 1.15));
}

export function layoutTypography(state: TypeState, canvasW: number, canvasH: number): TypeLayout | null {
  if (!state.enabled) return null;
  const text = state.text.replace(/\s+$/g, "");
  if (!text.trim()) return null;
  const w = Math.max(2, canvasW);
  const h = Math.max(2, canvasH);
  const aspectKey = Math.round((h / w) * 10000);
  const unitW = UNIT;
  const unitH = UNIT * (h / w);
  const key = placeKey(state, aspectKey);
  const ox = (state.x / 50) * unitW * 0.18;
  const oy = (state.y / 50) * unitH * 0.18;
  if (cache && cache.key === key) {
    return projectLayout(cache.layout, w, h, ox, oy, state.color, state.opacity / 100);
  }

  const blocks = tokenize(text).filter((b) => b.length > 0);
  if (blocks.length === 0) return null;

  const bk = breakKey(state);
  let lines: string[];
  if (state.mode === "fixed") {
    lines = blocks.map((words) => words.join(" "));
  } else if (breakCache && breakCache.key === bk) {
    lines = breakCache.lines;
  } else {
    lines = breakCopy(blocks, state.weight, unitW * BREAK_FILL, unitW);
    breakCache = { key: bk, lines };
  }
  if (lines.length === 0) return null;

  const fill = state.mode === "fixed" ? 0.7 : widthFill(state.scale);
  const maxW = unitW * fill;

  const vBleed = state.mode === "responsive" ? overscanV(state.scale) : 0;
  let fontSize =
    state.mode === "fixed"
      ? scaleFixed(state.scale, unitW, unitH)
      : sizeForLines(lines, state.weight, maxW);
  fontSize = Math.max(12, Math.min(fontSize, unitH * 1.15));

  const font = switzerFont(state.weight, fontSize);
  const widths = lines.map((l) => measureWidth(l, font));
  const ys = lineYs(lines.length, fontSize, unitH, state.valign, state.spread, vBleed);
  const laid: TypeLine[] = lines.map((textLine, i) => ({
    text: textLine,
    width: widths[i],
    height: fontSize,
    x: lineX(widths[i], unitW, state.align, i, lines.length, state.rhythm),
    y: ys[i],
  }));

  const layout: TypeLayout = {
    lines: laid,
    fontSize,
    weight: state.weight,
    lineHeight: fontSize * 0.92,
    canvasW: unitW,
    canvasH: unitH,
    color: state.color,
    opacity: state.opacity / 100,
    align: state.align,
    offsetX: ox,
    offsetY: oy,
  };
  cache = { key, layout };
  return projectLayout(layout, w, h, ox, oy, state.color, state.opacity / 100);
}

function projectLayout(
  unit: TypeLayout,
  canvasW: number,
  canvasH: number,
  ox: number,
  oy: number,
  color: string,
  opacity: number,
): TypeLayout {
  const s = canvasW / UNIT;
  return {
    lines: unit.lines.map((l) => ({
      text: l.text,
      x: l.x * s,
      y: l.y * s,
      width: l.width * s,
      height: l.height * s,
    })),
    fontSize: unit.fontSize * s,
    weight: unit.weight,
    lineHeight: unit.lineHeight * s,
    canvasW,
    canvasH,
    color,
    opacity,
    align: unit.align,
    offsetX: ox * s,
    offsetY: oy * s,
  };
}

export function invalidateTypeLayout(): void {
  cache = null;
  breakCache = null;
}

export function typeHasCopy(state: TypeState): boolean {
  return state.enabled && state.text.trim().length > 0;
}

export function ensureSwitzerMeasure(): void {
  measureContext().font = `500 48px "${SWITZER_FAMILY}"`;
}

export function debugLinePlan(state: TypeState, canvasW: number, canvasH: number): string[] {
  const layout = layoutTypography(state, canvasW, canvasH);
  return layout ? layout.lines.map((l) => l.text) : [];
}
