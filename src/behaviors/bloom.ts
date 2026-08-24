import { mulberry32, seededSeries } from "../core/rng";
import { clamp01 } from "../core/easing";
import type { MaskBehavior, ParamDef, ParamValues } from "../core/types";

const params: ParamDef[] = [
  { type: "range", key: "fieldCount", label: "Field Count", min: 2, max: 7, step: 1, default: 4 },
  { type: "range", key: "fieldSize", label: "Field Size", min: 20, max: 80, step: 1, default: 42, unit: "%" },
  { type: "range", key: "softness", label: "Softness", min: 0, max: 100, step: 1, default: 75, unit: "%" },
  { type: "range", key: "drift", label: "Drift", min: 0, max: 40, step: 1, default: 12, unit: "%" },
  { type: "range", key: "overlap", label: "Overlap", min: 0, max: 100, step: 1, default: 65, unit: "%" },
  { type: "range", key: "revealAmount", label: "Reveal Amount", min: 0, max: 100, step: 1, default: 78, unit: "%" },
  { type: "range", key: "resolveAmount", label: "Resolve Amount", min: 0, max: 100, step: 1, default: 55, unit: "%" },
  { type: "range", key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.05, default: 1, unit: "×" },
];

// Independent of speed/user control — the period of the shared "coalesce"
// sweep that Resolve Amount modulates. Kept off the control surface
// deliberately: Resolve Amount is the one dial for how far that sweep goes,
// not a second timing knob.
const RESOLVE_CYCLE_SECONDS = 11;

interface Lobe {
  angle: number; // radians, offset direction from field center
  distFrac: number; // fraction of field radius the lobe center sits from field center
  radiusMul: number; // lobe radius relative to field radius
}

interface BloomField {
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

interface BloomState {
  fields: BloomField[];
}

// Each field is a small cluster of overlapping soft lobes rather than a
// single circle — this is what keeps Bloom reading as an organic,
// irregular light field instead of "circles moving over an image".
function buildFields(count: number): BloomField[] {
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

export const bloomBehavior: MaskBehavior<BloomState> = {
  id: "bloom",
  name: "Bloom",
  index: "02",
  description: "Localized atmospheric light fields that drift, dim, and occasionally coalesce toward a full reveal before fragmenting apart again.",
  params,
  createState(p: ParamValues): BloomState {
    return { fields: buildFields(Math.round(p.fieldCount as number)) };
  },
  needsNewState(prev: ParamValues, next: ParamValues): boolean {
    return prev.fieldCount !== next.fieldCount;
  },
  renderMask(ctx, width, height, time, p, state): void {
    const fieldSizeFrac = (p.fieldSize as number) / 100;
    const softnessFrac = (p.softness as number) / 100;
    const driftFrac = (p.drift as number) / 100;
    const overlapFrac = (p.overlap as number) / 100;
    const revealFrac = (p.revealAmount as number) / 100;
    const resolveFrac = (p.resolveAmount as number) / 100;
    const speed = Math.max(0.01, p.speed as number);

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

    const extraBlur = (0.15 + softnessFrac * 0.85) * minDim * 0.045;
    ctx.filter = extraBlur > 0.5 ? `blur(${extraBlur}px)` : "none";
    ctx.globalCompositeOperation = "lighten";

    for (const field of state.fields) {
      // Pull base positions toward center as overlap increases, so fields
      // are more likely to intersect rather than sit in fixed isolated slots.
      const spread = 0.5 - 0.35 * overlapFrac;
      const baseX = 0.5 + (field.sx * 2 - 1) * spread;
      const baseY = 0.5 + (field.sy * 2 - 1) * spread;

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

      if (radius <= 0 || alpha <= 0.002) continue;

      const rotation = field.rotation + t * field.rotationSpeed;
      const innerStop = clamp01(1 - (0.35 + 0.65 * softnessFrac));

      for (const lobe of field.lobes) {
        const lobeAngle = lobe.angle + rotation;
        const lobeDist = lobe.distFrac * radius;
        const lx = cx + Math.cos(lobeAngle) * lobeDist;
        const ly = cy + Math.sin(lobeAngle) * lobeDist;
        const lr = radius * lobe.radiusMul;

        const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
        gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
        gradient.addColorStop(innerStop, `rgba(255,255,255,${alpha})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
  },
};
