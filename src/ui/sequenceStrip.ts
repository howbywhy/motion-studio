import { asGraphic } from "../sources/graphicAsset";
import { paintFieldToCanvas } from "../sources/field";
import type { SequenceItem } from "../core/sequence";
import type { MediaAsset } from "../core/media";

const THUMB_W = 36;
const THUMB_H = 45;

export interface SequenceStripHandle {
  refresh: () => void;
  syncMarks: () => void;
}

export function buildSequenceStrip(
  container: HTMLElement,
  opts: {
    getItems: () => SequenceItem[];
    getSelectedId: () => string | null;
    getActiveIds: () => { aId: string | null; bId: string | null };
    onSelect: (id: string) => void;
    onAdd: () => void;
    onReorder: (from: number, to: number) => void;
    onDropMedia: (id: string, file: File) => void;
  },
): SequenceStripHandle {
  container.className = "sequence-strip";

  let dragFrom: number | null = null;

  function paintThumb(canvas: HTMLCanvasElement, asset: MediaAsset): void {
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    const graphic = asGraphic(asset);
    if (graphic) {
      paintFieldToCanvas(canvas, { ...graphic.getField(), motion: "static" }, 0);
      return;
    }
    const src = asset.source;
    const sw = asset.naturalW || 1;
    const sh = asset.naturalH || 1;
    const scale = Math.max(THUMB_W / sw, THUMB_H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(src, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
  }

  function refresh(): void {
    const items = opts.getItems();
    const selected = opts.getSelectedId();
    const active = opts.getActiveIds();
    container.innerHTML = "";

    items.forEach((item, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sequence-cell";
      cell.dataset.id = item.id;
      cell.draggable = true;
      if (item.id === selected) cell.classList.add("is-selected");
      if (item.id === active.aId || item.id === active.bId) cell.classList.add("is-active");
      cell.title = item.asset.label;

      const indexEl = document.createElement("span");
      indexEl.className = "sequence-cell-index";
      indexEl.textContent = String(index + 1).padStart(2, "0");
      cell.appendChild(indexEl);

      const thumb = document.createElement("canvas");
      thumb.className = "sequence-cell-thumb";
      paintThumb(thumb, item.asset);
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
        dragFrom = index;
        e.dataTransfer?.setData("text/plain", item.id);
        e.dataTransfer?.setDragImage(thumb, 8, 8);
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
        if (file) {
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

      container.appendChild(cell);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "sequence-add";
    add.title = "Add source";
    add.innerHTML = "<span>+</span>";
    add.addEventListener("click", () => opts.onAdd());
    container.appendChild(add);
  }

  refresh();
  return {
    refresh,
    syncMarks() {
      const selected = opts.getSelectedId();
      const active = opts.getActiveIds();
      container.querySelectorAll<HTMLElement>(".sequence-cell").forEach((cell) => {
        const id = cell.dataset.id;
        cell.classList.toggle("is-selected", id === selected);
        cell.classList.toggle("is-active", id === active.aId || id === active.bId);
        const item = opts.getItems().find((s) => s.id === id);
        if (item?.asset.kind === "video") {
          const thumb = cell.querySelector("canvas");
          if (thumb) paintThumb(thumb, item.asset);
        }
      });
    },
  };
}
