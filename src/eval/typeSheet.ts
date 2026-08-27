import { MBM_COPY } from "./mbmCopy";
import { clampTypeState, type TypeComposition, type TypeState } from "../core/typeState";
import { layoutTypography } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const COMPOSITIONS: TypeComposition[] = ["display", "stack", "spread", "quiet"];
const ASPECTS: { id: string; w: number; h: number }[] = [
  { id: "4:5", w: 320, h: 400 },
  { id: "9:16", w: 270, h: 480 },
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

function stateFor(text: string, composition: TypeComposition, weight: number, scale: number): TypeState {
  return clampTypeState({
    enabled: true,
    text,
    composition,
    align: composition === "spread" ? "left" : "center",
    valign: composition === "quiet" ? "bottom" : composition === "display" ? "center" : "center",
    scale,
    spacing: 50,
    weight,
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

export interface SheetReport {
  plans: { copy: string; composition: TypeComposition; aspect: string; lines: string[]; fontSize: number }[];
  exportParity: { copy: string; preview: string[]; full: string[]; match: boolean }[];
}

export async function runTypeSheet(root: HTMLElement): Promise<SheetReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");

  const plans: SheetReport["plans"] = [];
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "MBM typographic system — contact sheet";
  root.appendChild(title);

  for (const aspect of ASPECTS) {
    const h = document.createElement("h2");
    h.textContent = `${aspect.id} · weight 500 · scale 50`;
    root.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "grid";
    root.appendChild(grid);
    for (const copy of MBM_COPY) {
      for (const composition of COMPOSITIONS) {
        const state = stateFor(copy.text, composition, 500, 50);
        const r = cell(grid, `${copy.id} · ${composition}`, aspect.w, aspect.h, state);
        plans.push({ copy: copy.id, composition, aspect: aspect.id, lines: r.lines, fontSize: r.fontSize });
      }
    }
  }

  const variants = document.createElement("h2");
  variants.textContent = "Weight 300 / 500 / 700 · scale 50 · 4:5";
  root.appendChild(variants);
  const wgrid = document.createElement("div");
  wgrid.className = "grid";
  root.appendChild(wgrid);
  const weightFocus = MBM_COPY.filter((c) => ["new", "name", "free"].includes(c.id));
  for (const copy of weightFocus) {
    for (const composition of COMPOSITIONS) {
      for (const weight of [300, 500, 700]) {
        const state = stateFor(copy.text, composition, weight, 50);
        cell(wgrid, `${copy.id} · ${composition} · w${weight}`, 240, 300, state);
      }
    }
  }

  const scales = document.createElement("h2");
  scales.textContent = "Scale 25 / 50 / 75 · weight 500 · 4:5";
  root.appendChild(scales);
  const sgrid = document.createElement("div");
  sgrid.className = "grid";
  root.appendChild(sgrid);
  const scaleFocus = MBM_COPY.filter((c) => ["new", "name", "now"].includes(c.id));
  for (const copy of scaleFocus) {
    for (const composition of COMPOSITIONS) {
      for (const scale of [25, 50, 75]) {
        const state = stateFor(copy.text, composition, 500, scale);
        cell(sgrid, `${copy.id} · ${composition} · s${scale}`, 240, 300, state);
      }
    }
  }

  const exportParity: SheetReport["exportParity"] = [];
  const parityCopy = MBM_COPY.filter((c) =>
    ["new", "name", "launching-date", "cold", "flawed", "free"].includes(c.id),
  );
  for (const copy of parityCopy) {
    const state = stateFor(copy.text, copy.id === "free" ? "spread" : copy.id === "now" ? "quiet" : "display", 500, 50);
    const a = layoutTypography(state, 400, 500);
    const b = layoutTypography(state, 1080, 1350);
    const c = layoutTypography(state, 2160, 2700);
    const lines = (l: ReturnType<typeof layoutTypography>) => l?.lines.map((x) => x.text) ?? [];
    const preview = lines(a);
    const full = lines(b);
    const uhd = lines(c);
    exportParity.push({
      copy: copy.id,
      preview,
      full,
      match: preview.join("|") === full.join("|") && full.join("|") === uhd.join("|"),
    });
  }

  return { plans, exportParity };
}
