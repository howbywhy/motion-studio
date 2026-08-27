import { mbmById } from "./mbmCopy";
import {
  clampTypeState,
  primaryBlock,
  roleDefaults,
  TYPE_ANCHORS,
  TYPE_TEXT_ALIGNS,
  type TypeAnchor,
  type TypeBlock,
  type TypeRole,
  type TypeState,
  type TypeTextAlign,
} from "../core/typeState";
import { editorialColumnsPx, layoutTypography, layoutTypeDocument, opticalFramePx, typeInkBox } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const ASPECTS: { id: string; w: number; h: number }[] = [
  { id: "4:5", w: 500, h: 625 },
  { id: "9:16", w: 360, h: 640 },
];

const SCALES = [0, 25, 50, 75, 100] as const;
const ALIGN_LABEL: Record<TypeTextAlign, string> = {
  left: "Left",
  center: "Centre",
  right: "Right",
};

interface SheetCase {
  copyId: string;
  role: TypeRole;
  anchor?: TypeAnchor;
  scale?: number;
  spacing?: number;
  weight?: number;
  textAlign?: TypeTextAlign;
  note?: string;
}

const ROLE_COPY: Record<TypeRole, { short: string; medium: string; multiline?: string }> = {
  display: { short: "new", medium: "coming-soon", multiline: "welcome-authored" },
  editorial: { short: "way", medium: "flawed", multiline: "flawed-break" },
  caption: { short: "sydney", medium: "now", multiline: "worn" },
  folio: { short: "num01", medium: "date-md", multiline: "date-split" },
};

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
  const defs = roleDefaults(c.role);
  return clampTypeState({
    enabled: true,
    text: copy.text,
    composition: c.role,
    textAlign: c.textAlign ?? "left",
    anchor: c.anchor ?? defs.anchor,
    scale: c.scale ?? defs.scale,
    spacing: c.spacing ?? defs.spacing,
    weight: c.weight ?? defs.weight,
    color: "#f3efe6",
  });
}

function documentState(blocks: Partial<TypeBlock>[]): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, color: "#f3efe6", ...blocks[0] },
      { enabled: true, color: "#f3efe6", ...blocks[1] },
    ],
  });
}

function paintState(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: TypeState,
  guide: boolean,
): { lines: string[]; fontSize: number; tracking: number } {
  photoGround(ctx, w, h);
  const laid = layoutTypeDocument(state, w, h);
  for (const item of laid) paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  if (guide) drawGrid(ctx, w, h);
  const first = laid[0]?.layout;
  return {
    lines: laid.flatMap((item) => item.layout.lines.map((l) => l.text)),
    fontSize: first?.fontSize ?? 0,
    tracking: first?.tracking ?? 0,
  };
}

function cell(
  parent: HTMLElement,
  label: string,
  w: number,
  h: number,
  state: TypeState,
  guide: boolean,
): { lines: string[]; fontSize: number; tracking: number } {
  const wrap = document.createElement("figure");
  wrap.className = "cell";
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const r = paintState(ctx, w, h, state, guide);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
  return r;
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
    const block = primaryBlock(state);
    const extra = [c.note, `s${block.scale}`, `sp${block.spacing}`, block.anchor, ALIGN_LABEL[block.textAlign]].filter(Boolean).join(" · ");
    for (const aspect of ASPECTS) {
      const r = cell(row, `${c.copyId} · ${c.role} · ${aspect.id} · ${extra}`, aspect.w, aspect.h, state, guide);
      out.push({ copy: c.copyId, composition: c.role, aspect: aspect.id, lines: r.lines, fontSize: r.fontSize });
    }
  }
  return out;
}

function countOutsidePixels(w: number, h: number, state: TypeState): number {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  const laid = layoutTypeDocument(state, w, h);
  for (const item of laid) paintTypeLayer(ctx, item.layout, "#ffffff", 1, undefined, item.index);
  const frame = opticalFramePx(w);
  const insideL = Math.max(0, Math.ceil(frame));
  const insideT = Math.max(0, Math.ceil(frame));
  const insideR = Math.min(w, Math.floor(w - frame));
  const insideB = Math.min(h, Math.floor(h - frame));
  let n = 0;
  const scan = (x: number, y: number, sw: number, sh: number): void => {
    if (sw <= 0 || sh <= 0) return;
    const img = ctx.getImageData(x, y, sw, sh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 12 || d[i + 1] > 12 || d[i + 2] > 12) n += 1;
    }
  };
  scan(0, 0, w, insideT);
  scan(0, insideB, w, h - insideB);
  scan(0, insideT, insideL, Math.max(0, insideB - insideT));
  scan(insideR, insideT, w - insideR, Math.max(0, insideB - insideT));
  return n;
}

interface ProofCase {
  copy: string;
  role: TypeRole;
  scale: number;
  spacing: number;
  anchor: TypeAnchor;
  aspect: string;
  w: number;
  h: number;
  outside: number;
  inkOutside: boolean;
  lines: string[];
  fontSize: number;
}

const PROOF_SETS: { copyId: string; role: TypeRole }[] = [
  { copyId: "new", role: "display" },
  { copyId: "coming-soon", role: "display" },
  { copyId: "welcome-authored", role: "display" },
  { copyId: "cold", role: "display" },
  { copyId: "redy", role: "display" },
  { copyId: "flawed-break", role: "editorial" },
  { copyId: "way", role: "editorial" },
  { copyId: "now", role: "caption" },
  { copyId: "worn", role: "caption" },
  { copyId: "date-md", role: "folio" },
  { copyId: "date-split", role: "folio" },
  { copyId: "ss26-short", role: "folio" },
];

function runOverflowProof(): { cases: ProofCase[]; outsideTotal: number; inkOutsideTotal: number } {
  const cases: ProofCase[] = [];
  let outsideTotal = 0;
  let inkOutsideTotal = 0;
  const check = (copyId: string, role: TypeRole, scale: number, anchor: TypeAnchor, aspect: { id: string; w: number; h: number }, tol: number): void => {
    const state = stateFor({ copyId, role, anchor, scale });
    const layout = layoutTypography(state, aspect.w, aspect.h);
    const frame = opticalFramePx(aspect.w);
    const box = layout ? typeInkBox(layout) : { l: frame, t: frame, r: aspect.w - frame, b: aspect.h - frame };
    const inkOutside =
      box.l < frame - tol ||
      box.t < frame - tol ||
      box.r > aspect.w - frame + tol ||
      box.b > aspect.h - frame + tol;
    const outside = inkOutside ? countOutsidePixels(aspect.w, aspect.h, state) : 0;
    if (inkOutside) inkOutsideTotal += 1;
    outsideTotal += outside;
    if (outside > 0 || inkOutside) {
      cases.push({
        copy: copyId,
        role,
        scale,
        spacing: roleDefaults(role).spacing,
        anchor,
        aspect: aspect.id,
        w: aspect.w,
        h: aspect.h,
        outside,
        inkOutside,
        lines: layout?.lines.map((l) => l.text) ?? [],
        fontSize: layout?.fontSize ?? 0,
      });
    }
  };
  for (const set of PROOF_SETS) {
    for (const scale of SCALES) {
      for (const anchor of TYPE_ANCHORS) {
        for (const aspect of ASPECTS) check(set.copyId, set.role, scale, anchor, aspect, 0.6);
      }
    }
  }
  for (const size of [
    { id: "1080", w: 1080, h: 1350 },
    { id: "2160", w: 2160, h: 2700 },
  ]) {
    for (const copyId of ["coming-soon", "welcome-authored", "date-split"] as const) {
      const role: TypeRole = copyId === "date-split" ? "folio" : "display";
      for (const anchor of TYPE_ANCHORS) check(copyId, role, 100, anchor, size, 1);
    }
  }
  return { cases, outsideTotal, inkOutsideTotal };
}

function fingerprint(state: TypeState, w: number, h: number): { fontSize: number; tracking: number; leading: number; lines: string; weight: number } {
  const layout = layoutTypography(state, w, h);
  return {
    fontSize: layout?.fontSize ?? 0,
    tracking: layout?.tracking ?? 0,
    leading: layout?.lineHeight ?? 0,
    lines: layout?.lines.map((l) => l.text).join("|") ?? "",
    weight: layout?.weight ?? 0,
  };
}

function sameCompose(a: ReturnType<typeof fingerprint>, b: ReturnType<typeof fingerprint>): boolean {
  return (
    a.lines === b.lines &&
    Math.abs(a.fontSize - b.fontSize) < 0.05 &&
    Math.abs(a.tracking - b.tracking) < 0.05 &&
    Math.abs(a.leading - b.leading) < 0.05 &&
    a.weight === b.weight
  );
}

function positionInvariant(): { copy: string; match: boolean; fontSizes: number[]; lines: string[] }[] {
  const out: { copy: string; match: boolean; fontSizes: number[]; lines: string[] }[] = [];
  const samples: { copyId: string; role: TypeRole; scale: number }[] = [
    { copyId: "coming-soon", role: "display", scale: 100 },
    { copyId: "welcome-authored", role: "display", scale: 100 },
    { copyId: "flawed-break", role: "editorial", scale: 100 },
    { copyId: "now", role: "caption", scale: 100 },
    { copyId: "date-md", role: "folio", scale: 100 },
  ];
  for (const sample of samples) {
    const fps: ReturnType<typeof fingerprint>[] = [];
    for (const anchor of TYPE_ANCHORS) {
      fps.push(fingerprint(stateFor({ ...sample, anchor }), 500, 625));
    }
    out.push({
      copy: `${sample.copyId}/${sample.role}`,
      match: fps.every((f) => sameCompose(f, fps[0]!)),
      fontSizes: fps.map((f) => f.fontSize),
      lines: fps[0]!.lines.split("|"),
    });
  }
  return out;
}

function alignInvariant(): { copy: string; match: boolean }[] {
  const samples: { copyId: string; role: TypeRole }[] = [
    { copyId: "welcome-authored", role: "display" },
    { copyId: "flawed-break", role: "editorial" },
    { copyId: "date-split", role: "folio" },
  ];
  return samples.map((sample) => {
    const fps = TYPE_TEXT_ALIGNS.map((textAlign) =>
      fingerprint(stateFor({ ...sample, textAlign, scale: 80, anchor: "br" }), 500, 625),
    );
    return { copy: sample.copyId, match: fps.every((f) => sameCompose(f, fps[0]!)) };
  });
}

function independence(): { type01Stable: boolean; type02DoesNotMoveType01: boolean } {
  const solo = documentState([
    { enabled: true, text: "COMING SOON", composition: "display", scale: 78, anchor: "mc" },
    { enabled: false, text: "", composition: "display" },
  ]);
  const pair = documentState([
    { enabled: true, text: "COMING SOON", composition: "display", scale: 78, anchor: "mc" },
    { enabled: true, text: "07.09", composition: "folio", scale: 100, anchor: "tl" },
  ]);
  const moved = documentState([
    { enabled: true, text: "COMING SOON", composition: "display", scale: 78, anchor: "mc" },
    { enabled: true, text: "WE'RE FLAWED\nAND FLAWLESS.", composition: "editorial", scale: 100, anchor: "br" },
  ]);
  const a = layoutTypeDocument(solo, 500, 625)[0]?.layout;
  const b = layoutTypeDocument(pair, 500, 625)[0]?.layout;
  const c = layoutTypeDocument(moved, 500, 625)[0]?.layout;
  const key = (l: typeof a) =>
    l ? `${l.fontSize}|${l.tracking}|${l.lineHeight}|${l.lines.map((x) => `${x.text}:${x.x.toFixed(2)}:${x.y.toFixed(2)}`).join("/")}` : "";
  return {
    type01Stable: key(a) === key(b),
    type02DoesNotMoveType01: key(a) === key(c),
  };
}

const TWO_BLOCK: { title: string; blocks: Partial<TypeBlock>[] }[] = [
  {
    title: "01 · 07.09 Folio TL / 2026 Folio BL",
    blocks: [
      { text: "07.09", composition: "folio", scale: 100, anchor: "tl" },
      { text: "2026", composition: "folio", scale: 100, anchor: "bl" },
    ],
  },
  {
    title: "02 · MADE BY Caption TL / MADELEN Display BL",
    blocks: [
      { text: "MADE BY", composition: "caption", scale: 100, anchor: "tl" },
      { text: "MADELEN", composition: "display", scale: 100, anchor: "bl" },
    ],
  },
  {
    title: "03 · SS26 Folio TR / COMING SOON Display BL",
    blocks: [
      { text: "SS26", composition: "folio", scale: 100, anchor: "tr" },
      { text: "COMING SOON", composition: "display", scale: 100, anchor: "bl" },
    ],
  },
  {
    title: "04 · NOW AVAILABLE Caption BL / 07.09.2026 Folio BR",
    blocks: [
      { text: "NOW AVAILABLE", composition: "caption", scale: 100, anchor: "bl" },
      { text: "07.09.2026", composition: "folio", scale: 100, anchor: "br" },
    ],
  },
  {
    title: "05 · WE'RE FLAWED Editorial TL / AND FLAWLESS. Editorial BR",
    blocks: [
      { text: "WE'RE FLAWED", composition: "editorial", scale: 100, anchor: "tl" },
      { text: "AND FLAWLESS.", composition: "editorial", scale: 100, anchor: "br" },
    ],
  },
];

export interface SheetReport {
  plans: { copy: string; composition: TypeRole; aspect: string; lines: string[]; fontSize: number }[];
  exportParity: { copy: string; preview: string[]; full: string[]; uhd: string[]; match: boolean }[];
  framePx: { "4:5": number; "9:16": number; "1080": number; "2160": number };
  overflow: { outsideTotal: number; inkOutsideTotal: number; failures: ProofCase[] };
  positionInvariant: { copy: string; match: boolean; lines: string[] }[];
  alignInvariant: { copy: string; match: boolean }[];
  authoredNewlines: { expected: string[]; actual: string[]; match: boolean };
  independence: { type01Stable: boolean; type02DoesNotMoveType01: boolean };
  longCopy: { text: string; lines: string[]; fontSize: number; lineCount: number };
  twoBlocks: { title: string; lines: string[] }[];
  proofCount: number;
  elapsedMs: number;
}

export async function runTypeSheet(root: HTMLElement): Promise<SheetReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");
  const t0 = performance.now();

  const plans: SheetReport["plans"] = [];
  root.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = "MBM type placement sheet";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Eval-only. Static type. Hairline = 10px optical frame. Position translates. Align is internal. Scale 100 = max legal. No crop.";
  root.appendChild(lead);

  const roles: TypeRole[] = ["display", "editorial", "caption", "folio"];
  for (const role of roles) {
    const copies = ROLE_COPY[role];
    const representative = copies.medium;
    plans.push(...pages(root, `${role} · copy length`, [
      { copyId: copies.short, role, note: "short" },
      { copyId: copies.medium, role, note: "medium" },
      ...(copies.multiline ? [{ copyId: copies.multiline, role, note: "authored lines" } satisfies SheetCase] : []),
    ], true));
    plans.push(...pages(root, `${role} · scale 0 / 25 / 50 / 75 / 100`, SCALES.map((scale) => ({
      copyId: representative,
      role,
      scale,
      note: `scale ${scale}`,
    })), true));
    plans.push(...pages(root, `${role} · nine positions`, TYPE_ANCHORS.map((anchor) => ({
      copyId: representative,
      role,
      anchor,
      note: anchor,
    })), true));
    plans.push(...pages(root, `${role} · align`, TYPE_TEXT_ALIGNS.map((textAlign) => ({
      copyId: copies.multiline ?? representative,
      role,
      textAlign,
      anchor: "br" as const,
      note: ALIGN_LABEL[textAlign],
    })), true));
  }

  const pairHead = document.createElement("h2");
  pairHead.textContent = "Two-block pages";
  root.appendChild(pairHead);
  const twoBlocks: SheetReport["twoBlocks"] = [];
  for (const pair of TWO_BLOCK) {
    const row = document.createElement("div");
    row.className = "page-row";
    root.appendChild(row);
    const state = documentState(pair.blocks);
    for (const aspect of ASPECTS) {
      const r = cell(row, `${pair.title} · ${aspect.id}`, aspect.w, aspect.h, state, true);
      twoBlocks.push({ title: `${pair.title} · ${aspect.id}`, lines: r.lines });
    }
  }

  const exportParity: SheetReport["exportParity"] = [];
  const parity: { id: string; role: TypeRole }[] = [
    { id: "coming-soon", role: "display" },
    { id: "welcome-authored", role: "display" },
    { id: "flawed-break", role: "editorial" },
    { id: "now", role: "caption" },
    { id: "date-md", role: "folio" },
    { id: "date-split", role: "folio" },
  ];
  for (const item of parity) {
    const state = stateFor({ copyId: item.id, role: item.role, scale: 100 });
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
      uhd,
      match: preview.join("|") === full.join("|") && full.join("|") === uhd.join("|"),
    });
  }

  const welcome = stateFor({ copyId: "welcome-authored", role: "display", scale: 100 });
  const welcomeLayout = layoutTypography(welcome, 500, 625);
  const authored = welcomeLayout?.lines.map((l) => l.text) ?? [];
  const overflow = runOverflowProof();
  const invariant = positionInvariant();
  const proofCount = PROOF_SETS.length * SCALES.length * TYPE_ANCHORS.length * ASPECTS.length + 3 * TYPE_ANCHORS.length * 2;

  for (const pair of TWO_BLOCK) {
    const state = documentState(pair.blocks);
    for (const aspect of [...ASPECTS, { id: "1080", w: 1080, h: 1350 }]) {
      overflow.outsideTotal += countOutsidePixels(aspect.w, aspect.h, state);
    }
  }

  return {
    plans,
    exportParity,
    framePx: {
      "4:5": opticalFramePx(500),
      "9:16": opticalFramePx(360),
      "1080": opticalFramePx(1080),
      "2160": opticalFramePx(2160),
    },
    overflow: {
      outsideTotal: overflow.outsideTotal,
      inkOutsideTotal: overflow.inkOutsideTotal,
      failures: overflow.cases,
    },
    positionInvariant: invariant.map((p) => ({ copy: p.copy, match: p.match, lines: p.lines })),
    alignInvariant: alignInvariant(),
    authoredNewlines: {
      expected: ["WELCOME TO", "THE MBM WORLD", "MADE BY MADELEN"],
      actual: authored,
      match: authored.join("|") === "WELCOME TO|THE MBM WORLD|MADE BY MADELEN",
    },
    independence: independence(),
    longCopy: {
      text: mbmById("welcome-authored").text,
      lines: authored,
      fontSize: welcomeLayout?.fontSize ?? 0,
      lineCount: authored.length,
    },
    twoBlocks,
    proofCount,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
