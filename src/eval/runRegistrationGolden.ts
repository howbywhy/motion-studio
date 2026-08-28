import fixture from "./fixtures/registration-golden.json";
import {
  CROPS,
  canvasToImageData,
  compareImageData,
  evaluateAgainstFixture,
  measureFrame,
  renderCleanOnlyFrame,
  renderGoldenFrame,
} from "./registrationGolden";

declare global {
  interface Window {
    __REGISTRATION_GOLDEN_RESULT__?: unknown;
  }
}

const status = document.getElementById("status")!;
const out = document.getElementById("out")!;
const frames = document.getElementById("frames")!;

void (async () => {
const { canvas, image, paintMs } = await renderGoldenFrame(false);
const omitted = await renderGoldenFrame(false);
const atDefault = await renderGoldenFrame(false, 50);
const atZero = await renderGoldenFrame(false, 0);
const cleanOnly = await renderCleanOnlyFrame();
const defaultIdentical = compareImageData(omitted.image, atDefault.image);
const zeroIsOff = compareImageData(atZero.image, cleanOnly);
if (defaultIdentical.mad !== 0 || defaultIdentical.maxAbs !== 0) {
  throw new Error("Amount 50 is not pixel-identical to omitted golden-master paint");
}
if (zeroIsOff.mad !== 0 || zeroIsOff.maxAbs !== 0) {
  throw new Error("Amount 0 is not pixel-identical to Registration skipped");
}
frames.appendChild(canvas);
const metrics = await measureFrame(image, paintMs);

const png = await canvasToImageData(canvas, "image/png");
let webpHf: number | null = null;
try {
  const webp = await canvasToImageData(canvas, "image/webp", 0.92);
  webpHf = (await measureFrame(webp, 0)).frame.hfEnergy;
} catch (e) {
  console.warn("webp encode skipped", e);
}

const capturing = fixture.frame.sha256 === "PENDING";
const result = capturing
  ? { ok: true, failures: ["CAPTURE"], metrics, pngExact: true, webpTextureVisible: true, typeDoesNotMutate: true }
  : evaluateAgainstFixture(metrics, fixture, image, png, webpHf);

window.__REGISTRATION_GOLDEN_RESULT__ = {
  capturing,
  result,
  metrics,
  fixture,
  crops: CROPS,
  amountIdentity: {
    defaultIsGolden: defaultIdentical.mad === 0 && defaultIdentical.maxAbs === 0,
    zeroIsOff: zeroIsOff.mad === 0 && zeroIsOff.maxAbs === 0,
  },
};

status.className = result.ok || capturing ? "ok" : "fail";
status.textContent = capturing
  ? `CAPTURE  paint ${paintMs.toFixed(1)}ms — write fixture from metrics`
  : result.ok
    ? `PASS  paint ${paintMs.toFixed(1)}ms  PNG exact=${result.pngExact}  WebP texture=${result.webpTextureVisible}`
    : `FAIL  ${result.failures.join(" | ")}`;
out.textContent = JSON.stringify({ capturing, result, metrics }, null, 2);
})().catch((e) => {
  status.className = "fail";
  status.textContent = e instanceof Error ? e.message : String(e);
});
