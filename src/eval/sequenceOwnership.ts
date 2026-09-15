import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState } from "../core/typeState";
import { loadSwitzer } from "../core/typeFont";
import { variantIdForPair } from "../core/bloomPairVariant";

const W = 420;
const H = 525;
const THUMB_W = 168;
const THUMB_H = 210;
const LOCALS = [0.25, 0.5, 0.7, 0.8, 0.9];
const COPIES = ["Stay", "She turns", "Reserved", "Listen", "The room keeps\nthe last record playing"];

function scene(label: string, fill: string): MediaAsset {
  const c = document.createElement("canvas");
  c.width = 420;
  c.height = 525;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 420, 525);
  ctx.fillStyle = "#f3efe6";
  ctx.font = "48px sans-serif";
  ctx.fillText(label, 36, 80);
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

const root = document.getElementById("root")!;
const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
const renderer = new Renderer(canvas);
renderer.resizeExact(W, H);
renderer.setBehavior(bloomBehavior, bloomParams());
renderer.setPlaybackMode("loop");
renderer.setLoopSeconds(12);
renderer.setSequenceWeights([1, 1, 1, 1, 1]);
renderer.setSequence(
  [
    { id: "src-0", asset: scene("01", "#6a8a4a") },
    { id: "src-1", asset: scene("02", "#d8d2c8") },
    { id: "src-2", asset: scene("03", "#8a5a3a") },
    { id: "src-3", asset: scene("04", "#e8d8b8") },
    { id: "src-4", asset: scene("05", "#141418") },
  ],
  "src-0",
);
renderer.setTypeState(
  clampTypeState({
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: COPIES,
    blocks: [{ enabled: true, text: "", scale: 34, composition: "headline", textAlign: "center", anchor: "bc" }],
  }),
);

void loadSwitzer().then(() => {
  renderer.setClockMode("hold");
  const table = document.createElement("table");
  const head = document.createElement("tr");
  head.innerHTML = `<th>Pair</th>${LOCALS.map((l) => `<th>${l.toFixed(2)}</th>`).join("")}`;
  table.appendChild(head);
  for (let pair = 0; pair < 5; pair++) {
    const row = document.createElement("tr");
    const next = (pair + 1) % 5;
    const label = document.createElement("td");
    label.innerHTML = `0${pair + 1} → 0${next + 1}<br><span class="meta">var ${variantIdForPair(pair, 5)}</span>`;
    row.appendChild(label);
    for (const local of LOCALS) {
      renderer.setHoldPhase(Math.min(0.9999, pair / 5 + 0.02 / 5));
      renderer.setHoldPhase(Math.min(0.9999, pair / 5 + local / 5));
      const info = renderer.mediaInfo();
      const cell = document.createElement("td");
      const thumb = document.createElement("canvas");
      thumb.width = THUMB_W;
      thumb.height = THUMB_H;
      thumb.getContext("2d")!.drawImage(renderer.getVisibleCanvas(), 0, 0, THUMB_W, THUMB_H);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${info.ownership}  sem ${info.ownershipContribution.toFixed(2)}  vis ${info.visibleContribution.toFixed(2)}  i${info.ownershipCopyIndex}`;
      cell.appendChild(thumb);
      cell.appendChild(meta);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  root.appendChild(table);
});
