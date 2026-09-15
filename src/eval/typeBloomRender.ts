import { bloomBehavior, lastBloomFieldMap } from "../behaviors/bloom";
import { renderMaskFromFields } from "../behaviors/bloom/render";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState } from "../core/typeState";
import { loadSwitzer } from "../core/typeFont";
import {
  lastTypeBloomPaintMs,
  paintSequenceTypeThroughBloom,
  type TypeBloomMatteKind,
} from "../core/sequenceType";

const W = 252;
const H = 315;
const PHASES = [0.5, 0.86, 0.88, 0.92];
const KINDS: TypeBloomMatteKind[] = ["current", "filtered", "higher", "safe"];
const LABELS: Record<TypeBloomMatteKind, string> = {
  current: "A Current 160",
  filtered: "B Filtered 160",
  higher: "C Higher 480",
  safe: "D Type-safe",
};

function scene(label: string, fill: string): MediaAsset {
  const c = document.createElement("canvas");
  c.width = 420;
  c.height = 525;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 420, 525);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "48px sans-serif";
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
  renderer.setClockMode("hold");
  return renderer;
}

function fieldMask(width: number, height: number): HTMLCanvasElement | null {
  const map = lastBloomFieldMap();
  if (!map) return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  renderMaskFromFields(ctx, width, height, map.fields, 0.75);
  return c;
}

const root = document.getElementById("root")!;
const renderer = makeRenderer();
const style = clampTypeState({
  enabled: true,
  typeMode: "sequence",
  sequenceCopies: ["She turns", "Listen"],
  blocks: [{ enabled: true, text: "", scale: 78, composition: "headline", textAlign: "center", anchor: "bc" }],
});

void loadSwitzer().then(() => {
  const table = document.createElement("table");
  const head = document.createElement("tr");
  head.innerHTML = `<th>Local</th>${KINDS.map((k) => `<th>${LABELS[k]}</th>`).join("")}`;
  table.appendChild(head);
  const timings: Record<string, number[]> = { current: [], filtered: [], higher: [], safe: [] };

  for (const local of PHASES) {
    renderer.setTypeState(clampTypeState({ enabled: false }));
    renderer.setHoldPhase(local * 0.5);
    const bare = document.createElement("canvas");
    bare.width = W;
    bare.height = H;
    bare.getContext("2d")!.drawImage(renderer.getVisibleCanvas(), 0, 0);
    const mask = fieldMask(W, H);
    const row = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = local.toFixed(2);
    row.appendChild(label);
    for (const kind of KINDS) {
      const shot = document.createElement("canvas");
      shot.width = W;
      shot.height = H;
      const ctx = shot.getContext("2d")!;
      ctx.drawImage(bare, 0, 0);
      if (mask) {
        paintSequenceTypeThroughBloom(
          ctx,
          W,
          H,
          style,
          ["She turns", "Listen"],
          0,
          2,
          mask,
          undefined,
          0.42,
          kind,
        );
        timings[kind]!.push(lastTypeBloomPaintMs);
      }
      const cell = document.createElement("td");
      cell.appendChild(shot);
      const ms = document.createElement("div");
      ms.className = "ms";
      ms.textContent = `${lastTypeBloomPaintMs.toFixed(2)} ms`;
      cell.appendChild(ms);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  const note = document.createElement("p");
  note.textContent = KINDS.map((k) => {
    const vals = timings[k] ?? [];
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    return `${LABELS[k]} mean ${mean.toFixed(2)} ms`;
  }).join(" · ");
  root.appendChild(table);
  root.appendChild(note);
});
