import { bloomBehavior } from "../behaviors/bloom";
import { lastBloomFieldMap } from "../behaviors/bloom";
import { renderMaskFromFields } from "../behaviors/bloom/render";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState } from "../core/typeState";
import { clampMarkState } from "../core/markState";
import { planMark } from "../core/markPlan";
import { paintMarkLayer } from "../core/markPaint";
import { loadSwitzer } from "../core/typeFont";

const W = 168;
const H = 210;
const PHASES = [0.04, 0.1, 0.5, 0.86, 0.94];

function scene(label: string, fill: string): MediaAsset {
  const c = document.createElement("canvas");
  c.width = 420;
  c.height = 525;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 420, 525);
  ctx.fillStyle = "#f3efe6";
  ctx.font = "42px sans-serif";
  ctx.fillText(label, 28, 72);
  return { kind: "image", source: c, naturalW: 420, naturalH: 525, label, transform: defaultTransform() };
}

function bloomParams() {
  const found = presetsForTreatment("clean").find((p) => p.label === "Balanced");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...(found?.values ?? {}),
    resolveLimit: 100,
  };
}

function makeRenderer(): Renderer {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const renderer = new Renderer(canvas);
  renderer.resizeExact(W, H);
  renderer.setBehavior(bloomBehavior, bloomParams());
  renderer.setPlaybackMode("loop");
  renderer.setLoopSeconds(12);
  renderer.setSequence(
    [
      { id: "src-0", asset: scene("01", "#6a8a4a") },
      { id: "src-1", asset: scene("02", "#d8d2c8") },
    ],
    "src-0",
  );
  renderer.setTypeState(
    clampTypeState({
      enabled: true,
      typeMode: "sequence",
      sequenceCopies: ["Stay", "She turns"],
      blocks: [{ enabled: true, text: "", scale: 34, composition: "headline", textAlign: "center", anchor: "bc" }],
    }),
  );
  renderer.setMarkState(clampMarkState({ enabled: true, mode: "intro", scale: 42 }));
  renderer.setClockMode("hold");
  return renderer;
}

function paintBloomRelated(src: HTMLCanvasElement, renderer: Renderer): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const map = lastBloomFieldMap();
  const mark = planMark(renderer.getMarkState(), renderer.getPhase(), W, H, renderer.getLoopSeconds());
  if (!mark.visible || !map) return out;
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext("2d")!;
  paintMarkLayer(lctx, mark);
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const mctx = mask.getContext("2d")!;
  renderMaskFromFields(mctx, W, H, map.fields, 0.75);
  lctx.globalCompositeOperation = "destination-in";
  lctx.drawImage(mask, 0, 0);
  ctx.drawImage(layer, 0, 0);
  return out;
}

function flickerOn(renderer: Renderer): boolean {
  const d = renderer.lastTransitionDiagnostics;
  return !!d && d.envelope > 0.08;
}

const root = document.getElementById("root")!;
const renderer = makeRenderer();

void loadSwitzer().then(() => {
  const table = document.createElement("table");
  const head = document.createElement("tr");
  head.innerHTML = "<th>Phase</th><th>A Current</th><th>B Bloom</th><th>C Flicker</th><th>D Bloom+Flicker</th>";
  table.appendChild(head);
  for (const phase of PHASES) {
    renderer.setMarkState(clampMarkState({ enabled: true, mode: "intro", scale: 42 }));
    renderer.setHoldPhase(phase);
    const live = renderer.getVisibleCanvas();
    const currentShot = document.createElement("canvas");
    currentShot.width = W;
    currentShot.height = H;
    currentShot.getContext("2d")!.drawImage(live, 0, 0);
    renderer.setMarkState(clampMarkState({ enabled: false, mode: "intro", scale: 42 }));
    renderer.setHoldPhase(phase);
    const bare = document.createElement("canvas");
    bare.width = W;
    bare.height = H;
    bare.getContext("2d")!.drawImage(renderer.getVisibleCanvas(), 0, 0);
    renderer.setMarkState(clampMarkState({ enabled: true, mode: "intro", scale: 42 }));
    const row = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = phase.toFixed(2);
    row.appendChild(label);
    const current = currentShot;
    const bloom = paintBloomRelated(bare, renderer);
    const flicker = document.createElement("canvas");
    flicker.width = W;
    flicker.height = H;
    const fctx = flicker.getContext("2d")!;
    fctx.drawImage(flickerOn(renderer) ? currentShot : bare, 0, 0);
    const both = document.createElement("canvas");
    both.width = W;
    both.height = H;
    both.getContext("2d")!.drawImage(bloom, 0, 0);
    for (const canvas of [current, bloom, flicker, both]) {
      const cell = document.createElement("td");
      cell.appendChild(canvas);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  root.appendChild(table);
});
