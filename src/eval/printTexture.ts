import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState } from "../core/typeState";
import { clampMarkState } from "../core/markState";
import { loadSwitzer } from "../core/typeFont";
import { bindEvalIdentityTexture, bindEvalTextureMaterial, lastIdentityTextureMs, lastTextureAudit, type IdentityTextureMaterial } from "../core/identityTexture";
import { runExport } from "../core/exportSession";

const MATERIALS: { id: IdentityTextureMaterial; label: string }[] = [
  { id: "current", label: "A CURRENT" },
  { id: "print", label: "B PRINT" },
  { id: "registration", label: "C REGISTRATION" },
  { id: "print-reactive", label: "D PRINT+REACTIVE" },
];

const PHASES: { id: string; phase: number }[] = [
  { id: "HOLD", phase: 0.04 },
  { id: "EARLY BLOOM", phase: 0.42 },
  { id: "MID BLOOM", phase: 0.5 },
  { id: "LATE BLOOM", phase: 0.58 },
  { id: "B HOLD", phase: 0.74 },
  { id: "WRAP", phase: 0.992 },
];

const ZOOMS: { label: string; nx: number; ny: number }[] = [
  { label: "skin", nx: 0.52, ny: 0.22 },
  { label: "hair", nx: 0.5, ny: 0.12 },
  { label: "garment", nx: 0.42, ny: 0.42 },
  { label: "flat bg", nx: 0.82, ny: 0.18 },
  { label: "bloom edge", nx: 0.5, ny: 0.5 },
];

function bloomParams() {
  const found = presetsForTreatment("clean").find((p) => p.label === "Balanced");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...(found?.values ?? {}),
    resolveLimit: 100,
  };
}

function fallback(label: string, fill: string): MediaAsset {
  const c = document.createElement("canvas");
  c.width = 840;
  c.height = 1050;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 840, 1050);
  ctx.fillStyle = "#f3efe6";
  ctx.font = "48px sans-serif";
  ctx.fillText(label, 36, 80);
  return { kind: "image", source: c, naturalW: 840, naturalH: 1050, label, transform: defaultTransform() };
}

async function loadImage(url: string, label: string): Promise<MediaAsset> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error(url));
      img.src = url;
    });
    return {
      kind: "image",
      source: img,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      label,
      transform: defaultTransform(),
    };
  } catch {
    return fallback(label, "#3a3028");
  }
}

async function loadVideo(url: string, label: string, host: HTMLElement): Promise<MediaAsset> {
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    host.appendChild(video);
    await new Promise<void>((res, rej) => {
      video.addEventListener("loadeddata", () => res(), { once: true });
      video.addEventListener("error", () => rej(new Error(url)), { once: true });
      video.src = url;
    });
    return {
      kind: "video",
      source: video,
      naturalW: video.videoWidth,
      naturalH: video.videoHeight,
      label,
      transform: defaultTransform(),
      videoEl: video,
    };
  } catch {
    return fallback(label, "#1a1814");
  }
}

function copyFrame(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

function cropZoom(src: HTMLCanvasElement, nx: number, ny: number, box = 72, out = 144): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  const ctx = c.getContext("2d")!;
  const sx = Math.max(0, Math.min(src.width - box, Math.round(nx * src.width - box / 2)));
  const sy = Math.max(0, Math.min(src.height - box, Math.round(ny * src.height - box / 2)));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, box, box, 0, 0, out, out);
  return c;
}

const stage = document.getElementById("stage")!;
const sheets = document.getElementById("sheets")!;
const opts = document.getElementById("opts")!;
const hud = document.getElementById("hud")!;
const perfEl = document.getElementById("perf")!;

const canvas = document.createElement("canvas");
stage.appendChild(canvas);
const renderer = new Renderer(canvas);
renderer.setBehavior(bloomBehavior, bloomParams());
renderer.setPlaybackMode("loop");
renderer.setLoopSeconds(8);
renderer.setEndBehaviour({ mode: "off" });
renderer.setClockMode("hold");
renderer.setProfiling(true);
renderer.setRegistrationEnabled(true);
renderer.setTransitionFlickerEnabled(false);

let aspect: "4:5" | "9:16" = "4:5";
let mediaKind: "portrait" | "dark" | "light" | "video" = "portrait";
let exportStatus = "";
const timings: Record<string, { prep: number; paint: number; total: number; cellA: number; cellB: number }> = {};

function dim(kind: "preview" | "1080" = "preview"): { w: number; h: number } {
  if (kind === "1080") return aspect === "9:16" ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 };
  return aspect === "9:16" ? { w: 315, h: 560 } : { w: 420, h: 525 };
}

function bindMaterial(material: IdentityTextureMaterial): void {
  bindEvalIdentityTexture(renderer, true);
  bindEvalTextureMaterial(renderer, material);
  renderer.setMarkState(clampMarkState({
    enabled: true,
    mode: "intro",
    scale: 40,
    sequenceStart: 0,
    sequenceStop: 1,
  }));
  renderer.setTypeState(clampTypeState({
    ...renderer.getTypeState(),
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: ["TURN", "STAY"],
    sequenceSizeModes: ["auto", "auto"],
    sequenceSizes: [48, 48],
    sequenceAnchors: ["inherit", "inherit"],
    blocks: [{ enabled: true, text: "", scale: 48, composition: "headline", textAlign: "center", anchor: "bc" }],
  }));
}

async function buildMedia(): Promise<void> {
  const host = renderer.getVideoHost();
  const items: { id: string; asset: MediaAsset }[] = [];
  if (mediaKind === "portrait") {
    items.push({ id: "src-0", asset: await loadImage("/eval/stress-media/02-turn.mp4.png", "portrait") });
    items.push({ id: "src-1", asset: await loadImage("/eval/stress-media/03-booth.jpg", "booth") });
  } else if (mediaKind === "dark") {
    items.push({ id: "src-0", asset: await loadImage("/eval/stress-media/03-booth.jpg", "booth") });
    items.push({ id: "src-1", asset: await loadImage("/eval/stress-media/04-speaker.jpg", "speaker") });
  } else if (mediaKind === "light") {
    items.push({ id: "src-0", asset: await loadImage("/eval/stress-media/01-fence-cat.jpg", "cat") });
    items.push({ id: "src-1", asset: await loadImage("/eval/stress-media/04-speaker.jpg", "speaker") });
  } else {
    items.push({ id: "src-0", asset: await loadVideo("/eval/stress-media/02-turn.mp4", "turn", host) });
    items.push({ id: "src-1", asset: await loadImage("/eval/stress-media/03-booth.jpg", "booth") });
  }
  const size = dim();
  renderer.resizeExact(size.w, size.h);
  renderer.setSequence(items, items[0]!.id);
  bindMaterial("print-reactive");
}

function capture(material: IdentityTextureMaterial, phase: number, size = dim()): HTMLCanvasElement {
  if (renderer.getCanvasSize().width !== size.w || renderer.getCanvasSize().height !== size.h) {
    renderer.resizeExact(size.w, size.h);
  }
  bindMaterial(material);
  renderer.setClockMode("hold");
  renderer.setHoldPhase(phase);
  renderer.renderFrame();
  const live = renderer.getVisibleCanvas();
  const prof = renderer.lastProfile;
  if (prof) {
    timings[`${material}@${size.w}x${size.h}@${phase.toFixed(2)}`] = {
      prep: prof.printPrepMs,
      paint: lastIdentityTextureMs,
      total: prof.totalMs,
      cellA: lastTextureAudit.cellA,
      cellB: lastTextureAudit.cellB,
    };
  }
  return copyFrame(live, live.width, live.height);
}

function addSheet(title: string, size: { w: number; h: number }, phases = PHASES): void {
  const wrap = document.createElement("section");
  const h = document.createElement("h2");
  h.textContent = title;
  wrap.appendChild(h);
  const table = document.createElement("table");
  const head = document.createElement("tr");
  head.innerHTML = `<th>Phase</th>${MATERIALS.map((m) => `<th>${m.label}</th>`).join("")}`;
  table.appendChild(head);
  for (const row of phases) {
    const tr = document.createElement("tr");
    const lab = document.createElement("td");
    lab.textContent = row.id;
    tr.appendChild(lab);
    for (const material of MATERIALS) {
      const td = document.createElement("td");
      const shot = capture(material.id, row.phase, size);
      const shown = copyFrame(shot, Math.min(210, size.w), Math.round(Math.min(210, size.w) * (size.h / size.w)));
      td.appendChild(shown);
      if (row.id === "HOLD" || row.id === "MID BLOOM") {
        const zooms = document.createElement("div");
        zooms.className = "zoom";
        for (const z of ZOOMS) {
          const fig = document.createElement("figure");
          fig.appendChild(cropZoom(shot, z.nx, z.ny, Math.max(48, Math.round(size.w * 0.12))));
          const cap = document.createElement("figcaption");
          cap.textContent = z.label;
          fig.appendChild(cap);
          zooms.appendChild(fig);
        }
        td.appendChild(zooms);
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  sheets.appendChild(wrap);
}

function renderSheets(): void {
  sheets.innerHTML = "";
  const preview = dim();
  addSheet(`${aspect} preview ${preview.w}×${preview.h}  ${mediaKind}`, preview);
  hud.textContent = [
    `material audit  cellA ${lastTextureAudit.cellA.toFixed(2)}  cellB ${lastTextureAudit.cellB.toFixed(2)}`,
    `canvas ${lastTextureAudit.width}×${lastTextureAudit.height}  dpr ${lastTextureAudit.dpr}`,
    `product default PRINT+REACTIVE   Registration remains ring-only`,
    exportStatus,
  ].filter(Boolean).join("\n");
  perfEl.textContent = Object.entries(timings)
    .map(([k, v]) => `${k}  prep ${v.prep.toFixed(1)}ms  paint ${v.paint.toFixed(1)}ms  frame ${v.total.toFixed(1)}ms  cell ${v.cellA.toFixed(2)}/${v.cellB.toFixed(2)}`)
    .join("\n");
  bindMaterial("print-reactive");
}

function button(parent: HTMLElement, label: string, on: boolean, click: () => void): void {
  const b = document.createElement("button");
  b.textContent = label;
  if (on) b.className = "is-on";
  b.addEventListener("click", click);
  parent.appendChild(b);
}

async function exportPiece(label: string, size: "preview" | "1080", pieceAspect: "4:5" | "9:16"): Promise<void> {
  aspect = pieceAspect;
  const preview = dim();
  renderer.resizeExact(preview.w, preview.h);
  bindMaterial("print-reactive");
  renderer.setClockMode("auto");
  renderer.setHoldPhase(0);
  const result = await runExport(
    renderer,
    { format: "mp4", fps: 30, size, quality: "standard", aspect: pieceAspect, includeAudio: false },
    { behaviorId: "bloom", treatment: label },
    (p) => {
      exportStatus = `${label}  ${p.label}`;
      hud.textContent = exportStatus;
    },
    new AbortController().signal,
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(result.blob);
  a.download = result.filename;
  a.click();
  exportStatus = `${label}  ${result.width}×${result.height}  ${(result.bytes / 1024).toFixed(0)}kb`;
}

function redrawBars(): void {
  opts.innerHTML = "";
  for (const id of ["portrait", "dark", "light", "video"] as const) {
    button(opts, id.toUpperCase(), mediaKind === id, () => {
      mediaKind = id;
      void buildMedia().then(() => {
        renderSheets();
        redrawBars();
      });
    });
  }
  button(opts, aspect, true, () => {
    aspect = aspect === "4:5" ? "9:16" : "4:5";
    renderer.resizeExact(dim().w, dim().h);
    renderSheets();
    redrawBars();
  });
  button(opts, "REBUILD SHEET", false, () => renderSheets());
  button(opts, "1080 HOLD/MID", false, () => {
    addSheet("1080 export space — HOLD / MID", dim("1080"), [
      { id: "HOLD", phase: 0.04 },
      { id: "MID BLOOM", phase: 0.5 },
    ]);
    renderer.resizeExact(dim().w, dim().h);
    hud.textContent = [
      `1080 audit  cellA ${lastTextureAudit.cellA.toFixed(2)}  cellB ${lastTextureAudit.cellB.toFixed(2)}`,
      `canvas ${lastTextureAudit.width}×${lastTextureAudit.height}`,
      exportStatus,
    ].filter(Boolean).join("\n");
    perfEl.textContent = Object.entries(timings)
      .map(([k, v]) => `${k}  prep ${v.prep.toFixed(1)}ms  paint ${v.paint.toFixed(1)}ms  frame ${v.total.toFixed(1)}ms  cell ${v.cellA.toFixed(2)}/${v.cellB.toFixed(2)}`)
      .join("\n");
  });
  button(opts, "EXPORT 4:5 STILLS", false, () => {
    mediaKind = "portrait";
    void buildMedia().then(() => exportPiece("print-4x5-stills", "1080", "4:5")).then(redrawBars);
  });
  button(opts, "EXPORT 4:5 VIDEO", false, () => {
    mediaKind = "video";
    void buildMedia().then(() => exportPiece("print-4x5-mixed", "1080", "4:5")).then(redrawBars);
  });
  button(opts, "EXPORT 9:16", false, () => {
    mediaKind = "portrait";
    void buildMedia().then(() => exportPiece("print-9x16", "1080", "9:16")).then(redrawBars);
  });
}

void loadSwitzer().then(async () => {
  await buildMedia();
  renderSheets();
  redrawBars();
});

Object.assign(window, {
  __printTexture: {
    capture,
    timings: () => timings,
    audit: () => lastTextureAudit,
    setMedia: async (kind: typeof mediaKind) => {
      mediaKind = kind;
      await buildMedia();
    },
    setAspect: (next: "4:5" | "9:16") => {
      aspect = next;
      renderer.resizeExact(dim().w, dim().h);
    },
    bindMaterial,
    renderer,
  },
});
