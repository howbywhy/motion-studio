import {
  clampTypeState,
  defaultTypeState,
  TYPE_WEIGHT_MAX,
  TYPE_WEIGHT_MIN,
  type TypeState,
} from "../core/typeState";

function seg(
  parent: HTMLElement,
  label: string,
  options: { value: string; label: string }[],
  current: string,
  onPick: (value: string) => void,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "control-row";
  const lab = document.createElement("label");
  lab.textContent = label;
  row.appendChild(lab);
  const toggle = document.createElement("div");
  toggle.className = "seg-toggle type-seg";
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
  unit: string,
  onInput: (v: number) => void,
): { input: HTMLInputElement; valueEl: HTMLSpanElement } {
  const row = document.createElement("div");
  row.className = "control-row";
  const lab = document.createElement("label");
  lab.textContent = label;
  row.appendChild(lab);
  const valueEl = document.createElement("span");
  valueEl.className = "control-value";
  const fmt = (v: number): string => `${Number(v.toFixed(step < 1 ? 2 : 0))}${unit}`;
  valueEl.textContent = fmt(value);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valueEl.textContent = fmt(v);
    onInput(v);
  });
  const inputRow = document.createElement("div");
  inputRow.className = "control-input-row";
  inputRow.appendChild(input);
  inputRow.appendChild(valueEl);
  row.appendChild(inputRow);
  parent.appendChild(row);
  return { input, valueEl };
}

function group(parent: HTMLElement, title: string, open: boolean): HTMLElement {
  const details = document.createElement("details");
  details.className = "type-group";
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  details.appendChild(summary);
  const body = document.createElement("div");
  body.className = "type-group-body";
  details.appendChild(body);
  parent.appendChild(details);
  return body;
}

function cartesianPad(
  parent: HTMLElement,
  x: number,
  y: number,
  onChange: (x: number, y: number) => void,
): { set: (x: number, y: number) => void } {
  const row = document.createElement("div");
  row.className = "control-row type-xy-row";
  const lab = document.createElement("label");
  lab.textContent = "Position";
  row.appendChild(lab);

  const SIZE = 88;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svg.classList.add("type-xy-svg");

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", "1");
  bg.setAttribute("y", "1");
  bg.setAttribute("width", String(SIZE - 2));
  bg.setAttribute("height", String(SIZE - 2));
  bg.setAttribute("class", "type-xy-frame");
  svg.appendChild(bg);

  const h = document.createElementNS(svgNS, "line");
  h.setAttribute("x1", "4");
  h.setAttribute("x2", String(SIZE - 4));
  h.setAttribute("y1", String(CY));
  h.setAttribute("y2", String(CY));
  h.setAttribute("class", "type-xy-cross");
  svg.appendChild(h);
  const v = document.createElementNS(svgNS, "line");
  v.setAttribute("x1", String(CX));
  v.setAttribute("x2", String(CX));
  v.setAttribute("y1", "4");
  v.setAttribute("y2", String(SIZE - 4));
  v.setAttribute("class", "type-xy-cross");
  svg.appendChild(v);

  const puck = document.createElementNS(svgNS, "circle");
  puck.setAttribute("r", "5");
  puck.setAttribute("class", "type-xy-puck");
  svg.appendChild(puck);

  function place(nx: number, ny: number): void {
    const px = CX + (nx / 50) * (CX - 8);
    const py = CY + (ny / 50) * (CY - 8);
    puck.setAttribute("cx", String(px));
    puck.setAttribute("cy", String(py));
  }
  place(x, y);

  function fromPointer(clientX: number, clientY: number): void {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * SIZE - CX;
    const py = ((clientY - rect.top) / rect.height) * SIZE - CY;
    const nx = Math.max(-50, Math.min(50, (px / (CX - 8)) * 50));
    const ny = Math.max(-50, Math.min(50, (py / (CY - 8)) * 50));
    place(nx, ny);
    onChange(Number(nx.toFixed(1)), Number(ny.toFixed(1)));
  }

  let dragging = false;
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    fromPointer(e.clientX, e.clientY);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    fromPointer(e.clientX, e.clientY);
  });
  const stop = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);

  row.appendChild(svg);
  parent.appendChild(row);
  return { set: place };
}

export function buildTypePanel(
  container: HTMLElement,
  initial: TypeState,
  onChange: (patch: Partial<TypeState>) => void,
): { sync: (state: TypeState) => void } {
  container.innerHTML = "";
  container.classList.add("type-panel");

  const head = document.createElement("div");
  head.className = "panel-label-row";
  const title = document.createElement("label");
  title.className = "panel-label";
  title.textContent = "Typography";
  head.appendChild(title);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "diagnostic-toggle";
  toggle.textContent = initial.enabled ? "On" : "Off";
  toggle.classList.toggle("active", initial.enabled);
  toggle.addEventListener("click", () => {
    const next = !toggle.classList.contains("active");
    toggle.classList.toggle("active", next);
    toggle.textContent = next ? "On" : "Off";
    container.classList.toggle("type-disabled", !next);
    onChange({ enabled: next });
  });
  head.appendChild(toggle);
  container.appendChild(head);
  container.classList.toggle("type-disabled", !initial.enabled);

  const content = group(container, "Content", true);
  const textRow = document.createElement("div");
  textRow.className = "control-row";
  const textLab = document.createElement("label");
  textLab.textContent = "Text";
  textRow.appendChild(textLab);
  const textarea = document.createElement("textarea");
  textarea.className = "type-text";
  textarea.rows = 4;
  textarea.placeholder = "";
  textarea.value = initial.text;
  textarea.addEventListener("input", () => onChange({ text: textarea.value }));
  textRow.appendChild(textarea);
  content.appendChild(textRow);

  const layout = group(container, "Layout", true);
  const modeSeg = seg(layout, "Mode", [
    { value: "responsive", label: "Responsive" },
    { value: "fixed", label: "Fixed" },
  ], initial.mode, (v) => onChange({ mode: v as TypeState["mode"] }));
  const alignSeg = seg(layout, "Align", [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
  ], initial.align, (v) => onChange({ align: v as TypeState["align"] }));
  const valignSeg = seg(layout, "Vertical", [
    { value: "top", label: "Top" },
    { value: "center", label: "Center" },
    { value: "bottom", label: "Bottom" },
  ], initial.valign, (v) => onChange({ valign: v as TypeState["valign"] }));
  const scale = slider(layout, "Scale", 0, 100, 1, initial.scale, "", (v) => onChange({ scale: v }));
  const spread = slider(layout, "Spread", 0, 100, 1, initial.spread, "", (v) => onChange({ spread: v }));
  const rhythm = slider(layout, "Rhythm", 0, 100, 1, initial.rhythm, "", (v) => onChange({ rhythm: v }));
  const xy = cartesianPad(layout, initial.x, initial.y, (x, y) => onChange({ x, y }));

  const type = group(container, "Type", true);
  const weight = slider(type, "Weight", TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, 10, initial.weight, "", (v) => onChange({ weight: v }));
  const colorRow = document.createElement("div");
  colorRow.className = "control-row bg-colour-row";
  const colorLab = document.createElement("label");
  colorLab.textContent = "Colour";
  colorRow.appendChild(colorLab);
  const color = document.createElement("input");
  color.type = "color";
  color.value = initial.color;
  color.title = "Type colour";
  color.addEventListener("input", () => onChange({ color: color.value }));
  colorRow.appendChild(color);
  type.appendChild(colorRow);

  function markSeg(el: HTMLDivElement, value: string): void {
    for (const b of el.querySelectorAll("button")) {
      b.classList.toggle("active", b.getAttribute("data-value") === value);
    }
  }

  return {
    sync(state: TypeState) {
      const s = clampTypeState(state);
      toggle.classList.toggle("active", s.enabled);
      toggle.textContent = s.enabled ? "On" : "Off";
      container.classList.toggle("type-disabled", !s.enabled);
      textarea.value = s.text;
      markSeg(modeSeg, s.mode);
      markSeg(alignSeg, s.align);
      markSeg(valignSeg, s.valign);
      scale.input.value = String(s.scale);
      scale.valueEl.textContent = String(s.scale);
      spread.input.value = String(s.spread);
      spread.valueEl.textContent = String(s.spread);
      rhythm.input.value = String(s.rhythm);
      rhythm.valueEl.textContent = String(s.rhythm);
      xy.set(s.x, s.y);
      weight.input.value = String(s.weight);
      weight.valueEl.textContent = String(s.weight);
      color.value = s.color;
    },
  };
}

export { defaultTypeState };
