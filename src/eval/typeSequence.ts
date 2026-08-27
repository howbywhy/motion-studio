import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeRole, type TypeSequenceMode, type TypeState } from "../core/typeState";
import { layoutTypography } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { evaluateTypeSequence } from "../core/typeMotion";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const ASPECTS: { id: string; w: number; h: number }[] = [
  { id: "4:5", w: 500, h: 625 },
  { id: "9:16", w: 360, h: 640 },
];

const PHASES = [0, 0.12, 0.28, 0.45, 0.62, 0.88];
const MODES: TypeSequenceMode[] = ["together", "stagger", "hold", "alternate"];

interface SeqCase {
  copyId: string;
  role: TypeRole;
  scale: number;
  spacing: number;
  anchor?: TypeState["anchor"];
}

const CASES: SeqCase[] = [
  { copyId: "date-split", role: "folio", scale: 100, spacing: 100, anchor: "mc" },
  { copyId: "coming-soon-break", role: "display", scale: 80, spacing: 50 },
  { copyId: "name-break", role: "display", scale: 80, spacing: 50 },
  { copyId: "redy-break", role: "display", scale: 80, spacing: 50 },
  { copyId: "flawed-break", role: "editorial", scale: 50, spacing: 40, anchor: "ml" },
  { copyId: "free", role: "editorial", scale: 50, spacing: 50, anchor: "ml" },
  { copyId: "now", role: "caption", scale: 50, spacing: 50, anchor: "bl" },
];

const STATIC_BASELINE: { copyId: string; role: TypeRole; scale: number; spacing: number }[] = [
  { copyId: "hello", role: "display", scale: 100, spacing: 50 },
  { copyId: "flawed-break", role: "editorial", scale: 50, spacing: 40 },
  { copyId: "now", role: "caption", scale: 100, spacing: 50 },
  { copyId: "date-split", role: "folio", scale: 100, spacing: 100 },
];

function stateFor(c: SeqCase, mode: TypeSequenceMode, pace = 50): TypeState {
  return clampTypeState({
    enabled: true,
    text: mbmById(c.copyId).text,
    composition: c.role,
    scale: c.scale,
    spacing: c.spacing,
    weight: 500,
    color: "#f3efe6",
    anchor: c.anchor ?? (c.role === "caption" ? "bl" : c.role === "editorial" ? "ml" : "mc"),
    typeSequenceMode: mode,
    typeSequencePace: pace,
  });
}

function photo(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#6a3f2c");
  g.addColorStop(1, "#3d2418");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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

function paint(state: TypeState, w: number, h: number, phase: number, sequenced: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const layout = layoutTypography(state, w, h);
  if (!layout) return c;
  if (!sequenced) {
    paintTypeLayer(ctx, layout, "#ffffff", 1);
    return c;
  }
  const seq = evaluateTypeSequence(state, layout, phase);
  paintTypeLayer(ctx, layout, "#ffffff", 1, seq);
  return c;
}

export interface SequenceReport {
  togetherIdentity: { copy: string; role: TypeRole; phase: number; diff: number; identity: boolean }[];
  oneUnitCollapse: { copy: string; mode: TypeSequenceMode; identity: boolean }[];
  holdKeepsPosition: { copy: string; line: string; restY: number; phase: number; match: boolean }[];
  exportParity: { copy: string; mode: TypeSequenceMode; match: boolean; preview: number[]; full: number[] }[];
  folio: { mode: TypeSequenceMode; phase: number; opacities: number[] }[];
  elapsedMs: number;
  togetherFail: number;
}

export async function runTypeSequence(root: HTMLElement): Promise<SequenceReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");
  const t0 = performance.now();
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "MBM type sequence";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Eval-only. Static layout first. Time only reveals authored newline units.";
  root.appendChild(lead);

  for (const c of CASES) {
    const h = document.createElement("h2");
    h.textContent = `${c.copyId} · ${c.role}`;
    root.appendChild(h);
    for (const mode of MODES) {
      const sub = document.createElement("h3");
      sub.textContent = mode;
      root.appendChild(sub);
      const row = document.createElement("div");
      row.className = "page-row";
      root.appendChild(row);
      const state = stateFor(c, mode);
      for (const aspect of ASPECTS) {
        for (const phase of PHASES) {
          const wrap = document.createElement("figure");
          const canvas = document.createElement("canvas");
          canvas.width = aspect.w;
          canvas.height = aspect.h;
          const ctx = canvas.getContext("2d")!;
          photo(ctx, aspect.w, aspect.h);
          const layout = layoutTypography(state, aspect.w, aspect.h);
          if (layout) {
            const seq = evaluateTypeSequence(state, layout, phase);
            paintTypeLayer(ctx, layout, state.color, layout.opacity, seq);
          }
          const cap = document.createElement("figcaption");
          cap.textContent = `${aspect.id} · p${phase}`;
          wrap.appendChild(canvas);
          wrap.appendChild(cap);
          row.appendChild(wrap);
        }
      }
    }
  }

  const togetherIdentity: SequenceReport["togetherIdentity"] = [];
  for (const c of STATIC_BASELINE) {
    const state = stateFor(c, "together");
    for (const phase of [0, 0.37, 0.91]) {
      const a = paint(state, 500, 625, phase, false);
      const b = paint(state, 500, 625, phase, true);
      const layout = layoutTypography(state, 500, 625)!;
      const seq = evaluateTypeSequence(state, layout, phase);
      const diff = pixelDiff(a.getContext("2d")!.getImageData(0, 0, 500, 625), b.getContext("2d")!.getImageData(0, 0, 500, 625));
      togetherIdentity.push({ copy: c.copyId, role: c.role, phase, diff, identity: seq.identity && diff === 0 });
    }
  }

  const oneUnitCollapse: SequenceReport["oneUnitCollapse"] = [];
  for (const mode of MODES) {
    const state = stateFor({ copyId: "now", role: "caption", scale: 50, spacing: 50, anchor: "bl" }, mode);
    const layout = layoutTypography(state, 500, 625)!;
    const seq = evaluateTypeSequence(state, layout, 0.3);
    oneUnitCollapse.push({ copy: "now", mode, identity: seq.identity });
  }

  const holdKeepsPosition: SequenceReport["holdKeepsPosition"] = [];
  {
    const state = stateFor({ copyId: "date-split", role: "folio", scale: 100, spacing: 100, anchor: "mc" }, "hold");
    const layout = layoutTypography(state, 500, 625)!;
    const seq0 = evaluateTypeSequence(state, layout, 0.1);
    const seq1 = evaluateTypeSequence(state, layout, 0.7);
    const top = layout.lines.find((l) => l.unit === 0)!;
    const bot = layout.lines.find((l) => l.unit === 1)!;
    holdKeepsPosition.push({
      copy: "date-split",
      line: top.text,
      restY: top.y,
      phase: 0.1,
      match: seq0.units[0]!.opacity > 0.9 && Math.abs(seq0.units[0]!.dx) < 0.5 && seq0.units[1]!.opacity < 0.05,
    });
    holdKeepsPosition.push({
      copy: "date-split",
      line: bot.text,
      restY: bot.y,
      phase: 0.7,
      match: seq1.units[1]!.opacity > 0.9 && seq1.units[0]!.opacity < 0.05 && bot.y > 400,
    });
  }

  const exportParity: SequenceReport["exportParity"] = [];
  for (const mode of ["stagger", "hold", "alternate"] as TypeSequenceMode[]) {
    const state = stateFor({ copyId: "date-split", role: "folio", scale: 100, spacing: 100 }, mode);
    const la = layoutTypography(state, 500, 625)!;
    const lb = layoutTypography(state, 1080, 1350)!;
    const lc = layoutTypography(state, 2160, 2700)!;
    const pa = evaluateTypeSequence(state, la, 0.3);
    const pb = evaluateTypeSequence(state, lb, 0.3);
    const pc = evaluateTypeSequence(state, lc, 0.3);
    const opacities = (s: typeof pa) => s.units.map((u) => Number(u.opacity.toFixed(4)));
    exportParity.push({
      copy: "date-split",
      mode,
      preview: opacities(pa),
      full: opacities(pb),
      match:
        opacities(pa).join() === opacities(pb).join() &&
        opacities(pb).join() === opacities(pc).join() &&
        la.lines.map((l) => l.text).join("|") === lc.lines.map((l) => l.text).join("|"),
    });
  }

  const folio: SequenceReport["folio"] = [];
  {
    const state = stateFor({ copyId: "date-split", role: "folio", scale: 100, spacing: 100 }, "stagger");
    const layout = layoutTypography(state, 500, 625)!;
    for (const phase of PHASES) {
      const seq = evaluateTypeSequence(state, layout, phase);
      folio.push({ mode: "stagger", phase, opacities: seq.units.map((u) => Number(u.opacity.toFixed(3))) });
    }
  }

  return {
    togetherIdentity,
    oneUnitCollapse,
    holdKeepsPosition,
    exportParity,
    folio,
    elapsedMs: Math.round(performance.now() - t0),
    togetherFail: togetherIdentity.filter((t) => !t.identity).length,
  };
}
