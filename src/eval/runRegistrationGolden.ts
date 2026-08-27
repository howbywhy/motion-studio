import fixture from "./fixtures/registration-golden.json";
import {
  CROPS,
  canvasToImageData,
  evaluateAgainstFixture,
  measureFrame,
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

const { canvas, image, paintMs } = await renderGoldenFrame(false);
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

window.__REGISTRATION_GOLDEN_RESULT__ = { capturing, result, metrics, fixture, crops: CROPS };

status.className = result.ok || capturing ? "ok" : "fail";
status.textContent = capturing
  ? `CAPTURE  paint ${paintMs.toFixed(1)}ms — write fixture from metrics`
  : result.ok
    ? `PASS  paint ${paintMs.toFixed(1)}ms  PNG exact=${result.pngExact}  WebP texture=${result.webpTextureVisible}`
    : `FAIL  ${result.failures.join(" | ")}`;
out.textContent = JSON.stringify({ capturing, result, metrics }, null, 2);
