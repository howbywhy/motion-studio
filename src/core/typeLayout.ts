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

/**
 * Optical frame: 10 CSS pixels at a 500px-wide preview.
 * Projects to 21.6px at 1080 and 43.2px at 2160 — identical visual relationship.
 * Not a website safe area.
 */
const PREVIEW_REF_PX = 500;
const PREVIEW_MARGIN_PX = 10;
const FRAME = UNIT * (PREVIEW_MARGIN_PX / PREVIEW_REF_PX);
const AWKWARD_CROP = UNIT * (8 / PREVIEW_REF_PX);
const CONFIDENT_CROP = UNIT * (22 / PREVIEW_REF_PX);

const TRAILING_WEAK = new Set(["BY", "X"]);
const LEADING_WEAK = new Set(["OR", "AND", "TO", "THE", "A", "OF"]);

interface GlyphMetrics {
  advance: number;
  inkLeft: number;
  inkRight: number;
  ascent: number;
  descent: number;
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

function tokenKey(word: string): string {
  return word.replace(/[^\p{L}\p{N}]+/gu, "").toUpperCase();
}

function isTrailingWeak(word: string): boolean {
  return TRAILING_WEAK.has(tokenKey(word));
}

function isLeadingWeak(word: string): boolean {
  return LEADING_WEAK.has(tokenKey(word));
}

function setMeasureFont(weight: number, size: number, tracking: number): void {
  const ctx = measureContext();
  ctx.font = switzerFont(weight, size);
  const ls = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof ls.letterSpacing === "string") ls.letterSpacing = `${tracking}px`;
}

function measureLine(text: string, weight: number, size: number, tracking: number): GlyphMetrics {
  setMeasureFont(weight, size, tracking);
  const ctx = measureContext();
  const ls = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  let advance = 0;
  if (typeof ls.letterSpacing === "string") {
    advance = ctx.measureText(text).width;
  } else if (tracking === 0) {
    advance = ctx.measureText(text).width;
  } else {
    for (const ch of text) advance += ctx.measureText(ch).width;
    if (text.length > 1) advance += tracking * (text.length - 1);
  }
  if (!Number.isFinite(advance) || advance < 0) advance = 0;
  const m = ctx.measureText(text);
  const inkLeft = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
  const inkRight = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : advance;
  const ascent = Number.isFinite(m.actualBoundingBoxAscent) && m.actualBoundingBoxAscent > 0
    ? m.actualBoundingBoxAscent
    : size * 0.78;
  const descent = Number.isFinite(m.actualBoundingBoxDescent) && m.actualBoundingBoxDescent > 0
    ? m.actualBoundingBoxDescent
    : size * 0.22;
  return { advance, inkLeft, inkRight, ascent, descent };
}

function inkWidth(m: GlyphMetrics): number {
  return Math.max(m.advance, m.inkLeft + m.inkRight);
}

function hardBlocks(raw: string): string[][] {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((block) => block.trim().split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);
}

function join(words: string[], a: number, b: number): string {
  return words.slice(a, b).join(" ");
}

function splitTwo(words: string[]): [string, string] | null {
  const n = words.length;
  if (n < 2) return null;
  let cut = Math.ceil(n / 2);
  if (cut < n && isLeadingWeak(words[cut])) cut += 1;
  if (cut > 1 && isTrailingWeak(words[cut - 1]) && tokenKey(words[cut - 1]) !== "BY") cut -= 1;
  if (cut > 1 && isLeadingWeak(words[cut - 1])) cut -= 1;
  cut = Math.min(n - 1, Math.max(1, cut));
  return [join(words, 0, cut), join(words, cut, n)];
}

function splitThree(words: string[]): string[] {
  const n = words.length;
  if (n < 3) return [words.join(" ")];
  const pair = splitTwo(words);
  if (!pair) return [words.join(" ")];
  const left = pair[0].split(/\s+/).filter(Boolean);
  const right = pair[1].split(/\s+/).filter(Boolean);
  if (left.length >= 3) {
    const a = splitTwo(left);
    if (a) return [a[0], a[1], pair[1]];
  }
  if (right.length >= 3) {
    const b = splitTwo(right);
    if (b) return [pair[0], b[0], b[1]];
  }
  return [pair[0], pair[1]];
}

function headlineLines(words: string[]): string[] {
  const n = words.length;
  if (n <= 3) return [words.join(" ")];
  if (n <= 8) {
    const pair = splitTwo(words);
    return pair ? [pair[0], pair[1]] : [words.join(" ")];
  }
  return splitThree(words);
}

function breakCopy(text: string, composition: TypeComposition): string[] {
  const blocks = hardBlocks(text);
  if (blocks.length === 0) return [];
  const userBroke = blocks.length > 1;
  const lines: string[] = [];
  for (const words of blocks) {
    if (userBroke || composition === "spread" || composition === "caption") {
      lines.push(words.join(" "));
      continue;
    }
    lines.push(...headlineLines(words));
  }
  return lines.filter(Boolean);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function u01(v: number): number {
  return Math.min(1, Math.max(0, v / 100));
}

function headlineFill(scale: number): number {
  const u = u01(scale);
  if (u <= 0.5) return lerp(0.52, 1.0, u / 0.5);
  return lerp(1.0, 1.38, (u - 0.5) / 0.5);
}

function spreadEm(scale: number, unitW: number): number {
  return unitW * lerp(0.07, 0.16, u01(scale));
}

function captionEm(scale: number, unitW: number): number {
  return unitW * lerp(0.026, 0.062, u01(scale));
}

function captionInset(scale: number): number {
  return FRAME * lerp(3, 1, u01(scale));
}

function trackingEm(composition: TypeComposition, spacing: number): number {
  const s = u01(spacing);
  if (composition === "headline") return lerp(-0.045, 0.055, s);
  if (composition === "caption") return lerp(0.02, 0.12, s);
  return lerp(-0.01, 0.04, s);
}

function leadingRatio(composition: TypeComposition, spacing: number): number {
  const s = u01(spacing);
  if (composition === "headline") return lerp(0.78, 1.04, s);
  if (composition === "caption") return lerp(1.12, 1.32, s);
  return lerp(0.88, 1.08, s);
}

function sizeToFill(lines: string[], weight: number, targetW: number, trackingEmVal: number): number {
  const probe = 200;
  const tracking = trackingEmVal * probe;
  let longest = 1;
  for (const line of lines) {
    longest = Math.max(longest, inkWidth(measureLine(line, weight, probe, tracking)));
  }
  const size = (targetW / longest) * probe;
  if (!Number.isFinite(size) || size <= 0) return 24;
  return size;
}

function resolveSize(
  composition: TypeComposition,
  scale: number,
  lines: string[],
  weight: number,
  trackingEmVal: number,
  unitW: number,
): number {
  const inner = unitW - FRAME * 2;
  if (composition === "caption") {
    return captionEm(scale, unitW);
  }
  if (composition === "spread") {
    const size = spreadEm(scale, unitW);
    const fit = sizeToFill(lines, weight, inner, trackingEmVal);
    return Math.min(size, fit);
  }
  const fill = headlineFill(scale);
  const size = sizeToFill(lines, weight, inner * fill, trackingEmVal);
  const min = unitW * lerp(0.055, 0.09, u01(scale));
  const max = unitW * lerp(0.42, 1.15, u01(scale));
  return Math.min(max, Math.max(min, size));
}

/** If a calculated crop is tiny, fit inside the optical frame. If it is real, push it to a confident overscan. */
function snapOverflow(overflow: number, grow: boolean): { fitInside: boolean; overflow: number } {
  if (overflow <= 0) return { fitInside: true, overflow: 0 };
  if (overflow < AWKWARD_CROP) return { fitInside: true, overflow: 0 };
  if (grow && overflow < CONFIDENT_CROP) return { fitInside: false, overflow: CONFIDENT_CROP };
  return { fitInside: false, overflow };
}

function placeInkX(
  inkW: number,
  align: TypeAlign,
  unitW: number,
  allowOverscan: boolean,
  margin: number,
): { inkLeft: number; fitScale: number } {
  const innerL = margin;
  const innerR = unitW - margin;
  const innerW = innerR - innerL;
  if (!allowOverscan || inkW <= innerW) {
    const fit = inkW > innerW ? innerW / Math.max(inkW, 1) : 1;
    const w = inkW * fit;
    const inkLeft =
      align === "left" ? innerL :
      align === "right" ? innerR - w :
      innerL + (innerW - w) / 2;
    return { inkLeft, fitScale: fit };
  }

  const canvasOverflow =
    align === "center" ? inkW - unitW :
    inkW - (unitW - margin);
  const snapped = snapOverflow(Math.max(0, canvasOverflow), true);
  if (snapped.fitInside) {
    const fit = innerW / Math.max(inkW, 1);
    const w = inkW * fit;
    const inkLeft =
      align === "left" ? innerL :
      align === "right" ? innerR - w :
      innerL + (innerW - w) / 2;
    return { inkLeft, fitScale: fit };
  }

  const want = snapped.overflow;
  let grow = 1;
  if (align === "center") {
    const current = Math.max(0, inkW - unitW);
    if (current < want) grow = (unitW + want) / Math.max(inkW, 1);
    const w = inkW * grow;
    return { inkLeft: (unitW - w) / 2, fitScale: grow };
  }
  const current = Math.max(0, inkW - (unitW - margin));
  if (current < want) grow = (unitW - margin + want) / Math.max(inkW, 1);
  const w = inkW * grow;
  if (align === "left") return { inkLeft: margin, fitScale: grow };
  return { inkLeft: unitW - margin - w, fitScale: grow };
}

function placeInkY(
  inkH: number,
  valign: TypeValign,
  unitH: number,
  allowOverscan: boolean,
  margin: number,
): { inkTop: number; fitScale: number } {
  const innerT = margin;
  const innerB = unitH - margin;
  const innerH = innerB - innerT;
  if (!allowOverscan || inkH <= innerH) {
    const fit = inkH > innerH ? innerH / Math.max(inkH, 1) : 1;
    const h = inkH * fit;
    const inkTop =
      valign === "top" ? innerT :
      valign === "bottom" ? innerB - h :
      innerT + (innerH - h) / 2;
    return { inkTop, fitScale: fit };
  }

  const canvasOverflow =
    valign === "center" ? inkH - unitH :
    inkH - (unitH - margin);
  const snapped = snapOverflow(Math.max(0, canvasOverflow), true);
  if (snapped.fitInside) {
    const fit = innerH / Math.max(inkH, 1);
    const h = inkH * fit;
    const inkTop =
      valign === "top" ? innerT :
      valign === "bottom" ? innerB - h :
      innerT + (innerH - h) / 2;
    return { inkTop, fitScale: fit };
  }
  const want = snapped.overflow;
  let grow = 1;
  if (valign === "center") {
    const current = Math.max(0, inkH - unitH);
    if (current < want) grow = (unitH + want) / Math.max(inkH, 1);
    const h = inkH * grow;
    return { inkTop: (unitH - h) / 2, fitScale: grow };
  }
  const current = Math.max(0, inkH - (unitH - margin));
  if (current < want) grow = (unitH - margin + want) / Math.max(inkH, 1);
  const h = inkH * grow;
  if (valign === "top") return { inkTop: margin, fitScale: grow };
  return { inkTop: unitH - margin - h, fitScale: grow };
}

interface PreparedLine {
  text: string;
  m: GlyphMetrics;
}

function prepareLines(lines: string[], weight: number, fontSize: number, tracking: number): PreparedLine[] {
  return lines.map((text) => ({ text, m: measureLine(text, weight, fontSize, tracking) }));
}

function lockupMetrics(prepared: PreparedLine[], lineHeight: number): {
  blockW: number;
  blockH: number;
  ascent: number;
  descent: number;
} {
  let blockW = 0;
  let ascent = 0;
  let descent = 0;
  for (const line of prepared) {
    blockW = Math.max(blockW, inkWidth(line.m));
    ascent = Math.max(ascent, line.m.ascent);
    descent = Math.max(descent, line.m.descent);
  }
  const n = prepared.length;
  const blockH = n <= 1 ? ascent + descent : ascent + descent + (n - 1) * lineHeight;
  return { blockW, blockH, ascent, descent };
}

function placeLockup(
  prepared: PreparedLine[],
  lineHeight: number,
  align: TypeAlign,
  valign: TypeValign,
  unitW: number,
  unitH: number,
  allowOverscan: boolean,
  margin: number,
): { xs: number[]; ys: number[]; fontScale: number } {
  const box = lockupMetrics(prepared, lineHeight);
  const px = placeInkX(box.blockW, align, unitW, allowOverscan, margin);
  const py = placeInkY(box.blockH, valign, unitH, allowOverscan, margin);
  const fontScale = Math.min(px.fitScale, py.fitScale);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const line = prepared[i];
    const w = inkWidth(line.m) * fontScale;
    const inkLeft =
      align === "left" ? px.inkLeft :
      align === "right" ? px.inkLeft + box.blockW * fontScale - w :
      px.inkLeft + (box.blockW * fontScale - w) / 2;
    const fillX = inkLeft + line.m.inkLeft * fontScale;
    const fillY = py.inkTop + line.m.ascent * fontScale + i * lineHeight * fontScale;
    xs.push(fillX);
    ys.push(fillY);
  }
  return { xs, ys, fontScale };
}

interface Pin {
  hx: number;
  hy: number;
}

function spreadPins(n: number, align: TypeAlign): Pin[] {
  const mirror = (pins: Pin[]): Pin[] =>
    align === "right" ? pins.map((p) => ({ hx: 1 - p.hx, hy: p.hy })) : pins;
  if (n <= 1) return [{ hx: align === "left" ? 0 : align === "right" ? 1 : 0.5, hy: 0.5 }];
  if (n === 2) {
    if (align === "center") return [{ hx: 0.08, hy: 0.06 }, { hx: 0.92, hy: 0.94 }];
    return mirror([{ hx: 0, hy: 0 }, { hx: 1, hy: 1 }]);
  }
  if (n === 3) {
    if (align === "center") return [{ hx: 0, hy: 0.04 }, { hx: 1, hy: 0.5 }, { hx: 0, hy: 0.96 }];
    return mirror([{ hx: 0, hy: 0 }, { hx: 1, hy: 0.5 }, { hx: 0, hy: 1 }]);
  }
  return mirror([{ hx: 0, hy: 0 }, { hx: 1, hy: 0 }, { hx: 0, hy: 1 }, { hx: 1, hy: 1 }]);
}

function clusterAnchor(align: TypeAlign, valign: TypeValign): Pin {
  return {
    hx: align === "left" ? 0 : align === "right" ? 1 : 0.5,
    hy: valign === "top" ? 0 : valign === "bottom" ? 1 : 0.5,
  };
}

function pinInk(
  pin: Pin,
  inkW: number,
  inkH: number,
  unitW: number,
  unitH: number,
): { left: number; top: number } {
  const innerL = FRAME;
  const innerT = FRAME;
  const innerW = unitW - FRAME * 2;
  const innerH = unitH - FRAME * 2;
  const left = innerL + pin.hx * (innerW - inkW);
  const top = innerT + pin.hy * (innerH - inkH);
  return { left, top };
}

function placeSpread(
  prepared: PreparedLine[],
  fontSize: number,
  align: TypeAlign,
  valign: TypeValign,
  spacing: number,
  unitW: number,
  unitH: number,
): { xs: number[]; ys: number[] } {
  const n = prepared.length;
  if (n <= 1) {
    const lineHeight = fontSize;
    const placed = placeLockup(prepared, lineHeight, align, valign, unitW, unitH, false, FRAME);
    return { xs: placed.xs, ys: placed.ys };
  }

  const t = u01(spacing);
  const pins = spreadPins(n, align);
  const cluster = clusterAnchor(align, valign);
  const xs: number[] = [];
  const ys: number[] = [];
  const compactGap = fontSize * 0.92;

  for (let i = 0; i < n; i++) {
    const line = prepared[i];
    const inkW = inkWidth(line.m);
    const inkH = line.m.ascent + line.m.descent;
    const authored = pinInk(pins[i] ?? pins[pins.length - 1], inkW, inkH, unitW, unitH);
    const stackedTop =
      valign === "top" ? FRAME :
      valign === "bottom" ? unitH - FRAME - (n * inkH + (n - 1) * (compactGap - inkH)) :
      (unitH - (n * inkH + (n - 1) * (compactGap - inkH))) / 2;
    const clusterPos = pinInk(cluster, inkW, inkH, unitW, unitH);
    const compactLeft = clusterPos.left;
    const compactTop = stackedTop + i * compactGap;
    const left = lerp(compactLeft, authored.left, t);
    const top = lerp(compactTop, authored.top, t);
    xs.push(left + line.m.inkLeft);
    ys.push(top + line.m.ascent);
  }
  return { xs, ys };
}

function cacheKey(state: TypeState, aspectKey: number): string {
  return [
    "v8",
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
  const ox = (state.x / 50) * unitW * 0.12;
  const oy = (state.y / 50) * unitH * 0.12;
  if (cache && cache.key === key) {
    return projectLayout(cache.layout, w, h, ox, oy, state.color, state.opacity / 100);
  }

  const composition = state.composition;
  let lines = breakCopy(text, composition);
  if (lines.length === 0) return null;

  const tEm = trackingEm(composition, state.spacing);
  let fontSize = resolveSize(composition, state.scale, lines, state.weight, tEm, unitW);
  let tracking = tEm * fontSize;
  let prepared = prepareLines(lines, state.weight, fontSize, tracking);

  if (composition === "caption" && lines.length === 1) {
    const words = lines[0].split(/\s+/).filter(Boolean);
    const capInner = unitW - captionInset(state.scale) * 2;
    if (words.length >= 5 && inkWidth(prepared[0].m) > capInner) {
      const pair = splitTwo(words);
      if (pair) {
        lines = pair;
        fontSize = resolveSize(composition, state.scale, lines, state.weight, tEm, unitW);
        tracking = tEm * fontSize;
        prepared = prepareLines(lines, state.weight, fontSize, tracking);
      }
    }
  }

  if (composition === "spread") {
    const longest = prepared.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
    const inner = unitW - FRAME * 2;
    if (longest > inner) {
      fontSize *= inner / longest;
      tracking = tEm * fontSize;
      prepared = prepareLines(lines, state.weight, fontSize, tracking);
    }
  }

  const leading = fontSize * leadingRatio(composition, state.spacing);

  let xs: number[];
  let ys: number[];

  if (composition === "spread") {
    const placed = placeSpread(prepared, fontSize, state.align, state.valign, state.spacing, unitW, unitH);
    xs = placed.xs;
    ys = placed.ys;
  } else {
    const allowOverscan = composition === "headline";
    const margin = composition === "caption" ? captionInset(state.scale) : FRAME;
    let placed = placeLockup(
      prepared,
      leading,
      state.align,
      state.valign,
      unitW,
      unitH,
      allowOverscan,
      margin,
    );
    if (Math.abs(placed.fontScale - 1) > 0.002) {
      const grow = placed.fontScale;
      fontSize *= grow;
      tracking = tEm * fontSize;
      prepared = prepareLines(lines, state.weight, fontSize, tracking);
      const nextLeading = fontSize * leadingRatio(composition, state.spacing);
      placed = placeLockup(
        prepared,
        nextLeading,
        state.align,
        state.valign,
        unitW,
        unitH,
        allowOverscan && grow >= 1,
        margin,
      );
    }
    xs = placed.xs;
    ys = placed.ys;
  }

  const laid: TypeLine[] = lines.map((textLine, i) => ({
    text: textLine,
    width: prepared[i].m.advance,
    height: fontSize,
    x: xs[i],
    y: ys[i],
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

/** Optical frame in pixels for a given canvas width. Eval-only diagnostics. */
export function opticalFramePx(canvasW: number): number {
  return canvasW * (PREVIEW_MARGIN_PX / PREVIEW_REF_PX);
}
