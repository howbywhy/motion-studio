import { asGraphic } from "../sources/graphicAsset";
import { paintFieldToCanvas } from "../sources/field";
import type { SequenceItem } from "../core/sequence";
import type { MediaAsset } from "../core/media";
import {
  SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE,
  sequenceSpans,
  transferSequenceWeight,
} from "../core/sequenceRhythm";

const THUMB_H = 45;
const THUMB_MIN_W = 28;

export interface RhythmStripHandle {
  refresh: () => void;
  layout: () => void;
  syncMarks: () => void;
}

export function buildSequenceRhythmStrip(
  container: HTMLElement,
  opts: {
    getItems: () => SequenceItem[];
    getWeights: () => number[];
    getSelectedId: () => string | null;
    getActiveIndex: () => number;
    getLoopSeconds: () => number;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onReorder: (from: number, to: number) => void;
    onWeights: (weights: number[]) => void;
    onResetTiming: () => void;
    onDropMedia?: (id: string, file: File) => void;
  },
): RhythmStripHandle {
  container.className = "sequence-strip sequence-rhythm-strip";

  let dragFrom: number | null = null;
  let dragBoundary: number | null = null;

  function paintThumb(canvas: HTMLCanvasElement, asset: MediaAsset, width: number): void {
    const w = Math.max(THUMB_MIN_W, Math.round(width));
    canvas.width = w;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, THUMB_H);
    const graphic = asGraphic(asset);
    if (graphic) {
      paintFieldToCanvas(canvas, { ...graphic.getField(), motion: "static" }, 0);
      return;
    }
    const src = asset.source;
    const sw = asset.naturalW || 1;
    const sh = asset.naturalH || 1;
    const scale = Math.max(w / sw, THUMB_H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(src, (w - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
  }

  function secondsFor(index: number): string {
    const weights = opts.getWeights();
    const spans = sequenceSpans(weights);
    const share = spans[index]?.share ?? 0;
    return `${(share * opts.getLoopSeconds()).toFixed(1)}s`;
  }

  function refresh(): void {
    const items = opts.getItems();
    const weights = opts.getWeights();
    const selected = opts.getSelectedId();
    const active = opts.getActiveIndex();
    const spans = sequenceSpans(weights);
    const railW = Math.max(160, container.clientWidth - 52);
    container.innerHTML = "";

    const rail = document.createElement("div");
    rail.className = "sequence-rhythm-rail";
    container.appendChild(rail);

    items.forEach((item, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sequence-cell";
      cell.dataset.id = item.id;
      cell.dataset.index = String(index);
      cell.draggable = true;
      const share = spans[index]?.share ?? 1 / Math.max(1, items.length);
      cell.style.flex = `${Math.max(0.001, share)} 1 0`;
      if (item.id === selected) cell.classList.add("is-selected");
      if (index === active) cell.classList.add("is-active");

      const indexEl = document.createElement("span");
      indexEl.className = "sequence-cell-index";
      indexEl.textContent = String(index + 1).padStart(2, "0");
      cell.appendChild(indexEl);

      const timeEl = document.createElement("span");
      timeEl.className = "sequence-cell-time";
      timeEl.textContent = secondsFor(index);
      timeEl.hidden = !SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE;
      cell.appendChild(timeEl);

      const thumb = document.createElement("canvas");
      thumb.className = "sequence-cell-thumb";
      const thumbW = Math.max(THUMB_MIN_W, Math.round(railW * share));
      paintThumb(thumb, item.asset, thumbW);
      cell.appendChild(thumb);

      if (item.asset.kind === "video") {
        const tag = document.createElement("span");
        tag.className = "sequence-cell-tag";
        tag.textContent = "VIDEO";
        cell.appendChild(tag);
      } else if (item.asset.kind === "graphic") {
        const tag = document.createElement("span");
        tag.className = "sequence-cell-tag";
        tag.textContent = "FIELD";
        cell.appendChild(tag);
      }

      cell.addEventListener("click", () => opts.onSelect(item.id));
      cell.addEventListener("dragstart", (e) => {
        if (dragBoundary !== null) {
          e.preventDefault();
          return;
        }
        dragFrom = index;
        e.dataTransfer?.setData("text/plain", item.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      cell.addEventListener("dragover", (e) => {
        e.preventDefault();
        cell.classList.add("is-drop");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("is-drop"));
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        cell.classList.remove("is-drop");
        const file = e.dataTransfer?.files?.[0];
        if (file && opts.onDropMedia) {
          // External media: replace this state's picture only.
          opts.onDropMedia(item.id, file);
          dragFrom = null;
          return;
        }
        if (dragFrom !== null && dragFrom !== index) opts.onReorder(dragFrom, index);
        dragFrom = null;
      });
      cell.addEventListener("dragend", () => {
        dragFrom = null;
      });

      rail.appendChild(cell);
    });

    for (let index = 1; index < items.length; index++) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "sequence-rhythm-handle";
      handle.dataset.after = String(index - 1);
      handle.setAttribute("aria-label", `Duration between ${String(index).padStart(2, "0")} and ${String(index + 1).padStart(2, "0")}`);
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        dragBoundary = index - 1;
        const startX = e.clientX;
        const start = opts.getWeights().slice();
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          const totalW = start.reduce((sum, w) => sum + w, 0);
          const deltaWeight = (dx / Math.max(1, rail.getBoundingClientRect().width)) * totalW;
          opts.onWeights(transferSequenceWeight(start, index - 1, deltaWeight, opts.getLoopSeconds()));
          layout();
        };
        const up = () => {
          handle.releasePointerCapture(e.pointerId);
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          dragBoundary = null;
          refresh();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });
      rail.appendChild(handle);
    }

    const tools = document.createElement("div");
    tools.className = "sequence-rhythm-tools";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "sequence-add";
    add.title = "Add source";
    add.innerHTML = "<span>+</span>";
    add.addEventListener("click", () => opts.onAdd());
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "reset-link";
    reset.textContent = "Reset timing";
    reset.addEventListener("click", () => opts.onResetTiming());
    tools.appendChild(add);
    tools.appendChild(reset);
    container.appendChild(tools);
    layout();
  }

  function layout(): void {
    const spans = sequenceSpans(opts.getWeights());
    container.querySelectorAll<HTMLElement>(".sequence-cell").forEach((cell) => {
      const index = Number(cell.dataset.index);
      const share = spans[index]?.share ?? 0;
      cell.style.flex = `${Math.max(0.001, share)} 1 0`;
    });
    container.querySelectorAll<HTMLElement>(".sequence-rhythm-handle").forEach((handle) => {
      const left = Number(handle.dataset.after);
      handle.style.left = `${(spans[left]?.end ?? 0) * 100}%`;
    });
    syncTimes();
  }

  function syncTimes(): void {
    container.querySelectorAll<HTMLElement>(".sequence-cell").forEach((cell) => {
      const index = Number(cell.dataset.index);
      const time = cell.querySelector<HTMLElement>(".sequence-cell-time");
      if (!time || !Number.isFinite(index)) return;
      time.textContent = secondsFor(index);
      time.hidden = !SEQUENCE_RHYTHM_TIMES_ALWAYS_VISIBLE;
    });
  }

  refresh();
  return {
    refresh,
    layout,
    syncMarks() {
      const selected = opts.getSelectedId();
      const active = opts.getActiveIndex();
      container.querySelectorAll<HTMLElement>(".sequence-cell").forEach((cell) => {
        const id = cell.dataset.id;
        const index = Number(cell.dataset.index);
        cell.classList.toggle("is-selected", id === selected);
        cell.classList.toggle("is-active", index === active);
      });
      syncTimes();
    },
  };
}
