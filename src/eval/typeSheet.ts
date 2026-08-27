import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeAlign, type TypeComposition, type TypeState, type TypeValign } from "../core/typeState";
import { layoutTypography, opticalFramePx } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const ASPECTS: { id: string; w: number; h: number }[] = [
  { id: "4:5", w: 500, h: 625 },
  { id: "9:16", w: 360, h: 640 },
];

interface SheetCase {
  copyId: string;
  composition: TypeComposition;
  align?: TypeAlign;
  valign?: TypeValign;
  scale?: number;
  spacing?: number;
  weight?: number;
  note?: string;
}

/** Each mode's useful territory — not a cartesian product of every phrase. */
const HEADLINE_CASES: SheetCase[] = [
  { copyId: "new", composition: "headline", scale: 50 },
  { copyId: "coming-soon", composition: "headline", scale: 50 },
  { copyId: "coming-soon", composition: "headline", scale: 75, note: "overscan" },
  { copyId: "coming-soon", composition: "headline", align: "left", valign: "top", scale: 50 },
  { copyId: "coming-soon-break", composition: "headline", scale: 50 },
  { copyId: "name", composition: "headline", scale: 50 },
  { copyId: "name-break", composition: "headline", scale: 50 },
  { copyId: "redy-break", composition: "headline", scale: 50 },
  { copyId: "flawed-break", composition: "headline", scale: 50 },
  { copyId: "study", composition: "headline", scale: 50 },
  { copyId: "ss26", composition: "headline", scale: 50 },
  { copyId: "cold", composition: "headline", scale: 50 },
];

const SPREAD_CASES: SheetCase[] = [
  { copyId: "coming-soon-break", composition: "spread", align: "right", valign: "center", spacing: 100 },
  { copyId: "name-break", composition: "spread", align: "left", spacing: 80 },
  { copyId: "date-split", composition: "spread", align: "left", spacing: 100 },
  { copyId: "date", composition: "spread", align: "left", valign: "top", note: "single unit" },
  { copyId: "redy-break", composition: "spread", align: "right", spacing: 90 },
  { copyId: "flawed-break", composition: "spread", align: "left", spacing: 85 },
  { copyId: "free", composition: "spread", align: "left", spacing: 80 },
  { copyId: "launching-date", composition: "spread", align: "left", spacing: 70 },
];

const CAPTION_CASES: SheetCase[] = [
  { copyId: "now", composition: "caption", align: "left", valign: "bottom", scale: 50 },
  { copyId: "date", composition: "caption", align: "right", valign: "bottom", scale: 50 },
  { copyId: "info", composition: "caption", align: "left", valign: "top", scale: 25 },
  { copyId: "name", composition: "caption", align: "center", valign: "bottom", scale: 50 },
  { copyId: "worn", composition: "caption", align: "left", valign: "bottom", scale: 50 },
  { copyId: "coming-soon", composition: "caption", align: "right", valign: "top", scale: 75 },
];

const THREE_GESTURES: SheetCase[] = [
  { copyId: "coming-soon", composition: "headline", scale: 50 },
  { copyId: "coming-soon-break", composition: "spread", align: "right", spacing: 100 },
  { copyId: "coming-soon", composition: "caption", align: "left", valign: "bottom", scale: 50 },
];

function photoGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#6a3f2c");
  g.addColorStop(0.45, "#8a5a3a");
  g.addColorStop(1, "#3d2418");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = ((i * 17) % 13) - 6;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n * 0.6));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n * 0.4));
  }
  ctx.putImageData(img, 0, 0);
}

function stateFor(c: SheetCase): TypeState {
  const copy = mbmById(c.copyId);
  return clampTypeState({
    enabled: true,
    text: copy.text,
    composition: c.composition,
    align: c.align ?? (c.composition === "spread" ? "left" : c.composition === "caption" ? "left" : "center"),
    valign: c.valign ?? (c.composition === "caption" ? "bottom" : "center"),
    scale: c.scale ?? 50,
    spacing: c.spacing ?? 50,
    weight: c.weight ?? 500,
    color: "#f3efe6",
    x: 0,
    y: 0,
  });
}

function cell(
  parent: HTMLElement,
  label: string,
  w: number,
  h: number,
  state: TypeState,
  guide: boolean,
): { lines: string[]; fontSize: number } {
  const wrap = document.createElement("figure");
  wrap.className = "cell";
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  photoGround(ctx, w, h);
  const layout = layoutTypography(state, w, h);
  if (layout) paintTypeLayer(ctx, layout, state.color, layout.opacity);
  if (guide) {
    const m = opticalFramePx(w);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(m + 0.5, m + 0.5, w - m * 2 - 1, h - m * 2 - 1);
  }
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
  return {
    lines: layout?.lines.map((l) => l.text) ?? [],
    fontSize: layout?.fontSize ?? 0,
  };
}

function section(root: HTMLElement, title: string, cases: SheetCase[], aspect: { id: string; w: number; h: number }, guide: boolean) {
  const h = document.createElement("h2");
  h.textContent = `${title} · ${aspect.id}`;
  root.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "grid";
  root.appendChild(grid);
  return cases.map((c) => {
    const state = stateFor(c);
    const extra = [c.note, `s${state.scale}`, state.align, state.valign].filter(Boolean).join(" · ");
    const r = cell(grid, `${c.copyId} · ${c.composition} · ${extra}`, aspect.w, aspect.h, state, guide);
    return { copy: c.copyId, composition: c.composition, aspect: aspect.id, lines: r.lines, fontSize: r.fontSize };
  });
}

export interface SheetReport {
  plans: { copy: string; composition: TypeComposition; aspect: string; lines: string[]; fontSize: number }[];
  exportParity: { copy: string; preview: string[]; full: string[]; match: boolean }[];
  framePx: { "4:5": number; "9:16": number };
}

export async function runTypeSheet(root: HTMLElement): Promise<SheetReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");

  const plans: SheetReport["plans"] = [];
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "MBM typographic system — Headline / Spread / Caption";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Eval-only. Hairline is the 10px optical frame (scales with canvas). Not in the product UI.";
  root.appendChild(lead);

  for (const aspect of ASPECTS) {
    plans.push(...section(root, "HEADLINE", HEADLINE_CASES, aspect, true));
    plans.push(...section(root, "SPREAD", SPREAD_CASES, aspect, true));
    plans.push(...section(root, "CAPTION", CAPTION_CASES, aspect, true));
    plans.push(...section(root, "COMING SOON — three gestures", THREE_GESTURES, aspect, true));
  }

  const variants = document.createElement("h2");
  variants.textContent = "Weight 300 / 500 / 700 · Headline · 4:5";
  root.appendChild(variants);
  const wgrid = document.createElement("div");
  wgrid.className = "grid";
  root.appendChild(wgrid);
  for (const copyId of ["coming-soon", "name", "new"]) {
    for (const weight of [300, 500, 700]) {
      const state = stateFor({ copyId, composition: "headline", weight, scale: 50 });
      cell(wgrid, `${copyId} · headline · w${weight}`, 400, 500, state, false);
    }
  }

  const scales = document.createElement("h2");
  scales.textContent = "Scale 0 / 50 / 100 · 4:5";
  root.appendChild(scales);
  const sgrid = document.createElement("div");
  sgrid.className = "grid";
  root.appendChild(sgrid);
  for (const copyId of ["coming-soon", "new"]) {
    for (const scale of [0, 50, 100]) {
      const state = stateFor({ copyId, composition: "headline", scale });
      cell(sgrid, `${copyId} · headline · s${scale}`, 400, 500, state, true);
    }
  }
  for (const scale of [0, 50, 100]) {
    const state = stateFor({ copyId: "now", composition: "caption", align: "left", valign: "bottom", scale });
    cell(sgrid, `now · caption · s${scale}`, 400, 500, state, true);
  }

  const exportParity: SheetReport["exportParity"] = [];
  const parity: { id: string; composition: TypeComposition }[] = [
    { id: "new", composition: "headline" },
    { id: "coming-soon", composition: "headline" },
    { id: "name", composition: "headline" },
    { id: "redy-break", composition: "headline" },
    { id: "flawed-break", composition: "headline" },
    { id: "free", composition: "spread" },
    { id: "now", composition: "caption" },
  ];
  for (const item of parity) {
    const state = stateFor({ copyId: item.id, composition: item.composition });
    const a = layoutTypography(state, 500, 625);
    const b = layoutTypography(state, 1080, 1350);
    const c = layoutTypography(state, 2160, 2700);
    const lines = (l: ReturnType<typeof layoutTypography>) => l?.lines.map((x) => x.text) ?? [];
    const preview = lines(a);
    const full = lines(b);
    const uhd = lines(c);
    exportParity.push({
      copy: item.id,
      preview,
      full,
      match: preview.join("|") === full.join("|") && full.join("|") === uhd.join("|"),
    });
  }

  return {
    plans,
    exportParity,
    framePx: {
      "4:5": opticalFramePx(500),
      "9:16": opticalFramePx(360),
    },
  };
}
