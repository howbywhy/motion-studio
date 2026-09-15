import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { clampMarkState } from "../core/markState";
import { alignFromAnchor, clampTypeState, type TypeAnchor, type TypeState } from "../core/typeState";
import { loadSwitzer } from "../core/typeFont";
import { sequenceEnvelope, ENVELOPE_B_HOLD } from "../core/sequencePhase";
import { resolveActivePair } from "../core/sequence";
import { DEFAULT_BLOOM_PULSE } from "../core/bloomPulse";
import {
  bindEvalSequenceType,
  defaultEvalSequenceCopies,
  getEvalSequenceType,
  productSequenceTypeApplies,
  sequenceTypeApplies,
  sequenceTypeCopyForPair,
  sequenceTypeEnvelope,
  sequenceTypeHasCopy,
  sequenceTypeReadability,
  setEvalSequenceType,
  sharedSequenceTypeStyle,
  SEQUENCE_TYPE_ARRIVALS,
  type SequenceTypeArrival,
  type SequenceTypeMotion,
} from "../core/sequenceType";

const W = 288;
const H = 360;
const LOOP = 12;
const COPIES = defaultEvalSequenceCopies();
const COPY_SETS: Record<string, string[]> = {
  short: ["MOVE", "TOGETHER", "AGAIN", "RETURN"],
  normal: defaultEvalSequenceCopies(),
  mixed: ["MOVE", "Made for movement", "Rhythm changes everything", "Again"],
};
const LOCALS = [0.08, 0.18, 0.4, 0.52, 0.72, 0.86, 0.98] as const;
const MOTIONS: SequenceTypeMotion[] = ["quiet", "connected", "expressive"];
const RESOLVE_LOCALS = [0.72, 0.8, 0.86, 0.98] as const;

function hashPixels(img: ImageData): string {
  let h = 2166136261;
  const d = img.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function pixelDiff(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n += 1;
  return n;
}

function sequenceStyle(anchor: TypeAnchor): TypeState {
  const placed = alignFromAnchor(anchor);
  return clampTypeState({
    enabled: true,
    sequenceStart: 0,
    sequenceStop: 1,
    blocks: [
      {
        enabled: true,
        text: "",
        composition: "headline",
        textAlign: "center",
        anchor,
        align: placed.align,
        valign: placed.valign,
        x: placed.x,
        y: placed.y,
        scale: 48,
        tracking: 18,
        leading: 38,
        weight: 500,
        color: "#f3efe6",
        blendMode: "normal",
        opacity: 100,
      },
      { enabled: false, text: "" },
      { enabled: false, text: "" },
    ],
  });
}

function bloomParams(): ParamValues {
  const found = presetsForTreatment("clean").find((p) => p.label === "Expressive");
  if (!found) throw new Error("Missing Bloom Expressive");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...found.values,
    resolveLimit: 100,
  };
}

function note(root: HTMLElement, text: string): void {
  const p = document.createElement("p");
  p.textContent = text;
  root.appendChild(p);
}

function table(root: HTMLElement, title: string, rows: string[][]): void {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  const pre = document.createElement("pre");
  pre.className = "sheet";
  pre.textContent = rows.map((r) => r.join("\t")).join("\n");
  root.appendChild(pre);
}

function section(root: HTMLElement, title: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "grid";
  root.appendChild(grid);
  return grid;
}

function cell(parent: HTMLElement, label: string, img: ImageData): void {
  const wrap = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  parent.appendChild(wrap);
}

function paintScene(kind: string, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (kind === "portrait") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2a1810");
    g.addColorStop(0.45, "#8a5a3a");
    g.addColorStop(1, "#1a100c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#d4a07a";
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.36, w * 0.18, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2218";
    ctx.fillRect(w * 0.28, h * 0.5, w * 0.44, h * 0.5);
  } else if (kind === "texture") {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const n = ((x * 73 + y * 157) ^ (x * 19 + y * 9)) & 255;
        img.data[i] = 90 + (n % 80);
        img.data[i + 1] = 70 + ((n * 3) % 70);
        img.data[i + 2] = 55 + ((n * 5) % 50);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (kind === "contrast") {
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(w * 0.52, 0, w * 0.48, h);
  } else if (kind === "edge") {
    ctx.fillStyle = "#1c1410";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c8a070";
    ctx.beginPath();
    ctx.ellipse(w * 0.12, h * 0.55, w * 0.16, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = kind;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

function globalBook(copies: string[]): TypeState {
  return clampTypeState({
    enabled: true,
    sequenceStart: 0.2,
    sequenceStop: 0.7,
    sequenceSpeed: 50,
    pages: copies.map((text) => [
      { enabled: true, text, composition: "headline", textAlign: "center", anchor: "bc", scale: 48, color: "#f3efe6" },
      { enabled: false, text: "" },
      { enabled: false, text: "" },
    ]),
  });
}

function makeRenderer(
  host: HTMLElement,
  mode: "loop" | "pingpong",
  opts?: { count?: number; identical?: boolean; scenes?: string[]; type?: TypeState },
): Renderer {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W, H);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode(mode);
  renderer.setRegistrationEnabled(true);
  renderer.setRegistrationAmount(60);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams());
  const n = opts?.count ?? 4;
  const identical = opts?.identical === true;
  const scenes = opts?.scenes ?? ["portrait", "texture", "contrast", "edge"];
  const items = [];
  for (let i = 0; i < n; i++) {
    const scene = identical ? "portrait" : (scenes[i] ?? "portrait");
    const src = scene.startsWith("#") ? placeholderA(scene) : paintScene(scene, 640, 800);
    items.push({ id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(src, String(i + 1).padStart(2, "0")) });
  }
  renderer.setSequence(items, undefined);
  renderer.setTypeState(opts?.type ?? sharedSequenceTypeStyle());
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setTransitionFlickerEnabled(false);
  renderer.setClockMode("hold");
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 6; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function masterFor(pairIndex: number, local: number, pairCount: number): number {
  return (pairIndex + local) / pairCount;
}

function withSequence<T>(config: { copies: string[]; motion: SequenceTypeMotion; arrival?: SequenceTypeArrival } | null, fn: () => T): T {
  const prev = getEvalSequenceType();
  setEvalSequenceType(config);
  try {
    return fn();
  } finally {
    setEvalSequenceType(prev);
  }
}

function at(
  renderer: Renderer,
  phase: number,
  opts?: { copies?: string[]; motion?: SequenceTypeMotion; arrival?: SequenceTypeArrival; sequence?: boolean },
): ImageData {
  renderer.setClockMode("hold");
  renderer.setHoldPhase(phase);
  if (opts?.sequence === false) {
    return withSequence(null, () => settle(renderer));
  }
  return withSequence(
    { copies: opts?.copies ?? COPIES, motion: opts?.motion ?? "connected", arrival: opts?.arrival ?? "soft-crop" },
    () => settle(renderer),
  );
}

function productStyle(copies: string[] = COPIES): TypeState {
  return clampTypeState({
    ...sharedSequenceTypeStyle(),
    enabled: true,
    typeMode: "sequence",
    sequenceCopies: copies,
  });
}

function atBare(renderer: Renderer, phase: number): ImageData {
  bindEvalSequenceType(renderer, null);
  setEvalSequenceType(null);
  renderer.setClockMode("hold");
  renderer.setHoldPhase(phase);
  return settle(renderer);
}

function atProduct(renderer: Renderer, phase: number, copies: string[] = COPIES): ImageData {
  renderer.setTypeState(productStyle(copies));
  return atBare(renderer, phase);
}

export interface SequenceTypeReport {
  globalUnchangedWhenSequenceOff: boolean;
  sequenceFollowsPair: boolean;
  blankSlotIsSilent: boolean;
  noBoundaryFlash: boolean;
  wrapMatchesInternal: boolean;
  pulseIgnoresSequenceType: boolean;
  previewExportMatch: boolean;
  durationKeepsSlotCopy: boolean;
  holdReadableAt12s4: boolean;
  arrivalDoesNotChangeResolve: boolean;
  productPathMatchesEval: boolean;
  productPulseUsesGlobal: boolean;
  productModeSwitchKeepsState: boolean;
  productEditDoesNotRestartRaf: boolean;
  productPreviewExportMatch: boolean;
  productMarkCoexistsWithSequenceType: boolean;
  elapsedMs: number;
  details: Record<string, unknown>;
}

function addBar(parent: HTMLElement, label: string): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "bar";
  const tag = document.createElement("span");
  tag.textContent = label;
  bar.appendChild(tag);
  parent.appendChild(bar);
  return bar;
}

function addBtn(bar: HTMLElement, text: string, onClick: () => void): void {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  bar.appendChild(b);
}

function mountLive(root: HTMLElement): void {
  const box = document.createElement("section");
  box.className = "live";
  const h = document.createElement("h2");
  h.textContent = "Live instrument — Global vs Sequence";
  box.appendChild(h);
  note(box, "Judge CONNECTED crop as part of the Bloom event, not a generic text reveal. Freeze RESOLVE 0.72–0.98 to inspect the handoff. Pulse is not shown. These controls are eval-only.");

  const row = document.createElement("div");
  row.className = "live-row";
  const globalHost = document.createElement("div");
  const seqHost = document.createElement("div");
  globalHost.className = "stage";
  seqHost.className = "stage";
  row.appendChild(globalHost);
  row.appendChild(seqHost);
  box.appendChild(row);

  const hud = document.createElement("pre");
  hud.className = "hud";
  box.appendChild(hud);

  const gCanvas = document.createElement("canvas");
  const sCanvas = document.createElement("canvas");
  globalHost.appendChild(gCanvas);
  seqHost.appendChild(sCanvas);
  const capG = document.createElement("div");
  capG.textContent = "GLOBAL TYPE";
  const capS = document.createElement("div");
  capS.textContent = "SEQUENCE TYPE";
  globalHost.appendChild(capG);
  seqHost.appendChild(capS);

  const liveGlobal = new Renderer(gCanvas);
  const liveSeq = new Renderer(sCanvas);
  let motion: SequenceTypeMotion = "connected";
  let arrival: SequenceTypeArrival = "soft-crop";
  let pairCount = 4;
  let loopSeconds = LOOP;
  let identical = true;
  let flicker = false;
  let anchor: TypeAnchor = "bc";
  let copies = COPY_SETS.normal.slice();
  const areas: HTMLTextAreaElement[] = [];

  const applySeq = (): void => {
    bindEvalSequenceType(liveSeq, { copies, motion, arrival });
    bindEvalSequenceType(liveGlobal, null);
  };

  const syncAreas = (): void => {
    areas.forEach((ta, i) => {
      ta.value = copies[i] ?? "";
    });
  };

  const wire = (renderer: Renderer, sequence: boolean): void => {
    renderer.pause();
    renderer.resizeExact(W, H);
    renderer.setLoopSeconds(loopSeconds);
    renderer.setPlaybackMode("loop");
    renderer.setRegistrationEnabled(true);
    renderer.setRegistrationAmount(60);
    renderer.setBwMode("off");
    renderer.setBehavior(bloomBehavior, bloomParams());
    const items = [];
    for (let i = 0; i < pairCount; i++) {
      const scene = identical ? "portrait" : (["portrait", "texture", "contrast", "edge"][i] ?? "portrait");
      items.push({
        id: renderer.nextSourceId(),
        asset: wrapCanvasAsPlaceholder(paintScene(scene, 640, 800), String(i + 1).padStart(2, "0")),
      });
    }
    renderer.setSequence(items, undefined);
    renderer.setTypeState(sequence ? sequenceStyle(anchor) : globalBook(copies));
    renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
    renderer.setTransitionFlickerEnabled(flicker);
    renderer.setClockMode("auto");
    renderer.play();
  };

  applySeq();
  wire(liveGlobal, false);
  wire(liveSeq, true);

  const refresh = (): void => {
    applySeq();
    wire(liveGlobal, false);
    wire(liveSeq, true);
  };

  const holdLocal = (local: number): void => {
    const phase = masterFor(0, local, pairCount);
    for (const renderer of [liveSeq, liveGlobal]) {
      renderer.pause();
      renderer.setClockMode("hold");
      renderer.setHoldPhase(phase);
      renderer.renderFrame();
    }
  };

  const motionBar = addBar(box, "MOTION");
  for (const m of MOTIONS) {
    addBtn(motionBar, m.toUpperCase(), () => {
      motion = m;
      applySeq();
    });
  }
  const arrivalBar = addBar(box, "ARRIVAL");
  addBtn(arrivalBar, "NEAR-SILENT", () => {
    arrival = "near-silent";
    applySeq();
  });
  addBtn(arrivalBar, "SOFT CROP", () => {
    arrival = "soft-crop";
    applySeq();
  });
  addBtn(arrivalBar, "CURRENT", () => {
    arrival = "current";
    applySeq();
  });
  const pairBar = addBar(box, "PAIRS");
  for (const n of [2, 3, 4, 5]) {
    addBtn(pairBar, String(n), () => {
      pairCount = n;
      refresh();
    });
  }
  const durBar = addBar(box, "DURATION");
  for (const seconds of [8, 12]) {
    addBtn(durBar, `${seconds}s`, () => {
      loopSeconds = seconds;
      refresh();
    });
  }
  const copyBar = addBar(box, "COPY");
  addBtn(copyBar, "SHORT", () => {
    copies = COPY_SETS.short.slice();
    syncAreas();
    refresh();
  });
  addBtn(copyBar, "NORMAL", () => {
    copies = COPY_SETS.normal.slice();
    syncAreas();
    refresh();
  });
  addBtn(copyBar, "MIXED", () => {
    copies = COPY_SETS.mixed.slice();
    syncAreas();
    refresh();
  });
  const imageBar = addBar(box, "IMAGE");
  addBtn(imageBar, "IDENTICAL", () => {
    identical = true;
    refresh();
  });
  addBtn(imageBar, "PHOTOS", () => {
    identical = false;
    refresh();
  });
  const posBar = addBar(box, "POSITION");
  addBtn(posBar, "BOTTOM CENTRE", () => {
    anchor = "bc";
    refresh();
  });
  addBtn(posBar, "CENTRE", () => {
    anchor = "mc";
    refresh();
  });
  const phaseBar = addBar(box, "PHASE");
  addBtn(phaseBar, "AUTO", () => refresh());
  addBtn(phaseBar, "ARRIVE 0.10", () => holdLocal(0.1));
  addBtn(phaseBar, "HOLD 0.40", () => holdLocal(0.4));
  addBtn(phaseBar, "RESOLVE 0.72", () => holdLocal(0.72));
  addBtn(phaseBar, "RESOLVE 0.86", () => holdLocal(0.86));
  addBtn(phaseBar, "RESOLVE 0.98", () => holdLocal(0.98));
  const extraBar = addBar(box, "OTHER");
  addBtn(extraBar, "FLICKER", () => {
    flicker = !flicker;
    refresh();
  });

  const copyBox = document.createElement("div");
  copyBox.className = "copies";
  copies.forEach((_, i) => {
    const label = document.createElement("label");
    const id = document.createElement("span");
    id.textContent = String(i + 1).padStart(2, "0");
    const ta = document.createElement("textarea");
    ta.value = copies[i] ?? "";
    ta.addEventListener("input", () => {
      copies[i] = ta.value;
      applySeq();
      liveGlobal.setTypeState(globalBook(copies));
    });
    areas.push(ta);
    label.appendChild(id);
    label.appendChild(ta);
    copyBox.appendChild(label);
  });
  box.appendChild(copyBox);

  liveSeq.onFrame = () => {
    const pair = liveSeq.getActivePair();
    const env = sequenceEnvelope("bloom", "clean", pair.localPhase);
    const typeEnv = sequenceTypeEnvelope(pair.localPhase, loopSeconds / Math.max(1, pair.pairCount));
    const copy = sequenceTypeCopyForPair(copies, pair.pairIndex);
    hud.textContent = [
      `SEQUENCE  ${motion.toUpperCase()}  arrival ${arrival}  ${loopSeconds}s  ${pairCount} pairs  ${anchor}  slot ${pair.pairIndex}  “${copy.replace(/\n/g, " / ")}”`,
      `          ${typeEnv.stage} ${typeEnv.presence.toFixed(2)}  arrive≤${typeEnv.arriveEnd.toFixed(2)}  resolve≥${typeEnv.resolveStart.toFixed(2)}  local ${pair.localPhase.toFixed(4)}  bloom res ${env.resolve.toFixed(2)} @ hold ${ENVELOPE_B_HOLD}`,
      `GLOBAL    master window 0.20–0.70 · Type States do not follow pairs`,
    ].join("\n");
  };

  root.appendChild(box);
}

export async function runSequenceTypeSheet(root: HTMLElement): Promise<SequenceTypeReport> {
  const t0 = performance.now();
  await loadSwitzer();
  root.innerHTML = "";
  const hidden = document.createElement("div");
  hidden.style.display = "none";
  root.appendChild(hidden);

  note(root, "QA retains NEAR-SILENT / SOFT CROP / CURRENT. Product Sequence Type uses SOFT CROP + CONNECTED only. Pulse stays on Global Type.");
  mountLive(root);

  const same = makeRenderer(hidden, "loop", { count: 4, identical: true });
  same.setTypeState(sharedSequenceTypeStyle());

  same.setTypeState(globalBook(COPIES));
  const globalA = hashPixels(at(same, 0.28, { sequence: false }));
  const globalB = hashPixels(at(same, 0.28, { sequence: false }));
  const globalUnchangedWhenSequenceOff = globalA === globalB;
  same.setTypeState(sharedSequenceTypeStyle());

  const hold0 = at(same, masterFor(0, 0.4, 4), { motion: "connected" });
  const hold1 = at(same, masterFor(1, 0.4, 4), { motion: "connected" });
  const hold2 = at(same, masterFor(2, 0.4, 4), { motion: "connected" });
  const sequenceFollowsPair = hashPixels(hold0) !== hashPixels(hold1) && hashPixels(hold1) !== hashPixels(hold2);

  const compare = section(root, "Identical image · CONNECTED · pair-local arrive / hold / resolve");
  for (const pairIndex of [0, 1, 2, 3]) {
    for (const local of [0.1, 0.4, 0.86]) {
      const img = at(same, masterFor(pairIndex, local, 4), { motion: "connected" });
      const env = sequenceTypeEnvelope(local, LOOP / 4);
      cell(compare, `p${pairIndex} L${local.toFixed(2)} ${env.stage}`, img);
    }
  }

  const arrivalGrid = section(root, "CONNECTED arrivals — same HOLD / RESOLVE · only arrival changes");
  for (const arrival of SEQUENCE_TYPE_ARRIVALS) {
    for (const local of [0.08, 0.4, 0.86]) {
      cell(arrivalGrid, `${arrival} L${local.toFixed(2)}`, at(same, masterFor(0, local, 4), { motion: "connected", arrival }));
    }
  }
  const resolveA = hashPixels(at(same, masterFor(0, 0.86, 4), { motion: "connected", arrival: "near-silent" }));
  const resolveB = hashPixels(at(same, masterFor(0, 0.86, 4), { motion: "connected", arrival: "soft-crop" }));
  const resolveC = hashPixels(at(same, masterFor(0, 0.86, 4), { motion: "connected", arrival: "current" }));
  const holdA = hashPixels(at(same, masterFor(0, 0.4, 4), { motion: "connected", arrival: "near-silent" }));
  const holdB = hashPixels(at(same, masterFor(0, 0.4, 4), { motion: "connected", arrival: "soft-crop" }));
  const arrivalDoesNotChangeResolve = resolveA === resolveB && resolveB === resolveC && holdA === holdB;

  const motions = section(root, "Motion options at pair 0 — QUIET / CONNECTED / EXPRESSIVE");
  for (const motion of MOTIONS) {
    for (const local of [0.1, 0.52, 0.86]) {
      cell(motions, `${motion} L${local.toFixed(2)}`, at(same, masterFor(0, local, 4), { motion }));
    }
  }

  const resolveGrid = section(root, "Resolve 0.72–1.00 — QUIET / CONNECTED / EXPRESSIVE · pair 0 identical");
  for (const motion of MOTIONS) {
    for (const local of RESOLVE_LOCALS) {
      cell(resolveGrid, `${motion} L${local.toFixed(2)}`, at(same, masterFor(0, local, 4), { motion }));
    }
  }

  const durGrid = section(root, "SOFT CROP arrival · 12s/4 vs 8s/5 at local 0.08 / 0.40 / 0.86");
  same.setLoopSeconds(12);
  for (const local of [0.08, 0.4, 0.86]) {
    cell(durGrid, `12s/4 L${local.toFixed(2)}`, at(same, masterFor(0, local, 4), { motion: "connected", arrival: "soft-crop" }));
  }
  const shortR = makeRenderer(hidden, "loop", { count: 5, identical: true });
  shortR.setLoopSeconds(8);
  for (const local of [0.08, 0.4, 0.86]) {
    cell(durGrid, `8s/5 L${local.toFixed(2)}`, at(shortR, masterFor(0, local, 5), { motion: "connected", arrival: "soft-crop" }));
  }
  same.setLoopSeconds(LOOP);

  const twoLine = Array.from({ length: 4 }, () => "Rhythm changes\neverything");
  const twoGrid = section(root, "Two-line block — Rhythm changes / everything · CONNECTED");
  for (const local of [0.1, 0.4, 0.72, 0.86, 0.98]) {
    cell(twoGrid, `L${local.toFixed(2)}`, at(same, masterFor(0, local, 4), { copies: twoLine, motion: "connected" }));
  }

  const posGrid = section(root, "Position — BOTTOM CENTRE vs CENTRE · CONNECTED hold and resolve");
  same.setTypeState(sequenceStyle("bc"));
  cell(posGrid, "bc hold 0.40", at(same, masterFor(0, 0.4, 4), { motion: "connected" }));
  cell(posGrid, "bc resolve 0.86", at(same, masterFor(0, 0.86, 4), { motion: "connected" }));
  same.setTypeState(sequenceStyle("mc"));
  cell(posGrid, "mc hold 0.40", at(same, masterFor(0, 0.4, 4), { motion: "connected" }));
  cell(posGrid, "mc resolve 0.86", at(same, masterFor(0, 0.86, 4), { motion: "connected" }));
  same.setTypeState(sharedSequenceTypeStyle());

  const globalGrid = section(root, "GLOBAL TYPE — same four copies as Type States on master 0.20–0.70");
  same.setTypeState(globalBook(COPIES));
  for (const p of [0.15, 0.25, 0.4, 0.55, 0.72, 0.9]) {
    cell(globalGrid, `GLOBAL φ${p.toFixed(2)}`, at(same, p, { sequence: false }));
  }
  same.setTypeState(sharedSequenceTypeStyle());

  const blankCopies = ["Motion starts here", "", "Rhythm changes\neverything", "Back to the beginning"];
  const blankOn = at(same, masterFor(0, 0.4, 4), { copies: blankCopies, motion: "connected" });
  const blankOff = at(same, masterFor(1, 0.4, 4), { copies: blankCopies, motion: "connected" });
  const blankSilent = at(same, masterFor(1, 0.4, 4), { sequence: false });
  const blankSlotIsSilent = pixelDiff(blankOff, blankSilent) === 0 && hashPixels(blankOn) !== hashPixels(blankOff);
  const blankGrid = section(root, "Blank slot 02 — no type event");
  cell(blankGrid, "p0 copy", blankOn);
  cell(blankGrid, "p1 blank", blankOff);

  const lengths = section(root, "Copy length — 1 word / phrase / sentence / two lines");
  const lengthCopies = ["Again", "Made for movement", "Rhythm changes everything", "Designed\nto return"];
  for (const pairIndex of [0, 1, 2, 3]) {
    cell(lengths, `p${pairIndex} hold`, at(same, masterFor(pairIndex, 0.4, 4), { copies: lengthCopies, motion: "connected" }));
  }

  const photos = makeRenderer(hidden, "loop", { count: 4, identical: false });
  const photoGrid = section(root, "Photographic stand-ins · CONNECTED hold");
  for (const pairIndex of [0, 1, 2, 3]) {
    cell(photoGrid, `p${pairIndex}`, at(photos, masterFor(pairIndex, 0.4, 4), { motion: "connected" }));
  }

  const cutA = at(same, masterFor(0, 0.995, 4), { motion: "connected" });
  const cutB = at(same, masterFor(1, 0.005, 4), { motion: "connected" });
  const holdMid = at(same, masterFor(0, 0.4, 4), { motion: "connected" });
  const noBoundaryFlash =
    pixelDiff(cutA, holdMid) > 1000 &&
    pixelDiff(cutB, holdMid) > 1000 &&
    sequenceTypeEnvelope(0.995, 3).presence < 0.08 &&
    sequenceTypeEnvelope(0.005, 3).presence < 0.08;

  const wrapOut = at(same, masterFor(3, 0.86, 4), { motion: "connected" });
  const wrapIn = at(same, masterFor(0, 0.1, 4), { motion: "connected" });
  const internalOut = at(same, masterFor(1, 0.86, 4), { motion: "connected" });
  const internalIn = at(same, masterFor(2, 0.1, 4), { motion: "connected" });
  const wrapGrid = section(root, "Wrap last→first vs internal pair cut — CONNECTED");
  cell(wrapGrid, "p3 resolve", wrapOut);
  cell(wrapGrid, "p0 arrive", wrapIn);
  cell(wrapGrid, "p1 resolve", internalOut);
  cell(wrapGrid, "p2 arrive", internalIn);
  const wrapMatchesInternal =
    sequenceTypeEnvelope(0.86, 3).stage === sequenceTypeEnvelope(0.86, 3).stage &&
    sequenceTypeEnvelope(0.1, 3).stage === "arrive";

  const pulse = makeRenderer(hidden, "pingpong", { count: 4, identical: true });
  pulse.setBloomPulse({ ...DEFAULT_BLOOM_PULSE });
  pulse.setTypeState(clampTypeState({ enabled: false }));
  const pulseSeq = hashPixels(at(pulse, 0.25, { motion: "connected" }));
  const pulseBare = hashPixels(at(pulse, 0.25, { sequence: false }));
  const pulseIgnoresSequenceType = pulseSeq === pulseBare && !sequenceTypeApplies("pingpong", resolveActivePair(4, 0.25, "pingpong"));

  const parityLocals = [0.1, 0.4, 0.72, 0.86] as const;
  const holdParity: Record<string, string> = {};
  const expParity: Record<string, string> = {};
  for (const pairIndex of [0, 3]) {
    for (const local of parityLocals) {
      const key = `${pairIndex}:${local}`;
      const master = masterFor(pairIndex, local, 4);
      holdParity[key] = hashPixels(at(same, master, { motion: "connected" }));
      same.beginExport(W, H);
      setEvalSequenceType({ copies: COPIES, motion: "connected" });
      await same.renderExportFrame(master * LOOP, { graphicTime: same.getGraphicElapsed() });
      expParity[key] = hashPixels(same.getVisibleImageData());
      same.endExport();
      same.resizeExact(W, H);
    }
  }
  setEvalSequenceType(null);
  const previewExportMatch = Object.keys(holdParity).every((k) => holdParity[k] === expParity[k]);

  same.setLoopSeconds(8);
  const copyAt8 = sequenceTypeCopyForPair(COPIES, 2);
  same.setLoopSeconds(12);
  const copyAt12 = sequenceTypeCopyForPair(COPIES, 2);
  const durationKeepsSlotCopy = copyAt8 === copyAt12 && copyAt8 === COPIES[2];

  const readRows: string[][] = [["pairs", "loop s", "event s", "arrive s", "hold s", "resolve s", "warn"]];
  for (const seconds of [8, 12, 16]) {
    for (const n of [2, 3, 4, 5]) {
      const r = sequenceTypeReadability(seconds, n);
      readRows.push([
        String(n),
        String(seconds),
        r.eventSeconds.toFixed(2),
        r.arriveSeconds.toFixed(2),
        r.holdSeconds.toFixed(2),
        r.resolveSeconds.toFixed(2),
        r.warn ? "WARN" : "ok",
      ]);
    }
  }
  table(root, "Readability — HOLD preserved when events shorten", readRows);
  const holdReadableAt12s4 = !sequenceTypeReadability(12, 4).warn && sequenceTypeReadability(12, 4).holdSeconds >= 1.05;

  const flickerR = makeRenderer(hidden, "loop", { count: 4, identical: true });
  flickerR.setTransitionFlickerEnabled(true);
  const flickGrid = section(root, "Transition Flicker On · CONNECTED at internal cut and wrap");
  for (const p of [0.48, 0.5, 0.52, 0.98, 0]) {
    cell(flickGrid, `flick φ${p.toFixed(2)}`, at(flickerR, p, { motion: "connected" }));
  }

  const envRows: string[][] = [["local", "stage", "presence", "bloom resolve"]];
  for (const local of LOCALS) {
    const env = sequenceTypeEnvelope(local, 3);
    const bloom = sequenceEnvelope("bloom", "clean", local);
    envRows.push([local.toFixed(2), env.stage, env.presence.toFixed(3), bloom.resolve.toFixed(3)]);
  }
  table(root, "CONNECTED envelope vs Envelope B (3s event)", envRows);

  setEvalSequenceType(null);
  bindEvalSequenceType(same, null);

  const productHold = atProduct(same, masterFor(0, 0.4, 4));
  const evalHold = at(same, masterFor(0, 0.4, 4), { motion: "connected", arrival: "soft-crop" });
  const productArrive = atProduct(same, masterFor(0, 0.08, 4));
  const evalArrive = at(same, masterFor(0, 0.08, 4), { motion: "connected", arrival: "soft-crop" });
  const productResolve = atProduct(same, masterFor(3, 0.86, 4));
  const evalResolve = at(same, masterFor(3, 0.86, 4), { motion: "connected", arrival: "soft-crop" });
  setEvalSequenceType(null);
  bindEvalSequenceType(same, null);
  const productPathMatchesEval =
    hashPixels(productHold) === hashPixels(evalHold) &&
    hashPixels(productArrive) === hashPixels(evalArrive) &&
    hashPixels(productResolve) === hashPixels(evalResolve);

  const productPulse = makeRenderer(hidden, "pingpong", { count: 4, identical: true });
  productPulse.setBloomPulse({ ...DEFAULT_BLOOM_PULSE });
  productPulse.setTypeState(productStyle(COPIES));
  const pulseProduct = hashPixels(atBare(productPulse, 0.25));
  productPulse.setTypeState(clampTypeState({ ...sharedSequenceTypeStyle(), enabled: true, typeMode: "global" }));
  const pulseGlobal = hashPixels(atBare(productPulse, 0.25));
  const productPulseUsesGlobal =
    pulseProduct === pulseGlobal &&
    !productSequenceTypeApplies(productStyle(COPIES), "pingpong", resolveActivePair(4, 0.25, "pingpong"));

  const switchR = makeRenderer(hidden, "loop", { count: 3, identical: true });
  switchR.setTypeState(clampTypeState({
    enabled: true,
    typeMode: "global",
    sequenceStart: 0.2,
    sequenceStop: 0.7,
    blocks: [{ enabled: true, text: "GLOBAL KEEP", composition: "headline" }],
    sequenceCopies: ["S1", "S2", "S3"],
  }));
  const globalBefore = switchR.getTypeState().blocks[0]!.text;
  switchR.patchTypeState({ typeMode: "sequence" });
  const seqMid = switchR.getTypeState();
  switchR.patchTypeState({ typeMode: "global" });
  const globalAfter = switchR.getTypeState();
  switchR.patchTypeState({ typeMode: "sequence" });
  const seqAfter = switchR.getTypeState();
  const productModeSwitchKeepsState =
    globalBefore === "GLOBAL KEEP" &&
    globalAfter.blocks[0]!.text === "GLOBAL KEEP" &&
    globalAfter.typeMode === "global" &&
    seqMid.sequenceCopies.join("|") === "S1|S2|S3" &&
    seqAfter.sequenceCopies.join("|") === "S1|S2|S3" &&
    seqAfter.typeMode === "sequence";

  same.setTypeState(productStyle(COPIES));
  same.play();
  const rafBefore = same.getPreviewClockDiagnostics().rafStarts;
  same.patchTypeState({ sequenceCopyAt: { index: 0, text: "Edited live" } });
  const rafAfter = same.getPreviewClockDiagnostics().rafStarts;
  const productEditDoesNotRestartRaf = rafBefore === rafAfter && rafBefore >= 1;
  same.pause();

  const productParity: Record<string, string> = {};
  const productExp: Record<string, string> = {};
  same.setTypeState(productStyle(COPIES));
  for (const pairIndex of [0, 3]) {
    for (const local of [0.1, 0.4, 0.86] as const) {
      const key = `${pairIndex}:${local}`;
      const master = masterFor(pairIndex, local, 4);
      productParity[key] = hashPixels(atBare(same, master));
      same.beginExport(W, H);
      await same.renderExportFrame(master * LOOP, { graphicTime: same.getGraphicElapsed() });
      productExp[key] = hashPixels(same.getVisibleImageData());
      same.endExport();
      same.resizeExact(W, H);
    }
  }
  const productPreviewExportMatch = Object.keys(productParity).every((k) => productParity[k] === productExp[k]);

  const markR = makeRenderer(hidden, "loop", { count: 4, identical: true });
  markR.setTypeState(productStyle(COPIES));
  const typeVisible = hashPixels(atBare(markR, masterFor(0, 0.4, 4)));
  markR.setMarkState(clampMarkState({
    enabled: true,
    mode: "interrupt",
    sequenceStart: 0,
    sequenceStop: 1,
  }));
  const typeHidden = hashPixels(atBare(markR, masterFor(0, 0.4, 4)));
  markR.setTypeState(clampTypeState({ enabled: false, typeMode: "sequence", sequenceCopies: COPIES }));
  const typeOff = hashPixels(atBare(markR, masterFor(0, 0.4, 4)));
  const productMarkCoexistsWithSequenceType = typeHidden === typeVisible && typeHidden !== typeOff;

  setEvalSequenceType(null);

  return {
    globalUnchangedWhenSequenceOff,
    sequenceFollowsPair,
    blankSlotIsSilent,
    noBoundaryFlash,
    wrapMatchesInternal,
    pulseIgnoresSequenceType,
    previewExportMatch,
    durationKeepsSlotCopy,
    holdReadableAt12s4,
    arrivalDoesNotChangeResolve,
    productPathMatchesEval,
    productPulseUsesGlobal,
    productModeSwitchKeepsState,
    productEditDoesNotRestartRaf,
    productPreviewExportMatch,
    productMarkCoexistsWithSequenceType,
    elapsedMs: Math.round(performance.now() - t0),
    details: {
      holdParity,
      expParity,
      productParity,
      productExp,
      readability: {
        "12/2": sequenceTypeReadability(12, 2),
        "12/4": sequenceTypeReadability(12, 4),
        "12/5": sequenceTypeReadability(12, 5),
        "8/5": sequenceTypeReadability(8, 5),
        "8/4": sequenceTypeReadability(8, 4),
      },
      blankHasCopy: sequenceTypeHasCopy(blankCopies, 0),
      blankSilentSlot: !sequenceTypeHasCopy(blankCopies, 1),
      copies: COPIES,
    },
  };
}
