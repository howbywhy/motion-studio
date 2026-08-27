import { switzerFont, SWITZER_FAMILY } from "./typeFont";
import type { TypeAlign, TypeComposition, TypeState, TypeValign } from "./typeState";

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
  tracking: number;
  lineHeight: number;
  canvasW: number;
  canvasH: number;
  color: string;
  opacity: number;
  align: TypeAlign;
  offsetX: number;
  offsetY: number;
  composition: TypeComposition;
}

/** Layout is authored in this square-width space, then projected to pixels.
 * Preview / 1080 / 2160 share the same unit plan. */
const UNIT = 1000;

const TRAILING_WEAK = new Set(["BY", "X"]);
const LEADING_WEAK = new Set(["OR", "AND", "TO", "THE", "A", "OF"]);

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

function tokenKey(word: string): string {
  return word.replace(/[^\p{L}\p{N}]+/gu, "").toUpperCase();
}

function isTrailingWeak(word: string): boolean {
  return TRAILING_WEAK.has(tokenKey(word));
}

function isLeadingWeak(word: string): boolean {
  return LEADING_WEAK.has(tokenKey(word));
}

function setMeasureFont(weight: number, size: number, tracking: number): string {
  const ctx = measureContext();
  const font = switzerFont(weight, size);
  ctx.font = font;
  const ls = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof ls.letterSpacing === "string") ls.letterSpacing = `${tracking}px`;
  return font;
}

function measureWidth(text: string, weight: number, size: number, tracking: number): number {
  setMeasureFont(weight, size, tracking);
  const ctx = measureContext();
  const ls = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof ls.letterSpacing === "string") {
    const w = ctx.measureText(text).width;
    return Number.isFinite(w) ? w : 0;
  }
  if (tracking === 0) {
    const w = ctx.measureText(text).width;
    return Number.isFinite(w) ? w : 0;
  }
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width;
  if (text.length > 1) w += tracking * (text.length - 1);
  return w;
}

function hardBlocks(raw: string): string[][] {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((block) => block.trim().split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);
}

/** Split a no-newline block on sentence boundaries when there are 2+ units. */
function sentenceUnits(words: string[]): string[][] {
  const joined = words.join(" ");
  const parts = joined.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [words];
  const units = parts.map((p) => p.split(/\s+/).filter(Boolean));
  const last = units[units.length - 1];
  if (last && last.length === 1 && (isTrailingWeak(last[0]) || last[0].length <= 1)) {
    const prev = units[units.length - 2];
    if (prev) {
      prev.push(...last);
      units.pop();
    }
  }
  return units.length >= 2 ? units : [words];
}

function join(words: string[], a: number, b: number): string {
  return words.slice(a, b).join(" ");
}

function splitTwo(words: string[]): [string, string] | null {
  const n = words.length;
  if (n < 2) return null;
  let cut = Math.ceil(n / 2);
  if (cut > 1 && isLeadingWeak(words[cut - 1])) {
    cut -= 1;
  }
  cut = Math.min(n - 1, Math.max(1, cut));
  return [join(words, 0, cut), join(words, cut, n)];
}

function splitThree(words: string[]): string[] {
  const n = words.length;
  if (n < 3) return [words.join(" ")];
  const a = Math.max(1, Math.round(n / 3));
  let b = Math.max(a + 1, Math.round((2 * n) / 3));
  if (b < n && isLeadingWeak(words[b])) b += 1;
  if (a < n && isLeadingWeak(words[a])) {
    return splitTwo(words) ? [...(splitTwo(words) as [string, string])] : [words.join(" ")];
  }
  b = Math.min(n - 1, Math.max(a + 1, b));
  return [join(words, 0, a), join(words, a, b), join(words, b, n)];
}

function sizeToFill(lines: string[], weight: number, targetW: number, trackingEm: number): number {
  const probe = 200;
  const tracking = trackingEm * probe;
  let longest = 1;
  for (const line of lines) {
    longest = Math.max(longest, measureWidth(line, weight, probe, tracking));
  }
  const size = (targetW / longest) * probe;
  if (!Number.isFinite(size) || size <= 0) return 24;
  return size;
}

function fillWidth(composition: TypeComposition, scale: number, unitW: number): number {
  const u = Math.min(1, Math.max(0, scale / 100));
  const frac =
    composition === "display" ? 0.22 + u * 1.08 :
    composition === "stack" ? 0.20 + u * 0.62 :
    composition === "spread" ? 0.22 + u * 0.50 :
    0.10 + u * 0.32;
  return unitW * frac;
}

function trackingEm(composition: TypeComposition, spacing: number): number {
  const s = Math.min(1, Math.max(0, spacing / 100));
  if (composition === "display") return -0.04 + s * 0.10;
  if (composition === "stack") return -0.02 + s * 0.04;
  if (composition === "quiet") return 0.02 + s * 0.12;
  return 0;
}

function leadingRatio(composition: TypeComposition, spacing: number): number {
  const s = Math.min(1, Math.max(0, spacing / 100));
  if (composition === "display") return 0.78 + s * 0.16;
  if (composition === "stack") return 0.70 + s * 0.58;
  if (composition === "quiet") return 1.08 + s * 0.38;
  return 1;
}

function composeBlock(words: string[], composition: TypeComposition, allowSplit: boolean): string[] {
  if (words.length === 0) return [];
  if (!allowSplit || words.length === 1) return [words.join(" ")];

  if (composition === "display") {
    if (words.length <= 3) return [words.join(" ")];
    const pair = splitTwo(words);
    return pair ? [pair[0], pair[1]] : [words.join(" ")];
  }

  if (composition === "quiet") {
    if (words.length <= 4) return [words.join(" ")];
    const pair = splitTwo(words);
    return pair ? [pair[0], pair[1]] : [words.join(" ")];
  }

  if (composition === "stack" || composition === "spread") {
    const sentences = sentenceUnits(words);
    if (sentences.length >= 2) return sentences.map((u) => u.join(" "));
    if (words.length === 2) return [words[0], words[1]];
    if (words.length === 3) {
      const pair = splitTwo(words);
      return pair ? [pair[0], pair[1]] : [words.join(" ")];
    }
    if (words.length === 4) {
      const pair = splitTwo(words);
      return pair ? [pair[0], pair[1]] : [words.join(" ")];
    }
    if (words.length >= 6) return splitThree(words);
    const pair = splitTwo(words);
    return pair ? [pair[0], pair[1]] : [words.join(" ")];
  }

  return [words.join(" ")];
}

function breakCopy(text: string, composition: TypeComposition): string[] {
  const blocks = hardBlocks(text);
  if (blocks.length === 0) return [];
  const userBroke = blocks.length > 1;
  const lines: string[] = [];
  for (const words of blocks) {
    const short = words.join(" ").length <= 22 && words.length <= 4;
    const allow = userBroke ? false : true;
    if (userBroke && short) {
      lines.push(words.join(" "));
    } else {
      lines.push(...composeBlock(words, composition, allow));
    }
  }
  if (composition === "display" && !userBroke && lines.length > 2) {
    return [lines[0], lines.slice(1).join(" ")];
  }
  return lines.filter(Boolean);
}

function maybeSplitForWeight(
  lines: string[],
  composition: TypeComposition,
  weight: number,
  targetW: number,
  trackingEmVal: number,
  userBroke: boolean,
): string[] {
  if (userBroke || lines.length !== 1 || composition === "quiet") return lines;
  const line = lines[0];
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 3) return lines;
  const size = sizeToFill(lines, weight, targetW, trackingEmVal);
  const tracking = trackingEmVal * size;
  const width = measureWidth(line, weight, size, tracking);
  const limit = composition === "display" ? targetW * 1.18 : targetW * 1.02;
  if (width <= limit) return lines;
  const pair = splitTwo(words);
  return pair ? [pair[0], pair[1]] : lines;
}

function quietWrap(
  lines: string[],
  weight: number,
  targetW: number,
  trackingEmVal: number,
): string[] {
  if (lines.length !== 1) return lines;
  const line = lines[0];
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 5) return lines;
  const size = sizeToFill(lines, weight, targetW, trackingEmVal);
  const width = measureWidth(line, weight, size, trackingEmVal * size);
  if (width <= targetW) return lines;
  const pair = splitTwo(words);
  return pair ? [pair[0], pair[1]] : lines;
}

function clampSize(size: number, composition: TypeComposition, unitW: number, unitH: number): number {
  const min = composition === "quiet" ? unitW * 0.022 : unitW * 0.032;
  const max =
    composition === "display" ? unitH * 1.28 :
    composition === "stack" ? unitH * 0.24 :
    composition === "spread" ? unitH * 0.20 :
    unitH * 0.12;
  return Math.min(max, Math.max(min, size));
}

function confidentCrop(x: number, w: number, frameW: number, fontSize: number, scale: number, composition: TypeComposition): number {
  if (composition === "quiet") {
    const inset = frameW * 0.08;
    if (x < inset) return inset;
    if (x + w > frameW - inset) return Math.max(inset, frameW - inset - w);
    return x;
  }
  const left = x;
  const right = x + w;
  const awkward = fontSize * 0.08;
  const confident = fontSize * 0.38;
  const overflowL = Math.max(0, -left);
  const overflowR = Math.max(0, right - frameW);
  const preferBleed = composition === "display" && scale >= 70;
  let nx = x;
  if (overflowL > 0 && overflowL < awkward) {
    nx = preferBleed ? x - (confident - overflowL) : 0;
  }
  if (overflowR > 0 && overflowR < awkward) {
    nx = preferBleed ? x + (confident - overflowR) : frameW - w;
  }
  return nx;
}

function placeBlock(
  widths: number[],
  fontSize: number,
  leading: number,
  unitW: number,
  unitH: number,
  align: TypeAlign,
  valign: TypeValign,
  composition: TypeComposition,
  scale: number,
): { xs: number[]; ys: number[] } {
  const n = widths.length;
  const ascent = fontSize * 0.78;
  const lineBox = fontSize;
  const gap = Math.max(fontSize * 0.02, leading - lineBox);
  const blockH = n * lineBox + Math.max(0, n - 1) * gap;
  const bleed =
    composition === "display" ? Math.min(0.12, (scale / 100) * 0.14) :
    composition === "stack" && scale >= 90 ? 0.04 :
    0;
  const insetX =
    composition === "quiet" ? unitW * 0.10 :
    composition === "display" ? unitW * (0.04 - bleed * 0.4) :
    unitW * 0.06;
  const insetY =
    composition === "quiet" ? unitH * 0.12 :
    composition === "display" ? unitH * (0.05 - bleed * 0.5) :
    unitH * 0.07;
  const frameW = unitW - insetX * 2;
  const top = insetY - unitH * bleed;
  const bottom = unitH - insetY + unitH * bleed;
  let origin = top;
  if (valign === "center") origin = (unitH - blockH) / 2;
  else if (valign === "bottom") origin = bottom - blockH;
  const ys: number[] = [];
  for (let i = 0; i < n; i++) ys.push(origin + i * (lineBox + gap) + ascent);
  const innerW = unitW - insetX * 2;
  const xs = widths.map((lineW) => {
    const local =
      align === "left" ? insetX :
      align === "right" ? unitW - insetX - lineW :
      insetX + (innerW - lineW) / 2;
    return confidentCrop(local, lineW, unitW, fontSize, scale, composition);
  });
  void frameW;
  return { xs, ys };
}

function spreadPattern(n: number, align: TypeAlign): { x: number; y: number }[] {
  const yFor = (count: number): number[] => {
    if (count <= 1) return [0.5];
    if (count === 2) return [0.20, 0.80];
    if (count === 3) return [0.16, 0.50, 0.84];
    return [0.12, 0.38, 0.64, 0.88].slice(0, count);
  };
  const ys = yFor(n);
  const leftSeq = n === 2 ? [0, 1] : n === 3 ? [0, 1, 0] : n === 4 ? [0, 1, 0, 1] : [0.5];
  const rightSeq = leftSeq.map((v) => 1 - v);
  const centerSeq = n === 2 ? [0.18, 0.82] : n === 3 ? [0.12, 0.88, 0.22] : n === 4 ? [0.10, 0.90, 0.14, 0.86] : [0.5];
  const seq = align === "left" ? leftSeq : align === "right" ? rightSeq : centerSeq;
  return ys.map((y, i) => ({ x: seq[i] ?? 0.5, y }));
}

function placeSpread(
  widths: number[],
  fontSize: number,
  unitW: number,
  unitH: number,
  align: TypeAlign,
  valign: TypeValign,
  spacing: number,
  scale: number,
): { xs: number[]; ys: number[] } {
  const n = widths.length;
  const s = Math.min(1, Math.max(0, spacing / 100));
  const authored = spreadPattern(n, align);
  const inset = unitW * 0.06;
  const compactY0 =
    valign === "top" ? unitH * 0.18 :
    valign === "bottom" ? unitH * 0.62 :
    unitH * 0.38;
  const xs: number[] = [];
  const ys: number[] = [];
  const extreme = s > 0.5 ? (s - 0.5) / 0.5 : 0;
  const towardAuth = s <= 0.5 ? s / 0.5 : 1;
  const valignShift =
    valign === "top" ? -unitH * 0.08 :
    valign === "bottom" ? unitH * 0.08 :
    0;
  for (let i = 0; i < n; i++) {
    const lineW = widths[i];
    const ax = authored[i].x;
    const ay = authored[i].y;
    const compactX =
      align === "left" ? 0 :
      align === "right" ? 1 :
      0.5;
    const t = towardAuth;
    const xAmt = compactX + (ax - compactX) * t;
    const xAmt2 = xAmt + (ax === 0 ? -0.04 * extreme : ax === 1 ? 0.04 * extreme : (xAmt - 0.5) * 0.15 * extreme);
    let x = inset + xAmt2 * (unitW - inset * 2 - lineW);
    if (align === "left" && ax < 0.5) x = inset + extreme * (inset * -0.4);
    if (align === "right" && ax > 0.5) x = unitW - inset - lineW - extreme * (inset * -0.4);
    const compactY = compactY0 + i * fontSize * 0.95;
    const authY = ay * unitH;
    const yMix = compactY + (authY - compactY) * t;
    const y = yMix + valignShift + (ay - 0.5) * unitH * 0.06 * extreme;
    xs.push(confidentCrop(x, lineW, unitW, fontSize, scale, "spread"));
    ys.push(y);
  }
  return { xs, ys };
}

function cacheKey(state: TypeState, aspectKey: number): string {
  return [
    "v7",
    aspectKey,
    state.text,
    state.composition,
    state.align,
    state.valign,
    state.scale,
    state.spacing,
    state.weight,
  ].join("\t");
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
  const key = cacheKey(state, aspectKey);
  const ox = (state.x / 50) * unitW * 0.16;
  const oy = (state.y / 50) * unitH * 0.16;
  if (cache && cache.key === key) {
    return projectLayout(cache.layout, w, h, ox, oy, state.color, state.opacity / 100);
  }

  const userBroke = hardBlocks(text).length > 1;
  const composition = state.composition;
  let lines = breakCopy(text, composition);
  if (lines.length === 0) return null;

  const tEm = trackingEm(composition, state.spacing);
  const targetW = fillWidth(composition, state.scale, unitW);
  lines = maybeSplitForWeight(lines, composition, state.weight, targetW, tEm, userBroke);
  if (composition === "quiet") lines = quietWrap(lines, state.weight, targetW, tEm);

  let fontSize = sizeToFill(lines, state.weight, targetW, tEm);
  fontSize = clampSize(fontSize, composition, unitW, unitH);
  const tracking = tEm * fontSize;
  const widths = lines.map((l) => measureWidth(l, state.weight, fontSize, tracking));
  const leading = fontSize * leadingRatio(composition, state.spacing);

  const placed =
    composition === "spread" && lines.length >= 2
      ? placeSpread(widths, fontSize, unitW, unitH, state.align, state.valign, state.spacing, state.scale)
      : placeBlock(widths, fontSize, leading, unitW, unitH, state.align, state.valign, composition, state.scale);

  const laid: TypeLine[] = lines.map((textLine, i) => ({
    text: textLine,
    width: widths[i],
    height: fontSize,
    x: placed.xs[i],
    y: placed.ys[i],
  }));

  const layout: TypeLayout = {
    lines: laid,
    fontSize,
    weight: state.weight,
    tracking,
    lineHeight: leading,
    canvasW: unitW,
    canvasH: unitH,
    color: state.color,
    opacity: state.opacity / 100,
    align: state.align,
    offsetX: ox,
    offsetY: oy,
    composition,
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
    tracking: unit.tracking * s,
    lineHeight: unit.lineHeight * s,
    canvasW,
    canvasH,
    color,
    opacity,
    align: unit.align,
    offsetX: ox * s,
    offsetY: oy * s,
    composition: unit.composition,
  };
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

export function debugLinePlan(state: TypeState, canvasW: number, canvasH: number): string[] {
  const layout = layoutTypography(state, canvasW, canvasH);
  return layout ? layout.lines.map((l) => l.text) : [];
}
