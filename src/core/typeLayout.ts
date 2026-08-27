import { switzerFont, SWITZER_FAMILY } from "./typeFont";
import type { TypeAlign, TypeAnchor, TypeBlock, TypeRole, TypeState, TypeTextAlign } from "./typeState";
import { activeTypeBlocks, alignFromAnchor } from "./typeState";

export interface TypeLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Extra pixels between words for justification. 0 = natural. */
  wordGap: number;
  /** Authored newline unit. Auto-wrapped lines share unit 0. */
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
  composition: TypeRole;
}

const UNIT = 1000;
const PREVIEW_REF_PX = 500;
const PREVIEW_MARGIN_PX = 10;
/** 10px at a ~500px preview. Scales with canvas width. */
const FRAME = UNIT * (PREVIEW_MARGIN_PX / PREVIEW_REF_PX);
const COLS = 4;
const FIT_PAD = 4;

const TRAILING_WEAK = new Set(["BY", "X"]);
const LEADING_WEAK = new Set(["OR", "AND", "TO", "THE", "A", "OF"]);

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
}

interface Solution {
  lines: string[];
  prepared: PreparedLine[];
  fontSize: number;
  tracking: number;
  leading: number;
  wordGaps: number[];
  localXs: number[];
  localYs: number[];
  bboxL: number;
  bboxT: number;
  bboxR: number;
  bboxB: number;
}

interface CacheEntry {
  key: string;
  solution: Solution;
}

const caches: [CacheEntry | null, CacheEntry | null] = [null, null];
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
  if (cut > 1 && isLeadingWeak(words[cut - 1])) cut -= 1;
  if (cut > 1 && isTrailingWeak(words[cut - 1]) && tokenKey(words[cut - 1]) !== "BY") cut -= 1;
  cut = Math.min(n - 1, Math.max(1, cut));
  return [join(words, 0, cut), join(words, cut, n)];
}

function splitThree(words: string[]): string[] {
  const n = words.length;
  if (n < 3) {
    const pair = splitTwo(words);
    return pair ? [pair[0], pair[1]] : [words.join(" ")];
  }
  let a = Math.round(n / 3);
  let b = Math.round((2 * n) / 3);
  a = Math.min(n - 2, Math.max(1, a));
  b = Math.min(n - 1, Math.max(a + 1, b));
  if (a > 1 && isLeadingWeak(words[a - 1])) a -= 1;
  if (b > a + 1 && isLeadingWeak(words[b - 1])) b -= 1;
  if (a > 1 && isTrailingWeak(words[a - 1]) && tokenKey(words[a - 1]) !== "BY") a -= 1;
  if (b > a + 1 && isTrailingWeak(words[b - 1]) && tokenKey(words[b - 1]) !== "BY") b -= 1;
  a = Math.min(n - 2, Math.max(1, a));
  b = Math.min(n - 1, Math.max(a + 1, b));
  return [join(words, 0, a), join(words, a, b), join(words, b, n)];
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

function displayCandidates(words: string[]): string[][] {
  const n = words.length;
  const one = [words.join(" ")];
  if (n <= 3) return [one];
  const cands: string[][] = [];
  const pair = splitTwo(words);
  if (pair) cands.push([pair[0], pair[1]]);
  if (n >= 7) {
    const three = splitThree(words);
    if (three.length >= 3) cands.push(three);
  }
  if (n <= 6 && pair) cands.unshift(one);
  return cands.length > 0 ? cands : [one];
}

function authoredOrBroken(text: string, role: TypeRole): string[][] {
  const blocks = hardBlocks(text);
  if (blocks.length === 0) return [];
  const userBroke = blocks.length > 1;
  if (userBroke) return [blocks.map((w) => w.join(" "))];
  const words = blocks[0];
  if (role === "caption" || role === "folio") return [[words.join(" ")]];
  if (role === "editorial") return [editorialLines(words)];
  return displayCandidates(words);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function u01(v: number): number {
  return Math.min(1, Math.max(0, v / 100));
}

function trackingEm(role: TypeRole, spacing: number): number {
  const s = u01(spacing);
  if (role === "display") return lerp(-0.04, 0.05, s);
  if (role === "caption") return lerp(0.02, 0.1, s);
  if (role === "folio") return lerp(-0.02, 0.06, s);
  return lerp(-0.02, 0.04, s);
}

function leadingRatio(role: TypeRole, spacing: number): number {
  const s = u01(spacing);
  if (role === "display") return lerp(0.8, 1.05, s);
  if (role === "caption") return lerp(1.12, 1.22, s);
  if (role === "folio") return lerp(0.84, 1.05, s);
  return lerp(0.95, 1.18, Math.min(1, s / 0.55));
}

function prepareLines(lines: string[], weight: number, fontSize: number, tracking: number): PreparedLine[] {
  return lines.map((text) => ({ text, m: measureLine(text, weight, fontSize, tracking) }));
}

function lockupHeight(prepared: PreparedLine[], leading: number, gap: number): { h: number; ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  for (const line of prepared) {
    ascent = Math.max(ascent, line.m.ascent);
    descent = Math.max(descent, line.m.descent);
  }
  const n = prepared.length;
  const h = n <= 1 ? ascent + descent : ascent + descent + (n - 1) * (leading + gap);
  return { h, ascent, descent };
}

function measureWidth(lines: string[], weight: number, size: number, trackingEmVal: number): number {
  const tracking = trackingEmVal * size;
  let longest = 1;
  for (const line of lines) longest = Math.max(longest, inkWidth(measureLine(line, weight, size, tracking)));
  return longest;
}

function maxLegalSize(
  lines: string[],
  weight: number,
  trackingEmVal: number,
  leadRatio: number,
  maxW: number,
  maxH: number,
): number {
  const probe = 200;
  const widthAtProbe = measureWidth(lines, weight, probe, trackingEmVal);
  let size = (maxW / Math.max(1, widthAtProbe)) * probe;
  if (!Number.isFinite(size) || size <= 0) size = 24;
  const fit = (s: number): boolean => {
    const tracking = trackingEmVal * s;
    const prepared = prepareLines(lines, weight, s, tracking);
    const box = lockupHeight(prepared, s * leadRatio, 0);
    const w = prepared.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
    return w <= maxW + 0.25 && box.h <= maxH + 0.25;
  };
  if (!fit(size)) {
    let lo = 4;
    let hi = size;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (fit(mid)) lo = mid;
      else hi = mid;
    }
    size = lo;
  } else {
    let lo = size;
    let hi = size * 1.08;
    if (fit(hi)) {
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (fit(mid * 1.04)) lo = mid * 1.04;
        else hi = mid;
      }
      size = lo;
    }
  }
  return Math.max(8, size);
}

function pickDisplayLines(
  candidates: string[][],
  weight: number,
  trackingEmVal: number,
  leadRatio: number,
  maxW: number,
  maxH: number,
): string[] {
  let best = candidates[0];
  let bestScore = -1;
  for (const lines of candidates) {
    const size = maxLegalSize(lines, weight, trackingEmVal, leadRatio, maxW, maxH);
    const fewer = lines.length === 1 ? 1.03 : lines.length === 2 ? 1.01 : 1;
    const score = size * fewer;
    if (score > bestScore) {
      bestScore = score;
      best = lines;
    }
  }
  return best;
}

function inkBounds(xs: number[], ys: number[], prepared: PreparedLine[], wordGaps: number[] = []): {
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
    const m = prepared[i].m;
    const extra = (wordGaps[i] ?? 0) * Math.max(0, wordCount(prepared[i].text) - 1);
    l = Math.min(l, xs[i] - m.inkLeft);
    r = Math.max(r, xs[i] + m.inkRight + extra);
    t = Math.min(t, ys[i] - m.ascent);
    b = Math.max(b, ys[i] + m.descent);
  }
  return { l, t, r, b };
}

function roleMeasure(role: TypeRole, innerW: number): number {
  if (role === "editorial") return innerW * 0.74;
  if (role === "caption") return innerW * 0.58;
  return innerW;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function justifyExtra(
  text: string,
  weight: number,
  size: number,
  tracking: number,
  targetW: number,
  last: boolean,
  only: boolean,
): number {
  if (only || last) return 0;
  const n = wordCount(text);
  if (n < 2) return 0;
  const natural = inkWidth(measureLine(text, weight, size, tracking));
  const extra = targetW - natural;
  if (extra <= 0.5) return 0;
  const space = Math.max(0.5, measureLine(" ", weight, size, tracking).advance);
  const proposed = space + extra / (n - 1);
  if (proposed > space * 1.8) return 0;
  if (proposed < space * 0.85) return 0;
  return proposed - space;
}

function greedyWrap(
  words: string[],
  weight: number,
  size: number,
  tracking: number,
  measure: number,
): string[] {
  if (words.length === 0) return [];
  const lines: string[] = [];
  let i = 0;
  while (i < words.length) {
    let j = i + 1;
    let best = i + 1;
    while (j <= words.length) {
      const t = join(words, i, j);
      if (inkWidth(measureLine(t, weight, size, tracking)) <= measure + 0.25) {
        best = j;
        j += 1;
      } else {
        break;
      }
    }
    lines.push(join(words, i, best));
    i = best;
  }
  return lines;
}

function extraGapFor(
  role: TypeRole,
  spacing: number,
  n: number,
  minH: number,
  innerH: number,
): number {
  if (n <= 1) return 0;
  const room = Math.max(0, innerH - minH);
  const s = u01(spacing);
  if (role === "caption" || role === "display") return 0;
  if (role === "editorial") {
    const t = Math.max(0, (s - 0.4) / 0.6);
    return (t * room * 0.55) / (n - 1);
  }
  return (s * room) / (n - 1);
}

function composeSolution(
  lines: string[],
  role: TypeRole,
  scale: number,
  spacing: number,
  weight: number,
  unitW: number,
  unitH: number,
  textAlign: TypeTextAlign,
): Solution {
  const innerW = unitW - FRAME * 2 - FIT_PAD * 2;
  const innerH = unitH - FRAME * 2 - FIT_PAD * 2;
  const tEm = trackingEm(role, spacing);
  const lead = leadingRatio(role, spacing);
  const measure = roleMeasure(role, innerW);
  const legal = maxLegalSize(lines, weight, tEm, lead, measure, innerH);
  const u = u01(scale);
  let fontSize: number;
  if (role === "caption") {
    fontSize = Math.min(legal, unitW * lerp(0.022, 0.05, u));
  } else if (role === "editorial") {
    fontSize = legal * lerp(0.42, 0.82, u);
  } else if (role === "folio") {
    fontSize = legal * lerp(0.16, 1, u);
  } else {
    fontSize = legal * lerp(0.32, 1, u);
  }
  fontSize = Math.min(fontSize, legal);
  let tracking = tEm * fontSize;
  let used = lines;
  if (textAlign === "justify") {
    const words = lines.join(" ").split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      used = greedyWrap(words, weight, fontSize, tracking, measure);
    }
  }
  let prepared = prepareLines(used, weight, fontSize, tracking);
  let leading = fontSize * lead;
  let box = lockupHeight(prepared, leading, 0);
  let width = prepared.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
  if (width > measure || box.h > innerH) {
    const sx = Math.min(1, measure / Math.max(1, width));
    const sy = Math.min(1, innerH / Math.max(1, box.h));
    fontSize *= Math.min(sx, sy);
    tracking = tEm * fontSize;
    if (textAlign === "justify") {
      const words = lines.join(" ").split(/\s+/).filter(Boolean);
      if (words.length >= 2) used = greedyWrap(words, weight, fontSize, tracking, measure);
    }
    prepared = prepareLines(used, weight, fontSize, tracking);
    leading = fontSize * lead;
    box = lockupHeight(prepared, leading, 0);
    width = prepared.reduce((m, line) => Math.max(m, inkWidth(line.m)), 0);
  }
  const gap = extraGapFor(role, spacing, prepared.length, box.h, innerH);
  box = lockupHeight(prepared, leading, gap);
  const only = prepared.length <= 1;
  const justify = textAlign === "justify" && !only;
  const blockW = justify ? measure : width;
  const wordGaps = prepared.map((line, i) =>
    justify ? justifyExtra(line.text, weight, fontSize, tracking, measure, i === prepared.length - 1, only) : 0,
  );
  const xs = prepared.map((line, i) => {
    const extra = wordGaps[i]! * Math.max(0, wordCount(line.text) - 1);
    const lineW = inkWidth(line.m) + extra;
    if (textAlign === "right") return blockW - lineW + line.m.inkLeft;
    if (textAlign === "center") return (blockW - lineW) / 2 + line.m.inkLeft;
    return line.m.inkLeft;
  });
  const localYs: number[] = [];
  for (let i = 0; i < prepared.length; i++) {
    localYs.push(box.ascent + i * (leading + gap));
  }
  const bounds = inkBounds(xs, localYs, prepared, wordGaps);
  return {
    lines: used,
    prepared,
    fontSize,
    tracking,
    leading,
    wordGaps,
    localXs: xs,
    localYs,
    bboxL: bounds.l,
    bboxT: bounds.t,
    bboxR: bounds.r,
    bboxB: bounds.b,
  };
}

function anchorFractions(anchor: TypeAnchor): { hx: number; hy: number } {
  const row = anchor[0];
  const col = anchor[1];
  return {
    hx: col === "l" ? 0 : col === "r" ? 1 : 0.5,
    hy: row === "t" ? 0 : row === "b" ? 1 : 0.5,
  };
}

function nudgeIntoFrame(
  xs: number[],
  ys: number[],
  prepared: PreparedLine[],
  wordGaps: number[],
  unitW: number,
  unitH: number,
): void {
  const innerL = FRAME + FIT_PAD;
  const innerT = FRAME + FIT_PAD;
  const innerR = unitW - FRAME - FIT_PAD;
  const innerB = unitH - FRAME - FIT_PAD;
  const box = inkBounds(xs, ys, prepared, wordGaps);
  let dx = 0;
  let dy = 0;
  if (box.l < innerL) dx += innerL - box.l;
  if (box.r > innerR) dx -= box.r - innerR;
  if (box.t < innerT) dy += innerT - box.t;
  if (box.b > innerB) dy -= box.b - innerB;
  if (dx === 0 && dy === 0) return;
  for (let i = 0; i < xs.length; i++) {
    xs[i] += dx;
    ys[i] += dy;
  }
}

function placeSolution(
  sol: Solution,
  anchor: TypeAnchor,
  unitW: number,
  unitH: number,
  place?: { hx?: number; hy?: number },
): {
  xs: number[];
  ys: number[];
} {
  const innerL = FRAME + FIT_PAD;
  const innerT = FRAME + FIT_PAD;
  const innerW = unitW - FRAME * 2 - FIT_PAD * 2;
  const innerH = unitH - FRAME * 2 - FIT_PAD * 2;
  const bw = sol.bboxR - sol.bboxL;
  const bh = sol.bboxB - sol.bboxT;
  const frac = anchorFractions(anchor);
  const hx = place?.hx ?? frac.hx;
  const hy = place?.hy ?? frac.hy;
  const left = innerL + hx * Math.max(0, innerW - bw);
  const top = innerT + hy * Math.max(0, innerH - bh);
  const dx = left - sol.bboxL;
  const dy = top - sol.bboxT;
  const xs = sol.localXs.map((x) => x + dx);
  const ys = sol.localYs.map((y) => y + dy);
  nudgeIntoFrame(xs, ys, sol.prepared, sol.wordGaps, unitW, unitH);
  return { xs, ys };
}

function isTypeDocument(input: TypeState | TypeBlock): input is TypeState {
  return Array.isArray((input as TypeState).blocks);
}

function composeKey(block: TypeBlock, aspectKey: number): string {
  return [
    "v12",
    aspectKey,
    block.text,
    block.composition,
    block.textAlign,
    block.scale,
    block.spacing,
    block.weight,
  ].join("\t");
}

function layoutBlock(
  block: TypeBlock,
  canvasW: number,
  canvasH: number,
  slot: 0 | 1,
  place?: { hx?: number; hy?: number },
): TypeLayout | null {
  if (!block.enabled) return null;
  const text = block.text.replace(/\s+$/g, "");
  if (!text.trim()) return null;
  const w = Math.max(2, canvasW);
  const h = Math.max(2, canvasH);
  const aspectKey = Math.round((h / w) * 10000);
  const unitW = UNIT;
  const unitH = UNIT * (h / w);
  const key = composeKey(block, aspectKey);

  let sol: Solution;
  const hit = caches[slot];
  if (hit && hit.key === key) {
    sol = hit.solution;
  } else {
    const role = block.composition;
    const candidates = authoredOrBroken(text, role);
    if (candidates.length === 0) return null;
    const tEm = trackingEm(role, block.spacing);
    const lead = leadingRatio(role, block.spacing);
    const innerW = unitW - FRAME * 2 - FIT_PAD * 2;
    const innerH = unitH - FRAME * 2 - FIT_PAD * 2;
    const measure = roleMeasure(role, innerW);
    let lines = [...(role === "display" && candidates.length > 1
      ? pickDisplayLines(candidates, block.weight, tEm, lead, measure, innerH)
      : candidates[0])];
    if (role === "caption" && lines.length === 1) {
      const words = lines[0].split(/\s+/).filter(Boolean);
      const cap = unitW * 0.05;
      const probe = prepareLines(lines, block.weight, cap, tEm * cap);
      if (words.length >= 5 && inkWidth(probe[0].m) > measure) {
        const pair = splitTwo(words);
        if (pair) lines = [pair[0], pair[1]];
      }
    }
    sol = composeSolution(lines, role, block.scale, block.spacing, block.weight, unitW, unitH, block.textAlign);
    caches[slot] = { key, solution: sol };
  }

  const placed = alignFromAnchor(block.anchor);
  const pts = placeSolution(sol, block.anchor, unitW, unitH, place);
  const laid: TypeLine[] = sol.lines.map((textLine, i) => ({
    text: textLine,
    width: sol.prepared[i].m.advance,
    height: sol.fontSize,
    x: pts.xs[i],
    y: pts.ys[i],
    wordGap: sol.wordGaps[i] ?? 0,
    unit: 0,
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
  };
  return clampProjected(projectLayout(layout, w, h), w, h, block.weight);
}

export function layoutTypography(
  input: TypeState | TypeBlock,
  canvasW: number,
  canvasH: number,
  slot: 0 | 1 = 0,
  place?: { hx?: number; hy?: number },
): TypeLayout | null {
  if (isTypeDocument(input)) {
    if (!input.enabled) return null;
    return layoutBlock(input.blocks[0], canvasW, canvasH, slot, place);
  }
  return layoutBlock(input, canvasW, canvasH, slot, place);
}

export function layoutTypeDocument(
  state: TypeState,
  canvasW: number,
  canvasH: number,
): { index: 0 | 1; layout: TypeLayout }[] {
  const active = activeTypeBlocks(state);
  const both = active.length === 2;
  const arrangement = both ? state.arrangement : "independent";
  const out: { index: 0 | 1; layout: TypeLayout }[] = [];
  for (const item of active) {
    let place: { hx?: number; hy?: number } | undefined;
    if (arrangement === "between-v") {
      place = { hy: item.index === 0 ? 0 : 1 };
    } else if (arrangement === "between-h") {
      place = { hx: item.index === 0 ? 0 : 1 };
    }
    const layout = layoutBlock(item.block, canvasW, canvasH, item.index, place);
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
  };
}

function clampProjected(
  layout: TypeLayout,
  canvasW: number,
  canvasH: number,
  weight: number,
): TypeLayout {
  const frame = opticalFramePx(canvasW) + 2;
  const xs = layout.lines.map((l) => l.x);
  const ys = layout.lines.map((l) => l.y);
  const pxPrepared = layout.lines.map((line) => ({
    text: line.text,
    m: measureLine(line.text, weight, layout.fontSize, layout.tracking),
  }));
  const wordGaps = layout.lines.map((line) => line.wordGap);
  const innerL = frame;
  const innerT = frame;
  const innerR = canvasW - frame;
  const innerB = canvasH - frame;
  const box = inkBounds(xs, ys, pxPrepared, wordGaps);
  let dx = 0;
  let dy = 0;
  if (box.l < innerL) dx += innerL - box.l;
  if (box.r + dx > innerR) dx -= box.r + dx - innerR;
  if (box.t < innerT) dy += innerT - box.t;
  if (box.b + dy > innerB) dy -= box.b + dy - innerB;
  if (dx === 0 && dy === 0) return layout;
  return {
    ...layout,
    lines: layout.lines.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })),
  };
}

export function invalidateTypeLayout(): void {
  caches[0] = null;
  caches[1] = null;
}

export function typeHasCopy(state: TypeState): boolean {
  return activeTypeBlocks(state).length > 0;
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
  const prepared = layout.lines.map((line) => ({
    text: line.text,
    m: measureLine(line.text, layout.weight, layout.fontSize, layout.tracking),
  }));
  return inkBounds(
    layout.lines.map((l) => l.x),
    layout.lines.map((l) => l.y),
    prepared,
    layout.lines.map((l) => l.wordGap),
  );
}
