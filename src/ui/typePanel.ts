import {
  clampTypeState,
  defaultTypeState,
  TYPE_ANCHORS,
  TYPE_WEIGHT_MAX,
  TYPE_WEIGHT_MIN,
  type TypeAnchor,
  type TypeComposition,
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
  onInput: (v: number) => void,
): { input: HTMLInputElement; valueEl: HTMLSpanElement } {
  const row = document.createElement("div");
  row.className = "control-row";
  const lab = document.createElement("label");
  lab.textContent = label;
  row.appendChild(lab);
  const valueEl = document.createElement("span");
  valueEl.className = "control-value";
  valueEl.textContent = String(value);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valueEl.textContent = String(Number(v.toFixed(step < 1 ? 2 : 0)));
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

function nearestAnchor(nx: number, ny: number): TypeAnchor {
  const col = nx < -17 ? "l" : nx > 17 ? "r" : "c";
  const row = ny < -17 ? "t" : ny > 17 ? "b" : "m";
  return `${row}${col}` as TypeAnchor;
}

function anchorPad(
  parent: HTMLElement,
  current: TypeAnchor,
  onChange: (anchor: TypeAnchor) => void,
): { set: (anchor: TypeAnchor) => void } {
  const row = document.createElement("div");
  row.className = "control-row type-xy-row";
  const lab = document.createElement("label");
  lab.textContent = "Position";
  row.appendChild(lab);

  const SIZE = 88;
  const PAD = 14;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svg.classList.add("type-xy-svg");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Position");

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", "1");
  bg.setAttribute("y", "1");
  bg.setAttribute("width", String(SIZE - 2));
  bg.setAttribute("height", String(SIZE - 2));
  bg.setAttribute("class", "type-xy-frame");
  svg.appendChild(bg);

  const dots = new Map<TypeAnchor, SVGCircleElement>();
  for (const anchor of TYPE_ANCHORS) {
    const col = anchor[1] === "l" ? 0 : anchor[1] === "r" ? 2 : 1;
    const rowI = anchor[0] === "t" ? 0 : anchor[0] === "b" ? 2 : 1;
    const cx = PAD + (col * (SIZE - PAD * 2)) / 2;
    const cy = PAD + (rowI * (SIZE - PAD * 2)) / 2;
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", "4");
    dot.setAttribute("data-anchor", anchor);
    dot.setAttribute("class", "type-anchor-dot");
    svg.appendChild(dot);
    dots.set(anchor, dot);
  }

  function mark(anchor: TypeAnchor): void {
    for (const [id, dot] of dots) {
      dot.classList.toggle("active", id === anchor);
    }
  }
  mark(current);

  function fromPointer(clientX: number, clientY: number): void {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * SIZE - SIZE / 2;
    const py = ((clientY - rect.top) / rect.height) * SIZE - SIZE / 2;
    const nx = (px / (SIZE / 2 - PAD)) * 50;
    const ny = (py / (SIZE / 2 - PAD)) * 50;
    const next = nearestAnchor(nx, ny);
    mark(next);
    onChange(next);
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
  return { set: mark };
}

export function buildTypePanel(
  container: HTMLElement,
  initial: TypeState,
  onChange: (patch: Partial<TypeState>) => void,
): { sync: (state: TypeState) => void } {
  container.innerHTML = "";
  container.className = "type-panel";

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

  const body = document.createElement("div");
  body.className = "type-panel-body";
  container.appendChild(body);

  const textRow = document.createElement("div");
  textRow.className = "control-row";
  const textLab = document.createElement("label");
  textLab.textContent = "Copy";
  textRow.appendChild(textLab);
  const textarea = document.createElement("textarea");
  textarea.className = "type-text";
  textarea.rows = 5;
  textarea.placeholder = "";
  textarea.value = initial.text;
  textarea.addEventListener("input", () => onChange({ text: textarea.value }));
  textRow.appendChild(textarea);
  body.appendChild(textRow);

  const compositionSeg = seg(body, "Role", [
    { value: "display", label: "Display" },
    { value: "editorial", label: "Editorial" },
    { value: "caption", label: "Caption" },
    { value: "folio", label: "Folio" },
  ], initial.composition, (v) => onChange({ composition: v as TypeComposition }));

  const scale = slider(body, "Scale", 0, 100, 1, initial.scale, (v) => onChange({ scale: v }));
  const weight = slider(body, "Weight", TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, 10, initial.weight, (v) => onChange({ weight: v }));
  const spacing = slider(body, "Spacing", 0, 100, 1, initial.spacing, (v) => onChange({ spacing: v }));
  const pos = anchorPad(body, initial.anchor, (anchor) => onChange({ anchor }));

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
  body.appendChild(colorRow);

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
      markSeg(compositionSeg, s.composition);
      scale.input.value = String(s.scale);
      scale.valueEl.textContent = String(s.scale);
      weight.input.value = String(s.weight);
      weight.valueEl.textContent = String(s.weight);
      spacing.input.value = String(s.spacing);
      spacing.valueEl.textContent = String(s.spacing);
      pos.set(s.anchor);
      color.value = s.color;
    },
  };
}

export { defaultTypeState };
