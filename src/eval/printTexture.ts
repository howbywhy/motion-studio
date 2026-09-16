import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { defaultTransform, type MediaAsset } from "../core/media";
import { defaultParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampTypeState } from "../core/typeState";
import { clampMarkState } from "../core/markState";
import { loadSwitzer } from "../core/typeFont";
import { bindEvalIdentityTexture, bindEvalTextureMaterial, lastIdentityTextureMs, lastTextureAudit, type IdentityTextureMaterial } from "../core/identityTexture";
import { lastPrintAudit, lastPrintTiming, printScreenPeriod } from "../core/identityPrintMaterial";
import { runExport } from "../core/exportSession";

const SCREEN_MATERIALS: { id: IdentityTextureMaterial; label: string }[] = [
  { id: "reactive-registration", label: "A CLEAN" },
  { id: "halftone-dot", label: "B FINE DOT" },
  { id: "halftone-elliptical", label: "C FINE ELLIPSE" },
  { id: "halftone-soft", label: "D FINE SOFT" },
];

const PRINT_MATERIALS: { id: IdentityTextureMaterial; label: string }[] = [
  { id: "halftone-soft", label: "A SCREEN" },
  { id: "halftone-registration", label: "B SCREEN+REG" },
  { id: "halftone-registration-strong", label: "C STRONGER REG" },
  { id: "print-identity", label: "D PRINT+BLOOM" },
];

const MATERIALS = PRINT_MATERIALS;

const PHASES: { id: string; phase: number }[] = [
  { id: "HOLD", phase: 0.04 },
  { id: "EARLY BLOOM", phase: 0.42 },
  { id: "MID BLOOM", phase: 0.5 },
  { id: "LATE BLOOM", phase: 0.58 },
  { id: "B HOLD", phase: 0.74 },
  { id: "WRAP", phase: 0.992 },
];

const ZOOMS: { label: string; nx: number; ny: number }[] = [
  { label: "flat bg", nx: 0.82, ny: 0.18 },
  { label: "cheek", nx: 0.52, ny: 0.22 },
  { label: "white fabric", nx: 0.42, ny: 0.42 },
  { label: "hair", nx: 0.5, ny: 0.12 },
  { label: "pattern", nx: 0.48, ny: 0.58 },
  { label: "bloom edge", nx: 0.5, ny: 0.5 },
];

const FLOOR_MATERIALS: { id: IdentityTextureMaterial; label: string }[] = [
  { id: "print-floor-00", label: "D0 CURRENT" },
  { id: "print-floor-10", label: "F10" },
  { id: "print-floor-15", label: "F15" },
  { id: "print-floor-20", label: "F20" },
];

const PRODUCT_MATERIAL: IdentityTextureMaterial = "print-identity";

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
renderer.setTransitionFlickerEnabled(true);

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
  bindMaterial(PRODUCT_MATERIAL);
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

function addSheet(
  title: string,
  size: { w: number; h: number },
  phases = PHASES,
  materials = MATERIALS,
): void {
  const wrap = document.createElement("section");
  const h = document.createElement("h2");
  h.textContent = title;
  wrap.appendChild(h);
  const table = document.createElement("table");
  const head = document.createElement("tr");
  head.innerHTML = `<th>Phase</th>${materials.map((m) => `<th>${m.label}</th>`).join("")}`;
  table.appendChild(head);
  for (const row of phases) {
    const tr = document.createElement("tr");
    const lab = document.createElement("td");
    lab.textContent = row.id;
    tr.appendChild(lab);
    for (const material of materials) {
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

function renderTypePrint(): void {
  const host = document.getElementById("type-print");
  if (!host) return;
  host.innerHTML = "";
  const modes: { id: string; label: string; split: number; blur: number }[] = [
    { id: "A", label: "A CRISP", split: 0, blur: 0 },
    { id: "B", label: "B SPLIT", split: 0.45, blur: 0 },
    { id: "C", label: "C SPLIT+INK", split: 0.45, blur: 0.35 },
  ];
  for (const mode of modes) {
    const fig = document.createElement("figure");
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 120;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#111214";
    ctx.fillRect(0, 0, 320, 120);
    ctx.fillStyle = "#f3efe6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 42px Switzer, sans-serif";
    if (mode.blur > 0) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.filter = `blur(${mode.blur}px)`;
      ctx.fillText("MADELEN", 160 + mode.split, 60 - mode.split * 0.3);
      ctx.restore();
    }
    if (mode.split > 0) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillText("MADELEN", 160 + mode.split, 60 - mode.split * 0.3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillText("MADELEN", 160, 60);
    const cap = document.createElement("figcaption");
    cap.textContent = mode.label;
    fig.appendChild(c);
    fig.appendChild(cap);
    host.appendChild(fig);
  }
}

function renderUx(): void {
  const host = document.getElementById("ux");
  if (!host) return;
  host.innerHTML = `
    <div class="ux-card">
      <h3>Model A — controls</h3>
      <div class="ux-row"><span>Print</span><span>On</span></div>
      <div class="ux-row"><span>Halftone</span><span>On / Off</span></div>
      <div class="ux-row"><span>Registration</span><span>On / Off</span></div>
      <p class="note">Invites an effects generator. A designer can remove the identity screen.</p>
    </div>
    <div class="ux-card">
      <h3>Model B — authored</h3>
      <div class="ux-row"><span>Print</span><span>On / Off</span></div>
      <div class="ux-row"><span>Bloom</span><span>existing</span></div>
      <div class="ux-row"><span>Flicker</span><span>On / Off</span></div>
      <div class="ux-row"><span>Signature</span><span>On / Off</span></div>
      <p class="note">Halftone and print registration stay inside Print. Product now uses this.</p>
    </div>
  `;
}

function renderSheets(): void {
  sheets.innerHTML = "";
  const preview = dim();
  addSheet(`Screen structure  ${aspect} ${preview.w}×${preview.h}`, preview, [
    { id: "HOLD", phase: 0.04 },
    { id: "MID BLOOM", phase: 0.5 },
  ], SCREEN_MATERIALS);
  addSheet(`Print combination  ${aspect} ${preview.w}×${preview.h}  ${mediaKind}`, preview);
  renderTypePrint();
  renderUx();
  const period = printScreenPeriod(preview.w, preview.h);
  const p1080 = printScreenPeriod(1080, aspect === "9:16" ? 1920 : 1350);
  hud.textContent = [
    `screen period  preview ${period.toFixed(2)}px  1080 ${p1080.toFixed(2)}px  ref ${lastPrintAudit.period.toFixed(2)}px`,
    `canvas ${lastTextureAudit.width}×${lastTextureAudit.height}  kind ${lastPrintAudit.kind}`,
    `product default PRINT IDENTITY   occupancy stamps stay eval-historical`,
    exportStatus,
  ].filter(Boolean).join("\n");
  perfEl.textContent = Object.entries(timings)
    .map(([k, v]) => `${k}  prep ${v.prep.toFixed(1)}ms  paint ${v.paint.toFixed(1)}ms  frame ${v.total.toFixed(1)}ms  screen ${lastPrintAudit.period.toFixed(2)}`)
    .join("\n");
  bindMaterial(PRODUCT_MATERIAL);
}

function button(parent: HTMLElement, label: string, on: boolean, click: () => void): void {
  const b = document.createElement("button");
  b.textContent = label;
  if (on) b.className = "is-on";
  b.addEventListener("click", click);
  parent.appendChild(b);
}

async function exportPiece(
  label: string,
  size: "preview" | "1080",
  pieceAspect: "4:5" | "9:16",
  material: IdentityTextureMaterial = PRODUCT_MATERIAL,
  download = true,
): Promise<{ filename: string; bytes: number; width: number; height: number; blob: Blob }> {
  aspect = pieceAspect;
  const preview = dim();
  renderer.resizeExact(preview.w, preview.h);
  bindMaterial(material);
  renderer.setClockMode("auto");
  renderer.seekLoopPhase(0);
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
  if (download) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(result.blob);
    a.download = result.filename;
    a.click();
  }
  exportStatus = `${label}  ${result.width}×${result.height}  ${(result.bytes / 1024).toFixed(0)}kb`;
  return result;
}

async function exportMaterialBlob(
  material: IdentityTextureMaterial,
  label: string,
  pieceAspect: "4:5" | "9:16",
): Promise<{ filename: string; bytes: number; width: number; height: number; b64: string }> {
  const result = await exportPiece(label, "1080", pieceAspect, material, false);
  const buf = await result.blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    filename: result.filename,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    b64: btoa(binary),
  };
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
    materials: MATERIALS,
    screenMaterials: SCREEN_MATERIALS,
    printAudit: () => lastPrintAudit,
    setMedia: async (kind: typeof mediaKind) => {
      mediaKind = kind;
      await buildMedia();
    },
    setAspect: (next: "4:5" | "9:16") => {
      aspect = next;
      renderer.resizeExact(dim().w, dim().h);
    },
    bindMaterial,
    floorMaterials: FLOOR_MATERIALS,
    printTiming: () => lastPrintTiming,
    exportMaterialBlob,
    capturePng: (material: IdentityTextureMaterial, phase: number, size = dim("1080")): string => {
      return capture(material, phase, size).toDataURL("image/png");
    },
    renderer,
  },
});
