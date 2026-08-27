import { mbmById } from "./mbmCopy";
import {
  clampTypeState,
  TYPE_BLEND_MODES,
  type TypeBlock,
  type TypeState,
} from "../core/typeState";
import { layoutTypeDocument, typeGeometryKey } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

function photoGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#6a3f2c");
  g.addColorStop(0.42, "#8a5a3a");
  g.addColorStop(1, "#2c1810");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function block(a: Partial<TypeBlock>, b?: Partial<TypeBlock>): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, color: "#f3efe6", ...a },
      b ? { enabled: true, color: "#f3efe6", ...b } : { enabled: false, text: "", composition: "paragraph" },
    ],
  });
}

function paint(state: TypeState, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  photoGround(ctx, w, h);
  const laid = layoutTypeDocument(state, w, h);
  for (const item of laid) paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  return c;
}

function pixelDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n += 1;
  return n;
}

function cell(parent: HTMLElement, label: string, canvas: HTMLCanvasElement): void {
  const wrap = document.createElement("figure");
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
}

export interface BlendReport {
  geometryNormal: string;
  geometryDifference: string;
  geometryUnchangedByBlend: boolean;
  normalDeterministic: boolean;
  previewExportMatch: boolean;
  elapsedMs: number;
}

export async function runTypeBlend(root: HTMLElement): Promise<BlendReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");
  const t0 = performance.now();
  root.innerHTML = "";
  const title = document.createElement("h1");
  title.textContent = "MBM type blend";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Paint only. Geometry must not change with blend. Normal is source-over.";
  root.appendChild(lead);

  const headline: Partial<TypeBlock> = {
    text: "09.07\n2026",
    composition: "headline",
    scale: 80,
    distribution: "between",
    anchor: "mc",
    textAlign: "center",
    color: "#f3efe6",
  };

  const h2 = document.createElement("h2");
  h2.textContent = "White headline · six blends";
  root.appendChild(h2);
  const row = document.createElement("div");
  row.className = "page-row";
  root.appendChild(row);
  for (const mode of TYPE_BLEND_MODES) {
    const state = block({ ...headline, blendMode: mode });
    cell(row, mode, paint(state, 280, 350));
  }

  const h3 = document.createElement("h2");
  h3.textContent = "Editorial mixed page";
  root.appendChild(h3);
  const mixed = document.createElement("div");
  mixed.className = "page-row";
  root.appendChild(mixed);
  const mixedState = block(
    { ...headline, blendMode: "difference", scale: 80, anchor: "mc" },
    {
      text: mbmById("kelly").text,
      composition: "paragraph",
      scale: 40,
      column: "medium",
      anchor: "bl",
      blendMode: "normal",
      color: "#f3efe6",
    },
  );
  cell(mixed, "4:5 Difference + Normal", paint(mixedState, 400, 500));
  cell(mixed, "9:16 Difference + Normal", paint(mixedState, 288, 512));

  const extra = document.createElement("h2");
  extra.textContent = "Colour × blend";
  root.appendChild(extra);
  const extras = document.createElement("div");
  extras.className = "page-row";
  root.appendChild(extras);
  cell(extras, "black · Screen", paint(block({ ...headline, color: "#111111", blendMode: "screen" }), 240, 300));
  cell(extras, "gold · Multiply", paint(block({ ...headline, color: "#c4a574", blendMode: "multiply" }), 240, 300));
  cell(extras, "white · Exclusion", paint(block({ ...headline, blendMode: "exclusion" }), 240, 300));

  const geoNormal = typeGeometryKey(block({ ...headline, blendMode: "normal" }), 500, 625);
  const geoDiff = typeGeometryKey(block({ ...headline, blendMode: "difference" }), 500, 625);
  const a = paint(block({ ...headline, blendMode: "normal" }), 500, 625);
  const b = paint(block({ ...headline, blendMode: "normal" }), 500, 625);
  const previewPlan = layoutTypeDocument(mixedState, 500, 625).map((i) => i.layout.lines.map((l) => l.text).join("|")).join("\n");
  const exportPlan = layoutTypeDocument(mixedState, 1080, 1350).map((i) => i.layout.lines.map((l) => l.text).join("|")).join("\n");

  return {
    geometryNormal: geoNormal,
    geometryDifference: geoDiff,
    geometryUnchangedByBlend: geoNormal === geoDiff,
    normalDeterministic: pixelDiff(a.getContext("2d")!.getImageData(0, 0, 500, 625), b.getContext("2d")!.getImageData(0, 0, 500, 625)) === 0,
    previewExportMatch: previewPlan === exportPlan,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
