export type ParamValue = number | string;

export interface RangeParamDef {
  type: "range";
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface SelectParamDef {
  type: "select";
  key: string;
  label: string;
  options: { value: string; label: string }[];
  default: string;
}

export type ParamDef = RangeParamDef | SelectParamDef;

export type ParamValues = Record<string, ParamValue>;

export function defaultParamValues(defs: ParamDef[]): ParamValues {
  const out: ParamValues = {};
  for (const d of defs) out[d.key] = d.default;
  return out;
}

/**
 * A mask behavior renders an alpha mask (white = reveal Image B, transparent
 * = show Image A) into the provided canvas context. It never touches image
 * pixels directly — the renderer composites B through the mask using
 * destination-in, then draws the result over A. This is what keeps the mask
 * behavior fully decoupled from the images themselves, so new behaviors can
 * be added without touching the compositor.
 */
export interface MaskBehavior<TState = unknown> {
  id: string;
  name: string;
  index: string; // "01", "02", ...
  description: string;
  params: ParamDef[];
  /** Called once when the behavior becomes active, or when a seed-affecting
   *  param changes (e.g. field/slab count). Used to derive stable per-region
   *  randomness so tweaking unrelated sliders doesn't reshuffle layout. */
  createState(params: ParamValues): TState;
  /** Returns true if changing from `prev` to `next` params requires a fresh
   *  state (e.g. count changed) vs. just continuing to animate. */
  needsNewState(prev: ParamValues, next: ParamValues): boolean;
  renderMask(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    params: ParamValues,
    state: TState
  ): void;
}
