import {
  clampHoldLength,
  clampSequenceWindow,
  cloneFrameHoldEnabled,
  cloneFrameHoldLength,
  cloneTypePage,
  FRAME_HOLD_LENGTH_DEFAULT,
  SEQUENCE_SPEED_DEFAULT,
  SEQUENCE_START_DEFAULT,
  SEQUENCE_STOP_DEFAULT,
  TYPE_PAGE_MAX,
  type TypePage,
} from "./typePages";

export type TypeAlign = "left" | "center" | "right";
export type TypeValign = "top" | "center" | "bottom";
export type TypeTextAlign = "left" | "center" | "right";
export type TypeAnchor = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export type TypeStyle = "headline" | "paragraph" | "subtitle";
export type TypeRole = TypeStyle;
export type TypeComposition = TypeStyle;
export type TypeSlot = 0 | 1 | 2;
export type TypeDistribution = "packed" | "between";
export type TypeColumn = "narrow" | "medium" | "wide";
export type TypeBlendMode = "normal" | "multiply" | "screen" | "overlay" | "difference" | "exclusion";
export type TypeMode = "responsive" | "fixed";

export interface TypeBlock {
  enabled: boolean;
  text: string;
  composition: TypeStyle;
  textAlign: TypeTextAlign;
  /** Frame align inside the padded optical frame. COMPAT name `anchor`. */
  anchor: TypeAnchor;
  scale: number;
  tracking: number;
  gap: number;
  leading: number;
  distribution: TypeDistribution;
  column: TypeColumn;
  padding: number;
  weight: number;
  color: string;
  /** Paint only. Never feeds layout. */
  blendMode: TypeBlendMode;
  opacity: number;
  /** COMPAT — derived from `anchor`. */
  align: TypeAlign;
  valign: TypeValign;
  x: number;
  y: number;
  mode: TypeMode;
  /** COMPAT — old saves. Mapped onto `tracking`. */
  spacing: number;
}

/** Document: three independent editorial blocks. Sequence / arrangement
 * fields on old saves are ignored. */
export interface TypeState {
  enabled: boolean;
  blocks: TypePage;
  activeIndex: TypeSlot;
  /** 1–6 editorial frames. Length 1 is production-identical. */
  pages: TypePage[];
  /** Which frame the Type inspector is editing. */
  selected: number;
  /** Per-frame Hold on/off. Final frame is ignored by the resolver but stored so reorder can restore it. */
  frameHoldEnabled: boolean[];
  /** Relative beat length while Hold is On. 1.0–3.0, default 2.0. Irrelevant while Off. */
  frameHoldLength: number[];
  /** Cadence of Type sequence cuts while typography is present. 0–100, default 50. */
  sequenceSpeed: number;
  /** Master phase where Type appears. */
  sequenceStart: number;
  /** Master phase where Type disappears. */
  sequenceStop: number;
}

export const TYPE_WEIGHT_MIN = 100;
export const TYPE_WEIGHT_MAX = 900;
export const TYPE_WEIGHT_DEFAULT = 500;

export const TYPE_SLOT_COUNT = 3;

/** Subtitle identity default. Not a documented brand colour. */
export const SUBTITLE_YELLOW = "#f5c518";

export const TYPE_STYLES: TypeStyle[] = ["headline", "paragraph", "subtitle"];
export const TYPE_ROLES = TYPE_STYLES;
export const TYPE_COMPOSITIONS = TYPE_STYLES;
export const TYPE_ANCHORS: TypeAnchor[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
export const TYPE_TEXT_ALIGNS: TypeTextAlign[] = ["left", "center", "right"];
export const TYPE_DISTRIBUTIONS: TypeDistribution[] = ["packed", "between"];
export const TYPE_COLUMNS: TypeColumn[] = ["narrow", "medium", "wide"];
export const TYPE_BLEND_MODES: TypeBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "difference",
  "exclusion",
];

export function canvasBlendOp(mode: TypeBlendMode): GlobalCompositeOperation {
  if (mode === "multiply") return "multiply";
  if (mode === "screen") return "screen";
  if (mode === "overlay") return "overlay";
  if (mode === "difference") return "difference";
  if (mode === "exclusion") return "exclusion";
  return "source-over";
}

function parseBlendMode(raw: unknown): TypeBlendMode {
  if (typeof raw === "string" && (TYPE_BLEND_MODES as string[]).includes(raw)) return raw as TypeBlendMode;
  return "normal";
}

function num(v: unknown, lo: number, hi: number, fb: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(hi, Math.max(lo, n));
}

function incomingStyleToken(raw: Partial<TypeBlock> | Partial<TypeState> | null | undefined): string | undefined {
  const rec = raw as { composition?: unknown; style?: unknown; mode?: unknown } | null | undefined;
  if (typeof rec?.style === "string") return rec.style;
  if (typeof rec?.composition === "string") return rec.composition;
  if (rec?.mode === "fixed") return "footnote";
  return undefined;
}

export function isLegacyFootnoteToken(token: string | undefined): boolean {
  return token === "footnote" || token === "caption" || token === "quiet";
}

/** Collapse legacy Footnote copy to a single Subtitle cue. */
export function flattenLegacyFootnoteCopy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
}

export function parseStyle(raw: Partial<TypeBlock> | Partial<TypeState> | null | undefined): TypeStyle {
  const rec = raw as { composition?: unknown; style?: unknown } | null | undefined;
  const c = rec?.style ?? rec?.composition;
  if (c === "headline" || c === "paragraph" || c === "subtitle") return c;
  if (c === "footnote") return "subtitle";
  if (c === "display" || c === "folio" || c === "stack") return "headline";
  if (c === "editorial" || c === "spread") return "paragraph";
  if (c === "caption" || c === "quiet") return "subtitle";
  if ((raw as { mode?: unknown })?.mode === "fixed") return "subtitle";
  return "headline";
}

function axis(v: number): 0 | 0.5 | 1 {
  if (v < -17) return 0;
  if (v > 17) return 1;
  return 0.5;
}

export function anchorFromAlign(align: TypeAlign, valign: TypeValign): TypeAnchor {
  const col = align === "left" ? "l" : align === "right" ? "r" : "c";
  const row = valign === "top" ? "t" : valign === "bottom" ? "b" : "m";
  return `${row}${col}` as TypeAnchor;
}

export function alignFromAnchor(anchor: TypeAnchor): { align: TypeAlign; valign: TypeValign; x: number; y: number } {
  const row = anchor[0];
  const col = anchor[1];
  const align: TypeAlign = col === "l" ? "left" : col === "r" ? "right" : "center";
  const valign: TypeValign = row === "t" ? "top" : row === "b" ? "bottom" : "center";
  const x = col === "l" ? -50 : col === "r" ? 50 : 0;
  const y = row === "t" ? -50 : row === "b" ? 50 : 0;
  return { align, valign, x, y };
}

function parseAnchor(raw: Partial<TypeBlock> | null | undefined, fallback: TypeAnchor): TypeAnchor {
  const a = raw && ((raw as { frameAlign?: unknown }).frameAlign ?? (raw as { anchor?: unknown }).anchor);
  if (typeof a === "string" && (TYPE_ANCHORS as string[]).includes(a)) return a as TypeAnchor;
  if (raw?.align || raw?.valign) {
    const align = raw.align === "left" || raw.align === "right" || raw.align === "center" ? raw.align : "center";
    const valign = raw.valign === "top" || raw.valign === "bottom" || raw.valign === "center" ? raw.valign : "center";
    return anchorFromAlign(align, valign);
  }
  if (typeof raw?.x === "number" || typeof raw?.y === "number") {
    const hx = axis(typeof raw.x === "number" ? raw.x : 0);
    const hy = axis(typeof raw.y === "number" ? raw.y : 0);
    const col = hx === 0 ? "l" : hx === 1 ? "r" : "c";
    const row = hy === 0 ? "t" : hy === 1 ? "b" : "m";
    return `${row}${col}` as TypeAnchor;
  }
  return fallback;
}

function parseTextAlign(raw: unknown, fallback: TypeTextAlign): TypeTextAlign {
  if (raw === "left" || raw === "center" || raw === "right") return raw;
  if (raw === "justify") return "left";
  return fallback;
}

function parseDistribution(raw: unknown, fallback: TypeDistribution): TypeDistribution {
  if (raw === "packed" || raw === "between") return raw;
  return fallback;
}

function parseColumn(raw: unknown, fallback: TypeColumn): TypeColumn {
  if (raw === "narrow" || raw === "medium" || raw === "wide") return raw;
  return fallback;
}

export interface StyleDefaults {
  scale: number;
  tracking: number;
  gap: number;
  leading: number;
  weight: number;
  anchor: TypeAnchor;
  padding: number;
  distribution: TypeDistribution;
  column: TypeColumn;
}

export function styleDefaults(style: TypeStyle): StyleDefaults {
  if (style === "paragraph") {
    return {
      scale: 42,
      tracking: 22,
      gap: 20,
      leading: 52,
      weight: 400,
      anchor: "ml",
      padding: 8,
      distribution: "packed",
      column: "medium",
    };
  }
  if (style === "subtitle") {
    return {
      scale: 32,
      tracking: 28,
      gap: 16,
      leading: 48,
      weight: 500,
      anchor: "bc",
      padding: 0,
      distribution: "packed",
      column: "medium",
    };
  }
  return {
    scale: 78,
    tracking: 28,
    gap: 16,
    leading: 40,
    weight: 500,
    anchor: "mc",
    padding: 0,
    distribution: "packed",
    column: "wide",
  };
}

export function applyStyleChange(
  current: { composition: TypeStyle; anchor: TypeAnchor },
  style: TypeStyle,
): Partial<TypeBlock> {
  const prev = styleDefaults(current.composition);
  const next = styleDefaults(style);
  const patch: Partial<TypeBlock> = {
    composition: style,
    scale: next.scale,
    tracking: next.tracking,
    gap: next.gap,
    leading: next.leading,
    weight: next.weight,
    padding: next.padding,
    distribution: next.distribution,
    column: next.column,
    spacing: next.tracking,
  };
  if (current.anchor === prev.anchor) patch.anchor = next.anchor;
  if (style === "subtitle") patch.color = SUBTITLE_YELLOW;
  else if (current.composition === "subtitle") patch.color = "#f3efe6";
  return patch;
}

export function authoredLineCount(text: string): number {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export function defaultTypeBlock(enabled: boolean, style: TypeStyle = "headline"): TypeBlock {
  const defs = styleDefaults(style);
  const placed = alignFromAnchor(defs.anchor);
  return {
    enabled,
    text: "",
    composition: style,
    textAlign: "left",
    anchor: defs.anchor,
    scale: defs.scale,
    tracking: defs.tracking,
    gap: defs.gap,
    leading: defs.leading,
    distribution: defs.distribution,
    column: defs.column,
    padding: defs.padding,
    weight: defs.weight,
    color: style === "subtitle" ? SUBTITLE_YELLOW : "#f3efe6",
    blendMode: "normal",
    opacity: 100,
    align: placed.align,
    valign: placed.valign,
    x: placed.x,
    y: placed.y,
    mode: "responsive",
    spacing: defs.tracking,
  };
}

export function clampTypeBlock(raw: Partial<TypeBlock> | null | undefined, fallbackEnabled = false): TypeBlock {
  const composition = parseStyle(raw);
  const d = defaultTypeBlock(fallbackEnabled, composition);
  if (!raw) return d;
  const legacyFootnote = isLegacyFootnoteToken(incomingStyleToken(raw));
  const anchor = parseAnchor(raw, d.anchor);
  const placed = alignFromAnchor(anchor);
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : d.color;
  const rawText = typeof raw.text === "string" ? raw.text : d.text;
  const text = legacyFootnote ? flattenLegacyFootnoteCopy(rawText) : rawText;
  const tracking = num(
    (raw as { tracking?: unknown }).tracking ?? raw.spacing ?? (raw as { spread?: number }).spread,
    0,
    100,
    d.tracking,
  );
  return {
    enabled: raw.enabled === true,
    text,
    composition,
    textAlign: parseTextAlign((raw as { textAlign?: unknown }).textAlign, d.textAlign),
    anchor,
    scale: num(raw.scale, 0, 100, d.scale),
    tracking,
    gap: num((raw as { gap?: unknown }).gap, 0, 100, d.gap),
    leading: num((raw as { leading?: unknown }).leading, 0, 100, d.leading),
    distribution: parseDistribution((raw as { distribution?: unknown }).distribution, d.distribution),
    column: parseColumn((raw as { column?: unknown; width?: unknown }).column ?? (raw as { width?: unknown }).width, d.column),
    padding: num((raw as { padding?: unknown }).padding, 0, 100, d.padding),
    weight: num(raw.weight, TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, d.weight),
    color,
    blendMode: parseBlendMode((raw as { blendMode?: unknown }).blendMode),
    opacity: num(raw.opacity, 0, 100, d.opacity),
    align: placed.align,
    valign: placed.valign,
    x: placed.x,
    y: placed.y,
    mode: "responsive",
    spacing: tracking,
  };
}

export function defaultTypeState(): TypeState {
  const blocks: TypePage = [
    defaultTypeBlock(true, "headline"),
    defaultTypeBlock(false, "headline"),
    defaultTypeBlock(false, "headline"),
  ];
  return {
    enabled: false,
    blocks,
    activeIndex: 0,
    pages: [cloneTypePage(blocks)],
    selected: 0,
    frameHoldEnabled: [false],
    frameHoldLength: [FRAME_HOLD_LENGTH_DEFAULT],
    sequenceSpeed: SEQUENCE_SPEED_DEFAULT,
    sequenceStart: SEQUENCE_START_DEFAULT,
    sequenceStop: SEQUENCE_STOP_DEFAULT,
  };
}

const BLOCK_PATCH_KEYS = [
  "text",
  "composition",
  "textAlign",
  "anchor",
  "scale",
  "tracking",
  "gap",
  "leading",
  "distribution",
  "column",
  "padding",
  "weight",
  "color",
  "blendMode",
  "opacity",
  "align",
  "valign",
  "x",
  "y",
  "mode",
  "spacing",
] as const;

function pickBlockPatch(raw: Record<string, unknown>): Partial<TypeBlock> | null {
  const out: Record<string, unknown> = {};
  let any = false;
  for (const key of BLOCK_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      out[key] = raw[key];
      any = true;
    }
  }
  if (typeof raw.blockEnabled === "boolean") {
    out.enabled = raw.blockEnabled;
    any = true;
  }
  if (typeof raw.style === "string") {
    out.composition = raw.style;
    any = true;
  }
  if (typeof raw.frameAlign === "string") {
    out.anchor = raw.frameAlign;
    any = true;
  }
  if (typeof raw.width === "string") {
    out.column = raw.width;
    any = true;
  }
  return any ? (out as Partial<TypeBlock>) : null;
}

function looksLikeLegacyBlock(raw: Record<string, unknown>): boolean {
  return !Array.isArray(raw.blocks) && (
    typeof raw.text === "string" ||
    typeof raw.composition === "string" ||
    typeof raw.anchor === "string" ||
    typeof raw.scale === "number"
  );
}

function padTypePage(raw: unknown[] | undefined, fallbackEnabled0 = true): TypePage {
  return [
    clampTypeBlock((raw?.[0] as Partial<TypeBlock> | undefined) ?? defaultTypeBlock(fallbackEnabled0, "headline"), fallbackEnabled0),
    clampTypeBlock((raw?.[1] as Partial<TypeBlock> | undefined) ?? defaultTypeBlock(false, "headline"), false),
    clampTypeBlock((raw?.[2] as Partial<TypeBlock> | undefined) ?? defaultTypeBlock(false, "headline"), false),
  ];
}

export function clampTypeState(raw: Partial<TypeState> | Record<string, unknown> | null | undefined): TypeState {
  const d = defaultTypeState();
  if (!raw) return d;
  const rec = raw as Record<string, unknown>;
  const activeIndex: TypeSlot = rec.activeIndex === 2 ? 2 : rec.activeIndex === 1 ? 1 : 0;
  let blocks: TypePage;
  if (Array.isArray(rec.blocks) && rec.blocks.length >= 1) {
    blocks = padTypePage(rec.blocks, true);
  } else if (looksLikeLegacyBlock(rec)) {
    blocks = padTypePage([clampTypeBlock({ ...(rec as Partial<TypeBlock>), enabled: true }, true)]);
  } else {
    blocks = cloneTypePage(d.blocks);
  }

  let pages: TypePage[];
  if (Array.isArray(rec.pages) && rec.pages.length >= 1) {
    const home = cloneTypePage(blocks);
    pages = rec.pages.slice(0, TYPE_PAGE_MAX).map((page) => {
      if (!Array.isArray(page)) return cloneTypePage(home);
      return padTypePage(page, true);
    });
  } else {
    pages = [cloneTypePage(blocks)];
  }
  if (pages.length < 1) pages = [cloneTypePage(blocks)];

  let selected = typeof rec.selected === "number" && Number.isFinite(rec.selected) ? Math.round(rec.selected) : 0;
  selected = Math.min(pages.length - 1, Math.max(0, selected));

  const legacyHolds = Array.isArray(rec.frameHolds) ? rec.frameHolds.map((h) => h === true) : [];
  const enabledRaw = Array.isArray(rec.frameHoldEnabled)
    ? rec.frameHoldEnabled.map((h) => h === true)
    : legacyHolds;
  let frameHoldEnabled = cloneFrameHoldEnabled(enabledRaw, pages.length);
  const lengthRaw = Array.isArray(rec.frameHoldLength)
    ? rec.frameHoldLength
    : legacyHolds.map((on) => (on ? FRAME_HOLD_LENGTH_DEFAULT : FRAME_HOLD_LENGTH_DEFAULT));
  let frameHoldLength = cloneFrameHoldLength(lengthRaw, pages.length);

  if (rec.typePage === "add" && pages.length < TYPE_PAGE_MAX) {
    const copy = cloneTypePage(pages[selected]!);
    pages = [
      ...pages.slice(0, selected + 1).map(cloneTypePage),
      copy,
      ...pages.slice(selected + 1).map(cloneTypePage),
    ];
    frameHoldEnabled = [...frameHoldEnabled.slice(0, selected + 1), false, ...frameHoldEnabled.slice(selected + 1)];
    frameHoldLength = [
      ...frameHoldLength.slice(0, selected + 1),
      FRAME_HOLD_LENGTH_DEFAULT,
      ...frameHoldLength.slice(selected + 1),
    ];
    selected = selected + 1;
  } else if (rec.typePage === "remove" && pages.length > 1 && selected > 0) {
    pages = pages.filter((_, i) => i !== selected).map(cloneTypePage);
    frameHoldEnabled = frameHoldEnabled.filter((_, i) => i !== selected);
    frameHoldLength = frameHoldLength.filter((_, i) => i !== selected);
    selected = Math.min(selected, pages.length - 1);
  }

  const moveRaw = rec.typePageMove as { from?: unknown; to?: unknown } | undefined;
  if (moveRaw && typeof moveRaw === "object") {
    const from = Math.round(Number(moveRaw.from));
    const to = Math.round(Number(moveRaw.to));
    if (
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      from !== to &&
      from >= 0 &&
      to >= 0 &&
      from < pages.length &&
      to < pages.length
    ) {
      const next = pages.map(cloneTypePage);
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      const nextOn = frameHoldEnabled.slice();
      const [on] = nextOn.splice(from, 1);
      nextOn.splice(to, 0, on === true);
      const nextLen = frameHoldLength.slice();
      const [len] = nextLen.splice(from, 1);
      nextLen.splice(to, 0, clampHoldLength(len));
      if (selected === from) selected = to;
      else if (from < selected && to >= selected) selected -= 1;
      else if (from > selected && to <= selected) selected += 1;
      pages = next;
      frameHoldEnabled = nextOn;
      frameHoldLength = nextLen;
    }
  }

  frameHoldEnabled = cloneFrameHoldEnabled(frameHoldEnabled, pages.length);
  frameHoldLength = cloneFrameHoldLength(frameHoldLength, pages.length);
  if (rec.frameHold === true || rec.frameHold === false) {
    if (selected < pages.length - 1) frameHoldEnabled[selected] = rec.frameHold;
  }
  if (typeof rec.holdLength === "number") {
    if (selected < pages.length - 1) frameHoldLength[selected] = clampHoldLength(rec.holdLength);
  }
  frameHoldEnabled = cloneFrameHoldEnabled(frameHoldEnabled, pages.length);
  frameHoldLength = cloneFrameHoldLength(frameHoldLength, pages.length);

  blocks = cloneTypePage(pages[selected]!);
  const blockPatch = pickBlockPatch(rec);
  if (blockPatch) {
    const i = activeIndex;
    blocks[i] = clampTypeBlock({ ...blocks[i], ...blockPatch }, blocks[i].enabled);
    pages[selected] = cloneTypePage(blocks);
  }

  const win = clampSequenceWindow(rec.sequenceStart, rec.sequenceStop);
  return {
    enabled: rec.enabled === true,
    blocks,
    activeIndex,
    pages,
    selected,
    frameHoldEnabled,
    frameHoldLength,
    sequenceSpeed: rec.sequenceSpeed === undefined || rec.sequenceSpeed === null
      ? SEQUENCE_SPEED_DEFAULT
      : num(rec.sequenceSpeed, 0, 100, SEQUENCE_SPEED_DEFAULT),
    sequenceStart: win.start,
    sequenceStop: win.stop,
  };
}

export function activeTypeBlocks(state: TypeState): { index: TypeSlot; block: TypeBlock }[] {
  if (!state.enabled) return [];
  const out: { index: TypeSlot; block: TypeBlock }[] = [];
  for (const index of [0, 1, 2] as const) {
    const block = state.blocks[index];
    if (block.enabled && block.text.trim()) out.push({ index, block });
  }
  return out;
}

export function patchTypeState(current: TypeState, patch: Partial<TypeState> & Partial<TypeBlock>): TypeState {
  const merged: Record<string, unknown> = { ...current, ...patch };
  if (patch.blocks) merged.blocks = patch.blocks;
  return clampTypeState(merged);
}

export function cloneTypeState(state: TypeState): TypeState {
  const pages = (state.pages ?? [state.blocks]).map(cloneTypePage);
  const selected = Math.min(pages.length - 1, Math.max(0, state.selected ?? 0));
  const win = clampSequenceWindow(state.sequenceStart, state.sequenceStop);
  return {
    enabled: state.enabled,
    activeIndex: state.activeIndex === 2 ? 2 : state.activeIndex === 1 ? 1 : 0,
    pages,
    selected,
    frameHoldEnabled: cloneFrameHoldEnabled(state.frameHoldEnabled, pages.length),
    frameHoldLength: cloneFrameHoldLength(state.frameHoldLength, pages.length),
    sequenceSpeed: typeof state.sequenceSpeed === "number" && Number.isFinite(state.sequenceSpeed)
      ? Math.min(100, Math.max(0, state.sequenceSpeed))
      : SEQUENCE_SPEED_DEFAULT,
    sequenceStart: win.start,
    sequenceStop: win.stop,
    blocks: cloneTypePage(pages[selected]!),
  };
}

export function primaryBlock(state: TypeState): TypeBlock {
  return state.blocks[0];
}

/** COMPAT alias used by older call sites. */
export const roleDefaults = styleDefaults;
export const applyRoleChange = applyStyleChange;
export const parseRole = parseStyle;
