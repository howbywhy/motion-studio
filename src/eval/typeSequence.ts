import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeAnchor, type TypeRole, type TypeSequenceMode, type TypeState } from "../core/typeState";
import { layoutTypeDocument, layoutTypography } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { evaluateTypeSequence, evaluateTypeSequences } from "../core/typeMotion";
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
  anchor?: TypeAnchor;
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

function twoFolio(mode: TypeSequenceMode): TypeState {
  return clampTypeState({
    enabled: true,
    arrangement: "between-v",
    typeSequenceMode: mode,
    typeSequencePace: 50,
    blocks: [
      { enabled: true, text: "07.09", composition: "folio", scale: 100, anchor: "tc", color: "#f3efe6" },
      { enabled: true, text: "2026", composition: "folio", scale: 100, anchor: "bc", color: "#f3efe6" },
    ],
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
  const laid = layoutTypeDocument(state, w, h);
  if (laid.length === 0) return c;
  if (!sequenced) {
    for (const item of laid) paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, null, item.index);
    return c;
  }
  const seqs = evaluateTypeSequences(state, laid.map((item) => item.layout), phase);
  for (let i = 0; i < laid.length; i++) {
    const item = laid[i]!;
    paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, seqs[i], item.index);
  }
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
  lead.textContent = "Eval-only. Each enabled block is one sequence unit. Together is identity.";
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
            paintTypeLayer(ctx, layout, layout.color, layout.opacity, seq);
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
    const state = twoFolio("hold");
    const laid = layoutTypeDocument(state, 500, 625);
    const seq0 = evaluateTypeSequences(state, laid.map((item) => item.layout), 0.1);
    const seq1 = evaluateTypeSequences(state, laid.map((item) => item.layout), 0.7);
    const top = laid[0]!.layout.lines[0]!;
    const bot = laid[1]!.layout.lines[0]!;
    holdKeepsPosition.push({
      copy: "07.09 / 2026",
      line: top.text,
      restY: top.y,
      phase: 0.1,
      match: seq0[0]!.units[0]!.opacity > 0.9 && Math.abs(seq0[0]!.units[0]!.dx) < 0.5 && seq0[1]!.units[0]!.opacity < 0.05,
    });
    holdKeepsPosition.push({
      copy: "07.09 / 2026",
      line: bot.text,
      restY: bot.y,
      phase: 0.7,
      match: seq1[1]!.units[0]!.opacity > 0.9 && seq1[0]!.units[0]!.opacity < 0.05 && bot.y > 400,
    });
  }

  const exportParity: SequenceReport["exportParity"] = [];
  for (const mode of ["stagger", "hold", "alternate"] as TypeSequenceMode[]) {
    const state = twoFolio(mode);
    const la = layoutTypeDocument(state, 500, 625);
    const lb = layoutTypeDocument(state, 1080, 1350);
    const lc = layoutTypeDocument(state, 2160, 2700);
    const pa = evaluateTypeSequences(state, la.map((item) => item.layout), 0.3);
    const pb = evaluateTypeSequences(state, lb.map((item) => item.layout), 0.3);
    const pc = evaluateTypeSequences(state, lc.map((item) => item.layout), 0.3);
    const opacities = (s: typeof pa) => s.map((item) => Number(item.units[0]!.opacity.toFixed(4)));
    exportParity.push({
      copy: "07.09 / 2026",
      mode,
      preview: opacities(pa),
      full: opacities(pb),
      match:
        opacities(pa).join() === opacities(pb).join() &&
        opacities(pb).join() === opacities(pc).join() &&
        la.map((item) => item.layout.lines.map((l) => l.text).join("|")).join("/") ===
          lc.map((item) => item.layout.lines.map((l) => l.text).join("|")).join("/"),
    });
  }

  const folio: SequenceReport["folio"] = [];
  {
    const state = twoFolio("stagger");
    const laid = layoutTypeDocument(state, 500, 625);
    for (const phase of PHASES) {
      const seq = evaluateTypeSequences(state, laid.map((item) => item.layout), phase);
      folio.push({ mode: "stagger", phase, opacities: seq.map((item) => Number(item.units[0]!.opacity.toFixed(3))) });
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
