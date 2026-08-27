export type TypeAlign = "left" | "center" | "right";
export type TypeValign = "top" | "center" | "bottom";
export type TypeAnchor = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
/** Editorial roles. Spatial behaviour is grid + Spacing, not a role. */
export type TypeRole = "display" | "editorial" | "caption" | "folio";
/** COMPAT alias — Saved States still serialise `composition`. */
export type TypeComposition = TypeRole;
/** COMPAT — mapped from role for older Saved States. */
export type TypeMode = "responsive" | "fixed";
export type TypeInMotion = "none" | "rise" | "slide" | "reveal" | "assemble";
export type TypeOutMotion = "none" | "rise" | "slide" | "reveal" | "disperse";
export type TypeMotionKind = "position" | "variable" | "both";

export interface TypeState {
  enabled: boolean;
  text: string;
  /** COMPAT — derived from `anchor`. Not exposed in the product UI. */
  align: TypeAlign;
  valign: TypeValign;
  /** 9-point page anchor. The only spatial control. */
  anchor: TypeAnchor;
  composition: TypeRole;
  scale: number;
  spacing: number;
  weight: number;
  color: string;
  opacity: number;
  /** COMPAT — snapped to -50 / 0 / 50 from `anchor`. */
  x: number;
  y: number;
  mode: TypeMode;
  spread: number;
  rhythm: number;
  inMotion: TypeInMotion;
  outMotion: TypeOutMotion;
  typeMotion: TypeMotionKind;
  stagger: number;
  inPoint: number;
  outPoint: number;
  inDuration: number;
  outDuration: number;
}

export const TYPE_WEIGHT_MIN = 100;
export const TYPE_WEIGHT_MAX = 900;
export const TYPE_WEIGHT_DEFAULT = 500;

export const TYPE_ROLES: TypeRole[] = ["display", "editorial", "caption", "folio"];
export const TYPE_COMPOSITIONS = TYPE_ROLES;
export const TYPE_ANCHORS: TypeAnchor[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

export function defaultTypeState(): TypeState {
  return {
    enabled: false,
    text: "",
    align: "center",
    valign: "center",
    anchor: "mc",
    composition: "display",
    scale: 50,
    spacing: 50,
    weight: TYPE_WEIGHT_DEFAULT,
    color: "#f3efe6",
    opacity: 100,
    x: 0,
    y: 0,
    mode: "responsive",
    spread: 50,
    rhythm: 0,
    inMotion: "none",
    outMotion: "none",
    typeMotion: "position",
    stagger: 0,
    inPoint: 0,
    outPoint: 100,
    inDuration: 0.15,
    outDuration: 0.15,
  };
}

function parseRole(raw: Partial<TypeState> | null | undefined): TypeRole {
  const c = raw && (raw as { composition?: unknown }).composition;
  if (c === "display" || c === "editorial" || c === "caption" || c === "folio") return c;
  if (c === "headline" || c === "stack") return "display";
  if (c === "spread") return "editorial";
  if (c === "quiet") return "caption";
  if (raw?.mode === "fixed") return "caption";
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

function parseAnchor(raw: Partial<TypeState> | null | undefined): TypeAnchor {
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

export function clampTypeState(raw: Partial<TypeState> | null | undefined): TypeState {
  const d = defaultTypeState();
  if (!raw) return d;
  const num = (v: unknown, lo: number, hi: number, fb: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fb;
    return Math.min(hi, Math.max(lo, n));
  };
  const composition = parseRole(raw);
  const anchor = parseAnchor(raw);
  const placed = alignFromAnchor(anchor);
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : d.color;
  let spacing = num(raw.spacing ?? raw.spread, 0, 100, d.spacing);
  if ((raw as { composition?: unknown }).composition === "spread" && spacing < 70) spacing = 80;
  return {
    enabled: raw.enabled === true,
    text: typeof raw.text === "string" ? raw.text : d.text,
    align: placed.align,
    valign: placed.valign,
    anchor,
    composition,
    scale: num(raw.scale, 0, 100, d.scale),
    spacing,
    weight: num(raw.weight, TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, d.weight),
    color,
    opacity: num(raw.opacity, 0, 100, d.opacity),
    x: placed.x,
    y: placed.y,
    mode: composition === "caption" || composition === "folio" ? "fixed" : "responsive",
    spread: spacing,
    rhythm: 0,
    inMotion: "none",
    outMotion: "none",
    typeMotion: "position",
    stagger: 0,
    inPoint: 0,
    outPoint: 100,
    inDuration: 0.15,
    outDuration: 0.15,
  };
}
