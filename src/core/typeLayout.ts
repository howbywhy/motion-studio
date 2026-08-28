import { switzerFont, SWITZER_FAMILY } from "./typeFont";
import type {
  TypeAlign,
  TypeAnchor,
  TypeBlendMode,
  TypeBlock,
  TypeColumn,
  TypeSlot,
  TypeState,
  TypeStyle,
  TypeTextAlign,
} from "./typeState";
import { activeTypeBlocks, alignFromAnchor } from "./typeState";

export interface TypeLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  wordGap: number;
  /** Authored row index. Auto-wrapped lines share their parent row. */
  unit: number;
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
  textAlign: TypeTextAlign;
  offsetX: number;
  offsetY: number;
  composition: TypeStyle;
  blendMode: TypeBlendMode;
  /** Headline outer-edge crop. Paint clips to the canvas on true edges, optical otherwise. */
  edgeBleed: { l: boolean; r: boolean; t: boolean; b: boolean };
}

const UNIT = 1000;
const PREVIEW_REF_PX = 500;
const PREVIEW_MARGIN_PX = 10;
const FRAME = UNIT * (PREVIEW_MARGIN_PX / PREVIEW_REF_PX);
const COLS = 4;
/** Visible-ink crop past the canvas — 10% of glyph height — on Headline outer Frame Align edges. */
export const HEADLINE_INK_BLEED = 0.10;

export interface TypeEdgeBleed {
  l: boolean;
  r: boolean;
  t: boolean;
  b: boolean;
}

const NO_BLEED: TypeEdgeBleed = { l: false, r: false, t: false, b: false };

const TRAILING_WEAK = new Set(["BY", "X"]);

interface GlyphMetrics {
  advance: number;
  inkLeft: number;
  inkRight: number;
  ascent: number;
  descent: number;
}

interface PreparedLine {
  text: string;
  m: GlyphMetrics;
  unit: number;
}

interface Solution {
  prepared: PreparedLine[];
  fontSize: number;
  tracking: number;
  leading: number;
  wordGaps: number[];
}

interface CacheEntry {
  key: string;
  solution: Solution;
}

const caches: [CacheEntry | null, CacheEntry | null, CacheEntry | null] = [null, null, null];
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function u01(v: number): number {
  return Math.min(1, Math.max(0, v / 100));
}

interface PadRect {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}

function paddedRect(unitW: number, unitH: number, padding: number): PadRect {
  const extra = u01(padding) * Math.min(unitW, unitH) * 0.12;
  const pad = FRAME + extra;
  return { l: pad, t: pad, r: unitW - pad, b: unitH - pad, w: unitW - pad * 2, h: unitH - pad * 2 };
}

function columnMeasure(column: TypeColumn, innerW: number): number {
  if (column === "narrow") return innerW * 0.35;
  if (column === "wide") return innerW * 0.75;
  return innerW * 0.55;
}

function trackingEm(style: TypeStyle, tracking: number): number {
  const s = u01(tracking);
  if (style === "headline") return lerp(-0.05, 0.055, s);
  if (style === "subtitle") return lerp(0, 0.05, s);
  return lerp(-0.02, 0.04, s);
}

function paragraphLead(leading: number): number {
  return lerp(1.08, 1.42, u01(leading));
}

function headlineRowLead(): number {
  return 0.88;
}

function subtitleLead(leading: number): number {
  return lerp(1.06, 1.28, u01(leading));
}

function authoredRows(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function join(words: string[], a: number, b: number): string {
  return words.slice(a, b).join(" ");
}

function wrapGreedy(words: string[], weight: number, size: number, tracking: number, measure: number): string[] {
  if (words.length === 0) return [];
  const lines: string[] = [];
  let i = 0;
  while (i < words.length) {
    let best = i + 1;
    let j = i + 1;
    while (j <= words.length) {
      const t = join(words, i, j);
      if (inkWidth(measureLine(t, weight, size, tracking)) <= measure + 0.25) {
        best = j;
        j += 1;
      } else {
        break;
      }
    }
    if (best < words.length && best - i >= 2 && isTrailingWeak(words[best - 1]!)) best -= 1;
    lines.push(join(words, i, Math.max(i + 1, best)));
    i = Math.max(i + 1, best);
  }
  return lines;
}

function wrapRow(text: string, weight: number, size: number, tracking: number, measure: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const one = words.join(" ");
  if (inkWidth(measureLine(one, weight, size, tracking)) <= measure + 0.25) return [one];
  return wrapGreedy(words, weight, size, tracking, measure);
}

function rowHeight(slice: PreparedLine[], intraLead: number): number {
  if (slice.length === 0) return 0;
  const first = slice[0]!.m;
  const last = slice[slice.length - 1]!.m;
  if (slice.length === 1) return first.ascent + first.descent;
  return first.ascent + last.descent + (slice.length - 1) * intraLead;
}

function packedRowsHeight(prepared: PreparedLine[], intraLead: number, rowGap: number): number {
  const units = unitsOf(prepared);
  if (units.length === 0) return 0;
  let h = 0;
  for (let i = 0; i < units.length; i++) {
    h += rowHeight(unitSlice(prepared, units[i]!), intraLead);
    if (i < units.length - 1) h += rowGap;
  }
  return h;
}

/** Line-stack height when every consecutive line uses the same leading. */
function flowHeight(prepared: PreparedLine[], leading: number): number {
  if (prepared.length === 0) return 0;
  const first = prepared[0]!.m;
  const last = prepared[prepared.length - 1]!.m;
  if (prepared.length === 1) return first.ascent + first.descent;
  return first.ascent + last.descent + (prepared.length - 1) * leading;
}

function unitsOf(prepared: PreparedLine[]): number[] {
  const out: number[] = [];
  for (const line of prepared) {
    if (out[out.length - 1] !== line.unit) out.push(line.unit);
  }
  return out;
}

function unitSlice(prepared: PreparedLine[], unit: number): PreparedLine[] {
  return prepared.filter((line) => line.unit === unit);
}

function searchFit(lo: number, hi: number, fit: (s: number) => boolean): number {
  if (!Number.isFinite(hi) || hi <= lo) hi = lo + 8;
  if (fit(hi)) {
    let top = hi * 1.18;
    if (!fit(top)) {
      let a = hi;
      let b = top;
      for (let i = 0; i < 10; i++) {
        const mid = (a + b) / 2;
        if (fit(mid)) a = mid;
        else b = mid;
      }
      return a;
    }
    let a = hi;
    let b = top;
    for (let i = 0; i < 8; i++) {
      const mid = (a + b) / 2;
      if (fit(mid * 1.03)) a = mid * 1.03;
      else b = mid;
    }
    return a;
  }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (fit(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function maxLegalHeadline(
  rows: string[],
  weight: number,
  tEm: number,
  measure: number,
  maxH: number,
): number {
  const probe = 200;
  let longestWord = 1;
  let longestRow = 1;
  for (const row of rows) {
    longestRow = Math.max(longestRow, inkWidth(measureLine(row, weight, probe, tEm * probe)));
    for (const word of row.split(/\s+/).filter(Boolean)) {
      longestWord = Math.max(longestWord, inkWidth(measureLine(word, weight, probe, tEm * probe)));
    }
  }
  const fromWord = (measure / Math.max(1, longestWord)) * probe;
  const fromRow = (measure / Math.max(1, longestRow)) * probe;
  const cap = Math.max(12, maxH / 0.62);

  const fitUnwrapped = (s: number): boolean => {
    const tracking = tEm * s;
    const intra = s * headlineRowLead();
    const laid: PreparedLine[] = [];
    for (let u = 0; u < rows.length; u++) {
      const text = rows[u]!;
      if (inkWidth(measureLine(text, weight, s, tracking)) > measure + 0.25) return false;
      laid.push({ text, unit: u, m: measureLine(text, weight, s, tracking) });
    }
    return packedRowsHeight(laid, intra, 0) <= maxH + 0.25;
  };

  const unwrappedHi = Math.min(fromRow, cap);
  if (Number.isFinite(unwrappedHi) && unwrappedHi > 8 && fitUnwrapped(Math.min(8.5, unwrappedHi))) {
    return searchFit(8, unwrappedHi, fitUnwrapped);
  }

  const fitWrapped = (s: number): boolean => {
    const tracking = tEm * s;
    const intra = s * headlineRowLead();
    const laid: PreparedLine[] = [];
    for (let u = 0; u < rows.length; u++) {
      const wrapped = wrapRow(rows[u]!, weight, s, tracking, measure);
      for (const text of wrapped) laid.push({ text, unit: u, m: measureLine(text, weight, s, tracking) });
    }
    const h = packedRowsHeight(laid, intra, 0);
    const w = laid.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
    return w <= measure + 0.25 && h <= maxH + 0.25;
  };
  const wrappedHi = Math.min(fromWord, cap);
  return searchFit(8, Number.isFinite(wrappedHi) && wrappedHi > 8 ? wrappedHi : 48, fitWrapped);
}

function composeHeadline(block: TypeBlock, pad: PadRect): Solution {
  const rows = authoredRows(block.text);
  const tEm = trackingEm("headline", block.tracking);
  const legal = maxLegalHeadline(rows, block.weight, tEm, pad.w, pad.h);
  const fontSize = Math.min(legal, legal * lerp(0.34, 1, u01(block.scale)));
  const tracking = tEm * fontSize;
  const laid: PreparedLine[] = [];
  for (let u = 0; u < rows.length; u++) {
    const wrapped = wrapRow(rows[u]!, block.weight, fontSize, tracking, pad.w);
    for (const text of wrapped) laid.push({ text, unit: u, m: measureLine(text, block.weight, fontSize, tracking) });
  }
  return {
    prepared: laid,
    fontSize,
    tracking,
    leading: fontSize * headlineRowLead(),
    wordGaps: laid.map(() => 0),
  };
}

function composeParagraph(block: TypeBlock, pad: PadRect): Solution {
  const tEm = trackingEm("paragraph", block.tracking);
  const leadRatio = paragraphLead(block.leading);
  const measure = columnMeasure(block.column, pad.w);
  const min = pad.w * 0.022;
  const max = pad.w * 0.048;
  let fontSize = lerp(min, max, u01(block.scale));
  const tEmPx = (s: number) => tEm * s;
  const wrapAll = (s: number): PreparedLine[] => {
    const tracking = tEmPx(s);
    const laid: PreparedLine[] = [];
    const rows = authoredRows(block.text);
    for (let u = 0; u < rows.length; u++) {
      const wrapped = wrapRow(rows[u]!, block.weight, s, tracking, measure);
      for (const text of wrapped) laid.push({ text, unit: u, m: measureLine(text, block.weight, s, tracking) });
    }
    return laid;
  };
  let prepared = wrapAll(fontSize);
  let leading = fontSize * leadRatio;
  let h = flowHeight(prepared, leading);
  if (h > pad.h + 0.25) {
    let lo = min;
    let hi = fontSize;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const trial = wrapAll(mid);
      const th = flowHeight(trial, mid * leadRatio);
      if (th <= pad.h + 0.25) lo = mid;
      else hi = mid;
    }
    fontSize = lo;
    prepared = wrapAll(fontSize);
    leading = fontSize * leadRatio;
  }
  return {
    prepared,
    fontSize,
    tracking: tEm * fontSize,
    leading,
    wordGaps: prepared.map(() => 0),
  };
}

function composeSubtitle(block: TypeBlock, pad: PadRect): Solution {
  const tEm = trackingEm("subtitle", block.tracking);
  const leadRatio = subtitleLead(block.leading);
  const measure = columnMeasure(block.column, pad.w);
  const min = pad.w * 0.016;
  const max = pad.w * 0.030;
  let fontSize = lerp(min, max, u01(block.scale));
  const wrapAll = (s: number): PreparedLine[] => {
    const tracking = tEm * s;
    const laid: PreparedLine[] = [];
    const rows = authoredRows(block.text);
    for (let u = 0; u < rows.length; u++) {
      const wrapped = wrapRow(rows[u]!, block.weight, s, tracking, measure);
      for (const text of wrapped) laid.push({ text, unit: u, m: measureLine(text, block.weight, s, tracking) });
    }
    return laid;
  };
  let prepared = wrapAll(fontSize);
  let leading = fontSize * leadRatio;
  if (flowHeight(prepared, leading) > pad.h + 0.25) {
    let lo = min;
    let hi = fontSize;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const trial = wrapAll(mid);
      if (flowHeight(trial, mid * leadRatio) <= pad.h + 0.25) lo = mid;
      else hi = mid;
    }
    fontSize = lo;
    prepared = wrapAll(fontSize);
    leading = fontSize * leadRatio;
  }
  return {
    prepared,
    fontSize,
    tracking: tEm * fontSize,
    leading,
    wordGaps: prepared.map(() => 0),
  };
}

function composeType(block: TypeBlock, pad: PadRect): Solution {
  if (block.composition === "paragraph") return composeParagraph(block, pad);
  if (block.composition === "subtitle") return composeSubtitle(block, pad);
  return composeHeadline(block, pad);
}

function composeKey(block: TypeBlock, aspectKey: number): string {
  return [
    "v16",
    aspectKey,
    block.text,
    block.composition,
    block.scale,
    block.tracking,
    block.leading,
    block.weight,
    block.column,
    block.padding,
  ].join("\t");
}

function inkBounds(xs: number[], ys: number[], prepared: PreparedLine[]): {
  l: number;
  t: number;
  r: number;
  b: number;
} {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (let i = 0; i < prepared.length; i++) {
    const m = prepared[i]!.m;
    l = Math.min(l, xs[i]! - m.inkLeft);
    r = Math.max(r, xs[i]! + m.inkRight);
    t = Math.min(t, ys[i]! - m.ascent);
    b = Math.max(b, ys[i]! + m.descent);
  }
  return { l, t, r, b };
}

/** Headline only. Outer Frame Align may crop on those edges; centre stays contained.
 * Between ignores vertical Frame Align, so top/bottom bleed is off for Between. */
export function headlineEdgeBleed(block: TypeBlock): TypeEdgeBleed {
  if (block.composition !== "headline") return { ...NO_BLEED };
  const row = block.anchor[0];
  const col = block.anchor[1];
  const between = block.distribution === "between" && authoredRows(block.text).length >= 2;
  return {
    l: col === "l",
    r: col === "r",
    t: !between && row === "t",
    b: !between && row === "b",
  };
}

function containInk(
  xs: number[],
  ys: number[],
  prepared: PreparedLine[],
  canvasW: number,
  canvasH: number,
  optical: number,
  bleed: TypeEdgeBleed,
): void {
  const box = inkBounds(xs, ys, prepared);
  if (!Number.isFinite(box.l)) return;
  const inkH = Math.max(1e-6, box.b - box.t);
  const crop = HEADLINE_INK_BLEED * inkH;
  let dx = 0;
  let dy = 0;
  if (bleed.l) dx += -crop - box.l;
  else if (box.l < optical) dx += optical - box.l;
  if (bleed.r) dx += canvasW + crop - (box.r + dx);
  else if (box.r + dx > canvasW - optical) dx -= box.r + dx - (canvasW - optical);
  if (bleed.t) dy += -crop - box.t;
  else if (box.t < optical) dy += optical - box.t;
  if (bleed.b) dy += canvasH + crop - (box.b + dy);
  else if (box.b + dy > canvasH - optical) dy -= box.b + dy - (canvasH - optical);
  if (dx === 0 && dy === 0) return;
  for (let i = 0; i < xs.length; i++) {
    xs[i]! += dx;
    ys[i]! += dy;
  }
}

function anchorFractions(anchor: TypeAnchor): { hx: number; hy: number } {
  const row = anchor[0];
  const col = anchor[1];
  return {
    hx: col === "l" ? 0 : col === "r" ? 1 : 0.5,
    hy: row === "t" ? 0 : row === "b" ? 1 : 0.5,
  };
}

function lineX(left: number, regionW: number, line: PreparedLine, textAlign: TypeTextAlign): number {
  const lineW = inkWidth(line.m);
  if (textAlign === "right") return left + regionW - lineW + line.m.inkLeft;
  if (textAlign === "center") return left + (regionW - lineW) / 2 + line.m.inkLeft;
  return left + line.m.inkLeft;
}

function placeHeadline(
  sol: Solution,
  block: TypeBlock,
  pad: PadRect,
): { xs: number[]; ys: number[] } {
  const prepared = sol.prepared;
  const n = prepared.length;
  const xs = new Array<number>(n).fill(0);
  const ys = new Array<number>(n).fill(0);
  if (n === 0) return { xs, ys };

  const units = unitsOf(prepared);
  const intra = sol.leading;
  const useBetween = block.distribution === "between" && units.length >= 2;
  const { hx, hy } = anchorFractions(block.anchor);

  const unitBoxes = units.map((unit) => {
    const slice = unitSlice(prepared, unit);
    return { unit, slice, h: rowHeight(slice, intra) };
  });
  const regionW = prepared.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
  const inkH = unitBoxes.reduce((s, box) => s + box.h, 0);
  const gaps = Math.max(0, unitBoxes.length - 1);
  const free = Math.max(0, pad.h - inkH);
  const requested = u01(block.gap) * pad.h * 0.28;
  const rowGap = useBetween
    ? (gaps > 0 ? free / gaps : 0)
    : (gaps > 0 ? Math.min(requested, free / gaps) : 0);
  const packedH = inkH + rowGap * gaps;
  const regionLeft = pad.l + hx * Math.max(0, pad.w - regionW);
  const regionTop = useBetween ? pad.t : pad.t + hy * Math.max(0, pad.h - packedH);

  let cursor = regionTop;
  for (const box of unitBoxes) {
    let y = cursor;
    for (let i = 0; i < prepared.length; i++) {
      if (prepared[i]!.unit !== box.unit) continue;
      xs[i] = lineX(regionLeft, regionW, prepared[i]!, block.textAlign);
      ys[i] = y + prepared[i]!.m.ascent;
      y += intra;
    }
    cursor += box.h + rowGap;
  }
  return { xs, ys };
}

function placeColumn(
  sol: Solution,
  block: TypeBlock,
  pad: PadRect,
): { xs: number[]; ys: number[] } {
  const prepared = sol.prepared;
  const n = prepared.length;
  const xs = new Array<number>(n).fill(0);
  const ys = new Array<number>(n).fill(0);
  if (n === 0) return { xs, ys };

  const { hx, hy } = anchorFractions(block.anchor);
  const regionW = block.composition === "paragraph"
    ? columnMeasure(block.column, pad.w)
    : prepared.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
  const packedH = flowHeight(prepared, sol.leading);
  const regionLeft = pad.l + hx * Math.max(0, pad.w - regionW);
  const regionTop = pad.t + hy * Math.max(0, pad.h - packedH);

  let y = regionTop;
  for (let i = 0; i < n; i++) {
    const line = prepared[i]!;
    xs[i] = lineX(regionLeft, regionW, line, block.textAlign);
    ys[i] = y + line.m.ascent;
    y += sol.leading;
  }
  return { xs, ys };
}

function placePackedOrBetween(
  sol: Solution,
  block: TypeBlock,
  pad: PadRect,
): { xs: number[]; ys: number[] } {
  if (block.composition === "headline") return placeHeadline(sol, block, pad);
  return placeColumn(sol, block, pad);
}

function nudgeIntoOptical(
  xs: number[],
  ys: number[],
  prepared: PreparedLine[],
  unitW: number,
  unitH: number,
  bleed: TypeEdgeBleed,
): void {
  containInk(xs, ys, prepared, unitW, unitH, FRAME, bleed);
}

function isTypeDocument(input: TypeState | TypeBlock): input is TypeState {
  return Array.isArray((input as TypeState).blocks);
}

function layoutBlock(
  block: TypeBlock,
  canvasW: number,
  canvasH: number,
  slot: TypeSlot,
): TypeLayout | null {
  if (!block.enabled) return null;
  const text = block.text.replace(/\s+$/g, "");
  if (!text.trim()) return null;
  const w = Math.max(2, canvasW);
  const h = Math.max(2, canvasH);
  const aspectKey = Math.round((h / w) * 10000);
  const unitW = UNIT;
  const unitH = UNIT * (h / w);
  const pad = paddedRect(unitW, unitH, block.padding);
  const key = composeKey(block, aspectKey);

  let sol: Solution;
  const hit = caches[slot];
  if (hit && hit.key === key) {
    sol = hit.solution;
  } else {
    sol = composeType(block, pad);
    if (sol.prepared.length === 0) return null;
    caches[slot] = { key, solution: sol };
  }

  const pts = placePackedOrBetween(sol, block, pad);
  const bleed = headlineEdgeBleed(block);
  nudgeIntoOptical(pts.xs, pts.ys, sol.prepared, unitW, unitH, bleed);
  const placed = alignFromAnchor(block.anchor);
  const laid: TypeLine[] = sol.prepared.map((line, i) => ({
    text: line.text,
    width: line.m.advance,
    height: sol.fontSize,
    x: pts.xs[i]!,
    y: pts.ys[i]!,
    wordGap: sol.wordGaps[i] ?? 0,
    unit: line.unit,
  }));

  const layout: TypeLayout = {
    lines: laid,
    fontSize: sol.fontSize,
    weight: block.weight,
    tracking: sol.tracking,
    lineHeight: sol.leading,
    canvasW: unitW,
    canvasH: unitH,
    color: block.color,
    opacity: block.opacity / 100,
    align: placed.align,
    textAlign: block.textAlign,
    offsetX: 0,
    offsetY: 0,
    composition: block.composition,
    blendMode: block.blendMode,
    edgeBleed: bleed,
  };
  return clampProjected(projectLayout(layout, w, h), w, h, block.weight);
}

export function layoutTypography(
  input: TypeState | TypeBlock,
  canvasW: number,
  canvasH: number,
  slot: TypeSlot = 0,
): TypeLayout | null {
  if (isTypeDocument(input)) {
    if (!input.enabled) return null;
    return layoutBlock(input.blocks[0], canvasW, canvasH, slot);
  }
  return layoutBlock(input, canvasW, canvasH, slot);
}

export function layoutTypeDocument(
  state: TypeState,
  canvasW: number,
  canvasH: number,
): { index: TypeSlot; layout: TypeLayout }[] {
  const active = activeTypeBlocks(state);
  const out: { index: TypeSlot; layout: TypeLayout }[] = [];
  for (const item of active) {
    const layout = layoutBlock(item.block, canvasW, canvasH, item.index);
    if (layout) out.push({ index: item.index, layout });
  }
  return out;
}

function projectLayout(unit: TypeLayout, canvasW: number, canvasH: number): TypeLayout {
  const s = canvasW / UNIT;
  return {
    lines: unit.lines.map((l) => ({
      text: l.text,
      x: l.x * s,
      y: l.y * s,
      width: l.width * s,
      height: l.height * s,
      wordGap: l.wordGap * s,
      unit: l.unit,
    })),
    fontSize: unit.fontSize * s,
    weight: unit.weight,
    tracking: unit.tracking * s,
    lineHeight: unit.lineHeight * s,
    canvasW,
    canvasH,
    color: unit.color,
    opacity: unit.opacity,
    align: unit.align,
    textAlign: unit.textAlign,
    offsetX: 0,
    offsetY: 0,
    composition: unit.composition,
    blendMode: unit.blendMode,
    edgeBleed: unit.edgeBleed,
  };
}

function clampProjected(
  layout: TypeLayout,
  canvasW: number,
  canvasH: number,
  weight: number,
): TypeLayout {
  const frame = opticalFramePx(canvasW);
  const xs = layout.lines.map((l) => l.x);
  const ys = layout.lines.map((l) => l.y);
  const pxPrepared: PreparedLine[] = layout.lines.map((line) => ({
    text: line.text,
    unit: line.unit,
    m: measureLine(line.text, weight, layout.fontSize, layout.tracking),
  }));
  containInk(xs, ys, pxPrepared, canvasW, canvasH, frame, layout.edgeBleed);
  let changed = false;
  for (let i = 0; i < layout.lines.length; i++) {
    if (xs[i] !== layout.lines[i]!.x || ys[i] !== layout.lines[i]!.y) {
      changed = true;
      break;
    }
  }
  if (!changed) return layout;
  return {
    ...layout,
    lines: layout.lines.map((l, i) => ({ ...l, x: xs[i]!, y: ys[i]! })),
  };
}

export function invalidateTypeLayout(): void {
  caches[0] = null;
  caches[1] = null;
}

export function typeHasCopy(state: TypeState): boolean {
  if (!state.enabled) return false;
  const pages = state.pages?.length ? state.pages : [state.blocks];
  return pages.some((page) =>
    (page[0]!.enabled && page[0]!.text.trim().length > 0) ||
    (page[1]!.enabled && page[1]!.text.trim().length > 0),
  );
}

export function ensureSwitzerMeasure(): void {
  measureContext().font = `500 48px "${SWITZER_FAMILY}"`;
}

export function debugLinePlan(state: TypeState, canvasW: number, canvasH: number): string[] {
  const laid = layoutTypeDocument(state, canvasW, canvasH);
  return laid.flatMap((item) => item.layout.lines.map((l) => l.text));
}

export function opticalFramePx(canvasW: number): number {
  return canvasW * (PREVIEW_MARGIN_PX / PREVIEW_REF_PX);
}

export function editorialColumnsPx(canvasW: number): number[] {
  const inner = canvasW - opticalFramePx(canvasW) * 2;
  const colW = inner / COLS;
  const m = opticalFramePx(canvasW);
  return [0, 1, 2, 3, 4].map((i) => m + i * colW);
}

export function typeInkBox(layout: TypeLayout): { l: number; t: number; r: number; b: number } {
  const prepared: PreparedLine[] = layout.lines.map((line) => ({
    text: line.text,
    unit: line.unit,
    m: measureLine(line.text, layout.weight, layout.fontSize, layout.tracking),
  }));
  return inkBounds(
    layout.lines.map((l) => l.x),
    layout.lines.map((l) => l.y),
    prepared,
  );
}

/** Layout fingerprint. Excludes colour, opacity, and blend. */
export function typeGeometryKey(state: TypeState, canvasW: number, canvasH: number): string {
  return layoutTypeDocument(state, canvasW, canvasH)
    .map((item) => {
      const l = item.layout;
      const lines = l.lines.map((line) => `${line.text}:${line.x.toFixed(3)}:${line.y.toFixed(3)}:${line.unit}`).join("|");
      return `${item.index}\t${l.fontSize.toFixed(4)}\t${l.tracking.toFixed(4)}\t${l.weight}\t${lines}`;
    })
    .join("\n");
}
