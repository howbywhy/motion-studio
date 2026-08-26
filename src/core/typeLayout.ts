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
  align: TypeState["align"];
  offsetX: number;
  offsetY: number;
}

interface CacheEntry {
  key: string;
  layout: TypeLayout;
}

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
  return ctx.measureText(text).width;
}

function tokenize(raw: string): string[][] {
  const blocks = raw.replace(/\r\n/g, "\n").split("\n");
  return blocks.map((block) => {
    const words = block.trim().split(/\s+/).filter(Boolean);
    return words;
  });
}

/** Target line count from copy length, hard breaks, and canvas proportion. */
function targetLineCount(blocks: string[][], canvasW: number, canvasH: number): number {
  const hard = blocks.filter((b) => b.length > 0).length;
  const words = blocks.reduce((n, b) => n + b.length, 0);
  const chars = blocks.reduce((n, b) => n + b.join(" ").length, 0);
  const portrait = canvasH / Math.max(1, canvasW);

  if (words === 0) return 0;
  if (hard >= 2) {
    const wrapExtra = chars > 48 ? Math.min(4, Math.floor((chars - 36) / 22)) : 0;
    return Math.min(10, Math.max(hard, hard + wrapExtra));
  }
  if (chars <= 6) return 1;
  if (chars <= 14) return portrait > 1.25 ? 2 : 1;
  if (chars <= 24) return portrait > 1.15 ? 3 : 2;
  if (chars <= 40) return portrait > 1.15 ? 4 : 3;
  if (chars <= 72) return Math.min(6, 3 + Math.floor(chars / 24) + (portrait > 1.3 ? 1 : 0));
  const density = portrait > 1.3 ? 16 : 20;
  return Math.min(10, Math.max(5, Math.round(chars / density)));
}

function joinWords(words: string[], from: number, to: number): string {
  return words.slice(from, to).join(" ");
}

function greedyWrap(words: string[], maxWidth: number, font: string): string[] {
  if (words.length === 0) return [];
  const lines: string[] = [];
  let start = 0;
  for (let i = 1; i <= words.length; i++) {
    const w = measureWidth(joinWords(words, start, i), font);
    if (w > maxWidth && i > start + 1) {
      lines.push(joinWords(words, start, i - 1));
      start = i - 1;
    }
  }
  if (start < words.length) lines.push(joinWords(words, start, words.length));
  return lines;
}

/** Balanced wrap toward a target line count without exceeding maxWidth. */
function wrapToCount(words: string[], target: number, maxWidth: number, font: string): string[] {
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0]];
  const n = Math.min(target, words.length);
  if (n <= 1) {
    const one = words.join(" ");
    if (measureWidth(one, font) <= maxWidth) return [one];
    return greedyWrap(words, maxWidth, font);
  }
  const total = words.length;
  const ideal = total / n;
  const lines: string[] = [];
  let i = 0;
  for (let line = 0; line < n && i < total; line++) {
    const remainingLines = n - line;
    const remainingWords = total - i;
    const takeMax = remainingWords - (remainingLines - 1);
    let best = 1;
    let bestScore = Infinity;
    for (let take = 1; take <= takeMax; take++) {
      const text = joinWords(words, i, i + take);
      const w = measureWidth(text, font);
      if (w > maxWidth && take > 1) break;
      const targetCount = ideal;
      const score = Math.abs(take - targetCount) + (w > maxWidth ? 80 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = take;
      }
    }
    while (best > 1 && measureWidth(joinWords(words, i, i + best), font) > maxWidth) best -= 1;
    lines.push(joinWords(words, i, i + best));
    i += best;
  }
  if (i < total) {
    const extra = greedyWrap(words.slice(i), maxWidth, font);
    lines.push(...extra);
  }
  return lines.filter((l) => l.length > 0);
}

function breakCopy(blocks: string[][], target: number, maxWidth: number, font: string): string[] {
  const filled = blocks.filter((b) => b.length > 0);
  if (filled.length === 0) return [];
  if (filled.length === 1) return wrapToCount(filled[0], target, maxWidth, font);
  const per = Math.max(1, Math.round(target / filled.length));
  const out: string[] = [];
  for (const words of filled) {
    out.push(...wrapToCount(words, per, maxWidth, font));
  }
  return out;
}

function layoutKey(state: TypeState, w: number, h: number): string {
  return [
    "v3",
    w,
    h,
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

function insetFor(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const m = Math.max(12, Math.min(w, h) * 0.07);
  return { x: m, y: m, w: w - m * 2, h: h - m * 2 };
}

function scaleBias(scale: number): number {
  return 0.55 + (scale / 100) * 0.9;
}

function fitFontSize(
  lines: string[],
  usableW: number,
  usableH: number,
  weight: number,
  spread: number,
  mode: TypeState["mode"],
  scale: number,
): { fontSize: number; lineHeight: number } {
  const n = Math.max(1, lines.length);
  const compact = 1 - spread / 100;
  const leading = 0.92 + compact * 0.18;
  const heightBudget = usableH / (n * leading + (n - 1) * (0.08 + (spread / 100) * 0.42));
  let size =
    mode === "fixed"
      ? Math.max(8, Math.min(usableH * 0.22, usableW * 0.18) * scaleBias(scale))
      : heightBudget;

  if (mode === "responsive") size *= scaleBias(scale);

  const maxSize = usableH * (n === 1 ? 0.86 : n === 2 ? 0.44 : n === 3 ? 0.3 : 0.24);
  size = Math.min(size, maxSize);
  size = Math.max(10, size);

  const fits = (s: number): boolean => {
    const font = switzerFont(weight, s);
    const lh = s * leading;
    const block = n * lh + Math.max(0, n - 1) * s * 0.04;
    if (block > usableH * 1.02) return false;
    for (const line of lines) {
      if (measureWidth(line, font) > usableW) return false;
    }
    return true;
  };

  if (!fits(size)) {
    let lo = 8;
    let hi = size;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    size = lo;
  }

  return { fontSize: size, lineHeight: size * leading };
}

function lineX(
  lineW: number,
  usable: { x: number; w: number },
  align: TypeState["align"],
  index: number,
  count: number,
  rhythm: number,
): number {
  const base =
    align === "left" ? usable.x : align === "right" ? usable.x + usable.w - lineW : usable.x + (usable.w - lineW) / 2;
  if (count < 2 || rhythm <= 0.5) return base;
  const amp = (rhythm / 100) * usable.w * 0.28;
  const t = count === 1 ? 0 : index / (count - 1);
  const zigzag = (index % 2 === 0 ? -1 : 1) * (0.35 + 0.65 * Math.min(1, index / Math.max(1, count - 1)));
  const drift = (t - 0.5) * 2 * 0.35;
  const dir = align === "left" ? 1 : align === "right" ? -1 : 1;
  let x = base + dir * amp * (zigzag * 0.7 + drift * 0.3);
  const minX = usable.x;
  const maxX = usable.x + usable.w - lineW;
  if (maxX < minX) return usable.x;
  return Math.min(maxX, Math.max(minX, x));
}

function lineYs(
  count: number,
  fontSize: number,
  lineHeight: number,
  usable: { y: number; h: number },
  valign: TypeState["valign"],
  spread: number,
): number[] {
  const n = Math.max(1, count);
  if (n === 1) {
    const baseline =
      valign === "top"
        ? usable.y + fontSize * 0.88
        : valign === "bottom"
          ? usable.y + usable.h - fontSize * 0.18
          : usable.y + usable.h / 2 + fontSize * 0.32;
    return [baseline];
  }
  const compactH = n * lineHeight;
  const s = spread / 100;
  const stretch = usable.h - fontSize;
  const gap = n <= 1 ? 0 : (stretch - n * fontSize) * (0.15 + s * 0.85) / (n - 1);
  const used = n * fontSize + Math.max(0, n - 1) * Math.max(lineHeight - fontSize, gap);
  let origin = usable.y;
  if (s < 0.92) {
    const compactOrigin =
      valign === "top" ? usable.y : valign === "bottom" ? usable.y + usable.h - compactH : usable.y + (usable.h - compactH) / 2;
    origin = compactOrigin * (1 - s) + usable.y * s;
  }
  if (used < usable.h && s > 0.05) {
    const extra = (usable.h - used) * s;
    if (valign === "center") origin = usable.y + extra * 0.15;
    else if (valign === "bottom") origin = usable.y + extra * 0.55;
  }
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = origin + i * fontSize + i * Math.max(lineHeight - fontSize, gap) + fontSize * 0.82;
    ys.push(y);
  }
  const last = ys[n - 1];
  const maxLast = usable.y + usable.h - fontSize * 0.12;
  if (last > maxLast && n > 1) {
    const scale = (maxLast - ys[0]) / Math.max(1, last - ys[0]);
    for (let i = 1; i < n; i++) ys[i] = ys[0] + (ys[i] - ys[0]) * scale;
  }
  return ys;
}

export function layoutTypography(state: TypeState, canvasW: number, canvasH: number): TypeLayout | null {
  if (!state.enabled) return null;
  const text = state.text.replace(/\s+$/g, "");
  if (!text.trim()) return null;
  const key = layoutKey(state, canvasW, canvasH);
  const usable = insetFor(canvasW, canvasH);
  const ox = (state.x / 50) * usable.w * 0.22;
  const oy = (state.y / 50) * usable.h * 0.22;
  if (cache && cache.key === key) {
    return { ...cache.layout, offsetX: ox, offsetY: oy, color: state.color };
  }
  const box = { x: usable.x, y: usable.y, w: usable.w, h: usable.h };

  const blocks = tokenize(text);
  const probe = switzerFont(state.weight, 48);
  const target = targetLineCount(blocks, canvasW, canvasH);
  let lines = breakCopy(blocks, target, box.w, probe);

  const fit = fitFontSize(lines, box.w, box.h, state.weight, state.spread, state.mode, state.scale);
  const font = switzerFont(state.weight, fit.fontSize);
  lines = breakCopy(blocks, target, box.w, font);
  if (lines.length === 0) return null;

  const widths = lines.map((l) => measureWidth(l, font));
  const ys = lineYs(lines.length, fit.fontSize, fit.lineHeight, box, state.valign, state.spread);
  const laid: TypeLine[] = lines.map((textLine, i) => ({
    text: textLine,
    width: widths[i],
    height: fit.fontSize,
    x: lineX(widths[i], box, state.align, i, lines.length, state.rhythm),
    y: ys[i],
  }));

  const layout: TypeLayout = {
    lines: laid,
    fontSize: fit.fontSize,
    weight: state.weight,
    lineHeight: fit.lineHeight,
    canvasW,
    canvasH,
    color: state.color,
    align: state.align,
    offsetX: ox,
    offsetY: oy,
  };
  cache = { key, layout };
  return { ...layout, offsetX: ox, offsetY: oy, color: state.color };
}

export function invalidateTypeLayout(): void {
  cache = null;
}

export function typeHasCopy(state: TypeState): boolean {
  return state.enabled && state.text.trim().length > 0;
}

export function ensureSwitzerMeasure(): void {
  measureContext().font = `500 48px "${SWITZER_FAMILY}"`;
}
