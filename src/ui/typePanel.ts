import {
  clampTypeState,
  defaultTypeState,
  TYPE_ANCHORS,
  TYPE_WEIGHT_MAX,
  TYPE_WEIGHT_MIN,
  type TypeAnchor,
  type TypeArrangement,
  type TypeBlock,
  type TypeComposition,
  type TypeSequenceMode,
  type TypeState,
  type TypeTextAlign,
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
  lab.textContent = "Type Position";
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
  svg.setAttribute("aria-label", "Type Position");

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
  onChange: (patch: Partial<TypeState> & Partial<TypeBlock> & { blockEnabled?: boolean }) => void,
): { sync: (state: TypeState) => void } {
  container.innerHTML = "";
  container.className = "type-panel";

  let state = clampTypeState(initial);
  let active = state.activeIndex;

  const head = document.createElement("div");
  head.className = "panel-label-row";
  const title = document.createElement("label");
  title.className = "panel-label";
  title.textContent = "Typography";
  head.appendChild(title);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "diagnostic-toggle";
  toggle.textContent = state.enabled ? "On" : "Off";
  toggle.classList.toggle("active", state.enabled);
  toggle.addEventListener("click", () => {
    const next = !toggle.classList.contains("active");
    toggle.classList.toggle("active", next);
    toggle.textContent = next ? "On" : "Off";
    container.classList.toggle("type-disabled", !next);
    onChange({ enabled: next });
  });
  head.appendChild(toggle);
  container.appendChild(head);
  container.classList.toggle("type-disabled", !state.enabled);

  const body = document.createElement("div");
  body.className = "type-panel-body";
  container.appendChild(body);

  const slotSeg = seg(body, "Block", [
    { value: "0", label: "Type 01" },
    { value: "1", label: "Type 02" },
  ], String(active), (v) => {
    active = v === "1" ? 1 : 0;
    state = { ...state, activeIndex: active };
    paintBlockFields(state);
    onChange({ activeIndex: active });
  });

  const blockOn = document.createElement("button");
  blockOn.type = "button";
  blockOn.className = "diagnostic-toggle type-block-on";
  function paintBlockOn(): void {
    const on = state.blocks[active].enabled;
    blockOn.textContent = on ? "On" : "Off";
    blockOn.classList.toggle("active", on);
  }
  blockOn.addEventListener("click", () => {
    const next = !state.blocks[active].enabled;
    state.blocks[active] = { ...state.blocks[active], enabled: next };
    paintBlockOn();
    arrangeWrap.hidden = !bothOn(state);
    onChange({ activeIndex: active, blockEnabled: next });
  });
  slotSeg.parentElement?.appendChild(blockOn);

  const textRow = document.createElement("div");
  textRow.className = "control-row";
  const textLab = document.createElement("label");
  textLab.textContent = "Copy";
  textRow.appendChild(textLab);
  const textarea = document.createElement("textarea");
  textarea.className = "type-text";
  textarea.rows = 4;
  textarea.placeholder = "";
  textarea.value = state.blocks[active].text;
  textarea.addEventListener("input", () => onChange({ activeIndex: active, text: textarea.value }));
  textRow.appendChild(textarea);
  body.appendChild(textRow);

  const compositionSeg = seg(body, "Role", [
    { value: "display", label: "Display" },
    { value: "editorial", label: "Editorial" },
    { value: "caption", label: "Caption" },
    { value: "folio", label: "Folio" },
  ], state.blocks[active].composition, (v) => onChange({ activeIndex: active, composition: v as TypeComposition }));

  const alignSeg = seg(body, "Align", [
    { value: "left", label: "Left" },
    { value: "center", label: "Centre" },
    { value: "right", label: "Right" },
    { value: "justify", label: "Justify" },
  ], state.blocks[active].textAlign, (v) => onChange({ activeIndex: active, textAlign: v as TypeTextAlign }));

  const scale = slider(body, "Scale", 0, 100, 1, state.blocks[active].scale, (v) => onChange({ activeIndex: active, scale: v }));
  const weight = slider(body, "Weight", TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, 10, state.blocks[active].weight, (v) => onChange({ activeIndex: active, weight: v }));
  const spacing = slider(body, "Spacing", 0, 100, 1, state.blocks[active].spacing, (v) => onChange({ activeIndex: active, spacing: v }));
  const pos = anchorPad(body, state.blocks[active].anchor, (anchor) => onChange({ activeIndex: active, anchor }));

  const colorRow = document.createElement("div");
  colorRow.className = "control-row bg-colour-row";
  const colorLab = document.createElement("label");
  colorLab.textContent = "Colour";
  colorRow.appendChild(colorLab);
  const color = document.createElement("input");
  color.type = "color";
  color.value = state.blocks[active].color;
  color.title = "Type colour";
  color.addEventListener("input", () => onChange({ activeIndex: active, color: color.value }));
  colorRow.appendChild(color);
  body.appendChild(colorRow);

  const arrangeWrap = document.createElement("div");
  arrangeWrap.className = "type-arrange";
  body.appendChild(arrangeWrap);
  const arrangeSeg = seg(arrangeWrap, "Arrangement", [
    { value: "independent", label: "Independent" },
    { value: "between-v", label: "Between V" },
    { value: "between-h", label: "Between H" },
  ], state.arrangement, (v) => onChange({ arrangement: v as TypeArrangement }));

  const sequenceSeg = seg(body, "Sequence", [
    { value: "together", label: "Together" },
    { value: "stagger", label: "Stagger" },
    { value: "hold", label: "Hold" },
    { value: "alternate", label: "Alternate" },
  ], state.typeSequenceMode, (v) => onChange({ typeSequenceMode: v as TypeSequenceMode }));

  const pace = slider(body, "Pace", 0, 100, 1, state.typeSequencePace, (v) => onChange({ typeSequencePace: v }));

  function markSeg(el: HTMLDivElement, value: string): void {
    for (const b of el.querySelectorAll("button")) {
      b.classList.toggle("active", b.getAttribute("data-value") === value);
    }
  }

  function bothOn(s: TypeState): boolean {
    return s.blocks[0].enabled && s.blocks[1].enabled;
  }

  function paintBlockFields(s: TypeState): void {
    const b = s.blocks[s.activeIndex];
    textarea.value = b.text;
    markSeg(compositionSeg, b.composition);
    markSeg(alignSeg, b.textAlign);
    scale.input.value = String(b.scale);
    scale.valueEl.textContent = String(b.scale);
    weight.input.value = String(b.weight);
    weight.valueEl.textContent = String(b.weight);
    spacing.input.value = String(b.spacing);
    spacing.valueEl.textContent = String(b.spacing);
    pos.set(b.anchor);
    color.value = b.color;
    paintBlockOn();
  }

  paintBlockOn();
  arrangeWrap.hidden = !bothOn(state);

  return {
    sync(next: TypeState) {
      state = clampTypeState(next);
      active = state.activeIndex;
      toggle.classList.toggle("active", state.enabled);
      toggle.textContent = state.enabled ? "On" : "Off";
      container.classList.toggle("type-disabled", !state.enabled);
      markSeg(slotSeg, String(state.activeIndex));
      paintBlockFields(state);
      arrangeWrap.hidden = !bothOn(state);
      markSeg(arrangeSeg, state.arrangement);
      markSeg(sequenceSeg, state.typeSequenceMode);
      pace.input.value = String(state.typeSequencePace);
      pace.valueEl.textContent = String(state.typeSequencePace);
    },
  };
}

export { defaultTypeState };
