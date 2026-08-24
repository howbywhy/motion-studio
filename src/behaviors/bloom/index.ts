import type { MaskBehavior, ParamDef, ParamValues } from "../../core/types";
import { buildFields, computeResolvedFields, type BloomState, type ResolvedField } from "./fields";
import { renderMaskFromFields, renderBoundaryFromFields } from "./render";
import { paintClean, paintRefraction, paintRegistration } from "./treatments";
import { getImageAwareAttractors } from "./imageAware";

const treatmentOptions = [
  { value: "clean", label: "Clean" },
  { value: "refraction", label: "Refraction" },
  { value: "registration", label: "Registration" },
];

const params: ParamDef[] = [
  { type: "range", key: "fieldCount", label: "Field Count", min: 2, max: 7, step: 1, default: 4 },
  { type: "range", key: "fieldSize", label: "Field Size", min: 20, max: 80, step: 1, default: 42, unit: "%" },
  { type: "range", key: "softness", label: "Softness", min: 0, max: 100, step: 1, default: 75, unit: "%" },
  { type: "range", key: "drift", label: "Drift", min: 0, max: 40, step: 1, default: 12, unit: "%" },
  { type: "range", key: "overlap", label: "Overlap", min: 0, max: 100, step: 1, default: 65, unit: "%" },
  { type: "range", key: "revealAmount", label: "Reveal Amount", min: 0, max: 100, step: 1, default: 78, unit: "%" },
  { type: "range", key: "resolveAmount", label: "Resolve Amount", min: 0, max: 100, step: 1, default: 55, unit: "%" },
  { type: "range", key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, default: 1, unit: "×" },
  // Structural — not rendered in the generic sidebar panel; the UI gives
  // these their own compact controls (see visibleParams below).
  { type: "select", key: "treatment", label: "Treatment", default: "clean", options: treatmentOptions },
  {
    type: "select",
    key: "imageAware",
    label: "Image Aware",
    default: "off",
    options: [
      { value: "off", label: "Off" },
      { value: "on", label: "On" },
    ],
  },
  // Treatment-specific — shown only while that treatment is active.
  { type: "range", key: "refractionAmount", label: "Refraction Amount", min: 0, max: 100, step: 1, default: 45, unit: "%" },
  { type: "range", key: "registrationAmount", label: "Registration Amount", min: 0, max: 100, step: 1, default: 40, unit: "%" },
];

// Fields are computed once per frame in renderMask (which the renderer
// always calls first) and reused by renderBoundary/renderComposite — this
// is what guarantees the boundary ring and every treatment line up exactly
// with the mask that frame, and avoids recomputing field geometry 2-3x.
// Safe as module state: one Bloom instance exists per page.
let cachedFields: ResolvedField[] = [];

export const bloomBehavior: MaskBehavior<BloomState> = {
  id: "bloom",
  name: "Bloom",
  index: "02",
  description: "Localized atmospheric light fields drive where transformation happens; a treatment decides what happens inside them.",
  params,
  createState(p: ParamValues): BloomState {
    return { fields: buildFields(Math.round(p.fieldCount as number)) };
  },
  needsNewState(prev: ParamValues, next: ParamValues): boolean {
    return prev.fieldCount !== next.fieldCount;
  },
  visibleParams(p: ParamValues): ParamDef[] {
    return params.filter((d) => {
      if (d.key === "treatment" || d.key === "imageAware") return false;
      if (d.key === "refractionAmount") return p.treatment === "refraction";
      if (d.key === "registrationAmount") return p.treatment === "registration";
      return true;
    });
  },
  renderMask(ctx, width, height, time, p, state, bLayer): void {
    const softnessFrac = (p.softness as number) / 100;
    const attractors = p.imageAware === "on" && bLayer ? getImageAwareAttractors(bLayer) : null;
    cachedFields = computeResolvedFields(width, height, time, p, state, attractors);
    renderMaskFromFields(ctx, width, height, cachedFields, softnessFrac);
  },
  renderBoundary(ctx): void {
    renderBoundaryFromFields(ctx, cachedFields);
  },
  renderComposite(ctx, aLayer, bLayer, maskLayer, _boundaryLayer, width, height, _time, p): void {
    const treatment = p.treatment as string;
    if (treatment === "refraction") {
      paintRefraction(ctx, aLayer, bLayer, maskLayer, cachedFields, width, height, (p.refractionAmount as number) / 100);
    } else if (treatment === "registration") {
      paintRegistration(ctx, aLayer, bLayer, maskLayer, cachedFields, width, height, (p.registrationAmount as number) / 100);
    } else {
      paintClean(ctx, aLayer, bLayer, maskLayer, width, height);
    }
  },
};
