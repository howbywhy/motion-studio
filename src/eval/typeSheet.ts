import { mbmById } from "./mbmCopy";
import {
  clampTypeState,
  primaryBlock,
  TYPE_ANCHORS,
  type TypeAnchor,
  type TypeRole,
  type TypeState,
} from "../core/typeState";
import { editorialColumnsPx, layoutTypography, layoutTypeDocument, opticalFramePx, typeInkBox } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const ASPECTS: { id: string; w: number; h: number }[] = [
  { id: "4:5", w: 500, h: 625 },
  { id: "9:16", w: 360, h: 640 },
];

interface SheetCase {
  copyId: string;
  role: TypeRole;
  anchor?: TypeAnchor;
  scale?: number;
  spacing?: number;
  weight?: number;
  note?: string;
}

const DISPLAY: SheetCase[] = [
  { copyId: "new", role: "display", scale: 50 },
  { copyId: "new", role: "display", scale: 100, note: "max legal" },
  { copyId: "hello", role: "display", scale: 50 },
  { copyId: "hello", role: "display", scale: 100, note: "max legal" },
  { copyId: "coming-soon", role: "display", scale: 50 },
  { copyId: "coming-soon", role: "display", scale: 100, note: "max legal" },
  { copyId: "name", role: "display", scale: 50 },
  { copyId: "name", role: "display", scale: 100, note: "max legal" },
  { copyId: "welcome", role: "display", scale: 50, note: "long copy" },
  { copyId: "welcome", role: "display", scale: 100, note: "2–3 line lockup" },
  { copyId: "cold", role: "display", scale: 100 },
  { copyId: "redy-break", role: "display", scale: 80 },
];

const EDITORIAL: SheetCase[] = [
  { copyId: "flawed-break", role: "editorial", anchor: "ml", scale: 50, spacing: 40 },
  { copyId: "flawed-break", role: "editorial", anchor: "ml", scale: 50, spacing: 90, note: "open rhythm" },
  { copyId: "flawed-break", role: "editorial", anchor: "ml", scale: 100, spacing: 40, note: "max ≠ display" },
  { copyId: "way", role: "editorial", anchor: "br", scale: 50, spacing: 40 },
  { copyId: "free", role: "editorial", anchor: "ml", scale: 50, spacing: 40, note: "lockup" },
  { copyId: "free", role: "editorial", anchor: "ml", scale: 50, spacing: 90, note: "open rhythm" },
  { copyId: "welcome", role: "editorial", anchor: "ml", scale: 100, note: "vs display" },
];

const CAPTION: SheetCase[] = [
  { copyId: "now", role: "caption", anchor: "bl", scale: 50 },
  { copyId: "now", role: "caption", anchor: "bl", scale: 100, note: "never headline" },
  { copyId: "worn", role: "caption", anchor: "bl", scale: 50 },
  { copyId: "hello", role: "caption", anchor: "tr", scale: 100, note: "stays furniture" },
  { copyId: "name", role: "caption", anchor: "bc", scale: 50 },
];

const FOLIO: SheetCase[] = [
  { copyId: "date-split", role: "folio", anchor: "mc", scale: 20, spacing: 20, note: "furniture" },
  { copyId: "date-split", role: "folio", anchor: "mc", scale: 100, spacing: 100, note: "distributed" },
  { copyId: "date-md", role: "folio", anchor: "tl", scale: 100 },
  { copyId: "year", role: "folio", anchor: "br", scale: 100 },
  { copyId: "ss26-short", role: "folio", anchor: "bl", scale: 20, note: "furniture" },
  { copyId: "ss26-short", role: "folio", anchor: "tl", scale: 100 },
];

const HIERARCHY: SheetCase[] = [
  { copyId: "coming-soon", role: "display", scale: 100 },
  { copyId: "coming-soon", role: "editorial", anchor: "ml", scale: 100, spacing: 40 },
  { copyId: "coming-soon", role: "caption", anchor: "bl", scale: 100 },
  { copyId: "coming-soon", role: "folio", anchor: "tl", scale: 100 },
  { copyId: "hello", role: "display", scale: 100 },
  { copyId: "hello", role: "editorial", anchor: "ml", scale: 100 },
  { copyId: "hello", role: "caption", anchor: "bl", scale: 100 },
  { copyId: "hello", role: "folio", anchor: "tl", scale: 100 },
];

const SCALE_SWEEP: SheetCase[] = [0, 25, 50, 75, 100].flatMap((scale) => [
  { copyId: "hello", role: "display" as const, scale, note: `scale ${scale}` },
  { copyId: "welcome", role: "display" as const, scale, note: `scale ${scale}` },
]);

const POSITION_HELLO: SheetCase[] = TYPE_ANCHORS.map((anchor) => ({
  copyId: "hello",
  role: "display" as const,
  anchor,
  scale: 50,
  note: anchor,
}));

const POSITION_WELCOME: SheetCase[] = TYPE_ANCHORS.map((anchor) => ({
  copyId: "welcome",
  role: "display" as const,
  anchor,
  scale: 100,
  note: anchor,
}));

function defaultAnchor(role: TypeRole): TypeAnchor {
  if (role === "caption") return "bl";
  if (role === "editorial") return "ml";
  if (role === "folio") return "tl";
  return "mc";
}

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
  return clampTypeState({
    enabled: true,
    text: copy.text,
    composition: c.role,
    anchor: c.anchor ?? defaultAnchor(c.role),
    scale: c.scale ?? 50,
    spacing: c.spacing ?? 50,
    weight: c.weight ?? 500,
    color: "#f3efe6",
  });
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
  photoGround(ctx, w, h);
  const layout = layoutTypography(state, w, h);
  if (layout) paintTypeLayer(ctx, layout, layout.color, layout.opacity);
  if (guide) drawGrid(ctx, w, h);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
  return {
    lines: layout?.lines.map((l) => l.text) ?? [],
    fontSize: layout?.fontSize ?? 0,
    tracking: layout?.tracking ?? 0,
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
    const block = primaryBlock(state);
    const extra = [c.note, `s${block.scale}`, `sp${block.spacing}`, block.anchor].filter(Boolean).join(" · ");
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
  for (const item of laid) paintTypeLayer(ctx, item.layout, "#ffffff", 1, null, item.index);
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

const PROOF_SETS: { copyId: string; role: TypeRole; spacing?: number }[] = [
  { copyId: "new", role: "display" },
  { copyId: "hello", role: "display" },
  { copyId: "coming-soon", role: "display" },
  { copyId: "name", role: "display" },
  { copyId: "welcome", role: "display" },
  { copyId: "cold", role: "display" },
  { copyId: "flawed-break", role: "editorial" },
  { copyId: "way", role: "editorial" },
  { copyId: "free", role: "editorial", spacing: 90 },
  { copyId: "now", role: "caption" },
  { copyId: "date-split", role: "folio", spacing: 100 },
  { copyId: "ss26-short", role: "folio" },
  { copyId: "hello", role: "caption" },
  { copyId: "hello", role: "folio" },
  { copyId: "welcome", role: "editorial" },
];

function runOverflowProof(): { cases: ProofCase[]; outsideTotal: number; inkOutsideTotal: number } {
  const cases: ProofCase[] = [];
  let outsideTotal = 0;
  let inkOutsideTotal = 0;
  const scales = [0, 25, 50, 75, 100];
  for (const set of PROOF_SETS) {
    for (const scale of scales) {
      for (const anchor of TYPE_ANCHORS) {
        for (const aspect of ASPECTS) {
          const state = stateFor({
            copyId: set.copyId,
            role: set.role,
            anchor,
            scale,
            spacing: set.spacing ?? 50,
          });
          const layout = layoutTypography(state, aspect.w, aspect.h);
          const frame = opticalFramePx(aspect.w);
          const box = layout ? typeInkBox(layout) : { l: frame, t: frame, r: aspect.w - frame, b: aspect.h - frame };
          const inkOutside =
            box.l < frame - 0.6 ||
            box.t < frame - 0.6 ||
            box.r > aspect.w - frame + 0.6 ||
            box.b > aspect.h - frame + 0.6;
          const outside = countOutsidePixels(aspect.w, aspect.h, state);
          if (inkOutside) inkOutsideTotal += 1;
          outsideTotal += outside;
          if (outside > 0 || inkOutside) {
            cases.push({
              copy: set.copyId,
              role: set.role,
              scale,
              spacing: set.spacing ?? 50,
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
        }
      }
    }
  }
  for (const size of [
    { id: "1080", w: 1080, h: 1350 },
    { id: "2160", w: 2160, h: 2700 },
  ]) {
    for (const copyId of ["hello", "welcome", "date-split"] as const) {
      const role: TypeRole = copyId === "date-split" ? "folio" : "display";
      const spacing = copyId === "date-split" ? 100 : 50;
      for (const anchor of TYPE_ANCHORS) {
        const state = stateFor({ copyId, role, anchor, scale: 100, spacing });
        const layout = layoutTypography(state, size.w, size.h);
        const frame = opticalFramePx(size.w);
        const box = layout ? typeInkBox(layout) : { l: frame, t: frame, r: size.w - frame, b: size.h - frame };
        const inkOutside =
          box.l < frame - 1 ||
          box.t < frame - 1 ||
          box.r > size.w - frame + 1 ||
          box.b > size.h - frame + 1;
        const outside = countOutsidePixels(size.w, size.h, state);
        if (inkOutside) inkOutsideTotal += 1;
        outsideTotal += outside;
        if (outside > 0 || inkOutside) {
          cases.push({
            copy: copyId,
            role,
            scale: 100,
            spacing,
            anchor,
            aspect: size.id,
            w: size.w,
            h: size.h,
            outside,
            inkOutside,
            lines: layout?.lines.map((l) => l.text) ?? [],
            fontSize: layout?.fontSize ?? 0,
          });
        }
      }
    }
  }
  return { cases, outsideTotal, inkOutsideTotal };
}

function positionInvariant(): { copy: string; match: boolean; fontSizes: number[]; lines: string[][] }[] {
  const out: { copy: string; match: boolean; fontSizes: number[]; lines: string[][] }[] = [];
  for (const copyId of ["hello", "welcome", "coming-soon"] as const) {
    const fontSizes: number[] = [];
    const lines: string[][] = [];
    const trackings: number[] = [];
    for (const anchor of TYPE_ANCHORS) {
      const state = stateFor({ copyId, role: "display", anchor, scale: 100 });
      const layout = layoutTypography(state, 500, 625);
      fontSizes.push(layout?.fontSize ?? 0);
      trackings.push(layout?.tracking ?? 0);
      lines.push(layout?.lines.map((l) => l.text) ?? []);
    }
    const lineKey = lines.map((l) => l.join("|"));
    const match =
      lineKey.every((k) => k === lineKey[0]) &&
      fontSizes.every((s) => Math.abs(s - fontSizes[0]) < 0.05) &&
      trackings.every((t) => Math.abs(t - trackings[0]) < 0.05);
    out.push({ copy: copyId, match, fontSizes, lines });
  }
  return out;
}

export interface SheetReport {
  plans: { copy: string; composition: TypeRole; aspect: string; lines: string[]; fontSize: number }[];
  exportParity: { copy: string; preview: string[]; full: string[]; uhd: string[]; match: boolean }[];
  framePx: { "4:5": number; "9:16": number; "1080": number; "2160": number };
  overflow: { outsideTotal: number; inkOutsideTotal: number; failures: ProofCase[] };
  positionInvariant: { copy: string; match: boolean; lines: string[] }[];
  longCopy: { text: string; lines: string[]; fontSize: number; lineCount: number };
  twoBlocks: {
    betweenV: boolean;
    betweenH: boolean;
    justify: { lines: number; lastGap: number; innerGap: number };
  };
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
  title.textContent = "MBM type constraint sheet";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Eval-only. Hairline = 10px optical frame. Position is translation. Scale 100 = max legal. No crop.";
  root.appendChild(lead);

  plans.push(...pages(root, "DISPLAY", DISPLAY, true));
  plans.push(...pages(root, "EDITORIAL", EDITORIAL, true));
  plans.push(...pages(root, "CAPTION", CAPTION, true));
  plans.push(...pages(root, "FOLIO", FOLIO, true));
  plans.push(...pages(root, "SAME COPY · four roles", HIERARCHY, true));
  plans.push(...pages(root, "SCALE 0 / 25 / 50 / 75 / 100", SCALE_SWEEP, true));
  plans.push(...pages(root, "POSITION · HELLO scale 50 · 9 anchors", POSITION_HELLO, true));
  plans.push(...pages(root, "POSITION · long copy scale 100 · 9 anchors", POSITION_WELCOME, true));

  const variants = document.createElement("h2");
  variants.textContent = "Weight 300 / 500 / 700";
  root.appendChild(variants);
  const wgrid = document.createElement("div");
  wgrid.className = "grid";
  root.appendChild(wgrid);
  for (const copyId of ["hello", "welcome", "date-split"]) {
    const role: TypeRole = copyId === "date-split" ? "folio" : "display";
    for (const weight of [300, 500, 700]) {
      const state = stateFor({
        copyId,
        role,
        weight,
        scale: 100,
        spacing: copyId === "date-split" ? 100 : 50,
      });
      cell(wgrid, `${copyId} · ${role} · w${weight}`, 400, 500, state, false);
    }
  }

  const exportParity: SheetReport["exportParity"] = [];
  const parity: { id: string; role: TypeRole; scale: number; spacing: number }[] = [
    { id: "new", role: "display", scale: 100, spacing: 50 },
    { id: "hello", role: "display", scale: 100, spacing: 50 },
    { id: "coming-soon", role: "display", scale: 100, spacing: 50 },
    { id: "name", role: "display", scale: 100, spacing: 50 },
    { id: "welcome", role: "display", scale: 100, spacing: 50 },
    { id: "flawed-break", role: "editorial", scale: 50, spacing: 40 },
    { id: "free", role: "editorial", scale: 50, spacing: 90 },
    { id: "date-split", role: "folio", scale: 100, spacing: 100 },
    { id: "now", role: "caption", scale: 100, spacing: 50 },
  ];
  for (const item of parity) {
    const state = stateFor({
      copyId: item.id,
      role: item.role,
      scale: item.scale,
      spacing: item.spacing,
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
      uhd,
      match: preview.join("|") === full.join("|") && full.join("|") === uhd.join("|"),
    });
  }

  const welcome = stateFor({ copyId: "welcome", role: "display", scale: 100 });
  const welcomeLayout = layoutTypography(welcome, 500, 625);
  const overflow = runOverflowProof();
  const invariant = positionInvariant();
  const proofCount = PROOF_SETS.length * 5 * TYPE_ANCHORS.length * ASPECTS.length + 3 * TYPE_ANCHORS.length * 2;

  const twoFolio = clampTypeState({
    enabled: true,
    arrangement: "between-v",
    blocks: [
      { enabled: true, text: "07.09", composition: "folio", scale: 100, anchor: "tc", color: "#f3efe6" },
      { enabled: true, text: "2026", composition: "folio", scale: 100, anchor: "bc", color: "#f3efe6" },
    ],
  });
  const twoH = clampTypeState({
    enabled: true,
    arrangement: "between-h",
    blocks: [
      { enabled: true, text: "MADE BY MADELEN", composition: "display", scale: 50, anchor: "ml", color: "#f3efe6" },
      { enabled: true, text: "07.09.2026", composition: "folio", scale: 40, anchor: "mr", color: "#f3efe6" },
    ],
  });
  const justState = clampTypeState({
    enabled: true,
    blocks: [{
      enabled: true,
      text: "WELCOME TO THE MBM WORLD MADE BY MADELEN",
      composition: "editorial",
      textAlign: "justify",
      scale: 80,
      spacing: 50,
      color: "#f3efe6",
      anchor: "ml",
    }],
  });
  const vLaid = layoutTypeDocument(twoFolio, 500, 625);
  const hLaid = layoutTypeDocument(twoH, 500, 625);
  const justLayout = layoutTypography(justState, 500, 625);
  const vTop = vLaid[0]?.layout;
  const vBot = vLaid[1]?.layout;
  const hLeft = hLaid[0]?.layout;
  const hRight = hLaid[1]?.layout;
  const betweenV = Boolean(vTop && vBot && vBot.lines[0]!.y - vTop.lines[0]!.y > 200 && vTop.lines[0]!.y < vBot.lines[0]!.y);
  const betweenH = Boolean(hLeft && hRight && hRight.lines[0]!.x - hLeft.lines[0]!.x > 40);

  for (const pair of [twoFolio, twoH, justState]) {
    for (const aspect of [...ASPECTS, { id: "1080", w: 1080, h: 1350 }]) {
      const outside = countOutsidePixels(aspect.w, aspect.h, pair);
      if (outside > 0) overflow.outsideTotal += outside;
    }
  }

  const justInner = justLayout?.lines.slice(0, -1).reduce((m, l) => Math.max(m, l.wordGap), 0) ?? 0;
  const justLast = justLayout?.lines.length ? justLayout.lines[justLayout.lines.length - 1]!.wordGap : 0;

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
    positionInvariant: invariant.map((p) => ({ copy: p.copy, match: p.match, lines: p.lines[0] })),
    longCopy: {
      text: mbmById("welcome").text,
      lines: welcomeLayout?.lines.map((l) => l.text) ?? [],
      fontSize: welcomeLayout?.fontSize ?? 0,
      lineCount: welcomeLayout?.lines.length ?? 0,
    },
    twoBlocks: {
      betweenV,
      betweenH,
      justify: {
        lines: justLayout?.lines.length ?? 0,
        lastGap: justLast,
        innerGap: justInner,
      },
    },
    proofCount,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
