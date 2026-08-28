import { TYPE_ANCHORS, type TypeAnchor } from "../core/typeState";
import {
  clampMarkState,
  markWindowForMode,
  type MarkMode,
  type MarkSource,
  type MarkState,
} from "../core/markState";

function seg(
  parent: HTMLElement,
  label: string,
  options: { value: string; label: string }[],
  current: string,
  onPick: (value: string) => void,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "control-row";
  if (label) {
    const lab = document.createElement("label");
    lab.textContent = label;
    row.appendChild(lab);
  }
  const toggle = document.createElement("div");
  toggle.className = "seg-toggle";
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = opt.label;
    btn.setAttribute("data-value", opt.value);
    if (opt.value === current) btn.classList.add("active");
    btn.addEventListener("click", () => {
      for (const b of toggle.querySelectorAll("button")) b.classList.remove("active");
      btn.classList.add("active");
      onPick(opt.value);
    });
    toggle.appendChild(btn);
  }
  row.appendChild(toggle);
  parent.appendChild(row);
  return toggle;
}

function slider(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  format: (v: number) => string,
  onInput: (v: number) => void,
): { row: HTMLDivElement; input: HTMLInputElement; valueEl: HTMLSpanElement } {
  const row = document.createElement("div");
  row.className = "control-row";
  const lab = document.createElement("label");
  lab.textContent = label;
  row.appendChild(lab);
  const valueEl = document.createElement("span");
  valueEl.className = "control-value";
  valueEl.textContent = format(value);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valueEl.textContent = format(v);
    onInput(v);
  });
  const inputRow = document.createElement("div");
  inputRow.className = "control-input-row";
  inputRow.appendChild(input);
  inputRow.appendChild(valueEl);
  row.appendChild(inputRow);
  parent.appendChild(row);
  return { row, input, valueEl };
}

function nearestAnchor(nx: number, ny: number): TypeAnchor {
  const col = nx < -17 ? "l" : nx > 17 ? "r" : "c";
  const row = ny < -17 ? "t" : ny > 17 ? "b" : "m";
  return `${row}${col}` as TypeAnchor;
}

function frameAlign(parent: HTMLElement, current: TypeAnchor, onChange: (a: TypeAnchor) => void): { set: (a: TypeAnchor) => void } {
  const row = document.createElement("div");
  row.className = "control-row type-xy-row";
  const lab = document.createElement("label");
  lab.textContent = "Frame Align";
  row.appendChild(lab);

  const SIZE = 84;
  const PAD = 12;
  const CELL = (SIZE - PAD * 2) / 2;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svg.classList.add("type-xy-svg");
  svg.setAttribute("aria-label", "Frame Align");

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", "1");
  bg.setAttribute("y", "1");
  bg.setAttribute("width", String(SIZE - 2));
  bg.setAttribute("height", String(SIZE - 2));
  bg.setAttribute("rx", "5");
  bg.setAttribute("class", "type-xy-frame");
  svg.appendChild(bg);

  const cells = new Map<TypeAnchor, SVGRectElement>();
  const dots = new Map<TypeAnchor, SVGCircleElement>();
  for (const anchor of TYPE_ANCHORS) {
    const col = anchor[1] === "l" ? 0 : anchor[1] === "r" ? 2 : 1;
    const rowI = anchor[0] === "t" ? 0 : anchor[0] === "b" ? 2 : 1;
    const cx = PAD + (col * (SIZE - PAD * 2)) / 2;
    const cy = PAD + (rowI * (SIZE - PAD * 2)) / 2;
    const cell = document.createElementNS(svgNS, "rect");
    const half = CELL * 0.42;
    cell.setAttribute("x", String(cx - half));
    cell.setAttribute("y", String(cy - half));
    cell.setAttribute("width", String(half * 2));
    cell.setAttribute("height", String(half * 2));
    cell.setAttribute("rx", "3");
    cell.setAttribute("class", "type-anchor-cell");
    svg.appendChild(cell);
    cells.set(anchor, cell);
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", "3.5");
    dot.setAttribute("class", "type-anchor-dot");
    svg.appendChild(dot);
    dots.set(anchor, dot);
  }

  function paint(anchor: TypeAnchor): void {
    for (const [id, cell] of cells) cell.classList.toggle("active", id === anchor);
    for (const [id, dot] of dots) dot.classList.toggle("active", id === anchor);
  }
  paint(current);

  function fromPointer(clientX: number, clientY: number, commit: boolean): void {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * SIZE - SIZE / 2;
    const py = ((clientY - rect.top) / rect.height) * SIZE - SIZE / 2;
    const nx = (px / (SIZE / 2 - PAD)) * 50;
    const ny = (py / (SIZE / 2 - PAD)) * 50;
    const next = nearestAnchor(nx, ny);
    if (commit) {
      paint(next);
      onChange(next);
    }
  }

  let dragging = false;
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    fromPointer(e.clientX, e.clientY, true);
  });
  svg.addEventListener("pointermove", (e) => {
    if (dragging) fromPointer(e.clientX, e.clientY, true);
  });
  svg.addEventListener("pointerup", () => {
    dragging = false;
  });
  svg.addEventListener("pointercancel", () => {
    dragging = false;
  });

  row.appendChild(svg);
  parent.appendChild(row);
  return { set: paint };
}

export function mountMarkPanel(
  host: HTMLElement,
  get: () => MarkState,
  set: (next: MarkState) => void,
): { sync: () => void } {
  host.classList.add("mark-panel");

  const apply = (patch: Partial<MarkState>): void => {
    set(clampMarkState({ ...get(), ...patch }));
    rebuild();
  };

  const rebuild = (): void => {
    const state = clampMarkState(get());
    host.innerHTML = "";
    const labelRow = document.createElement("div");
    labelRow.className = "panel-label-row";
    const label = document.createElement("label");
    label.className = "panel-label";
    label.textContent = "Mark";
    labelRow.appendChild(label);
    host.appendChild(labelRow);

    seg(host, "Mark", [
      { value: "off", label: "Off" },
      { value: "on", label: "On" },
    ], state.enabled ? "on" : "off", (v) => {
      apply({ enabled: v === "on" });
    });

    const fields = document.createElement("div");
    fields.className = "mark-fields";
    host.appendChild(fields);
    if (!state.enabled) {
      fields.hidden = true;
      return;
    }

    seg(fields, "Mode", [
      { value: "intro", label: "Intro" },
      { value: "interrupt", label: "Interrupt" },
      { value: "end", label: "End" },
    ], state.mode, (v) => {
      const mode = v as MarkMode;
      const win = markWindowForMode(mode);
      apply({ mode, sequenceStart: win.start, sequenceStop: win.stop });
    });

    seg(fields, "Source", [
      { value: "stacked", label: "Stacked" },
      { value: "horizontal", label: "Horizontal" },
      { value: "emblem", label: "Emblem" },
    ], state.source, (v) => {
      apply({ source: v as MarkSource });
    });

    slider(fields, "Mark Start", 0, 100, 1, Math.round(state.sequenceStart * 100), (n) => String(Math.round(n)), (v) => {
      set(clampMarkState({ ...get(), sequenceStart: v / 100 }));
    });
    slider(fields, "Mark Stop", 0, 100, 1, Math.round(state.sequenceStop * 100), (n) => String(Math.round(n)), (v) => {
      set(clampMarkState({ ...get(), sequenceStop: v / 100 }));
    });
    slider(fields, "Scale", 0, 100, 1, state.scale, (n) => String(Math.round(n)), (v) => {
      set(clampMarkState({ ...get(), scale: v }));
    });
    frameAlign(fields, state.anchor, (anchor) => {
      set(clampMarkState({ ...get(), anchor }));
    });
  };

  rebuild();
  return { sync: rebuild };
}
