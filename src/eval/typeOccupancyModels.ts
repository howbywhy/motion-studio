/**
 * Eval-only occupancy comparison from the authoring-model trial.
 * Rejected for product. Product uses resolveSequenceTypePosition.
 *
 * CURRENT            inherit copies the Global Type anchor (headline mc).
 * SIGNATURE-AWARE    nearest free region that does not collide — rejected.
 * SHARED DATUM       complementary content datum (bc) — approved, now product.
 */

import type { TypeAnchor } from "../core/typeState";

const TYPE_ANCHORS: TypeAnchor[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

const MARK_WORLD_W = 1080;
const MARK_WORLD_H = 394;
const MARK_INSET = 0.07;

export type OccupancyModel = "current" | "signature-region" | "shared-datum";

export const OCCUPANCY_MODELS: OccupancyModel[] = [
  "current",
  "signature-region",
  "shared-datum",
];

export interface OccupancyRect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface OccupancyMark {
  enabled: boolean;
  scale: number;
  anchor: TypeAnchor;
}

export interface OccupancyBind {
  model: OccupancyModel;
  mark: OccupancyMark;
}

export const OCCUPANCY_OVERLAP_RATIO = 0.08;
export const OCCUPANCY_SIGNATURE_PAD = 0.02;
export const SHARED_COMPOSITION_TYPE_ANCHOR: TypeAnchor = "bc";

const GRID: Record<TypeAnchor, { x: number; y: number }> = {
  tl: { x: 0, y: 0 },
  tc: { x: 1, y: 0 },
  tr: { x: 2, y: 0 },
  ml: { x: 0, y: 1 },
  mc: { x: 1, y: 1 },
  mr: { x: 2, y: 1 },
  bl: { x: 0, y: 2 },
  bc: { x: 1, y: 2 },
  br: { x: 2, y: 2 },
};

const TIE: TypeAnchor[] = ["bc", "tc", "bl", "br", "ml", "mr", "tl", "tr", "mc"];

let evalConfig: OccupancyBind | null = null;
const evalByOwner = new WeakMap<object, OccupancyBind | null>();

export function occupancyLabel(model: OccupancyModel): string {
  if (model === "signature-region") return "SIGNATURE-AWARE REGION";
  if (model === "shared-datum") return "SHARED COMPOSITION DATUM";
  return "CURRENT";
}

export function clampOccupancyModel(raw: unknown): OccupancyModel {
  return OCCUPANCY_MODELS.includes(raw as OccupancyModel) ? (raw as OccupancyModel) : "current";
}

export function setEvalTypeOccupancy(config: OccupancyBind | null): void {
  evalConfig = config;
}

export function bindEvalTypeOccupancy(owner: object, config: OccupancyBind | null): void {
  evalByOwner.set(owner, config);
}

export function resolveEvalTypeOccupancy(owner?: object): OccupancyBind | null {
  if (owner && evalByOwner.has(owner)) return evalByOwner.get(owner) ?? null;
  return evalConfig;
}

export function sharedCompositionDatum(_width: number, _height: number): TypeAnchor {
  void _width;
  void _height;
  return SHARED_COMPOSITION_TYPE_ANCHOR;
}

export function signatureOccupiedRect(
  width: number,
  height: number,
  mark: OccupancyMark,
): OccupancyRect | null {
  if (!mark.enabled) return null;
  const safeW = width * (1 - MARK_INSET * 2);
  const safeH = height * (1 - MARK_INSET * 2);
  const fit = Math.min(safeW / MARK_WORLD_W, safeH / MARK_WORLD_H);
  const s = fit * (0.42 + 0.58 * (Math.min(100, Math.max(0, mark.scale)) / 100));
  const dw = MARK_WORLD_W * s;
  const dh = MARK_WORLD_H * s;
  const hx = mark.anchor[1] === "l" ? 0 : mark.anchor[1] === "r" ? 1 : 0.5;
  const hy = mark.anchor[0] === "t" ? 0 : mark.anchor[0] === "b" ? 1 : 0.5;
  const x = width * MARK_INSET + (safeW - dw) * hx;
  const y = height * MARK_INSET + (safeH - dh) * hy;
  const padX = width * OCCUPANCY_SIGNATURE_PAD;
  const padY = height * OCCUPANCY_SIGNATURE_PAD;
  return {
    l: x - padX,
    t: y - padY,
    r: x + dw + padX,
    b: y + dh + padY,
  };
}

export function occupancyCandidateOrder(preferred: TypeAnchor): TypeAnchor[] {
  const pref = TYPE_ANCHORS.includes(preferred) ? preferred : "mc";
  const rest = TYPE_ANCHORS.filter((a) => a !== pref);
  rest.sort((a, b) => {
    const da = Math.abs(GRID[a]!.x - GRID[pref]!.x) + Math.abs(GRID[a]!.y - GRID[pref]!.y);
    const db = Math.abs(GRID[b]!.x - GRID[pref]!.x) + Math.abs(GRID[b]!.y - GRID[pref]!.y);
    if (da !== db) return da - db;
    return TIE.indexOf(a) - TIE.indexOf(b);
  });
  return [pref, ...rest];
}

export function overlapArea(a: OccupancyRect, b: OccupancyRect): number {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

export function rectArea(r: OccupancyRect): number {
  return Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
}

export function rectCenter(r: OccupancyRect): { x: number; y: number } {
  return { x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 };
}

export function containsPoint(r: OccupancyRect, x: number, y: number): boolean {
  return x >= r.l && x <= r.r && y >= r.t && y <= r.b;
}

export function materiallyCollides(signature: OccupancyRect, type: OccupancyRect): boolean {
  const overlap = overlapArea(signature, type);
  if (overlap <= 0) return false;
  const typeArea = Math.max(1, rectArea(type));
  if (overlap / typeArea > OCCUPANCY_OVERLAP_RATIO) return true;
  const c = rectCenter(type);
  return containsPoint(signature, c.x, c.y);
}

export function estimateTypeRect(
  width: number,
  height: number,
  anchor: TypeAnchor,
  copy: string,
  scale: number,
): OccupancyRect {
  const lines = copy.split(/\n/).filter((line) => line.trim().length > 0);
  const longest = Math.max(1, ...lines.map((line) => line.length), 1);
  const font = Math.max(12, (Math.min(100, Math.max(0, scale)) / 100) * Math.min(width, height) * 0.22);
  const tw = Math.min(width * 0.82, font * longest * 0.58);
  const th = font * 1.15 * Math.max(1, lines.length);
  const inset = 0.07;
  const hx = anchor[1] === "l" ? 0 : anchor[1] === "r" ? 1 : 0.5;
  const hy = anchor[0] === "t" ? 0 : anchor[0] === "b" ? 1 : 0.5;
  const safeW = width * (1 - inset * 2);
  const safeH = height * (1 - inset * 2);
  const x = width * inset + (safeW - tw) * hx;
  const y = height * inset + (safeH - th) * hy;
  return { l: x, t: y, r: x + tw, b: y + th };
}

export function resolveInheritOccupancyAnchor(opts: {
  model: OccupancyModel;
  preferred: TypeAnchor;
  width: number;
  height: number;
  copy: string;
  scale: number;
  mark?: OccupancyMark;
  occupied?: OccupancyRect | null;
  measureType?: (anchor: TypeAnchor) => OccupancyRect;
}): TypeAnchor {
  const preferred = TYPE_ANCHORS.includes(opts.preferred) ? opts.preferred : "mc";
  if (opts.model === "current") return preferred;
  if (opts.model === "shared-datum") return sharedCompositionDatum(opts.width, opts.height);

  const signature = opts.occupied !== undefined
    ? opts.occupied
    : opts.mark
      ? signatureOccupiedRect(opts.width, opts.height, opts.mark)
      : null;
  if (!signature) return preferred;

  const order = occupancyCandidateOrder(preferred);
  let fallback = order[0]!;
  let fallbackOverlap = Number.POSITIVE_INFINITY;
  for (const candidate of order) {
    const type = opts.measureType
      ? opts.measureType(candidate)
      : estimateTypeRect(opts.width, opts.height, candidate, opts.copy, opts.scale);
    const overlap = overlapArea(signature, type);
    if (!materiallyCollides(signature, type)) return candidate;
    if (overlap < fallbackOverlap) {
      fallbackOverlap = overlap;
      fallback = candidate;
    }
  }
  return fallback;
}

export function resolveSequenceTypeAnchor(opts: {
  raw: TypeAnchor | "inherit";
  model?: OccupancyModel;
  preferred: TypeAnchor;
  width: number;
  height: number;
  copy: string;
  scale: number;
  mark?: OccupancyMark;
  occupied?: OccupancyRect | null;
  measureType?: (anchor: TypeAnchor) => OccupancyRect;
}): TypeAnchor {
  if (opts.raw !== "inherit") return opts.raw;
  return resolveInheritOccupancyAnchor({
    model: opts.model ?? "current",
    preferred: opts.preferred,
    width: opts.width,
    height: opts.height,
    copy: opts.copy,
    scale: opts.scale,
    mark: opts.mark,
    occupied: opts.occupied,
    measureType: opts.measureType,
  });
}
