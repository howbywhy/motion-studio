/**
 * Visual + metric comparison before rebasing the Registration golden fixture.
 *
 * A = reconstructed wall-clock cache (unsampled default 150,150,150)
 * B = deterministic content-derived tint from source B
 *
 * The frozen JSON fixture has no pixel payload; A is the reconstructable
 * previous cache state. B is the new authority candidate.
 */
import fixture from "./fixtures/registration-golden.json";
import {
  CROPS,
  compareImageData,
  cropImage,
  lumaImageData,
  meanDelta,
  measureFrame,
  renderGoldenFrame,
  type CropName,
} from "./registrationGolden";

const LEGACY_TINT = { r: 150, g: 150, b: 150 };

function hfRatio(actual: number, expected: number): number {
  if (expected < 0.5) return actual < 1 ? 1 : actual;
  return actual / expected;
}

function hfOk(actual: number, expected: number): boolean {
  if (expected < 0.5) return actual < 1;
  const ratio = actual / expected;
  return ratio >= 0.92 && ratio <= 1.08;
}

function cell(parent: HTMLElement, label: string, img: ImageData): void {
  const wrap = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
}

function section(root: HTMLElement, title: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "grid";
  root.appendChild(grid);
  return grid;
}

export interface RegistrationRebaseReport {
  meanRgbDiff: { dr: number; dg: number; db: number; mean: number };
  maxRgbDiff: number;
  lumaMad: number;
  colorMad: number;
  textureStructureUnchanged: boolean;
  screenDensityUnchanged: boolean;
  contrastUnchanged: boolean;
  tintOnly: boolean;
  fixtureCloserTo: "legacyCache" | "deterministic" | "neither";
  acceptNewGolden: boolean;
  newFixture: unknown;
  elapsedMs: number;
  details: Record<string, unknown>;
}

export async function runRegistrationRebaseSheet(root: HTMLElement): Promise<RegistrationRebaseReport> {
  const t0 = performance.now();
  root.innerHTML = "";
  const p = document.createElement("p");
  p.textContent =
    "A reconstructs the old unsampled tint cache. B is the deterministic B-image sample. Grammar must match; only tint may move.";
  root.appendChild(p);

  const legacy = await renderGoldenFrame(false, 50, LEGACY_TINT);
  const live = await renderGoldenFrame(false);
  const liveMetrics = await measureFrame(live.image, live.paintMs);
  const legacyMetrics = await measureFrame(legacy.image, legacy.paintMs);

  const color = compareImageData(legacy.image, live.image);
  const luma = compareImageData(lumaImageData(legacy.image), lumaImageData(live.image));
  const meanVsLive = meanDelta(legacyMetrics.frame.mean, liveMetrics.frame.mean);
  const fixtureVsLive = meanDelta(fixture.frame.mean, liveMetrics.frame.mean);
  const fixtureVsLegacy = meanDelta(fixture.frame.mean, legacyMetrics.frame.mean);

  const crops: CropName[] = ["skin", "garment", "edge", "tonal"];
  const cropHf = Object.fromEntries(
    crops.map((name) => {
      const a = cropImage(legacy.image, CROPS[name]);
      const b = cropImage(live.image, CROPS[name]);
      const cmp = compareImageData(a, b);
      const lumaCmp = compareImageData(lumaImageData(a), lumaImageData(b));
      return [
        name,
        {
          colorMad: cmp.mad,
          maxAbs: cmp.maxAbs,
          lumaMad: lumaCmp.mad,
          hfLegacy: legacyMetrics.crops[name].hfEnergy,
          hfLive: liveMetrics.crops[name].hfEnergy,
          hfRatio: hfRatio(liveMetrics.crops[name].hfEnergy, legacyMetrics.crops[name].hfEnergy),
          hfOk: hfOk(liveMetrics.crops[name].hfEnergy, legacyMetrics.crops[name].hfEnergy),
          fixtureHfOk: hfOk(liveMetrics.crops[name].hfEnergy, fixture.crops[name].hfEnergy),
        },
      ];
    }),
  );

  const frameHfOk = hfOk(liveMetrics.frame.hfEnergy, legacyMetrics.frame.hfEnergy);
  const fixtureHfOk = hfOk(liveMetrics.frame.hfEnergy, fixture.frame.hfEnergy);
  const textureStructureUnchanged = frameHfOk && crops.every((n) => (cropHf[n] as { hfOk: boolean }).hfOk);
  const screenDensityUnchanged =
    Math.abs(liveMetrics.frame.hfEnergy - legacyMetrics.frame.hfEnergy) / Math.max(1, legacyMetrics.frame.hfEnergy) < 0.04;
  const fixtureWasLegacyCache = legacyMetrics.frame.sha256 === fixture.frame.sha256;
  const newGoldenMatchesLive = liveMetrics.frame.sha256 === fixture.frame.sha256;
  const fixtureCloserTo: "legacyCache" | "deterministic" | "neither" = newGoldenMatchesLive
    ? "deterministic"
    : fixtureWasLegacyCache
      ? "legacyCache"
      : "neither";
  const contrastUnchanged = luma.mad < 3;
  const tintOnly = textureStructureUnchanged && screenDensityUnchanged && contrastUnchanged && color.mad < 3;
  const acceptNewGolden = newGoldenMatchesLive && tintOnly && fixtureHfOk;

  const views: { label: string; crop?: { x: number; y: number; w: number; h: number } }[] = [
    { label: "whole frame" },
    { label: "high-detail", crop: CROPS.skin },
    { label: "mid-tone", crop: CROPS.tonal },
    { label: "dark", crop: CROPS.garment },
  ];
  const grid = section(root, "A legacy cache tint  ·  B deterministic B sample");
  for (const view of views) {
    const aImg = view.crop ? cropImage(legacy.image, view.crop) : legacy.image;
    const bImg = view.crop ? cropImage(live.image, view.crop) : live.image;
    cell(grid, `A ${view.label}`, aImg);
    cell(grid, `B ${view.label}`, bImg);
  }

  const newFixture = {
    width: liveMetrics.width,
    height: liveMetrics.height,
    amount: liveMetrics.amount,
    commit: liveMetrics.commit,
    paintMs: liveMetrics.paintMs,
    note: "Rebased: old fixture captured wall-clock-dependent cached tint. New fixture is content-derived deterministic tint from source B. Grammar unchanged (728ff08).",
    frame: liveMetrics.frame,
    crops: liveMetrics.crops,
  };

  return {
    meanRgbDiff: meanVsLive,
    maxRgbDiff: color.maxAbs,
    lumaMad: luma.mad,
    colorMad: color.mad,
    textureStructureUnchanged,
    screenDensityUnchanged,
    contrastUnchanged,
    tintOnly,
    fixtureCloserTo,
    acceptNewGolden,
    newFixture,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      fixtureMean: fixture.frame.mean,
      legacyMean: legacyMetrics.frame.mean,
      liveMean: liveMetrics.frame.mean,
      fixtureVsLive,
      fixtureVsLegacy,
      fixtureWasLegacyCache,
      newGoldenMatchesLive,
      legacySha: legacyMetrics.frame.sha256,
      fixtureSha: fixture.frame.sha256,
      cropHf,
      frameHf: {
        fixture: fixture.frame.hfEnergy,
        legacy: legacyMetrics.frame.hfEnergy,
        live: liveMetrics.frame.hfEnergy,
      },
    },
  };
}
