import { mulberry32, seededSeries } from "../../core/rng";
import { clamp01 } from "../../core/easing";
import type { ParamValues } from "../../core/types";

// Independent of speed/user control — the period of the shared "coalesce"
// sweep that Resolve Amount modulates. Kept off the control surface
// deliberately: Resolve Amount is the one dial for how far that sweep goes,
// not a second timing knob.
export const RESOLVE_CYCLE_SECONDS = 11;

export interface Lobe {
  angle: number; // radians, offset direction from field center
  distFrac: number; // fraction of field radius the lobe center sits from field center
  radiusMul: number; // lobe radius relative to field radius
}

export interface BloomField {
  sx: number; // seeded base x/y in 0..1
  sy: number;
  freqX: number;
  freqY: number;
  phase: number;
  localFreq: number; // each field breathes (dims/brightens) at its own rate
  localPhase: number; // and its own offset, so none of them are locked together
  rotation: number; // slow independent rotation for the lobe cluster
  rotationSpeed: number;
  lobes: Lobe[];
}

export interface BloomState {
  fields: BloomField[];
}

/** A single field fully resolved for one frame — this is the shared spatial
 * information the whole Bloom system (mask, boundary, and every treatment)
 * is built from. `alpha` and `innerStop` describe the field's own reveal
 * gradient (same shape the mask paints); a treatment reads `cx/cy/radius`
 * to know where its own effect should be centered and how far it reaches,
 * and `alpha` to know how "active" the field currently is (so effects fade
 * out exactly when the field does, never lingering). */
export interface ResolvedField {
  cx: number;
  cy: number;
  radius: number;
  alpha: number;
  innerStop: number; // 0..1 — where the reveal gradient's falloff begins
  rotation: number;
  lobes: Lobe[];
}

// Each field is a small cluster of overlapping soft lobes rather than a
// single circle — this is what keeps Bloom reading as an organic,
// irregular light field instead of "circles moving over an image".
export function buildFields(count: number): BloomField[] {
  const seeds = seededSeries(count * 7919 + 17, count);
  return seeds.map(([a, b, c, d, e, f], i) => {
    const rand = mulberry32(count * 104729 + i * 7919 + 3);
    const lobeCount = 3 + Math.floor(rand() * 3); // 3-5 lobes per field
    const lobes: Lobe[] = [];
    for (let j = 0; j < lobeCount; j++) {
      lobes.push({
        angle: rand() * Math.PI * 2,
        distFrac: 0.15 + rand() * 0.4,
        radiusMul: 0.55 + rand() * 0.4,
      });
    }
    return {
      sx: a,
      sy: b,
      freqX: 0.3 + c * 0.7,
      freqY: 0.3 + d * 0.7,
      phase: e * Math.PI * 2,
      localFreq: 0.035 + rand() * 0.07,
      localPhase: f,
      rotation: rand() * Math.PI * 2,
      rotationSpeed: 0.05 + rand() * 0.08,
      lobes,
    };
  });
}

export interface Attractor {
  x: number; // normalized 0..1
  y: number;
  weight: number; // 0..1
}

/** Resolves every field's geometry for the current frame. This is the one
 * place field motion/envelope math lives — renderMask, renderBoundary, and
 * every treatment all call this instead of recomputing it their own way. */
export function computeResolvedFields(
  width: number,
  height: number,
  time: number,
  params: ParamValues,
  state: BloomState,
  attractors: Attractor[] | null
): ResolvedField[] {
  const fieldSizeFrac = (params.fieldSize as number) / 100;
  const softnessFrac = (params.softness as number) / 100;
  const driftFrac = (params.drift as number) / 100;
  const overlapFrac = (params.overlap as number) / 100;
  const revealFrac = (params.revealAmount as number) / 100;
  const resolveFrac = (params.resolveAmount as number) / 100;
  const speed = Math.max(0.01, params.speed as number);

  const minDim = Math.min(width, height);
  const baseRadius = minDim * fieldSizeFrac * 0.5;
  const t = time * speed;

  // A slow, shared sweep — mostly near zero (fields stay independent and
  // isolated) with a brief shared peak where Resolve Amount pulls fields
  // toward expanding, merging, and approaching a full reveal together,
  // before they fall back apart. This is the one place fields move in
  // sync; everywhere else they're deliberately not.
  const resolvePeriod = RESOLVE_CYCLE_SECONDS / speed;
  const resolvePhase = (t % resolvePeriod) / resolvePeriod;
  const globalSweep = Math.pow(Math.sin(Math.PI * resolvePhase), 2.2);
  const peakAmount = resolveFrac * globalSweep;
  const innerStop = clamp01(1 - (0.35 + 0.65 * softnessFrac));

  return state.fields.map((field) => {
    const spread = 0.5 - 0.35 * overlapFrac;
    let baseX = 0.5 + (field.sx * 2 - 1) * spread;
    let baseY = 0.5 + (field.sy * 2 - 1) * spread;

    if (attractors && attractors.length > 0) {
      // Image Aware: pull the position the field drifts AROUND toward
      // whichever attractor is closest, blended rather than snapped — the
      // field still drifts with its own sinusoidal motion on top of this,
      // it just wanders around a photograph-influenced point instead of a
      // purely arbitrary one.
      let nearest = attractors[0];
      let bestD = Infinity;
      for (const a of attractors) {
        const d = (a.x - baseX) ** 2 + (a.y - baseY) ** 2;
        if (d < bestD) {
          bestD = d;
          nearest = a;
        }
      }
      const pull = 0.55 * nearest.weight;
      baseX = baseX + (nearest.x - baseX) * pull;
      baseY = baseY + (nearest.y - baseY) * pull;
    }

    const dx = driftFrac * width * Math.sin(t * field.freqX * 0.35 + field.phase);
    const dy = driftFrac * height * Math.cos(t * field.freqY * 0.35 + field.phase * 1.3);

    const cx = baseX * width + dx;
    const cy = baseY * height + dy;

    // Each field's own dim/bright cycle, at its own frequency and phase —
    // deliberately not locked to any other field, so some are near their
    // trough (almost gone) while others are near their own peak.
    const localCycle = (t * field.localFreq + field.localPhase) % 1;
    const localE = Math.sin(Math.PI * localCycle); // 0 -> 1 -> 0, can reach fully 0

    const radius = baseRadius * (1 + 0.15 * localE) * (1 + peakAmount * 1.8);
    const alpha = revealFrac * clamp01(localE * (1 - peakAmount) + peakAmount);
    const rotation = field.rotation + t * field.rotationSpeed;

    return { cx, cy, radius, alpha, innerStop, rotation, lobes: field.lobes };
  });
}
