export type TypeAlign = "left" | "center" | "right";
export type TypeValign = "top" | "center" | "bottom";
export type TypeTextAlign = "left" | "center" | "right";
export type TypeAnchor = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export type TypeStyle = "headline" | "paragraph" | "footnote";
export type TypeRole = TypeStyle;
export type TypeComposition = TypeStyle;
export type TypeDistribution = "packed" | "between";
export type TypeColumn = "narrow" | "medium" | "wide";
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

/** Document: two independent editorial blocks. Sequence / arrangement
 * fields on old saves are ignored. */
export interface TypeState {
  enabled: boolean;
  blocks: [TypeBlock, TypeBlock];
  activeIndex: 0 | 1;
}

export const TYPE_WEIGHT_MIN = 100;
export const TYPE_WEIGHT_MAX = 900;
export const TYPE_WEIGHT_DEFAULT = 500;

export const TYPE_STYLES: TypeStyle[] = ["headline", "paragraph", "footnote"];
export const TYPE_ROLES = TYPE_STYLES;
export const TYPE_COMPOSITIONS = TYPE_STYLES;
export const TYPE_ANCHORS: TypeAnchor[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
export const TYPE_TEXT_ALIGNS: TypeTextAlign[] = ["left", "center", "right"];
export const TYPE_DISTRIBUTIONS: TypeDistribution[] = ["packed", "between"];
export const TYPE_COLUMNS: TypeColumn[] = ["narrow", "medium", "wide"];

function num(v: unknown, lo: number, hi: number, fb: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(hi, Math.max(lo, n));
}

export function parseStyle(raw: Partial<TypeBlock> | Partial<TypeState> | null | undefined): TypeStyle {
  const rec = raw as { composition?: unknown; style?: unknown } | null | undefined;
  const c = rec?.style ?? rec?.composition;
  if (c === "headline" || c === "paragraph" || c === "footnote") return c;
  if (c === "display" || c === "folio" || c === "stack") return "headline";
  if (c === "editorial" || c === "spread") return "paragraph";
  if (c === "caption" || c === "quiet") return "footnote";
  if ((raw as { mode?: unknown })?.mode === "fixed") return "footnote";
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
  if (style === "footnote") {
    return {
      scale: 36,
      tracking: 54,
      gap: 16,
      leading: 48,
      weight: 500,
      anchor: "bl",
      padding: 0,
      distribution: "packed",
      column: "wide",
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
    color: "#f3efe6",
    opacity: 100,
    align: placed.align,
    valign: placed.valign,
    x: placed.x,
    y: placed.y,
    mode: style === "footnote" ? "fixed" : "responsive",
    spacing: defs.tracking,
  };
}

export function clampTypeBlock(raw: Partial<TypeBlock> | null | undefined, fallbackEnabled = false): TypeBlock {
  const composition = parseStyle(raw);
  const d = defaultTypeBlock(fallbackEnabled, composition);
  if (!raw) return d;
  const anchor = parseAnchor(raw, d.anchor);
  const placed = alignFromAnchor(anchor);
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : d.color;
  const tracking = num(
    (raw as { tracking?: unknown }).tracking ?? raw.spacing ?? (raw as { spread?: number }).spread,
    0,
    100,
    d.tracking,
  );
  return {
    enabled: raw.enabled === true,
    text: typeof raw.text === "string" ? raw.text : d.text,
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
    opacity: num(raw.opacity, 0, 100, d.opacity),
    align: placed.align,
    valign: placed.valign,
    x: placed.x,
    y: placed.y,
    mode: composition === "footnote" ? "fixed" : "responsive",
    spacing: tracking,
  };
}

export function defaultTypeState(): TypeState {
  return {
    enabled: false,
    blocks: [defaultTypeBlock(true, "headline"), defaultTypeBlock(false, "headline")],
    activeIndex: 0,
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

export function clampTypeState(raw: Partial<TypeState> | Record<string, unknown> | null | undefined): TypeState {
  const d = defaultTypeState();
  if (!raw) return d;
  const rec = raw as Record<string, unknown>;
  const activeIndex: 0 | 1 = rec.activeIndex === 1 ? 1 : 0;
  let blocks: [TypeBlock, TypeBlock];
  if (Array.isArray(rec.blocks) && rec.blocks.length >= 1) {
    blocks = [
      clampTypeBlock(rec.blocks[0] as Partial<TypeBlock>, true),
      clampTypeBlock((rec.blocks[1] as Partial<TypeBlock> | undefined) ?? defaultTypeBlock(false), false),
    ];
  } else if (looksLikeLegacyBlock(rec)) {
    blocks = [clampTypeBlock({ ...(rec as Partial<TypeBlock>), enabled: true }, true), defaultTypeBlock(false)];
  } else {
    blocks = d.blocks;
  }
  const blockPatch = pickBlockPatch(rec);
  if (Array.isArray(rec.blocks) && blockPatch) {
    const i = activeIndex;
    blocks[i] = clampTypeBlock({ ...blocks[i], ...blockPatch }, blocks[i].enabled);
  }
  return {
    enabled: rec.enabled === true,
    blocks,
    activeIndex,
  };
}

export function activeTypeBlocks(state: TypeState): { index: 0 | 1; block: TypeBlock }[] {
  if (!state.enabled) return [];
  const out: { index: 0 | 1; block: TypeBlock }[] = [];
  if (state.blocks[0].enabled && state.blocks[0].text.trim()) out.push({ index: 0, block: state.blocks[0] });
  if (state.blocks[1].enabled && state.blocks[1].text.trim()) out.push({ index: 1, block: state.blocks[1] });
  return out;
}

export function patchTypeState(current: TypeState, patch: Partial<TypeState> & Partial<TypeBlock>): TypeState {
  const merged: Record<string, unknown> = { ...current, ...patch };
  if (patch.blocks) merged.blocks = patch.blocks;
  return clampTypeState(merged);
}

export function cloneTypeState(state: TypeState): TypeState {
  return {
    enabled: state.enabled,
    activeIndex: state.activeIndex,
    blocks: [{ ...state.blocks[0] }, { ...state.blocks[1] }],
  };
}

export function primaryBlock(state: TypeState): TypeBlock {
  return state.blocks[0];
}

/** COMPAT alias used by older call sites. */
export const roleDefaults = styleDefaults;
export const applyRoleChange = applyStyleChange;
export const parseRole = parseStyle;
