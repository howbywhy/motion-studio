import { mbmById } from "./mbmCopy";
import {
  clampTypeState,
  type TypeAnchor,
  type TypeBlock,
  type TypeColumn,
  type TypeDistribution,
  type TypeState,
} from "../core/typeState";
import { editorialColumnsPx, layoutTypography, layoutTypeDocument, opticalFramePx, typeGeometryKey, typeInkBox } from "../core/typeLayout";
import { paintTypeLayer } from "../core/typePaint";
import { loadSwitzer, switzerReady } from "../core/typeFont";

const ASPECTS: { id: string; w: number; h: number }[] = [
  { id: "4:5", w: 500, h: 625 },
  { id: "9:16", w: 360, h: 640 },
];

function photoGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#6a3f2c");
  g.addColorStop(0.45, "#8a5a3a");
  g.addColorStop(1, "#3d2418");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
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

function block(partial: Partial<TypeBlock>): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, color: "#f3efe6", ...partial },
      { enabled: false, text: "", composition: "headline" },
    ],
  });
}

function pair(a: Partial<TypeBlock>, b: Partial<TypeBlock>): TypeState {
  return clampTypeState({
    enabled: true,
    blocks: [
      { enabled: true, color: "#f3efe6", ...a },
      { enabled: true, color: "#f3efe6", ...b },
    ],
  });
}

function cell(
  parent: HTMLElement,
  label: string,
  w: number,
  h: number,
  state: TypeState,
): ReturnType<typeof layoutTypeDocument> {
  const wrap = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  photoGround(ctx, w, h);
  const laid = layoutTypeDocument(state, w, h);
  for (const item of laid) paintTypeLayer(ctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  drawGrid(ctx, w, h);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
  return laid;
}

function section(root: HTMLElement, title: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  return root;
}

function row(root: HTMLElement): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "page-row";
  root.appendChild(el);
  return el;
}

function fingerprint(state: TypeState, w = 500, h = 625): { fontSize: number; tracking: number; leading: number; lines: string } {
  const layout = layoutTypography(state, w, h);
  return {
    fontSize: layout?.fontSize ?? 0,
    tracking: layout?.tracking ?? 0,
    leading: layout?.lineHeight ?? 0,
    lines: layout?.lines.map((l) => l.text).join("|") ?? "",
  };
}

function countOutside(w: number, h: number, state: TypeState): { pixels: number; ink: boolean } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const laid = layoutTypeDocument(state, w, h);
  for (const item of laid) paintTypeLayer(ctx, item.layout, "#ffffff", 1, undefined, item.index);
  const frame = opticalFramePx(w);
  let ink = false;
  for (const item of laid) {
    const box = typeInkBox(item.layout);
    if (box.l < frame - 0.6 || box.t < frame - 0.6 || box.r > w - frame + 0.6 || box.b > h - frame + 0.6) ink = true;
  }
  let pixels = 0;
  if (ink) {
    const img = ctx.getImageData(0, 0, w, h).data;
    const insideL = Math.ceil(frame);
    const insideT = Math.ceil(frame);
    const insideR = Math.floor(w - frame);
    const insideB = Math.floor(h - frame);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= insideL && x < insideR && y >= insideT && y < insideB) continue;
        const i = (y * w + x) * 4;
        if (img[i]! > 12) pixels += 1;
      }
    }
  }
  return { pixels, ink };
}

export interface SheetReport {
  coupling: {
    distributionIndependent: boolean;
    frameAlignIndependent: boolean;
    gapIndependent: boolean;
    textAlignIndependent: boolean;
    gapMovesRows: boolean;
    betweenMovesRows: boolean;
    sizes: number[];
  };
  spaceBetween: { two: boolean; three: boolean; date: boolean };
  paragraphReadable: { column: TypeColumn; fontSize: number; lines: number; ok: boolean }[];
  styleCeilings: { headline: number; paragraph: number; footnote: number; ordered: boolean };
  overflow: { ink: number; pixels: number };
  exportParity: { copy: string; match: boolean }[];
  needType03: { evidence: string[]; verdict: "two-enough" | "three-would-help" };
  geometryUnchangedByBlend: boolean;
  elapsedMs: number;
}

export async function runTypeSheet(root: HTMLElement): Promise<SheetReport> {
  const ok = await loadSwitzer();
  if (!ok || !switzerReady()) throw new Error("Switzer Variable failed to load");
  const t0 = performance.now();
  root.innerHTML = "";
  const title = document.createElement("h1");
  title.textContent = "MBM editorial frame layout";
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.textContent = "Static type. Frame align + distribution + padding. Scale sizes. Distribution places.";
  root.appendChild(lead);

  section(root, "TEST A — two rows");
  const two = "FIRST LINE\nSECOND LINE";
  for (const spec of [
    { note: "Top Packed", anchor: "tl" as TypeAnchor, distribution: "packed" as TypeDistribution },
    { note: "Centre Packed", anchor: "ml" as TypeAnchor, distribution: "packed" as TypeDistribution },
    { note: "Bottom Packed", anchor: "bl" as TypeAnchor, distribution: "packed" as TypeDistribution },
    { note: "Space Between", anchor: "ml" as TypeAnchor, distribution: "between" as TypeDistribution },
  ]) {
    const r = row(root);
    const state = block({
      text: two,
      composition: "headline",
      scale: 70,
      textAlign: "left",
      anchor: spec.anchor,
      distribution: spec.distribution,
      gap: 20,
    });
    for (const aspect of ASPECTS) {
      cell(r, `${spec.note} · ${aspect.id}`, aspect.w, aspect.h, state);
    }
  }

  section(root, "TEST B — three rows Space Between");
  {
    const r = row(root);
    const state = block({
      text: "FIRST LINE\nSECOND LINE\nTHIRD LINE",
      composition: "headline",
      scale: 70,
      textAlign: "left",
      anchor: "ml",
      distribution: "between",
    });
    for (const aspect of ASPECTS) cell(r, `three · ${aspect.id}`, aspect.w, aspect.h, state);
  }

  section(root, "TEST C — date 09.07 / 2026");
  {
    const r = row(root);
    const state = block({
      text: "09.07\n2026",
      composition: "headline",
      scale: 100,
      textAlign: "left",
      anchor: "ml",
      distribution: "between",
    });
    for (const aspect of ASPECTS) cell(r, `date · ${aspect.id}`, aspect.w, aspect.h, state);
  }

  section(root, "TEST D — paragraph width");
  const para = mbmById("kelly").text;
  const paragraphReadable: SheetReport["paragraphReadable"] = [];
  for (const column of ["narrow", "medium", "wide"] as TypeColumn[]) {
    const r = row(root);
    const state = block({
      text: para,
      composition: "paragraph",
      scale: 100,
      column,
      anchor: "ml",
      leading: 52,
    });
    for (const aspect of ASPECTS) {
      const laid = cell(r, `${column} · ${aspect.id}`, aspect.w, aspect.h, state);
      if (aspect.id === "4:5") {
        const layout = laid[0]?.layout;
        paragraphReadable.push({
          column,
          fontSize: layout?.fontSize ?? 0,
          lines: layout?.lines.length ?? 0,
          ok: (layout?.fontSize ?? 0) >= 14,
        });
      }
    }
  }

  section(root, "TEST E — mixed pages (two blocks)");
  const mixes: { title: string; a: Partial<TypeBlock>; b: Partial<TypeBlock> }[] = [
    {
      title: "01 Headline date Between + Paragraph BL",
      a: { text: "09.07\n2026", composition: "headline", scale: 80, distribution: "between", anchor: "mc", textAlign: "center" },
      b: { text: para, composition: "paragraph", scale: 40, column: "medium", anchor: "bl" },
    },
    {
      title: "02 COMING SOON BL + footnote date TR",
      a: { text: "COMING SOON", composition: "headline", scale: 80, anchor: "bl" },
      b: { text: "07.09.2026", composition: "footnote", scale: 80, anchor: "tr" },
    },
    {
      title: "03 two-line Between + MADE BY MADELEN BR",
      a: { text: "FIRST LINE\nSECOND LINE", composition: "headline", scale: 80, distribution: "between", anchor: "ml" },
      b: { text: "MADE BY MADELEN", composition: "footnote", scale: 70, anchor: "br" },
    },
    {
      title: "04 Headline + Footnote — missing Paragraph",
      a: { text: "09.07\n2026", composition: "headline", scale: 90, distribution: "between", anchor: "ml" },
      b: { text: "MADE BY MADELEN", composition: "footnote", scale: 70, anchor: "br" },
    },
    {
      title: "05 Paragraph + Footnote — missing Headline",
      a: { text: para, composition: "paragraph", scale: 55, column: "medium", anchor: "tl" },
      b: { text: "SS26", composition: "footnote", scale: 80, anchor: "br" },
    },
  ];
  for (const mix of mixes) {
    const r = row(root);
    const state = pair(mix.a, mix.b);
    for (const aspect of ASPECTS) cell(r, `${mix.title} · ${aspect.id}`, aspect.w, aspect.h, state);
  }

  const base = block({
    text: two,
    composition: "headline",
    scale: 70,
    textAlign: "left",
    anchor: "ml",
    distribution: "packed",
    gap: 20,
  });
  const fp0 = fingerprint(base);
  const distFp = fingerprint(block({
    text: two, composition: "headline", scale: 70, textAlign: "left", anchor: "ml", distribution: "between", gap: 20,
  }));
  const frameFp = fingerprint(block({
    text: two, composition: "headline", scale: 70, textAlign: "left", anchor: "br", distribution: "packed", gap: 20,
  }));
  const gapFp = fingerprint(block({
    text: two, composition: "headline", scale: 70, textAlign: "left", anchor: "ml", distribution: "packed", gap: 80,
  }));
  const alignFp = fingerprint(block({
    text: two, composition: "headline", scale: 70, textAlign: "right", anchor: "ml", distribution: "packed", gap: 20,
  }));
  const packedYs = layoutTypography(base, 500, 625)?.lines.map((l) => Math.round(l.y)) ?? [];
  const gapYs = layoutTypography(block({
    text: two, composition: "headline", scale: 70, textAlign: "left", anchor: "ml", distribution: "packed", gap: 80,
  }), 500, 625)?.lines.map((l) => Math.round(l.y)) ?? [];
  const betweenYs = layoutTypography(block({
    text: two, composition: "headline", scale: 70, textAlign: "left", anchor: "ml", distribution: "between", gap: 20,
  }), 500, 625)?.lines.map((l) => Math.round(l.y)) ?? [];

  const twoState = block({
    text: two, composition: "headline", scale: 70, textAlign: "left", anchor: "ml", distribution: "between",
  });
  const twoLaid = layoutTypography(twoState, 500, 625)!;
  const twoBox = typeInkBox(twoLaid);
  const threeState = block({
    text: "FIRST LINE\nSECOND LINE\nTHIRD LINE", composition: "headline", scale: 70, distribution: "between", anchor: "ml",
  });
  const threeLaid = layoutTypography(threeState, 500, 625)!;
  const threeBox = typeInkBox(threeLaid);
  const threeUnitYs = [...new Set(threeLaid.lines.map((l) => l.unit))]
    .map((unit) => threeLaid.lines.find((l) => l.unit === unit)!.y);
  const dateState = block({
    text: "09.07\n2026", composition: "headline", scale: 100, distribution: "between", anchor: "ml",
  });
  const dateLaid = layoutTypography(dateState, 500, 625)!;
  const dateBox = typeInkBox(dateLaid);
  const framePx = opticalFramePx(500);

  const spaceBetween = {
    two: twoLaid.lines.map((l) => l.text).join("|") === "FIRST LINE|SECOND LINE" &&
      twoBox.t < framePx + 2 && twoBox.b > 625 - framePx - 2,
    three: threeLaid.lines.map((l) => l.text).join("|") === "FIRST LINE|SECOND LINE|THIRD LINE" &&
      threeBox.t < framePx + 2 && threeBox.b > 625 - framePx - 2 &&
      threeUnitYs.length === 3 &&
      Math.abs((threeUnitYs[1]! - threeUnitYs[0]!) - (threeUnitYs[2]! - threeUnitYs[1]!)) < 8,
    date: dateLaid.lines.map((l) => l.text).join("|") === "09.07|2026" &&
      dateBox.t < framePx + 2 && dateBox.b > 625 - framePx - 2 && dateLaid.fontSize > 40,
  };

  const proofs: TypeState[] = [
    base, twoState, threeState, dateState,
    block({ text: para, composition: "paragraph", scale: 100, column: "wide", anchor: "ml" }),
    block({ text: "NOW AVAILABLE", composition: "footnote", scale: 100, anchor: "bl" }),
    pair(
      { text: "09.07\n2026", composition: "headline", scale: 100, distribution: "between", anchor: "ml" },
      { text: para, composition: "paragraph", scale: 40, column: "medium", anchor: "br" },
    ),
  ];
  let ink = 0;
  let pixels = 0;
  for (const state of proofs) {
    for (const aspect of [...ASPECTS, { id: "1080", w: 1080, h: 1350 }]) {
      const r = countOutside(aspect.w, aspect.h, state);
      if (r.ink) ink += 1;
      pixels += r.pixels;
    }
  }

  const exportParity = [
    { copy: "two-rows", state: twoState, sizes: [[500, 625], [1080, 1350], [2160, 2700]] as [number, number][] },
    { copy: "date", state: dateState, sizes: [[500, 625], [1080, 1350], [2160, 2700]] as [number, number][] },
    { copy: "paragraph-4:5", state: block({ text: para, composition: "paragraph", scale: 100, column: "medium", anchor: "ml" }), sizes: [[500, 625], [1080, 1350], [2160, 2700]] as [number, number][] },
    { copy: "paragraph-9:16", state: block({ text: para, composition: "paragraph", scale: 100, column: "medium", anchor: "ml" }), sizes: [[360, 640], [1080, 1920], [2160, 3840]] as [number, number][] },
    { copy: "date-9:16", state: dateState, sizes: [[360, 640], [1080, 1920], [2160, 3840]] as [number, number][] },
  ].map((item) => {
    const plans = item.sizes.map(([w, h]) => layoutTypography(item.state, w, h)?.lines.map((l) => l.text).join("|"));
    return { copy: item.copy, match: plans.every((p) => p === plans[0]) };
  });

  const needType03: SheetReport["needType03"] = {
    evidence: [
      "Headline date + Paragraph standfirst uses both blocks; Footnote credit cannot join that page.",
      "COMING SOON + 07.09.2026 works as Headline + Footnote without a third block.",
      "A campaign page that wants date (Headline), body (Paragraph) and MADE BY MADELEN (Footnote) simultaneously cannot be authored with two blocks.",
    ],
    verdict: "three-would-help",
  };

  const styleCeilings = {
    headline: layoutTypography(block({ text: "COMING SOON", composition: "headline", scale: 100, anchor: "mc" }), 500, 625)?.fontSize ?? 0,
    paragraph: layoutTypography(block({ text: para, composition: "paragraph", scale: 100, column: "medium", anchor: "ml" }), 500, 625)?.fontSize ?? 0,
    footnote: layoutTypography(block({ text: "NOW AVAILABLE", composition: "footnote", scale: 100, anchor: "bl" }), 500, 625)?.fontSize ?? 0,
    ordered: false,
  };
  styleCeilings.ordered = styleCeilings.headline > styleCeilings.paragraph && styleCeilings.paragraph > styleCeilings.footnote;

  return {
    coupling: {
      distributionIndependent: Math.abs(fp0.fontSize - distFp.fontSize) < 0.05 && fp0.lines === distFp.lines,
      frameAlignIndependent: Math.abs(fp0.fontSize - frameFp.fontSize) < 0.05 && fp0.lines === frameFp.lines,
      gapIndependent: Math.abs(fp0.fontSize - gapFp.fontSize) < 0.05 && fp0.lines === gapFp.lines,
      textAlignIndependent: Math.abs(fp0.fontSize - alignFp.fontSize) < 0.05 && fp0.lines === alignFp.lines,
      gapMovesRows: packedYs.length === gapYs.length && packedYs.join(",") !== gapYs.join(","),
      betweenMovesRows: packedYs.length === betweenYs.length && packedYs.join(",") !== betweenYs.join(","),
      sizes: [fp0.fontSize, distFp.fontSize, frameFp.fontSize, gapFp.fontSize, alignFp.fontSize],
    },
    spaceBetween,
    paragraphReadable,
    styleCeilings,
    overflow: { ink, pixels },
    exportParity,
    needType03,
    geometryUnchangedByBlend: typeGeometryKey(dateState, 500, 625) ===
      typeGeometryKey(clampTypeState({
        enabled: true,
        blocks: [
          { ...dateState.blocks[0], blendMode: "difference" },
          dateState.blocks[1],
        ],
      }), 500, 625),
    elapsedMs: Math.round(performance.now() - t0),
  };
}
