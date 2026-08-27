export type TypeAlign = "left" | "center" | "right";
export type TypeValign = "top" | "center" | "bottom";
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
  align: TypeAlign;
  valign: TypeValign;
  composition: TypeRole;
  scale: number;
  spacing: number;
  weight: number;
  color: string;
  opacity: number;
  x: number;
  y: number;
  /** COMPAT aliases. Product UI does not expose these. */
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

export function defaultTypeState(): TypeState {
  return {
    enabled: false,
    text: "",
    align: "center",
    valign: "center",
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

export function clampTypeState(raw: Partial<TypeState> | null | undefined): TypeState {
  const d = defaultTypeState();
  if (!raw) return d;
  const num = (v: unknown, lo: number, hi: number, fb: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fb;
    return Math.min(hi, Math.max(lo, n));
  };
  const align = raw.align === "left" || raw.align === "right" || raw.align === "center" ? raw.align : d.align;
  const valign = raw.valign === "top" || raw.valign === "bottom" || raw.valign === "center" ? raw.valign : d.valign;
  const composition = parseRole(raw);
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : d.color;
  let spacing = num(raw.spacing ?? raw.spread, 0, 100, d.spacing);
  if ((raw as { composition?: unknown }).composition === "spread" && spacing < 70) spacing = 80;
  return {
    enabled: raw.enabled === true,
    text: typeof raw.text === "string" ? raw.text : d.text,
    align,
    valign,
    composition,
    scale: num(raw.scale, 0, 100, d.scale),
    spacing,
    weight: num(raw.weight, TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, d.weight),
    color,
    opacity: num(raw.opacity, 0, 100, d.opacity),
    x: num(raw.x, -50, 50, d.x),
    y: num(raw.y, -50, 50, d.y),
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
