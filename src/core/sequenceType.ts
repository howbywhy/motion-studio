import { clamp01 } from "./easing";
import type { PairMapping } from "./sequence";
import { clampTypeState, cloneTypeState, defaultTypeState, type TypeAnchor, type TypeState } from "./typeState";
import {
  resolveSequenceTypeSize,
  SEQUENCE_TYPE_SIZE_REF,
  type SequenceTypeAnchor,
} from "./sequenceTypeSize";
import { layoutTypeDocument, typeInkBox } from "./typeLayout";
import { paintTypeLayer } from "./typePaint";
import {
  sequenceTypeApplies,
  sequenceTypeCopyForPair,
  sequenceTypeDraw,
  sequenceTypeEnvelope,
  type SequenceTypeArrival,
  type SequenceTypeMotion,
} from "./sequenceTypeTiming";
import { applyTypeBloomMask } from "./sequenceTypeBloom";
import {
  connectionUsesBloom,
  connectionUsesFlicker,
  resolveEvalSequenceUnity,
  sequenceTypeConnectionDraw,
  sequenceTypeCopyIndex,
  type TypeConnectionMode,
} from "./sequenceTypeConnection";
import { resolveEvalSequenceWeights } from "./sequenceRhythm";
import { transitionFlickerEnvelope, transitionFlickerHalfSpan } from "./transitionFlicker";
import {
  incomingTypeBFormation,
  incomingTypeBPresent,
  resolveEvalTypeIncoming,
  resolveEvalTypeIncomingFormation,
  TYPE_INCOMING_MATERIAL_BIAS,
  TYPE_INCOMING_SHORT_BIAS,
  type TypeIncomingFormation,
  type TypeIncomingStrategy,
} from "./sequenceTypeIncoming";

export {
  defaultEvalSequenceCopies,
  productSequenceTypeApplies,
  sequenceTypeApplies,
  sequenceTypeCopyForPair,
  sequenceTypeDraw,
  sequenceTypeEnvelope,
  sequenceTypeHasCopy,
  sequenceTypeReadability,
  sequenceTypeWindows,
  applySequenceCopyChange,
  applySequenceFieldChange,
  sequenceCopiesEqual,
  SEQUENCE_TYPE_ARRIVE_END,
  SEQUENCE_TYPE_RESOLVE_START,
  SEQUENCE_TYPE_WARN_EVENT_SECONDS,
  type SequenceTypeDraw,
  type SequenceTypeEnvelope,
  SEQUENCE_TYPE_ARRIVALS,
  type SequenceCopyChange,
  type SequenceTypeArrival,
  type SequenceTypeMotion,
  type SequenceTypeStage,
} from "./sequenceTypeTiming";
export {
  TYPE_CONNECTION_MODES,
  FLICKER_WRAP_MODES,
  FLICKER_SWAPS,
  connectionUsesFlicker,
  connectionUsesBloom,
  sequenceTypeCopyIndex,
  type TypeConnectionMode,
  type FlickerWrapMode,
  type FlickerSwap,
} from "./sequenceTypeConnection";

/**
 * Sequence Type — product Sequence mode + eval QA.
 *
 * Product: Type belongs to the visual state and is consumed by the same
 * Bloom field that consumes that state. No independent outro, crop, fade,
 * or arrive/hold/resolve clock. Canonical ownership still chooses the
 * semantic slot. Visible Bloom mask reveals Type B and retires Type A.
 * Pulse and Global Type ignore this path. Eval may still bind SOFT / BLOOM.
 * Product handoff: Bloom consumes Type A only. Type B becomes present
 * when semantic ownership flips to B. Flicker confirms; it does not introduce Type.
 */

/** Authored threshold on the existing Bloom mask. Not a control. */
export const SEQUENCE_TYPE_REVEAL_THRESHOLD = 0.42;
/** Tiny A/B separation so complementary Type does not double in the halo. */
const TYPE_A_THRESHOLD_BIAS = -0.02;
const TYPE_B_THRESHOLD_BIAS = 0.02;

/** Visible Type matte treatment. Eval compares these; product uses `safe`. */
export type TypeBloomMatteKind = "current" | "filtered" | "higher" | "safe";
export const PRODUCT_TYPE_BLOOM_MATTE: TypeBloomMatteKind = "safe";

export let lastTypeBloomPaintMs = 0;

export interface SequenceTypePaintTrace {
  paintedA: boolean;
  paintedB: boolean;
  incoming: boolean;
  copyA: boolean;
  copyB: boolean;
  strategy: TypeIncomingStrategy;
  formation: TypeIncomingFormation;
  amount: number;
  threshold: number;
  full: boolean;
}

export const emptySequenceTypePaintTrace = (): SequenceTypePaintTrace => ({
  paintedA: false,
  paintedB: false,
  incoming: false,
  copyA: false,
  copyB: false,
  strategy: "current",
  formation: "current",
  amount: 0,
  threshold: 1,
  full: false,
});

export let lastSequenceTypePaint: SequenceTypePaintTrace = emptySequenceTypePaintTrace();

export const PRODUCT_SEQUENCE_TYPE_MOTION: SequenceTypeMotion = "connected";
export const PRODUCT_SEQUENCE_TYPE_ARRIVAL: SequenceTypeArrival = "soft-crop";
export const PRODUCT_SEQUENCE_TYPE_CONNECTION: TypeConnectionMode = "flicker";

export interface SequenceTypeEvalConfig {
  copies: string[];
  motion: SequenceTypeMotion;
  arrival?: SequenceTypeArrival;
  /** Product Sequence Type is flicker. Eval may bind SOFT / BLOOM. */
  connection?: TypeConnectionMode;
  masterPhase?: number;
  /** Renderer that owns eval binds. Avoids leaking the live review bind into hidden QA. */
  owner?: object;
  /** Product Loop: copy index from Bloom ownership. Eval flicker swap ignores this. */
  ownershipCopyIndex?: number;
  /** Visible Bloom mask. Product Sequence Type composites through this field. */
  imageMask?: HTMLCanvasElement;
  /** Envelope B resolve matte (same 160px grow the image uses). */
  imageResolveMask?: HTMLCanvasElement;
  /** Eval-only raster treatment. Product omits this and uses `safe`. */
  matteKind?: TypeBloomMatteKind;
  /** Canonical ownership has flipped to B. */
  ownedB?: boolean;
  /** Eval incoming strategy. Product uses the locked relationship. */
  incoming?: TypeIncomingStrategy;
  /** Eval incoming formation. Product uses the locked relationship. */
  incomingFormation?: TypeIncomingFormation;
  /** Envelope B resolve 0..1. Drives incoming B formation, not video time. */
  bloomResolve?: number;
}

let evalConfig: SequenceTypeEvalConfig | null = null;
const evalByOwner = new WeakMap<object, SequenceTypeEvalConfig | null>();

export function setEvalSequenceType(config: SequenceTypeEvalConfig | null): void {
  evalConfig = config;
}

export function getEvalSequenceType(): SequenceTypeEvalConfig | null {
  return evalConfig;
}

export function bindEvalSequenceType(owner: object, config: SequenceTypeEvalConfig | null): void {
  evalByOwner.set(owner, config);
}

export function resolveEvalSequenceType(owner?: object): SequenceTypeEvalConfig | null {
  if (owner && evalByOwner.has(owner)) return evalByOwner.get(owner) ?? null;
  return evalConfig;
}

export function sharedSequenceTypeStyle(): TypeState {
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
        anchor: "bc",
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

export function typeStateForSequenceCopy(
  style: TypeState,
  copy: string,
  trackingAdd = 0,
  compose?: { scale?: number; anchor?: TypeAnchor },
): TypeState {
  const base = cloneTypeState(style);
  const text = copy.trimEnd();
  const block0 = {
    ...base.blocks[0],
    enabled: text.trim().length > 0,
    text,
    scale: compose?.scale ?? base.blocks[0]!.scale,
    anchor: compose?.anchor ?? base.blocks[0]!.anchor,
    tracking: Math.max(0, base.blocks[0]!.tracking + trackingAdd),
  };
  const block1 = { ...base.blocks[1], enabled: false, text: "" };
  const block2 = { ...base.blocks[2], enabled: false, text: "" };
  const next = clampTypeState({
    ...base,
    enabled: true,
    sequenceStart: 0,
    sequenceStop: 1,
    selected: 0,
    blocks: [block0, block1, block2],
    pages: [[block0, block1, block2]],
  });
  return { ...next, sequenceLegalCopy: SEQUENCE_TYPE_SIZE_REF };
}

export function composeSequenceTypeState(
  style: TypeState,
  copy: string,
  copyIndex: number,
  width: number,
  height: number,
  trackingAdd = 0,
): TypeState {
  const mode = style.sequenceSizeModes[copyIndex] ?? "auto";
  const stored = style.sequenceSizes[copyIndex] ?? style.blocks[0]!.scale;
  const scale = resolveSequenceTypeSize(style, copy, mode, stored, width, height);
  const raw: SequenceTypeAnchor = style.sequenceAnchors[copyIndex] ?? "inherit";
  const anchor = raw === "inherit" ? style.blocks[0]!.anchor : raw;
  return typeStateForSequenceCopy(style, copy, trackingAdd, { scale, anchor });
}

function resolveConnectionCopyIndex(
  mapping: PairMapping,
  loopSeconds: number,
  masterPhase?: number,
  owner?: object,
  connection?: TypeConnectionMode,
): number {
  const mode = connection ?? "soft";
  if (!connectionUsesFlicker(mode)) return mapping.pairIndex;
  if (masterPhase == null || !Number.isFinite(masterPhase)) return mapping.pairIndex;
  const unity = resolveEvalSequenceUnity(owner);
  const weights = resolveEvalSequenceWeights(owner);
  const includeWrap = unity ? unity.flickerWrap === "include-wrap" : true;
  const { cut, envelope } = transitionFlickerEnvelope(
    masterPhase,
    mapping.pairCount,
    loopSeconds,
    weights ?? undefined,
    includeWrap,
  );
  return sequenceTypeCopyIndex(
    mapping.pairIndex,
    mapping.pairCount,
    masterPhase,
    cut,
    envelope,
    unity?.flickerSwap ?? "centre",
    transitionFlickerHalfSpan(loopSeconds),
  );
}

export function paintEvalSequenceType(
  dest: CanvasRenderingContext2D,
  width: number,
  height: number,
  mapping: PairMapping,
  loopSeconds: number,
  config: SequenceTypeEvalConfig,
  style: TypeState = sharedSequenceTypeStyle(),
): void {
  if (!sequenceTypeApplies("loop", mapping)) return;
  const copyIndex =
    config.ownershipCopyIndex != null && Number.isFinite(config.ownershipCopyIndex)
      ? ((Math.round(config.ownershipCopyIndex) % Math.max(1, mapping.pairCount)) + Math.max(1, mapping.pairCount)) %
        Math.max(1, mapping.pairCount)
      : resolveConnectionCopyIndex(
        mapping,
        loopSeconds,
        config.masterPhase,
        config.owner,
        config.connection,
      );
  const copy = sequenceTypeCopyForPair(config.copies, copyIndex);
  const connection = config.connection ?? "soft";
  if (config.imageMask && connection !== "soft" && !connectionUsesBloom(connection)) {
    const strategy = config.incoming ?? resolveEvalTypeIncoming(config.owner);
    const weights = resolveEvalSequenceWeights(config.owner);
    const flick = transitionFlickerEnvelope(
      config.masterPhase ?? 0,
      mapping.pairCount,
      loopSeconds,
      weights ?? undefined,
      true,
    );
    const incoming = incomingTypeBPresent({
      strategy,
      ownedB: config.ownedB === true,
      masterPhase: config.masterPhase ?? 0,
      cut: flick.cut,
      loopSeconds,
    });
    const formation = incomingTypeBFormation({
      treatment: config.incomingFormation ?? resolveEvalTypeIncomingFormation(config.owner),
      ownedB: incoming,
      resolve: config.bloomResolve ?? 0,
    });
    paintSequenceTypeThroughBloom(
      dest,
      width,
      height,
      style,
      config.copies,
      mapping.pairIndex,
      mapping.pairCount,
      config.imageMask,
      config.imageResolveMask,
      SEQUENCE_TYPE_REVEAL_THRESHOLD,
      config.matteKind ?? PRODUCT_TYPE_BLOOM_MATTE,
      incoming,
      strategy,
      formation,
    );
    return;
  }
  if (!copy.trim()) return;
  const eventSeconds = mapping.eventSeconds ?? loopSeconds / Math.max(1, mapping.pairCount);
  const env = sequenceTypeEnvelope(mapping.localPhase, eventSeconds);
  if (connection === "soft" && env.presence <= 0.001 && env.stage !== "hold") return;
  const draw = connection === "soft"
    ? sequenceTypeDraw(env, config.motion, height, config.arrival ?? "soft-crop")
    : sequenceTypeConnectionDraw(env, connection, height);
  const type = composeSequenceTypeState(style, copy, copyIndex, width, height, draw.trackingAdd);
  const laid = layoutTypeDocument(type, width, height);
  if (laid.length === 0) return;

  if (connectionUsesBloom(connection)) {
    const layer = typePaintScratch(width, height);
    const lctx = layer.getContext("2d")!;
    lctx.clearRect(0, 0, width, height);
    let union = { l: width, t: height, r: 0, b: 0 };
    for (const item of laid) {
      paintTypeLayer(lctx, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
      const box = typeInkBox(item.layout);
      union = {
        l: Math.min(union.l, box.l + item.layout.offsetX),
        t: Math.min(union.t, box.t + item.layout.offsetY),
        r: Math.max(union.r, box.r + item.layout.offsetX),
        b: Math.max(union.b, box.b + item.layout.offsetY),
      };
    }
    applyTypeBloomMask(dest, layer, union, mapping.localPhase, connection, copyIndex, mapping.pairCount);
    return;
  }

  for (const item of laid) {
    dest.save();
    dest.translate(0, draw.dy);
    const box = typeInkBox(item.layout);
    const l = box.l + item.layout.offsetX;
    const t = box.t + item.layout.offsetY;
    const r = box.r + item.layout.offsetX;
    const b = box.b + item.layout.offsetY;
    const bw = Math.max(1, r - l);
    const bh = Math.max(1, b - t);
    const pad = Math.max(2, item.layout.fontSize * 0.12);
    const clipL = l - pad + bw * clamp01(draw.cropL);
    const clipT = t - pad + bh * clamp01(draw.cropT);
    const clipR = r + pad - bw * clamp01(draw.cropR);
    const clipB = b + pad - bh * clamp01(draw.cropB);
    dest.beginPath();
    dest.rect(clipL, clipT, Math.max(0, clipR - clipL), Math.max(0, clipB - clipT));
    dest.clip();
    dest.globalAlpha *= clamp01(draw.opacity);
    paintTypeLayer(dest, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
    dest.restore();
  }
}

let paintScratch: HTMLCanvasElement | null = null;
let typeAScratch: HTMLCanvasElement | null = null;
let typeBScratch: HTMLCanvasElement | null = null;
let typeMatteScratch: HTMLCanvasElement | null = null;
let typeMatteAScratch: HTMLCanvasElement | null = null;
let typeMatteBScratch: HTMLCanvasElement | null = null;
let typeFilterScratch: HTMLCanvasElement | null = null;

function typePaintScratch(width: number, height: number): HTMLCanvasElement {
  if (!paintScratch || paintScratch.width !== width || paintScratch.height !== height) {
    paintScratch = document.createElement("canvas");
    paintScratch.width = width;
    paintScratch.height = height;
  }
  return paintScratch;
}

function ensureScratch(current: HTMLCanvasElement | null, width: number, height: number): HTMLCanvasElement {
  if (!current || current.width !== width || current.height !== height) {
    const next = document.createElement("canvas");
    next.width = width;
    next.height = height;
    return next;
  }
  return current;
}

function paintSequenceCopy(
  dest: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: TypeState,
  copy: string,
  copyIndex: number,
): boolean {
  if (!copy.trim()) return false;
  const type = composeSequenceTypeState(style, copy, copyIndex, width, height, 0);
  const laid = layoutTypeDocument(type, width, height);
  if (laid.length === 0) return false;
  for (const item of laid) {
    paintTypeLayer(dest, item.layout, item.layout.color, item.layout.opacity, undefined, item.index);
  }
  return true;
}

function typeMatteSoftBand(fontSize: number): number {
  if (fontSize < 32) return 26;
  if (fontSize < 56) return 20;
  return 14;
}

function remapMaskAlpha(data: Uint8ClampedArray, threshold: number, band: number): void {
  const cut = threshold * 255;
  const lo = cut - band;
  const hi = cut + band;
  const span = Math.max(1, hi - lo);
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i] ?? 0;
    let t = (a - lo) / span;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    t = t * t * (3 - 2 * t);
    data[i] = Math.round(t * 255);
  }
}

function stampBloomField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  imageMask: HTMLCanvasElement,
  resolveMask: HTMLCanvasElement | undefined,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(imageMask, 0, 0, width, height);
  if (resolveMask && resolveMask.width > 0) {
    ctx.globalCompositeOperation = "lighten";
    ctx.drawImage(resolveMask, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }
}

function thresholdWhole(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold: number,
  band: number,
): void {
  const img = ctx.getImageData(0, 0, width, height);
  remapMaskAlpha(img.data, threshold, band);
  ctx.putImageData(img, 0, 0);
}

function buildLowResTypeMatte(
  destW: number,
  destH: number,
  imageMask: HTMLCanvasElement,
  resolveMask: HTMLCanvasElement | undefined,
  threshold: number,
  sampleW: number,
  blurPx: number,
): HTMLCanvasElement {
  const sampleH = Math.max(1, Math.round(sampleW * (destH / Math.max(1, destW))));
  typeMatteScratch = ensureScratch(typeMatteScratch, sampleW, sampleH);
  const ctx = typeMatteScratch.getContext("2d", { willReadFrequently: true })!;
  stampBloomField(ctx, sampleW, sampleH, imageMask, resolveMask);
  thresholdWhole(ctx, sampleW, sampleH, threshold, 18);
  if (blurPx > 0.2) {
    typeFilterScratch = ensureScratch(typeFilterScratch, sampleW, sampleH);
    const fctx = typeFilterScratch.getContext("2d")!;
    fctx.clearRect(0, 0, sampleW, sampleH);
    fctx.filter = `blur(${blurPx.toFixed(2)}px)`;
    fctx.drawImage(typeMatteScratch, 0, 0);
    fctx.filter = "none";
    ctx.clearRect(0, 0, sampleW, sampleH);
    ctx.drawImage(typeFilterScratch, 0, 0);
  }
  return typeMatteScratch;
}

function typeInkUnion(
  width: number,
  height: number,
  style: TypeState,
  copies: { copy: string; index: number }[],
): { l: number; t: number; r: number; b: number; fontSize: number } {
  let l = width;
  let t = height;
  let r = 0;
  let b = 0;
  let fontSize = 0;
  for (const item of copies) {
    if (!item.copy.trim()) continue;
    const type = composeSequenceTypeState(style, item.copy, item.index, width, height, 0);
    const laid = layoutTypeDocument(type, width, height);
    for (const item of laid) {
      fontSize = Math.max(fontSize, item.layout.fontSize);
      const box = typeInkBox(item.layout);
      l = Math.min(l, box.l + item.layout.offsetX);
      t = Math.min(t, box.t + item.layout.offsetY);
      r = Math.max(r, box.r + item.layout.offsetX);
      b = Math.max(b, box.b + item.layout.offsetY);
    }
  }
  const pad = Math.max(8, Math.round(fontSize * 0.18));
  return {
    l: Math.max(0, Math.floor(l - pad)),
    t: Math.max(0, Math.floor(t - pad)),
    r: Math.min(width, Math.ceil(r + pad)),
    b: Math.min(height, Math.ceil(b + pad)),
    fontSize,
  };
}

function buildSafeTypeMattes(
  width: number,
  height: number,
  imageMask: HTMLCanvasElement,
  resolveMask: HTMLCanvasElement | undefined,
  threshold: number,
  fontSize: number,
  box: { l: number; t: number; r: number; b: number },
): { matteA: HTMLCanvasElement; matteB: HTMLCanvasElement } {
  typeMatteAScratch = ensureScratch(typeMatteAScratch, width, height);
  typeMatteBScratch = ensureScratch(typeMatteBScratch, width, height);
  const aCtx = typeMatteAScratch.getContext("2d", { willReadFrequently: true })!;
  const bCtx = typeMatteBScratch.getContext("2d")!;
  stampBloomField(aCtx, width, height, imageMask, resolveMask);
  bCtx.clearRect(0, 0, width, height);
  bCtx.imageSmoothingEnabled = true;
  bCtx.drawImage(typeMatteAScratch, 0, 0);

  if (box.r <= box.l || box.b <= box.t) {
    return { matteA: typeMatteAScratch, matteB: typeMatteBScratch };
  }
  const bw = Math.max(1, box.r - box.l);
  const bh = Math.max(1, box.b - box.t);
  const img = aCtx.getImageData(box.l, box.t, bw, bh);
  const src = new Uint8ClampedArray(img.data);
  const band = typeMatteSoftBand(fontSize);
  remapMaskAlpha(img.data, clamp01(threshold + TYPE_A_THRESHOLD_BIAS), band);
  aCtx.putImageData(img, box.l, box.t);
  img.data.set(src);
  remapMaskAlpha(img.data, clamp01(threshold + TYPE_B_THRESHOLD_BIAS), band);
  bCtx.putImageData(img, box.l, box.t);
  return { matteA: typeMatteAScratch, matteB: typeMatteBScratch };
}

/** Output-resolution Type-safe matte. Incoming B opens from just above the local field. */
function buildSafeTypeMatte(
  width: number,
  height: number,
  imageMask: HTMLCanvasElement,
  resolveMask: HTMLCanvasElement | undefined,
  threshold: number,
  fontSize: number,
  box: { l: number; t: number; r: number; b: number },
  amount?: number,
  bias?: number,
): { matte: HTMLCanvasElement; threshold: number } {
  typeMatteBScratch = ensureScratch(typeMatteBScratch, width, height);
  const ctx = typeMatteBScratch.getContext("2d", { willReadFrequently: true })!;
  stampBloomField(ctx, width, height, imageMask, resolveMask);
  if (box.r <= box.l || box.b <= box.t) return { matte: typeMatteBScratch, threshold };
  const bw = Math.max(1, box.r - box.l);
  const bh = Math.max(1, box.b - box.t);
  const img = ctx.getImageData(box.l, box.t, bw, bh);
  let cut = threshold;
  if (amount != null && bias != null) {
    let sum = 0;
    let n = 0;
    for (let i = 3; i < img.data.length; i += 4) {
      sum += img.data[i] ?? 0;
      n += 1;
    }
    const mean = n > 0 ? sum / (n * 255) : 0;
    const start = Math.min(1.12, Math.max(SEQUENCE_TYPE_REVEAL_THRESHOLD, mean + bias));
    cut = start + (0.28 - start) * clamp01(amount);
  }
  remapMaskAlpha(img.data, cut, typeMatteSoftBand(fontSize));
  ctx.putImageData(img, box.l, box.t);
  return { matte: typeMatteBScratch, threshold: cut };
}

function compositeTypeThroughMatte(
  dest: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  matte: HTMLCanvasElement,
  mode: "destination-out" | "destination-in",
): void {
  const ctx = scratch.getContext("2d")!;
  ctx.globalCompositeOperation = mode;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(matte, 0, 0, scratch.width, scratch.height);
  ctx.globalCompositeOperation = "source-over";
  dest.drawImage(scratch, 0, 0);
}

/**
 * Type A is consumed by the visible Bloom field.
 * Type B starts at semantic ownership. Formation may condense B through
 * a restrained Type-safe contour of the same field — not a reverse of A.
 */
export function paintSequenceTypeThroughBloom(
  dest: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: TypeState,
  copies: readonly string[],
  pairIndex: number,
  pairCount: number,
  imageMask: HTMLCanvasElement,
  resolveMask?: HTMLCanvasElement,
  threshold = SEQUENCE_TYPE_REVEAL_THRESHOLD,
  kind: TypeBloomMatteKind = PRODUCT_TYPE_BLOOM_MATTE,
  incomingB = false,
  strategy: TypeIncomingStrategy = "current",
  formation = incomingTypeBFormation({ treatment: "current", ownedB: incomingB, resolve: incomingB ? 1 : 0 }),
): void {
  const t0 = performance.now();
  const n = Math.max(1, pairCount);
  const i = ((pairIndex % n) + n) % n;
  const next = (i + 1) % n;
  const copyA = sequenceTypeCopyForPair(copies, i);
  const copyB = sequenceTypeCopyForPair(copies, next);
  const hasA = Boolean(copyA.trim());
  const hasB = Boolean(copyB.trim());
  lastSequenceTypePaint = {
    paintedA: false,
    paintedB: false,
    incoming: incomingB,
    copyA: hasA,
    copyB: hasB,
    strategy,
    formation: formation.treatment,
    amount: formation.amount,
    threshold: formation.threshold,
    full: formation.full,
  };

  if (hasA) {
    const box = typeInkUnion(width, height, style, [{ copy: copyA, index: i }]);
    let matteA: HTMLCanvasElement;
    if (kind === "safe") {
      const pair = buildSafeTypeMattes(width, height, imageMask, resolveMask, threshold, box.fontSize, box);
      matteA = pair.matteA;
    } else {
      const sampleW = kind === "higher" ? 480 : 160;
      const blur = kind === "filtered" ? 0.7 : 0;
      matteA = buildLowResTypeMatte(width, height, imageMask, resolveMask, threshold, sampleW, blur);
    }

    typeAScratch = ensureScratch(typeAScratch, width, height);
    const aCtx = typeAScratch.getContext("2d")!;
    aCtx.clearRect(0, 0, width, height);
    if (paintSequenceCopy(aCtx, width, height, style, copyA, i)) {
      compositeTypeThroughMatte(dest, typeAScratch, matteA, "destination-out");
      lastSequenceTypePaint.paintedA = true;
    }
  }

  if (formation.present && hasB) {
    if (formation.full || kind !== "safe") {
      lastSequenceTypePaint.paintedB = paintSequenceCopy(dest, width, height, style, copyB, next);
    } else {
      const box = typeInkUnion(width, height, style, [{ copy: copyB, index: next }]);
      const bias = formation.treatment === "short" ? TYPE_INCOMING_SHORT_BIAS : TYPE_INCOMING_MATERIAL_BIAS;
      const matteB = buildSafeTypeMatte(
        width,
        height,
        imageMask,
        resolveMask,
        formation.threshold,
        box.fontSize,
        box,
        formation.amount,
        bias,
      );
      lastSequenceTypePaint.threshold = matteB.threshold;
      typeBScratch = ensureScratch(typeBScratch, width, height);
      const bCtx = typeBScratch.getContext("2d")!;
      bCtx.clearRect(0, 0, width, height);
      if (paintSequenceCopy(bCtx, width, height, style, copyB, next)) {
        compositeTypeThroughMatte(dest, typeBScratch, matteB.matte, "destination-in");
        lastSequenceTypePaint.paintedB = true;
      }
    }
  }
  lastTypeBloomPaintMs = performance.now() - t0;
}

export function emptySequenceTypeStyle(): TypeState {
  return defaultTypeState();
}
