import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeState } from "../core/typeState";
import { layoutTypeDocument } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

function state(): TypeState {
  return clampTypeState({
    enabled: true,
    typeSequenceMode: "stagger",
    typeSequencePace: 12,
    arrangement: "between-v",
    blocks: [
      { enabled: true, text: mbmById("coming-soon").text, composition: "headline", scale: 100, anchor: "bl", color: "#f3efe6" },
      { enabled: true, text: mbmById("date-md").text, composition: "footnote", scale: 100, anchor: "tr", color: "#f3efe6" },
    ],
  });
}

function paint(type: TypeState, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1a120e";
  ctx.fillRect(0, 0, w, h);
  const laid = layoutTypeDocument(type, w, h);
  for (const item of laid) paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  return c;
}

function pixelDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) {
    if (da[i] !== db[i]) n += 1;
  }
  return n;
}

export interface SequenceReport {
  staticAcrossPhase: { phase: number; diff: number; match: boolean }[];
  legacyFieldsIgnored: boolean;
  elapsedMs: number;
  fail: number;
}

export async function runTypeSequence(root: HTMLElement): Promise<SequenceReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");
  const t0 = performance.now();
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "MBM type identity";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Typography is static. Paint must be identical at every loop phase. Old sequence fields must have no effect.";
  root.appendChild(lead);

  const type = state();
  const phases = [0, 0.12, 0.37, 0.62, 0.91];
  const baseline = paint(type, 500, 625);
  const base = baseline.getContext("2d")!.getImageData(0, 0, 500, 625);
  const row = document.createElement("div");
  row.className = "page-row";
  root.appendChild(row);

  const staticAcrossPhase: SequenceReport["staticAcrossPhase"] = [];
  for (const phase of phases) {
    const wrap = document.createElement("figure");
    const canvas = paint(type, 500, 625);
    const diff = pixelDiff(base, canvas.getContext("2d")!.getImageData(0, 0, 500, 625));
    const cap = document.createElement("figcaption");
    cap.textContent = `p${phase} · Δ${diff}`;
    wrap.appendChild(canvas);
    wrap.appendChild(cap);
    row.appendChild(wrap);
    staticAcrossPhase.push({ phase, diff, match: diff === 0 });
  }

  const clean = clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, text: mbmById("coming-soon").text, composition: "headline", scale: 100, anchor: "bl", color: "#f3efe6" },
      { enabled: true, text: mbmById("date-md").text, composition: "footnote", scale: 100, anchor: "tr", color: "#f3efe6" },
    ],
  });
  const withLegacy = paint(type, 500, 625);
  const withoutLegacy = paint(clean, 500, 625);
  const legacyDiff = pixelDiff(
    withLegacy.getContext("2d")!.getImageData(0, 0, 500, 625),
    withoutLegacy.getContext("2d")!.getImageData(0, 0, 500, 625),
  );

  return {
    staticAcrossPhase,
    legacyFieldsIgnored: legacyDiff === 0,
    elapsedMs: Math.round(performance.now() - t0),
    fail: staticAcrossPhase.filter((p) => !p.match).length + (legacyDiff === 0 ? 0 : 1),
  };
}
