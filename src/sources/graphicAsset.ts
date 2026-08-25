import { defaultTransform, type GraphicDriver as CoreGraphicDriver, type MediaAsset } from "../core/media";
import { DEFAULT_FIELD, type FieldParams, paintFieldToCanvas } from "./field";

export interface GraphicDriver extends CoreGraphicDriver {
  getField(): FieldParams;
  patchField(p: Partial<FieldParams>): void;
}

function sourceSize(aspectW: number, aspectH: number): { w: number; h: number } {
  const max = 900;
  if (aspectH >= aspectW) {
    const h = max;
    const w = Math.round((max * aspectW) / aspectH);
    return { w: Math.max(320, w), h };
  }
  const w = max;
  const h = Math.round((max * aspectH) / aspectW);
  return { w, h: Math.max(320, h) };
}

export function createGraphicAsset(
  aspectW: number,
  aspectH: number,
  label: string,
  field: FieldParams = { ...DEFAULT_FIELD },
): MediaAsset {
  const { w, h } = sourceSize(aspectW, aspectH);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const state = { field: { ...field }, dpr: 1 };

  const driver: GraphicDriver = {
    dirty: true,
    paintedAt: -1,
    paint(time: number) {
      paintFieldToCanvas(canvas, state.field, time, state.dpr);
    },
    getMotion() {
      return state.field.motion;
    },
    getField() {
      return state.field;
    },
    patchField(p) {
      Object.assign(state.field, p);
      driver.dirty = true;
    },
    setAspect(aw, ah) {
      // Pixel size is owned by setRasterSize (output canvas). Aspect only
      // marks dirty so a later raster sync repaints the new frame.
      void aw;
      void ah;
      driver.dirty = true;
    },
    setRasterSize(width, height, dpr = 1) {
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      const nextDpr = Math.max(1, dpr);
      if (canvas.width === w && canvas.height === h && state.dpr === nextDpr) return;
      canvas.width = w;
      canvas.height = h;
      state.dpr = nextDpr;
      driver.dirty = true;
    },
  };

  const asset: MediaAsset = {
    kind: "graphic",
    source: canvas,
    naturalW: canvas.width,
    naturalH: canvas.height,
    label,
    transform: defaultTransform(),
    graphic: driver,
  };

  const setAspect = driver.setAspect;
  driver.setAspect = (aw, ah) => {
    setAspect(aw, ah);
    asset.naturalW = canvas.width;
    asset.naturalH = canvas.height;
  };

  const setRasterSize = driver.setRasterSize;
  driver.setRasterSize = (width, height, dpr) => {
    setRasterSize(width, height, dpr);
    asset.naturalW = canvas.width;
    asset.naturalH = canvas.height;
  };

  driver.paint(0);
  driver.dirty = false;
  driver.paintedAt = 0;
  return asset;
}

export function asGraphic(asset: MediaAsset | null | undefined): GraphicDriver | null {
  if (!asset?.graphic || asset.kind !== "graphic") return null;
  return asset.graphic as GraphicDriver;
}
