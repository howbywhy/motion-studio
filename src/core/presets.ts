import type { ParamValues } from "./types";

/** Curated starting points, not arbitrary technical defaults. Scoped per
 * expression/treatment (Diffuse, Slice, Bloom/Clean, Bloom/Refraction,
 * Bloom/Registration). Drift presets are retained so a saved state whose
 * treatment is still `"drift"` can match Restrained/Balanced/Expressive
 * without being rewritten — Drift is hidden from the selector, not deleted.
 *
 * "Balanced" is always exactly the existing, already-tuned default for
 * that treatment — these presets never alter the underlying behavior, only
 * pick different points along its existing parameter space. Deliberately
 * sparse (3 per treatment): Restrained, Balanced, Expressive. */
export interface Preset {
  id: string;
  label: string;
  values: ParamValues;
}

const shiftBase = { direction: 18 };

// Fragment is held close to Balanced's value across all three tiers here,
// deliberately -- Slice's event-clustering means a LOW fragment count
// produces fewer, larger bands that read as a bolder photographic streak,
// not a calmer one, so swinging Fragment hard between tiers (as the other
// behaviors do) actually inverted Restrained/Expressive: the old preset
// numbers made "Restrained" look more dramatic than "Expressive" at their
// own maximums. Overlap/Spread/Rhythm/Speed still scale monotonically with
// perceived intensity, so those carry the restrained-to-expressive range.
const SLICE: Preset[] = [
  { id: "slice-restrained", label: "Restrained", values: { ...shiftBase, fragment: 35, spread: 45, overlap: 18, rhythm: 15, speed: 0.55 } },
  { id: "slice-balanced", label: "Balanced", values: { ...shiftBase, fragment: 40, spread: 72, overlap: 42, rhythm: 28, speed: 0.8 } },
  { id: "slice-expressive", label: "Expressive", values: { ...shiftBase, fragment: 45, spread: 92, overlap: 85, rhythm: 50, speed: 1.15 } },
];

const DRIFT: Preset[] = [
  { id: "drift-restrained", label: "Restrained", values: { ...shiftBase, fragment: 25, spread: 55, overlap: 20, rhythm: 15, speed: 0.6 } },
  { id: "drift-balanced", label: "Balanced", values: { ...shiftBase, fragment: 40, spread: 72, overlap: 42, rhythm: 28, speed: 0.8 } },
  { id: "drift-expressive", label: "Expressive", values: { ...shiftBase, fragment: 60, spread: 85, overlap: 80, rhythm: 50, speed: 1.0 } },
];

const DIFFUSE: Preset[] = [
  { id: "diffuse-restrained", label: "Restrained", values: { ...shiftBase, fragment: 20, spread: 50, overlap: 25, rhythm: 15, speed: 0.6 } },
  { id: "diffuse-balanced", label: "Balanced", values: { ...shiftBase, fragment: 40, spread: 72, overlap: 42, rhythm: 28, speed: 0.8 } },
  { id: "diffuse-expressive", label: "Expressive", values: { ...shiftBase, fragment: 70, spread: 90, overlap: 75, rhythm: 45, speed: 1.0 } },
];

const bloomBase = { fieldCount: 4 };

const BLOOM_CLEAN: Preset[] = [
  {
    id: "bloom-clean-restrained",
    label: "Restrained",
    values: { fieldCount: 3, fieldSize: 35, softness: 85, drift: 6, overlap: 45, revealAmount: 55, resolveAmount: 40, resolveLimit: 100, speed: 0.7 },
  },
  {
    id: "bloom-clean-balanced",
    label: "Balanced",
    values: { ...bloomBase, fieldSize: 42, softness: 75, drift: 12, overlap: 65, revealAmount: 78, resolveAmount: 55, resolveLimit: 100, speed: 1.0 },
  },
  {
    id: "bloom-clean-expressive",
    label: "Expressive",
    values: { fieldCount: 6, fieldSize: 55, softness: 60, drift: 22, overlap: 85, revealAmount: 95, resolveAmount: 75, resolveLimit: 100, speed: 1.4 },
  },
];

const BLOOM_REFRACTION: Preset[] = [
  {
    id: "bloom-refraction-restrained",
    label: "Restrained",
    values: {
      fieldCount: 3,
      fieldSize: 35,
      softness: 85,
      drift: 6,
      overlap: 45,
      revealAmount: 55,
      resolveAmount: 40,
      resolveLimit: 100,
      speed: 0.7,
      refractionAmount: 25,
    },
  },
  {
    id: "bloom-refraction-balanced",
    label: "Balanced",
    values: {
      ...bloomBase,
      fieldSize: 42,
      softness: 75,
      drift: 12,
      overlap: 65,
      revealAmount: 78,
      resolveAmount: 55,
      resolveLimit: 100,
      speed: 1.0,
      refractionAmount: 45,
    },
  },
  {
    id: "bloom-refraction-expressive",
    label: "Expressive",
    values: {
      fieldCount: 6,
      fieldSize: 55,
      softness: 60,
      drift: 22,
      overlap: 85,
      revealAmount: 95,
      resolveAmount: 75,
      resolveLimit: 100,
      speed: 1.4,
      refractionAmount: 75,
    },
  },
];

const BLOOM_REGISTRATION: Preset[] = [
  {
    id: "bloom-registration-restrained",
    label: "Restrained",
    values: {
      fieldCount: 3,
      fieldSize: 35,
      softness: 85,
      drift: 6,
      overlap: 45,
      revealAmount: 55,
      resolveAmount: 40,
      resolveLimit: 100,
      speed: 0.7,
      registrationAmount: 20,
    },
  },
  {
    id: "bloom-registration-balanced",
    label: "Balanced",
    values: {
      ...bloomBase,
      fieldSize: 42,
      softness: 75,
      drift: 12,
      overlap: 65,
      revealAmount: 78,
      resolveAmount: 55,
      resolveLimit: 100,
      speed: 1.0,
      registrationAmount: 40,
    },
  },
  {
    id: "bloom-registration-expressive",
    label: "Expressive",
    values: {
      fieldCount: 6,
      fieldSize: 55,
      softness: 60,
      drift: 22,
      overlap: 85,
      revealAmount: 95,
      resolveAmount: 75,
      resolveLimit: 100,
      speed: 1.4,
      registrationAmount: 75,
    },
  },
];

const PRESETS_BY_TREATMENT: Record<string, Preset[]> = {
  slice: SLICE,
  drift: DRIFT,
  diffuse: DIFFUSE,
  clean: BLOOM_CLEAN,
  refraction: BLOOM_REFRACTION,
  registration: BLOOM_REGISTRATION,
};

export function presetsForTreatment(treatment: string): Preset[] {
  return PRESETS_BY_TREATMENT[treatment] ?? [];
}

/** Finds a preset (within the given treatment's list) whose values are an
 * exact match for `values` on every key the preset declares — used to
 * decide whether the current param state should show as a named preset or
 * as Custom. Editing any control after loading a preset moves at least one
 * key off the preset's value, so this naturally falls through to Custom
 * without needing to track "was this edited" separately. */
export function matchingPreset(treatment: string, values: ParamValues): Preset | null {
  const presets = presetsForTreatment(treatment);
  for (const preset of presets) {
    const isMatch = Object.entries(preset.values).every(([k, v]) => values[k] === v);
    if (isMatch) return preset;
  }
  return null;
}
