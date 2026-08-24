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
 * = show Image A) into the provided canvas context. By default the renderer
 * composites B through that mask using destination-in and draws the result
 * over A, which keeps a simple behavior (Slabs) fully decoupled from the
 * images themselves. A behavior that needs to do more than reveal/hide — a
 * treatment that reshapes pixels near the mask's own boundary — can opt into
 * `renderComposite` to take over final compositing directly, and
 * `renderBoundary` to expose a second spatial field (proximity to the
 * moving edge, not just inside/outside) for that treatment to use. Both are
 * optional so existing simple behaviors need no changes.
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
  /** The reveal field: white/alpha = B visible, transparent = A visible.
   *  Always computed, every frame, regardless of treatment — it's what the
   *  Show Mask diagnostic displays. `bLayer` (the top media, already
   *  cover-fit into a same-size canvas) is passed through for behaviors
   *  that want to sample the actual photograph (e.g. Image Aware). */
  renderMask(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    params: ParamValues,
    state: TState,
    bLayer?: CanvasImageSource
  ): void;
  /** Returns the subset of `params` that should currently render as controls
   *  — e.g. a treatment-specific slider only when that treatment is active.
   *  Omit to always show every declared param. */
  visibleParams?(params: ParamValues): ParamDef[];
  /** A second spatial field: proximity to the mask's own moving boundary
   *  (near zero deep inside or outside the reveal, peaking at the edge).
   *  Optional — only behaviors with a boundary-driven treatment define it. */
  renderBoundary?(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    params: ParamValues,
    state: TState
  ): void;
  /** When present, the renderer delegates final on-screen compositing here
   *  instead of the generic destination-in path — the behavior draws A, B,
   *  and however it wants to combine them using the mask/boundary layers it
   *  already computed this frame. */
  renderComposite?(
    ctx: CanvasRenderingContext2D,
    aLayer: HTMLCanvasElement,
    bLayer: HTMLCanvasElement,
    maskLayer: HTMLCanvasElement,
    boundaryLayer: HTMLCanvasElement | null,
    width: number,
    height: number,
    time: number,
    params: ParamValues,
    state: TState
  ): void;
}
