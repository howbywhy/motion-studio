import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeAlign, type TypeRole, type TypeState, type TypeValign } from "../core/typeState";
import { editorialColumnsPx, layoutTypography, opticalFramePx } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const ASPECTS: { id: string; w: number; h: number }[] = [
  { id: "4:5", w: 500, h: 625 },
  { id: "9:16", w: 360, h: 640 },
];

interface SheetCase {
  copyId: string;
  role: TypeRole;
  align?: TypeAlign;
  valign?: TypeValign;
  scale?: number;
  spacing?: number;
  weight?: number;
  note?: string;
}

const DISPLAY: SheetCase[] = [
  { copyId: "new", role: "display", scale: 50 },
  { copyId: "coming-soon", role: "display", scale: 50 },
  { copyId: "coming-soon", role: "display", scale: 80, note: "overscan" },
  { copyId: "coming-soon", role: "display", align: "left", valign: "top", scale: 50 },
  { copyId: "name", role: "display", scale: 50 },
  { copyId: "cold", role: "display", scale: 50 },
  { copyId: "redy-break", role: "display", scale: 50 },
  { copyId: "slate", role: "display", scale: 50 },
  { copyId: "mixed", role: "display", scale: 50 },
];

const EDITORIAL: SheetCase[] = [
  { copyId: "flawed-break", role: "editorial", align: "left", valign: "center", scale: 50, spacing: 40 },
  { copyId: "flawed-break", role: "editorial", align: "left", valign: "center", scale: 50, spacing: 90, note: "distributed" },
  { copyId: "perfect", role: "editorial", align: "left", valign: "top", scale: 50, spacing: 45 },
  { copyId: "way", role: "editorial", align: "right", valign: "bottom", scale: 50, spacing: 40 },
  { copyId: "free", role: "editorial", align: "left", valign: "center", scale: 50, spacing: 40, note: "lockup" },
  { copyId: "free", role: "editorial", align: "left", valign: "center", scale: 50, spacing: 90, note: "distributed" },
  { copyId: "this-is", role: "editorial", align: "left", valign: "center", scale: 50, spacing: 50 },
  { copyId: "name-break", role: "editorial", align: "left", valign: "top", scale: 50, spacing: 35 },
];

const CAPTION: SheetCase[] = [
  { copyId: "now", role: "caption", align: "left", valign: "bottom", scale: 50 },
  { copyId: "worn", role: "caption", align: "left", valign: "bottom", scale: 50 },
  { copyId: "launching", role: "caption", align: "right", valign: "top", scale: 50 },
  { copyId: "product-colour", role: "caption", align: "right", valign: "bottom", scale: 40 },
  { copyId: "name", role: "caption", align: "center", valign: "bottom", scale: 50 },
];

const FOLIO: SheetCase[] = [
  { copyId: "date-split", role: "folio", align: "left", valign: "center", scale: 85, spacing: 100, note: "oversized" },
  { copyId: "date-split", role: "folio", align: "center", valign: "center", scale: 90, spacing: 100, note: "oversized" },
  { copyId: "date-md", role: "folio", align: "left", valign: "top", scale: 90, note: "oversized" },
  { copyId: "year", role: "folio", align: "right", valign: "bottom", scale: 90, note: "oversized" },
  { copyId: "date", role: "folio", align: "left", valign: "top", scale: 80 },
  { copyId: "date", role: "folio", align: "right", valign: "bottom", scale: 20, note: "furniture" },
  { copyId: "ss26-short", role: "folio", align: "left", valign: "bottom", scale: 18, note: "furniture" },
  { copyId: "num01", role: "folio", align: "left", valign: "top", scale: 22, note: "furniture" },
  { copyId: "num02", role: "folio", align: "right", valign: "top", scale: 22, note: "furniture" },
  { copyId: "sydney", role: "folio", align: "right", valign: "bottom", scale: 20, note: "furniture" },
];

const HIERARCHY: SheetCase[] = [
  { copyId: "coming-soon", role: "display", scale: 50 },
  { copyId: "coming-soon", role: "editorial", align: "left", scale: 50, spacing: 40 },
  { copyId: "coming-soon", role: "caption", align: "left", valign: "bottom", scale: 50 },
  { copyId: "coming-soon", role: "folio", align: "left", valign: "top", scale: 70 },
  { copyId: "date-split", role: "display", scale: 50 },
  { copyId: "date-split", role: "editorial", align: "left", spacing: 90 },
  { copyId: "date-split", role: "caption", align: "right", valign: "bottom" },
  { copyId: "date-split", role: "folio", align: "left", scale: 90, spacing: 100 },
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

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const m = opticalFramePx(w);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(m + 0.5, m + 0.5, w - m * 2 - 1, h - m * 2 - 1);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (const x of editorialColumnsPx(w)) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, m);
    ctx.lineTo(x + 0.5, h - m);
    ctx.stroke();
  }
}

function stateFor(c: SheetCase): TypeState {
  const copy = mbmById(c.copyId);
  const role = c.role;
  return clampTypeState({
    enabled: true,
    text: copy.text,
    composition: role,
    align: c.align ?? (role === "caption" || role === "editorial" || role === "folio" ? "left" : "center"),
    valign: c.valign ?? (role === "caption" ? "bottom" : "center"),
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
  if (guide) drawGrid(ctx, w, h);
  const layout = layoutTypography(state, w, h);
  if (layout) paintTypeLayer(ctx, layout, state.color, layout.opacity);
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

function pages(
  root: HTMLElement,
  title: string,
  cases: SheetCase[],
  guide: boolean,
): { copy: string; composition: TypeRole; aspect: string; lines: string[]; fontSize: number }[] {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  const out: { copy: string; composition: TypeRole; aspect: string; lines: string[]; fontSize: number }[] = [];
  for (const c of cases) {
    const row = document.createElement("div");
    row.className = "page-row";
    root.appendChild(row);
    const state = stateFor(c);
    const extra = [c.note, `s${state.scale}`, `sp${state.spacing}`, state.align, state.valign].filter(Boolean).join(" · ");
    for (const aspect of ASPECTS) {
      const r = cell(row, `${c.copyId} · ${c.role} · ${aspect.id} · ${extra}`, aspect.w, aspect.h, state, guide);
      out.push({ copy: c.copyId, composition: c.role, aspect: aspect.id, lines: r.lines, fontSize: r.fontSize });
    }
  }
  return out;
}

export interface SheetReport {
  plans: { copy: string; composition: TypeRole; aspect: string; lines: string[]; fontSize: number }[];
  exportParity: { copy: string; preview: string[]; full: string[]; match: boolean }[];
  framePx: { "4:5": number; "9:16": number };
}

export async function runTypeSheet(root: HTMLElement): Promise<SheetReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");

  const plans: SheetReport["plans"] = [];
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "MBM editorial hierarchy";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Eval-only. Hairline = 10px optical frame + 4 columns. Not in the product UI.";
  root.appendChild(lead);

  plans.push(...pages(root, "DISPLAY", DISPLAY, true));
  plans.push(...pages(root, "EDITORIAL", EDITORIAL, true));
  plans.push(...pages(root, "CAPTION", CAPTION, true));
  plans.push(...pages(root, "FOLIO", FOLIO, true));
  plans.push(...pages(root, "SAME COPY · four roles", HIERARCHY, true));

  const variants = document.createElement("h2");
  variants.textContent = "Weight 300 / 500 / 700";
  root.appendChild(variants);
  const wgrid = document.createElement("div");
  wgrid.className = "grid";
  root.appendChild(wgrid);
  for (const copyId of ["coming-soon", "date-split", "new"]) {
    const role: TypeRole = copyId === "date-split" ? "folio" : "display";
    for (const weight of [300, 500, 700]) {
      const state = stateFor({ copyId, role, weight, scale: copyId === "date-split" ? 85 : 50, spacing: copyId === "date-split" ? 100 : 50 });
      cell(wgrid, `${copyId} · ${role} · w${weight}`, 400, 500, state, false);
    }
  }

  const exportParity: SheetReport["exportParity"] = [];
  const parity: { id: string; role: TypeRole }[] = [
    { id: "new", role: "display" },
    { id: "coming-soon", role: "display" },
    { id: "name", role: "display" },
    { id: "flawed-break", role: "editorial" },
    { id: "free", role: "editorial" },
    { id: "date-split", role: "folio" },
    { id: "now", role: "caption" },
  ];
  for (const item of parity) {
    const state = stateFor({
      copyId: item.id,
      role: item.role,
      scale: item.role === "folio" ? 85 : 50,
      spacing: item.role === "folio" || item.id === "free" ? 90 : 50,
    });
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
