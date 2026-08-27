import { switzerFont, SWITZER_FAMILY } from "./typeFont";
import type { TypeAlign, TypeRole, TypeState, TypeValign } from "./typeState";

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
  composition: TypeRole;
}

/** Layout is authored in this square-width space, then projected to pixels. */
const UNIT = 1000;

/** Optical frame: 10 CSS pixels at a 500px-wide preview. */
const PREVIEW_REF_PX = 500;
const PREVIEW_MARGIN_PX = 10;
const FRAME = UNIT * (PREVIEW_MARGIN_PX / PREVIEW_REF_PX);
const AWKWARD_CROP = UNIT * (8 / PREVIEW_REF_PX);
const CONFIDENT_CROP = UNIT * (22 / PREVIEW_REF_PX);

const COLS = 4;
const ROWS = 8;

const TRAILING_WEAK = new Set(["BY", "X"]);
const LEADING_WEAK = new Set(["OR", "AND", "TO", "THE", "A", "OF"]);

interface GlyphMetrics {
  advance: number;
  inkLeft: number;
  inkRight: number;
  ascent: number;
  descent: number;
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

interface Grid {
  innerL: number;
  innerT: number;
  innerW: number;
  innerH: number;
  colW: number;
  rowH: number;
  col: (i: number) => number;
  row: (j: number) => number;
}

interface PreparedLine {
  text: string;
  m: GlyphMetrics;
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

function displayLines(words: string[]): string[] {
  const n = words.length;
  if (n <= 3) return [words.join(" ")];
  if (n <= 8) {
    const pair = splitTwo(words);
    return pair ? [pair[0], pair[1]] : [words.join(" ")];
  }
  return splitThree(words);
}

function editorialLines(words: string[]): string[] {
  const n = words.length;
  if (n <= 2) return [words.join(" ")];
  if (n <= 5) {
    const pair = splitTwo(words);
    return pair ? [pair[0], pair[1]] : [words.join(" ")];
  }
  if (n <= 9) return splitThree(words);
  const three = splitThree(words);
  if (three.length >= 3) {
    const last = three[2].split(/\s+/).filter(Boolean);
    if (last.length >= 3) {
      const extra = splitTwo(last);
      if (extra) return [three[0], three[1], extra[0], extra[1]];
    }
  }
  return three;
}

function breakCopy(text: string, role: TypeRole): string[] {
  const blocks = hardBlocks(text);
  if (blocks.length === 0) return [];
  const userBroke = blocks.length > 1;
  const lines: string[] = [];
  for (const words of blocks) {
    if (userBroke || role === "caption" || role === "folio") {
      lines.push(words.join(" "));
      continue;
    }
    if (role === "editorial") {
      lines.push(...editorialLines(words));
      continue;
    }
    lines.push(...displayLines(words));
  }
  return lines.filter(Boolean);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function u01(v: number): number {
  return Math.min(1, Math.max(0, v / 100));
}

function makeGrid(unitW: number, unitH: number): Grid {
  const innerL = FRAME;
  const innerT = FRAME;
  const innerW = unitW - FRAME * 2;
  const innerH = unitH - FRAME * 2;
  const colW = innerW / COLS;
  const rowH = innerH / ROWS;
  return {
    innerL,
    innerT,
    innerW,
    innerH,
    colW,
    rowH,
    col: (i: number) => innerL + i * colW,
    row: (j: number) => innerT + j * rowH,
  };
}

function folioOversized(scale: number): boolean {
  return scale >= 55;
}

function roleBox(role: TypeRole, align: TypeAlign, valign: TypeValign, g: Grid, scale: number): Box {
  if (role === "display" || (role === "folio" && folioOversized(scale))) {
    return { l: g.innerL, t: g.innerT, r: g.innerL + g.innerW, b: g.innerT + g.innerH };
  }
  if (role === "editorial") {
    let c0 = 0;
    let c1 = 4;
    if (align === "left") {
      c0 = 0;
      c1 = 3;
    } else if (align === "right") {
      c0 = 1;
      c1 = 4;
    }
    let r0 = 1;
    let r1 = 7;
    if (valign === "top") {
      r0 = 0;
      r1 = 5;
    } else if (valign === "bottom") {
      r0 = 3;
      r1 = 8;
    }
    return { l: g.col(c0), t: g.row(r0), r: g.col(c1), b: g.row(r1) };
  }
  return { l: g.innerL, t: g.innerT, r: g.innerL + g.innerW, b: g.innerT + g.innerH };
}

function displayFill(scale: number): number {
  const u = u01(scale);
  if (u <= 0.5) return lerp(0.52, 1.0, u / 0.5);
  return lerp(1.0, 1.38, (u - 0.5) / 0.5);
}

function trackingEm(role: TypeRole, spacing: number): number {
  const s = u01(spacing);
  if (role === "display") return lerp(-0.045, 0.055, s);
  if (role === "caption") return lerp(0.02, 0.12, s);
  if (role === "folio") return lerp(-0.02, 0.08, s);
  return lerp(-0.02, 0.05, s);
}

function leadingRatio(role: TypeRole, spacing: number): number {
  const s = u01(spacing);
  if (role === "display") return lerp(0.78, 1.04, s);
  if (role === "caption") return lerp(1.12, 1.28, s);
  if (role === "folio") return lerp(0.82, 1.08, s);
  return lerp(0.92, 1.28, Math.min(1, s / 0.5));
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
  role: TypeRole,
  scale: number,
  lines: string[],
  weight: number,
  trackingEmVal: number,
  unitW: number,
  box: Box,
): number {
  const boxW = Math.max(8, box.r - box.l);
  const u = u01(scale);
  if (role === "caption") {
    return unitW * lerp(0.024, 0.052, u);
  }
  if (role === "folio") {
    if (u < 0.35) return unitW * lerp(0.022, 0.048, u / 0.35);
    if (u < 0.55) return unitW * lerp(0.048, 0.09, (u - 0.35) / 0.2);
    const fill = lerp(0.72, 1.32, (u - 0.55) / 0.45);
    const size = sizeToFill(lines, weight, boxW * fill, trackingEmVal);
    const min = unitW * 0.08;
    const max = unitW * lerp(0.28, 1.1, (u - 0.55) / 0.45);
    return Math.min(max, Math.max(min, size));
  }
  if (role === "editorial") {
    const fill = lerp(0.72, 0.96, u);
    const size = sizeToFill(lines, weight, boxW * fill, trackingEmVal);
    const min = unitW * 0.042;
    const max = unitW * 0.155;
    return Math.min(max, Math.max(min, size));
  }
  const fill = displayFill(scale);
  const size = sizeToFill(lines, weight, boxW * fill, trackingEmVal);
  const min = unitW * lerp(0.055, 0.09, u);
  const max = unitW * lerp(0.42, 1.15, u);
  return Math.min(max, Math.max(min, size));
}

function snapOverflow(overflow: number, grow: boolean): { fitInside: boolean; overflow: number } {
  if (overflow <= 0) return { fitInside: true, overflow: 0 };
  if (overflow < AWKWARD_CROP) return { fitInside: true, overflow: 0 };
  if (grow && overflow < CONFIDENT_CROP) return { fitInside: false, overflow: CONFIDENT_CROP };
  return { fitInside: false, overflow };
}

function placeInkX(
  inkW: number,
  align: TypeAlign,
  boxL: number,
  boxR: number,
  canvasW: number,
  allowOverscan: boolean,
): { inkLeft: number; fitScale: number } {
  const innerW = boxR - boxL;
  if (!allowOverscan || inkW <= innerW) {
    const fit = inkW > innerW ? innerW / Math.max(inkW, 1) : 1;
    const w = inkW * fit;
    const inkLeft =
      align === "left" ? boxL :
      align === "right" ? boxR - w :
      boxL + (innerW - w) / 2;
    return { inkLeft, fitScale: fit };
  }
  const canvasOverflow =
    align === "center" ? inkW - canvasW :
    inkW - (canvasW - boxL);
  const snapped = snapOverflow(Math.max(0, canvasOverflow), true);
  if (snapped.fitInside) {
    const fit = innerW / Math.max(inkW, 1);
    const w = inkW * fit;
    const inkLeft =
      align === "left" ? boxL :
      align === "right" ? boxR - w :
      boxL + (innerW - w) / 2;
    return { inkLeft, fitScale: fit };
  }
  const want = snapped.overflow;
  let grow = 1;
  if (align === "center") {
    const current = Math.max(0, inkW - canvasW);
    if (current < want) grow = (canvasW + want) / Math.max(inkW, 1);
    const w = inkW * grow;
    return { inkLeft: (canvasW - w) / 2, fitScale: grow };
  }
  const current = Math.max(0, inkW - (canvasW - boxL));
  if (current < want) grow = (canvasW - boxL + want) / Math.max(inkW, 1);
  const w = inkW * grow;
  if (align === "left") return { inkLeft: boxL, fitScale: grow };
  return { inkLeft: canvasW - boxL - w, fitScale: grow };
}

function placeInkY(
  inkH: number,
  valign: TypeValign,
  boxT: number,
  boxB: number,
  canvasH: number,
  allowOverscan: boolean,
): { inkTop: number; fitScale: number } {
  const innerH = boxB - boxT;
  if (!allowOverscan || inkH <= innerH) {
    const fit = inkH > innerH ? innerH / Math.max(inkH, 1) : 1;
    const h = inkH * fit;
    const inkTop =
      valign === "top" ? boxT :
      valign === "bottom" ? boxB - h :
      boxT + (innerH - h) / 2;
    return { inkTop, fitScale: fit };
  }
  const canvasOverflow =
    valign === "center" ? inkH - canvasH :
    inkH - (canvasH - boxT);
  const snapped = snapOverflow(Math.max(0, canvasOverflow), true);
  if (snapped.fitInside) {
    const fit = innerH / Math.max(inkH, 1);
    const h = inkH * fit;
    const inkTop =
      valign === "top" ? boxT :
      valign === "bottom" ? boxB - h :
      boxT + (innerH - h) / 2;
    return { inkTop, fitScale: fit };
  }
  const want = snapped.overflow;
  let grow = 1;
  if (valign === "center") {
    const current = Math.max(0, inkH - canvasH);
    if (current < want) grow = (canvasH + want) / Math.max(inkH, 1);
    const h = inkH * grow;
    return { inkTop: (canvasH - h) / 2, fitScale: grow };
  }
  const current = Math.max(0, inkH - (canvasH - boxT));
  if (current < want) grow = (canvasH - boxT + want) / Math.max(inkH, 1);
  const h = inkH * grow;
  if (valign === "top") return { inkTop: boxT, fitScale: grow };
  return { inkTop: canvasH - boxT - h, fitScale: grow };
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
  box: Box,
  unitW: number,
  unitH: number,
  allowOverscan: boolean,
): { xs: number[]; ys: number[]; fontScale: number } {
  const metrics = lockupMetrics(prepared, lineHeight);
  const px = placeInkX(metrics.blockW, align, box.l, box.r, unitW, allowOverscan);
  const py = placeInkY(metrics.blockH, valign, box.t, box.b, unitH, allowOverscan);
  const fontScale = Math.min(px.fitScale, py.fitScale);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const line = prepared[i];
    const w = inkWidth(line.m) * fontScale;
    const inkLeft =
      align === "left" ? px.inkLeft :
      align === "right" ? px.inkLeft + metrics.blockW * fontScale - w :
      px.inkLeft + (metrics.blockW * fontScale - w) / 2;
    xs.push(inkLeft + line.m.inkLeft * fontScale);
    ys.push(py.inkTop + line.m.ascent * fontScale + i * lineHeight * fontScale);
  }
  return { xs, ys, fontScale };
}

function pinX(align: TypeAlign, inkW: number, col: number, g: Grid): number {
  if (align === "left") return g.col(col);
  if (align === "right") return g.col(col + 1) - inkW;
  return g.col(col) + (g.colW - inkW) / 2;
}

function editorialPins(
  prepared: PreparedLine[],
  align: TypeAlign,
  g: Grid,
): { left: number; top: number }[] {
  const n = prepared.length;
  const colA = align === "right" ? 2 : 0;
  const colB = align === "right" ? 1 : 2;
  const rows =
    n === 2 ? [0, 6] :
    n === 3 ? [0, 3, 7] :
    [0, 2, 5, 7];
  return prepared.map((line, i) => {
    const inkW = inkWidth(line.m);
    const inkH = line.m.ascent + line.m.descent;
    const stagger = n > 1 && i % 2 === 1;
    const col = stagger ? colB : colA;
    const row = rows[Math.min(i, rows.length - 1)] ?? 0;
    let left = pinX(align === "center" ? (stagger ? "right" : "left") : align, inkW, col, g);
    if (align === "center") {
      left = stagger ? g.col(2) + (g.colW * 2 - inkW) / 2 : g.col(0) + (g.colW * 2 - inkW) / 2;
    }
    const top = g.row(row);
    void inkH;
    return { left, top };
  });
}

function folioPins(
  prepared: PreparedLine[],
  align: TypeAlign,
  g: Grid,
): { left: number; top: number }[] {
  const n = prepared.length;
  const rows =
    n === 2 ? [0, 7] :
    n === 3 ? [0, 4, 7] :
    [0, 2, 5, 7];
  return prepared.map((line, i) => {
    const inkW = inkWidth(line.m);
    const inkH = line.m.ascent + line.m.descent;
    const left =
      align === "left" ? g.innerL :
      align === "right" ? g.innerL + g.innerW - inkW :
      g.innerL + (g.innerW - inkW) / 2;
    const top = g.row(rows[Math.min(i, rows.length - 1)] ?? 0);
    void inkH;
    return { left, top };
  });
}

function placeDistributed(
  prepared: PreparedLine[],
  role: TypeRole,
  align: TypeAlign,
  g: Grid,
): { xs: number[]; ys: number[] } {
  const pins = role === "folio" ? folioPins(prepared, align, g) : editorialPins(prepared, align, g);
  return {
    xs: prepared.map((line, i) => pins[i].left + line.m.inkLeft),
    ys: prepared.map((line, i) => pins[i].top + line.m.ascent),
  };
}

/** Lockup vs distributed: derived from Spacing (and Folio scale). Not a UI mode. */
function distributeT(role: TypeRole, spacing: number, scale: number, n: number): number {
  if (n < 2) return 0;
  if (role === "editorial") return Math.max(0, (u01(spacing) - 0.5) / 0.5);
  if (role === "folio") {
    if (folioOversized(scale)) return u01(spacing);
    return Math.max(0, (u01(spacing) - 0.5) / 0.5);
  }
  return 0;
}

function cacheKey(state: TypeState, aspectKey: number): string {
  return [
    "v9",
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

  const role = state.composition;
  let lines = breakCopy(text, role);
  if (lines.length === 0) return null;

  const g = makeGrid(unitW, unitH);
  const box = roleBox(role, state.align, state.valign, g, state.scale);
  const tEm = trackingEm(role, state.spacing);
  let fontSize = resolveSize(role, state.scale, lines, state.weight, tEm, unitW, box);
  let tracking = tEm * fontSize;
  let prepared = prepareLines(lines, state.weight, fontSize, tracking);

  if (role === "caption" && lines.length === 1) {
    const words = lines[0].split(/\s+/).filter(Boolean);
    if (words.length >= 5 && inkWidth(prepared[0].m) > box.r - box.l) {
      const pair = splitTwo(words);
      if (pair) {
        lines = pair;
        fontSize = resolveSize(role, state.scale, lines, state.weight, tEm, unitW, box);
        tracking = tEm * fontSize;
        prepared = prepareLines(lines, state.weight, fontSize, tracking);
      }
    }
  }

  const longest = prepared.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
  const maxW = role === "display" || (role === "folio" && folioOversized(state.scale))
    ? unitW * 1.4
    : box.r - box.l;
  if (role !== "display" && longest > maxW) {
    fontSize *= maxW / longest;
    tracking = tEm * fontSize;
    prepared = prepareLines(lines, state.weight, fontSize, tracking);
  }

  const leading = fontSize * leadingRatio(role, state.spacing);
  const allowOverscan = role === "display" || (role === "folio" && folioOversized(state.scale));
  let placed = placeLockup(prepared, leading, state.align, state.valign, box, unitW, unitH, allowOverscan);
  if (Math.abs(placed.fontScale - 1) > 0.002) {
    const grow = placed.fontScale;
    fontSize *= grow;
    tracking = tEm * fontSize;
    prepared = prepareLines(lines, state.weight, fontSize, tracking);
    const nextLeading = fontSize * leadingRatio(role, state.spacing);
    placed = placeLockup(
      prepared,
      nextLeading,
      state.align,
      state.valign,
      box,
      unitW,
      unitH,
      allowOverscan && grow >= 1,
    );
  }

  const t = distributeT(role, state.spacing, state.scale, prepared.length);
  let xs = placed.xs;
  let ys = placed.ys;
  if (t > 0) {
    const dist = placeDistributed(prepared, role, state.align, g);
    xs = placed.xs.map((x, i) => lerp(x, dist.xs[i], t));
    ys = placed.ys.map((y, i) => lerp(y, dist.ys[i], t));
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
    composition: role,
  };
  cache = { key, layout };
  return projectLayout(layout, w, h, ox, oy, state.color, state.opacity / 100);
}

function prepareLines(lines: string[], weight: number, fontSize: number, tracking: number): PreparedLine[] {
  return lines.map((text) => ({ text, m: measureLine(text, weight, fontSize, tracking) }));
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

export function opticalFramePx(canvasW: number): number {
  return canvasW * (PREVIEW_MARGIN_PX / PREVIEW_REF_PX);
}

/** Eval-only: column x positions in pixels. */
export function editorialColumnsPx(canvasW: number): number[] {
  const inner = canvasW - opticalFramePx(canvasW) * 2;
  const colW = inner / COLS;
  const m = opticalFramePx(canvasW);
  return [0, 1, 2, 3, 4].map((i) => m + i * colW);
}
