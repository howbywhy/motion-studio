export type TypeAlign = "left" | "center" | "right";
export type TypeValign = "top" | "center" | "bottom";
export type TypeTextAlign = "left" | "center" | "right" | "justify";
export type TypeAnchor = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export type TypeRole = "display" | "editorial" | "caption" | "folio";
export type TypeComposition = TypeRole;
export type TypeMode = "responsive" | "fixed";
export type TypeSequenceMode = "together" | "stagger" | "hold" | "alternate";
export type TypeArrangement = "independent" | "between-v" | "between-h";

export interface TypeBlock {
  enabled: boolean;
  text: string;
  composition: TypeRole;
  textAlign: TypeTextAlign;
  anchor: TypeAnchor;
  scale: number;
  spacing: number;
  weight: number;
  color: string;
  opacity: number;
  /** COMPAT — derived from `anchor`. */
  align: TypeAlign;
  valign: TypeValign;
  x: number;
  y: number;
  mode: TypeMode;
}

/** Document: two editorial blocks + arrangement + sequence. */
export interface TypeState {
  enabled: boolean;
  blocks: [TypeBlock, TypeBlock];
  activeIndex: 0 | 1;
  arrangement: TypeArrangement;
  typeSequenceMode: TypeSequenceMode;
  typeSequencePace: number;
}

export const TYPE_WEIGHT_MIN = 100;
export const TYPE_WEIGHT_MAX = 900;
export const TYPE_WEIGHT_DEFAULT = 500;

export const TYPE_ROLES: TypeRole[] = ["display", "editorial", "caption", "folio"];
export const TYPE_COMPOSITIONS = TYPE_ROLES;
export const TYPE_ANCHORS: TypeAnchor[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
export const TYPE_SEQUENCE_MODES: TypeSequenceMode[] = ["together", "stagger", "hold", "alternate"];
export const TYPE_TEXT_ALIGNS: TypeTextAlign[] = ["left", "center", "right", "justify"];
export const TYPE_ARRANGEMENTS: TypeArrangement[] = ["independent", "between-v", "between-h"];

function num(v: unknown, lo: number, hi: number, fb: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(hi, Math.max(lo, n));
}

function parseRole(raw: Partial<TypeBlock> | Partial<TypeState> | null | undefined): TypeRole {
  const c = raw && (raw as { composition?: unknown }).composition;
  if (c === "display" || c === "editorial" || c === "caption" || c === "folio") return c;
  if (c === "headline" || c === "stack") return "display";
  if (c === "spread") return "editorial";
  if (c === "quiet") return "caption";
  if ((raw as { mode?: unknown })?.mode === "fixed") return "caption";
  return "display";
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

function parseAnchor(raw: Partial<TypeBlock> | null | undefined): TypeAnchor {
  const a = raw && (raw as { anchor?: unknown }).anchor;
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
  return "mc";
}

function parseTextAlign(raw: unknown, fallback: TypeTextAlign): TypeTextAlign {
  if (raw === "left" || raw === "center" || raw === "right" || raw === "justify") return raw;
  return fallback;
}

function parseArrangement(raw: unknown): TypeArrangement {
  if (raw === "between-v" || raw === "between-h" || raw === "independent") return raw;
  return "independent";
}

export function defaultTypeBlock(enabled: boolean): TypeBlock {
  const placed = alignFromAnchor("mc");
  return {
    enabled,
    text: "",
    composition: "display",
    textAlign: "left",
    anchor: "mc",
    scale: 50,
    spacing: 50,
    weight: TYPE_WEIGHT_DEFAULT,
    color: "#f3efe6",
    opacity: 100,
    align: placed.align,
    valign: placed.valign,
    x: placed.x,
    y: placed.y,
    mode: "responsive",
  };
}

export function clampTypeBlock(raw: Partial<TypeBlock> | null | undefined, fallbackEnabled = false): TypeBlock {
  const d = defaultTypeBlock(fallbackEnabled);
  if (!raw) return d;
  const composition = parseRole(raw);
  const anchor = parseAnchor(raw);
  const placed = alignFromAnchor(anchor);
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : d.color;
  let spacing = num(raw.spacing ?? (raw as { spread?: number }).spread, 0, 100, d.spacing);
  if ((raw as { composition?: unknown }).composition === "spread" && spacing < 70) spacing = 80;
  const textAlign = parseTextAlign((raw as { textAlign?: unknown }).textAlign, d.textAlign);
  return {
    enabled: raw.enabled === true,
    text: typeof raw.text === "string" ? raw.text : d.text,
    composition,
    textAlign,
    anchor,
    scale: num(raw.scale, 0, 100, d.scale),
    spacing,
    weight: num(raw.weight, TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, d.weight),
    color,
    opacity: num(raw.opacity, 0, 100, d.opacity),
    align: placed.align,
    valign: placed.valign,
    x: placed.x,
    y: placed.y,
    mode: composition === "caption" || composition === "folio" ? "fixed" : "responsive",
  };
}

export function defaultTypeState(): TypeState {
  return {
    enabled: false,
    blocks: [defaultTypeBlock(true), defaultTypeBlock(false)],
    activeIndex: 0,
    arrangement: "independent",
    typeSequenceMode: "together",
    typeSequencePace: 50,
  };
}

const BLOCK_PATCH_KEYS = [
  "text",
  "composition",
  "textAlign",
  "anchor",
  "scale",
  "spacing",
  "weight",
  "color",
  "opacity",
  "align",
  "valign",
  "x",
  "y",
  "mode",
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
  const seqRaw = rec.typeSequenceMode;
  const typeSequenceMode: TypeSequenceMode =
    seqRaw === "stagger" || seqRaw === "hold" || seqRaw === "alternate" || seqRaw === "together"
      ? seqRaw
      : "together";
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
    arrangement: parseArrangement(rec.arrangement),
    typeSequenceMode,
    typeSequencePace: num(rec.typeSequencePace, 0, 100, d.typeSequencePace),
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
    arrangement: state.arrangement,
    typeSequenceMode: state.typeSequenceMode,
    typeSequencePace: state.typeSequencePace,
    blocks: [{ ...state.blocks[0] }, { ...state.blocks[1] }],
  };
}

export function primaryBlock(state: TypeState): TypeBlock {
  return state.blocks[0];
}
