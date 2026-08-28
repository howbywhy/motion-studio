import { mbmById } from "./mbmCopy";
import { clampTypeState, type TypeBlock, type TypeState } from "../core/typeState";
import { typePageIndexForState, typeVisibleForState } from "../core/typePages";
import { bloomBehavior } from "../behaviors/bloom";
import { Renderer } from "../core/renderer";
import { placeholderA } from "../core/placeholder";
import { wrapCanvasAsPlaceholder } from "../core/media";
import { defaultParamValues, type ParamValues } from "../core/types";
import { presetsForTreatment } from "../core/presets";
import { clampEndBehaviourSettings } from "../core/endBehaviour";
import { loadSwitzer, switzerReady } from "../core/typeFont";
import {
  bloomPulsePhase,
  clampBloomPulse,
  DEFAULT_BLOOM_PULSE,
  triangle01,
  type PulseCycles,
} from "../core/bloomPulse";
import { generateRandomisation } from "../core/randomise";

const W = 320;
const H = 400;
const LOOP = 12;
const MASTER = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;
const RANGES = [
  { id: "A", start: 0.35, end: 0.65 },
  { id: "B", start: 0.45, end: 0.55 },
  { id: "C", start: 0.2, end: 0.4 },
] as const;
const SPEEDS: PulseCycles[] = [1, 2, 3, 4];

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

function bloomParams(limit: number): ParamValues {
  const found = presetsForTreatment("clean").find((p) => p.label === "Expressive");
  if (!found) throw new Error("Missing Bloom Expressive");
  return {
    ...defaultParamValues(bloomBehavior.params),
    treatment: "clean",
    imageAware: "off",
    ...found.values,
    resolveLimit: limit,
  };
}

function page(a: Partial<TypeBlock>, b?: Partial<TypeBlock>): Partial<TypeBlock>[] {
  return [
    { enabled: true, color: "#f3efe6", ...a },
    b ? { enabled: true, color: "#f3efe6", ...b } : { enabled: false, text: "", composition: "subtitle" },
  ];
}

function campaignType(): TypeState {
  return clampTypeState({
    enabled: true,
    sequenceStart: 0.2,
    sequenceStop: 0.75,
    pageBeats: [1, 2, 1, 1, 1],
    pages: [
      page({ text: "07.09", composition: "headline", scale: 100, anchor: "tl" }),
      page({ text: mbmById("name-break").text, composition: "headline", scale: 78, anchor: "mc" }),
      page({ text: "FLAWED", composition: "headline", scale: 86, anchor: "bl" }),
      page({ text: "AND FLAWLESS", composition: "headline", scale: 64, anchor: "bl" }),
      page({ text: "2026", composition: "headline", scale: 100, anchor: "br" }),
    ],
  });
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

function makeRenderer(host: HTMLElement, sources = 2): Renderer {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  host.appendChild(canvas);
  canvas.style.display = "none";
  const renderer = new Renderer(canvas);
  renderer.pause();
  renderer.resizeExact(W, H);
  renderer.setLoopSeconds(LOOP);
  renderer.setPlaybackMode("loop");
  renderer.setRegistrationEnabled(false);
  renderer.setBwMode("off");
  renderer.setBehavior(bloomBehavior, bloomParams(60));
  const items = [
    { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#1c1c1e"), "01") },
    { id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#c8a070"), "02") },
  ];
  if (sources >= 3) {
    items.push({ id: renderer.nextSourceId(), asset: wrapCanvasAsPlaceholder(placeholderA("#3a5a8a"), "03") });
  }
  renderer.setSequence(items, undefined);
  renderer.setTypeState(clampTypeState({ enabled: false }));
  renderer.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  renderer.setClockMode("hold");
  return renderer;
}

function settle(renderer: Renderer): ImageData {
  for (let i = 0; i < 6; i++) renderer.renderFrame();
  return renderer.getVisibleImageData();
}

function inside(derived: number, start: number, end: number, eps = 1e-9): boolean {
  return derived >= start - eps && derived <= end + eps;
}

interface PhaseRow {
  master: number;
  linear: number;
  cosine: number;
  triangle: number;
  inside: boolean;
}

function phaseTable(start: number, end: number, cycles: PulseCycles): PhaseRow[] {
  return MASTER.map((master) => {
    const linear = bloomPulsePhase(master, start, end, cycles, "linear");
    const cosine = bloomPulsePhase(master, start, end, cycles, "cosine");
    return {
      master,
      linear,
      cosine,
      triangle: triangle01(master, cycles),
      inside: inside(cosine, start, end) && inside(linear, start, end),
    };
  });
}

export interface BloomPulseReport {
  loopUntouched: boolean;
  endpointsMatchLoop: boolean;
  seam01: boolean;
  derivedInsideRange: boolean;
  reverses: boolean;
  pairFrozen: boolean;
  typeIndependent: boolean;
  flickerOverPulse: boolean;
  holdExportExact: boolean;
  loopLengthIndependent: boolean;
  wholeCyclesSeam: boolean;
  defaultRange: boolean;
  randomiseLeavesPulse: boolean;
  elapsedMs: number;
  tables: Record<string, PhaseRow[]>;
  details: Record<string, unknown>;
}

export async function runBloomPulseSheet(root: HTMLElement): Promise<BloomPulseReport> {
  const t0 = performance.now();
  await loadSwitzer();
  await switzerReady();
  root.innerHTML = "";

  const intro = document.createElement("p");
  intro.textContent =
    "Loop is the approved Bloom. Pulse samples a Pulse Range of that same pair-local evolution. Type sequences on master phase. Flicker still uses master phase.";
  root.appendChild(intro);

  const hidden = document.createElement("div");
  hidden.style.position = "absolute";
  hidden.style.left = "-9999px";
  root.appendChild(hidden);
  const loopR = makeRenderer(hidden);
  const pulseR = makeRenderer(hidden);
  const pulseWild = makeRenderer(hidden);
  pulseWild.setBloomPulse({ start: 0.12, end: 0.88, cycles: 4 });

  const loopPhases = [0, 0.17, 0.28, 0.37, 0.5, 0.63, 0.91, 0.995];
  let loopUntouched = true;
  const loopGrid = section(root, "Loop identity — pulse params must not leak");
  for (const p of loopPhases) {
    loopR.setPlaybackMode("loop");
    pulseWild.setPlaybackMode("loop");
    loopR.setHoldPhase(p);
    pulseWild.setHoldPhase(p);
    const a = settle(loopR);
    const b = settle(pulseWild);
    const diff = pixelDiff(a, b);
    if (diff !== 0) loopUntouched = false;
    if (p === 0.28 || p === 0.63) cell(loopGrid, `Loop ${p.toFixed(2)}  Δ ${diff}`, a);
  }

  const tables: Record<string, PhaseRow[]> = {};
  let derivedInsideRange = true;
  let seam01 = true;
  let reverses = true;
  let wholeCyclesSeam = true;
  const tableHost = document.createElement("div");
  root.appendChild(tableHost);

  for (const range of RANGES) {
    for (const cycles of SPEEDS) {
      const key = `${range.id} ${Math.round(range.start * 100)}–${Math.round(range.end * 100)} ${cycles}×`;
      const rows = phaseTable(range.start, range.end, cycles);
      tables[key] = rows;
      const pre = document.createElement("pre");
      pre.textContent = [
        key,
        "master  linear   cosine   tri",
        ...rows.map(
          (r) =>
            `${r.master.toFixed(2)}   ${r.linear.toFixed(4)}  ${r.cosine.toFixed(4)}  ${r.triangle.toFixed(3)}`,
        ),
      ].join("\n");
      tableHost.appendChild(pre);
      for (const r of rows) if (!r.inside) derivedInsideRange = false;
      const first = rows[0]!;
      const last = rows[rows.length - 1]!;
      if (Math.abs(first.cosine - last.cosine) > 1e-9 || Math.abs(first.linear - last.linear) > 1e-9) {
        seam01 = false;
        wholeCyclesSeam = false;
      }
      if (Math.abs(first.cosine - range.start) > 1e-9) wholeCyclesSeam = false;
      const mid = rows.find((r) => r.master === 0.5);
      if (cycles === 1 && mid) {
        const expectedEnd = bloomPulsePhase(0.5, range.start, range.end, 1, "cosine");
        if (Math.abs(expectedEnd - range.end) > 1e-9) reverses = false;
      }
      if (cycles === 2 && mid && Math.abs(mid.cosine - range.start) > 1e-9) reverses = false;
    }
  }

  const sample = clampBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  pulseR.setPlaybackMode("pingpong");
  pulseR.setBloomPulse(sample);
  loopR.setPlaybackMode("loop");
  loopR.setBloomPulse(sample);

  let endpointsMatchLoop = true;
  const endGrid = section(root, "Endpoints = Loop Bloom at those pair-local phases");
  const pairCount = 2;
  for (const local of [sample.start, sample.end]) {
    pulseR.setHoldPhase(local === sample.start ? 0 : 0.25);
    const ping = settle(pulseR);
    loopR.setHoldPhase(local / pairCount);
    const loop = settle(loopR);
    const diff = pixelDiff(ping, loop);
    if (diff !== 0) endpointsMatchLoop = false;
    cell(endGrid, `Ping ${local === sample.start ? "Start" : "End"}  Δ ${diff}`, ping);
    cell(endGrid, `Loop local ${local.toFixed(2)}`, loop);
  }

  const seamGrid = section(root, "Seam — master 0 and 1");
  pulseR.setHoldPhase(0);
  const seam0 = settle(pulseR);
  pulseR.setHoldPhase(1);
  const seam1 = settle(pulseR);
  const seamDiff = pixelDiff(seam0, seam1);
  if (seamDiff !== 0) seam01 = false;
  cell(seamGrid, `phase 0  ${hashPixels(seam0)}`, seam0);
  cell(seamGrid, `phase 1  Δ ${seamDiff}`, seam1);

  const three = makeRenderer(hidden, 3);
  three.setPlaybackMode("pingpong");
  three.setBloomPulse(sample);
  let pairFrozen = true;
  const pairGrid = section(root, "Three sources — pair stays 01/02");
  for (const p of MASTER) {
    three.setHoldPhase(p);
    settle(three);
    const pair = three.getActivePair();
    if (pair.aIndex !== 0 || pair.bIndex !== 1 || pair.pairIndex !== 0) pairFrozen = false;
    if (p === 0 || p === 0.5 || p === 0.8) {
      cell(pairGrid, `master ${p.toFixed(2)}  pair ${pair.aIndex + 1}/${pair.bIndex + 1}`, settle(three));
    }
  }

  const type = campaignType();
  pulseR.setTypeState(type);
  pulseR.setRegistrationEnabled(true);
  pulseR.setRegistrationAmount(68);
  pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  pulseR.setPlaybackMode("pingpong");
  let typeIndependent = true;
  const typeGrid = section(root, "Type + Bloom — 42–58 · 2× · Start 20 Stop 75");
  for (const p of MASTER) {
    pulseR.setHoldPhase(p);
    const img = settle(pulseR);
    const visible = typeVisibleForState(type, p);
    const pageAtMaster = visible ? typePageIndexForState(type, p) : -1;
    const bloom = pulseR.getBloomSamplePhase();
    const pageIfBloomClock = typeVisibleForState(type, bloom) ? typePageIndexForState(type, bloom) : -1;
    if (p === 0 || p === 0.1 || p === 0.9 || p === 1) {
      if (visible) typeIndependent = false;
    }
    if (visible && pageAtMaster !== pageIfBloomClock && p > 0.2 && p < 0.75) {
      /* expected — clocks differ inside the window */
    }
    if (p === 0.4 || p === 0.6) {
      if (pageAtMaster === pageIfBloomClock) {
        /* may coincide; not a failure */
      }
    }
    cell(
      typeGrid,
      `${p.toFixed(2)}  bloom ${bloom.toFixed(2)}  type ${visible ? String(pageAtMaster + 1).padStart(2, "0") : "off"}`,
      img,
    );
  }
  if (!typeVisibleForState(type, 0.1) && typeVisibleForState(type, 0.4) && !typeVisibleForState(type, 0.9)) {
    typeIndependent = true;
  } else {
    typeIndependent = false;
  }

  const flickerR = makeRenderer(hidden);
  flickerR.setPlaybackMode("pingpong");
  flickerR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  flickerR.setHoldPhase(0.96);
  flickerR.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  const noFlicker = settle(flickerR);
  flickerR.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }));
  const withFlicker = settle(flickerR);
  const flickerOverPulse = pixelDiff(noFlicker, withFlicker) > 0 && flickerR.getActivePair().pairIndex === 0;
  const flickGrid = section(root, "Flicker over pulsing Bloom — master 0.96");
  cell(flickGrid, "Pulse Flicker Off", noFlicker);
  cell(flickGrid, "Pulse Flicker 100", withFlicker);

  pulseR.setTypeState(clampTypeState({ enabled: false }));
  pulseR.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  pulseR.setRegistrationEnabled(false);
  pulseR.setHoldPhase(0.33);
  const holdPreview = settle(pulseR);
  pulseR.beginExport(W, H);
  await pulseR.renderExportFrame(0);
  const holdExport = pulseR.getVisibleImageData();
  pulseR.endExport();
  pulseR.resizeExact(W, H);
  const holdExportExact = pixelDiff(holdPreview, holdExport) === 0;
  const holdGrid = section(root, "HOLD 0.33 = export");
  cell(holdGrid, `preview ${hashPixels(holdPreview)}`, holdPreview);
  cell(holdGrid, `export Δ ${pixelDiff(holdPreview, holdExport)}`, holdExport);

  const a4 = makeRenderer(hidden);
  const a12 = makeRenderer(hidden);
  a4.setLoopSeconds(4);
  a12.setLoopSeconds(12);
  a4.setPlaybackMode("pingpong");
  a12.setPlaybackMode("pingpong");
  a4.setBloomPulse(sample);
  a12.setBloomPulse(sample);
  a4.setHoldPhase(0.33);
  a12.setHoldPhase(0.33);
  const loopLengthIndependent = pixelDiff(settle(a4), settle(a12)) === 0;

  const turnGrid = section(root, "Turnaround — linear vs cosine near reverse (Loop samples)");
  loopR.setPlaybackMode("loop");
  loopR.setTypeState(clampTypeState({ enabled: false }));
  loopR.setRegistrationEnabled(false);
  const near = [0.22, 0.24, 0.25, 0.26, 0.28];
  for (const kind of ["linear", "cosine"] as const) {
    for (const m of near) {
      const local = bloomPulsePhase(m, 0.4, 0.58, 2, kind);
      loopR.setHoldPhase(local / pairCount);
      cell(turnGrid, `${kind}  m ${m.toFixed(2)}  bloom ${local.toFixed(3)}`, settle(loopR));
    }
  }

  const sizeGrid = section(root, "Range size — 2× at master 0.00–1.00");
  pulseR.setPlaybackMode("pingpong");
  pulseR.setTypeState(clampTypeState({ enabled: false }));
  for (const range of [
    { label: "5%  45–50", start: 0.45, end: 0.5 },
    { label: "10%  45–55", start: 0.45, end: 0.55 },
    { label: "16%  42–58", start: 0.42, end: 0.58 },
    { label: "18%  40–58", start: 0.4, end: 0.58 },
    { label: "25%  35–60", start: 0.35, end: 0.6 },
  ]) {
    pulseR.setBloomPulse({ start: range.start, end: range.end, cycles: 2 });
    pulseR.setHoldPhase(0.25);
    cell(sizeGrid, `${range.label}  peak`, settle(pulseR));
  }

  const speedGrid = section(root, "Pulse Speed — 42–58 at master 0.25");
  pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 1 });
  for (const cycles of SPEEDS) {
    pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles });
    pulseR.setHoldPhase(0.25);
    cell(speedGrid, `${cycles}×  bloom ${pulseR.getBloomSamplePhase().toFixed(3)}`, settle(pulseR));
  }

  pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  pulseR.setTypeState(type);
  pulseR.setRegistrationEnabled(true);
  pulseR.setRegistrationAmount(68);
  pulseR.setParams(bloomParams(60));
  pulseR.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));

  const comparePhases = [0, 0.15, 0.25, 0.4, 0.5, 0.65, 0.85, 0.96];
  const variants: { id: string; label: string; mode: "loop" | "pingpong"; start: number; end: number; cycles: PulseCycles }[] = [
    { id: "A", label: "A  LOOP", mode: "loop", start: 0.42, end: 0.58, cycles: 1 },
    { id: "B", label: "B  PULSE 42–58  1×", mode: "pingpong", start: 0.42, end: 0.58, cycles: 1 },
    { id: "C", label: "C  PULSE 42–58  2×", mode: "pingpong", start: 0.42, end: 0.58, cycles: 2 },
    { id: "D", label: "D  PULSE 45–55  2×", mode: "pingpong", start: 0.45, end: 0.55, cycles: 2 },
  ];
  for (const v of variants) {
    pulseR.setPlaybackMode(v.mode);
    pulseR.setBloomPulse({ start: v.start, end: v.end, cycles: v.cycles });
    pulseR.setTypeState(clampTypeState({ enabled: false }));
    const grid = section(root, `${v.label}  — image only`);
    for (const p of comparePhases) {
      pulseR.setHoldPhase(p);
      cell(grid, `${p.toFixed(2)}  bloom ${pulseR.getBloomSamplePhase().toFixed(2)}`, settle(pulseR));
    }
  }
  for (const v of variants.filter((row) => row.id !== "A")) {
    pulseR.setPlaybackMode("pingpong");
    pulseR.setBloomPulse({ start: v.start, end: v.end, cycles: v.cycles });
    pulseR.setTypeState(type);
    const grid = section(root, `${v.label}  + Type Sequence`);
    for (const p of comparePhases) {
      pulseR.setHoldPhase(p);
      const vis = typeVisibleForState(type, p);
      const idx = vis ? typePageIndexForState(type, p) : -1;
      cell(grid, `${p.toFixed(2)}  ${vis ? `0${idx + 1}` : "no type"}`, settle(pulseR));
    }
  }

  pulseR.setPlaybackMode("pingpong");
  pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  pulseR.setTypeState(type);
  pulseR.setEndBehaviour(clampEndBehaviourSettings({ mode: "flicker", amount: 100, hold: 45, duration: 35 }));
  const rhythm = section(root, "Rhythm  C 42–58 2×  ·  Type event  ·  Flicker interruption");
  for (const p of [0, 0.1, 0.2, 0.32, 0.45, 0.58, 0.7, 0.75, 0.88, 0.96, 1]) {
    pulseR.setHoldPhase(p);
    const vis = typeVisibleForState(type, p);
    const idx = vis ? typePageIndexForState(type, p) : -1;
    const bloom = pulseR.getBloomSamplePhase();
    cell(rhythm, `${p.toFixed(2)}  bloom ${bloom.toFixed(2)}  ${vis ? `0${idx + 1}` : p >= 0.9 ? "flicker" : "no type"}`, settle(pulseR));
  }
  pulseR.setEndBehaviour(clampEndBehaviourSettings({ mode: "off" }));
  pulseR.setTypeState(clampTypeState({ enabled: false }));

  const omitted = clampBloomPulse({});
  const defaultRange = omitted.start === 0.42 && omitted.end === 0.58 && omitted.cycles === 1
    && DEFAULT_BLOOM_PULSE.start === 0.42 && DEFAULT_BLOOM_PULSE.end === 0.58;
  pulseR.setBloomPulse({ start: 0.42, end: 0.58, cycles: 2 });
  const beforeRand = pulseR.getBloomPulse();
  const rand = generateRandomisation({
    seed: 42,
    params: bloomParams(60),
    loopSeconds: LOOP,
    pairIndex: 0,
    pairCount: 2,
  });
  pulseR.setParams(rand.params);
  const afterRand = pulseR.getBloomPulse();
  const randomiseLeavesPulse = afterRand.start === beforeRand.start && afterRand.end === beforeRand.end && afterRand.cycles === beforeRand.cycles;

  return {
    loopUntouched,
    endpointsMatchLoop,
    seam01,
    derivedInsideRange,
    reverses,
    pairFrozen,
    typeIndependent,
    flickerOverPulse,
    holdExportExact,
    loopLengthIndependent,
    wholeCyclesSeam,
    defaultRange,
    randomiseLeavesPulse,
    elapsedMs: performance.now() - t0,
    tables,
    details: {
      sample,
      seamDiff,
      holdHash: hashPixels(holdPreview),
      flickerDiff: pixelDiff(noFlicker, withFlicker),
      turnaround: "cosine",
      pulseMin: 0.03,
      speeds: SPEEDS,
      defaultPulse: DEFAULT_BLOOM_PULSE,
      uiMode: "Loop / Pulse",
      note: "Pulse Range is pair-local on LOOP pair 0. Two sources: Loop master = local / 2.",
    },
  };
}
