export type TypeAlign = "left" | "center" | "right";
export type TypeValign = "top" | "center" | "bottom";
export type TypeComposition = "display" | "stack" | "spread" | "quiet";
/** COMPAT — mapped from composition for older Saved States. */
export type TypeMode = "responsive" | "fixed";
export type TypeInMotion = "none" | "rise" | "slide" | "reveal" | "assemble";
export type TypeOutMotion = "none" | "rise" | "slide" | "reveal" | "disperse";
export type TypeMotionKind = "position" | "variable" | "both";

export interface TypeState {
  enabled: boolean;
  text: string;
  align: TypeAlign;
  valign: TypeValign;
  composition: TypeComposition;
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

export const TYPE_COMPOSITIONS: TypeComposition[] = ["display", "stack", "spread", "quiet"];

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

function parseComposition(raw: Partial<TypeState> | null | undefined): TypeComposition {
  const c = raw && (raw as { composition?: unknown }).composition;
  if (c === "display" || c === "stack" || c === "spread" || c === "quiet") return c;
  if (raw?.mode === "fixed") return "quiet";
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
  const composition = parseComposition(raw);
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : d.color;
  const spacing = num(raw.spacing ?? raw.spread, 0, 100, d.spacing);
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
    mode: composition === "quiet" ? "fixed" : "responsive",
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
