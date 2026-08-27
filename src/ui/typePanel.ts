import {
  applyStyleChange,
  authoredLineCount,
  clampTypeState,
  defaultTypeState,
  TYPE_ANCHORS,
  TYPE_WEIGHT_MAX,
  TYPE_WEIGHT_MIN,
  type TypeAnchor,
  type TypeBlock,
  type TypeColumn,
  type TypeDistribution,
  type TypeState,
  type TypeStyle,
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
): { row: HTMLDivElement; input: HTMLInputElement; valueEl: HTMLSpanElement } {
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
  return { row, input, valueEl };
}

function nearestAnchor(nx: number, ny: number): TypeAnchor {
  const col = nx < -17 ? "l" : nx > 17 ? "r" : "c";
  const row = ny < -17 ? "t" : ny > 17 ? "b" : "m";
  return `${row}${col}` as TypeAnchor;
}

function frameAlignPad(
  parent: HTMLElement,
  current: TypeAnchor,
  onChange: (anchor: TypeAnchor) => void,
): { set: (anchor: TypeAnchor) => void } {
  const row = document.createElement("div");
  row.className = "control-row type-xy-row";
  const lab = document.createElement("label");
  lab.textContent = "Frame Align";
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
  svg.setAttribute("aria-label", "Frame Align");

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

function markSeg(el: HTMLDivElement, value: string): void {
  for (const b of el.querySelectorAll("button")) {
    b.classList.toggle("active", b.getAttribute("data-value") === value);
  }
}

function buildBlock(
  parent: HTMLElement,
  index: 0 | 1,
  initial: TypeBlock,
  onChange: (patch: Partial<TypeState> & Partial<TypeBlock> & { blockEnabled?: boolean }) => void,
): {
  root: HTMLElement;
  sync: (block: TypeBlock) => void;
} {
  const root = document.createElement("div");
  root.className = "type-block";
  root.classList.toggle("is-off", !initial.enabled);

  const head = document.createElement("div");
  head.className = "type-block-head";
  const title = document.createElement("span");
  title.className = "type-block-title";
  title.textContent = index === 0 ? "Type 01" : "Type 02";
  head.appendChild(title);
  const onBtn = document.createElement("button");
  onBtn.type = "button";
  onBtn.className = "diagnostic-toggle type-block-on";
  function paintOn(on: boolean): void {
    onBtn.textContent = on ? "On" : "Off";
    onBtn.classList.toggle("active", on);
    root.classList.toggle("is-off", !on);
  }
  paintOn(initial.enabled);
  onBtn.addEventListener("click", () => {
    const next = !onBtn.classList.contains("active");
    paintOn(next);
    onChange({ activeIndex: index, blockEnabled: next });
  });
  head.appendChild(onBtn);
  root.appendChild(head);

  const body = document.createElement("div");
  body.className = "type-block-body";
  root.appendChild(body);

  const textRow = document.createElement("div");
  textRow.className = "control-row";
  const textLab = document.createElement("label");
  textLab.textContent = "Copy";
  textRow.appendChild(textLab);
  const textarea = document.createElement("textarea");
  textarea.className = "type-text";
  textarea.rows = 4;
  textarea.value = initial.text;
  textarea.addEventListener("input", () => {
    paintContext();
    onChange({ activeIndex: index, text: textarea.value });
  });
  textRow.appendChild(textarea);
  body.appendChild(textRow);

  let currentStyle = initial.composition;
  let currentAnchor = initial.anchor;
  let currentDist: TypeDistribution = initial.distribution;

  const styleSeg = seg(body, "Style", [
    { value: "headline", label: "Headline" },
    { value: "paragraph", label: "Paragraph" },
    { value: "footnote", label: "Footnote" },
  ], initial.composition, (v) => {
    const style = v as TypeStyle;
    const patch = applyStyleChange({ composition: currentStyle, anchor: currentAnchor }, style);
    currentStyle = style;
    currentDist = (patch.distribution ?? currentDist) as TypeDistribution;
    applyPatchToControls(patch);
    paintContext();
    onChange({ activeIndex: index, ...patch });
  });

  const alignSeg = seg(body, "Text Align", [
    { value: "left", label: "Left" },
    { value: "center", label: "Centre" },
    { value: "right", label: "Right" },
  ], initial.textAlign, (v) => onChange({ activeIndex: index, textAlign: v as TypeTextAlign }));

  const scale = slider(body, "Scale", 0, 100, 1, initial.scale, (v) => onChange({ activeIndex: index, scale: v }));
  const weight = slider(body, "Weight", TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, 10, initial.weight, (v) => onChange({ activeIndex: index, weight: v }));

  const headlineCtx = document.createElement("div");
  headlineCtx.className = "type-ctx";
  body.appendChild(headlineCtx);
  const trackingH = slider(headlineCtx, "Tracking", 0, 100, 1, initial.tracking, (v) => onChange({ activeIndex: index, tracking: v }));
  const gap = slider(headlineCtx, "Gap", 0, 100, 1, initial.gap, (v) => onChange({ activeIndex: index, gap: v }));
  const distSeg = seg(headlineCtx, "Distribution", [
    { value: "packed", label: "Packed" },
    { value: "between", label: "Between" },
  ], initial.distribution, (v) => {
    currentDist = v as TypeDistribution;
    paintContext();
    onChange({ activeIndex: index, distribution: currentDist });
  });

  const paraCtx = document.createElement("div");
  paraCtx.className = "type-ctx";
  body.appendChild(paraCtx);
  const widthSeg = seg(paraCtx, "Width", [
    { value: "narrow", label: "Narrow" },
    { value: "medium", label: "Medium" },
    { value: "wide", label: "Wide" },
  ], initial.column, (v) => onChange({ activeIndex: index, column: v as TypeColumn }));
  const leading = slider(paraCtx, "Leading", 0, 100, 1, initial.leading, (v) => onChange({ activeIndex: index, leading: v }));
  const trackingP = slider(paraCtx, "Tracking", 0, 100, 1, initial.tracking, (v) => onChange({ activeIndex: index, tracking: v }));

  const footCtx = document.createElement("div");
  footCtx.className = "type-ctx";
  body.appendChild(footCtx);
  const trackingF = slider(footCtx, "Tracking", 0, 100, 1, initial.tracking, (v) => onChange({ activeIndex: index, tracking: v }));

  const pos = frameAlignPad(body, initial.anchor, (anchor) => {
    currentAnchor = anchor;
    onChange({ activeIndex: index, anchor });
  });
  const padding = slider(body, "Padding", 0, 100, 1, initial.padding, (v) => onChange({ activeIndex: index, padding: v }));

  const colorRow = document.createElement("div");
  colorRow.className = "control-row bg-colour-row";
  const colorLab = document.createElement("label");
  colorLab.textContent = "Colour";
  colorRow.appendChild(colorLab);
  const color = document.createElement("input");
  color.type = "color";
  color.value = initial.color;
  color.title = "Type colour";
  color.addEventListener("input", () => onChange({ activeIndex: index, color: color.value }));
  colorRow.appendChild(color);
  body.appendChild(colorRow);

  function setTracking(v: number): void {
    trackingH.input.value = String(v);
    trackingH.valueEl.textContent = String(v);
    trackingP.input.value = String(v);
    trackingP.valueEl.textContent = String(v);
    trackingF.input.value = String(v);
    trackingF.valueEl.textContent = String(v);
  }

  function applyPatchToControls(patch: Partial<TypeBlock>): void {
    if (patch.scale !== undefined) {
      scale.input.value = String(patch.scale);
      scale.valueEl.textContent = String(patch.scale);
    }
    if (patch.weight !== undefined) {
      weight.input.value = String(patch.weight);
      weight.valueEl.textContent = String(patch.weight);
    }
    if (patch.tracking !== undefined) setTracking(patch.tracking);
    if (patch.gap !== undefined) {
      gap.input.value = String(patch.gap);
      gap.valueEl.textContent = String(patch.gap);
    }
    if (patch.leading !== undefined) {
      leading.input.value = String(patch.leading);
      leading.valueEl.textContent = String(patch.leading);
    }
    if (patch.padding !== undefined) {
      padding.input.value = String(patch.padding);
      padding.valueEl.textContent = String(patch.padding);
    }
    if (patch.distribution) markSeg(distSeg, patch.distribution);
    if (patch.column) markSeg(widthSeg, patch.column);
    if (patch.anchor) {
      currentAnchor = patch.anchor;
      pos.set(patch.anchor);
    }
  }

  function paintContext(): void {
    const style = currentStyle;
    const rows = authoredLineCount(textarea.value);
    headlineCtx.hidden = style !== "headline";
    paraCtx.hidden = style !== "paragraph";
    footCtx.hidden = style !== "footnote";
    const showDist = style === "headline" && rows >= 2;
    distSeg.parentElement!.hidden = !showDist;
    gap.row.hidden = !showDist || currentDist === "between";
  }

  paintContext();
  parent.appendChild(root);

  return {
    root,
    sync(block: TypeBlock) {
      paintOn(block.enabled);
      textarea.value = block.text;
      currentStyle = block.composition;
      currentDist = block.distribution;
      markSeg(styleSeg, block.composition);
      markSeg(alignSeg, block.textAlign);
      markSeg(distSeg, block.distribution);
      markSeg(widthSeg, block.column);
      scale.input.value = String(block.scale);
      scale.valueEl.textContent = String(block.scale);
      weight.input.value = String(block.weight);
      weight.valueEl.textContent = String(block.weight);
      setTracking(block.tracking);
      gap.input.value = String(block.gap);
      gap.valueEl.textContent = String(block.gap);
      leading.input.value = String(block.leading);
      leading.valueEl.textContent = String(block.leading);
      padding.input.value = String(block.padding);
      padding.valueEl.textContent = String(block.padding);
      currentAnchor = block.anchor;
      pos.set(block.anchor);
      color.value = block.color;
      paintContext();
    },
  };
}

export function buildTypePanel(
  container: HTMLElement,
  initial: TypeState,
  onChange: (patch: Partial<TypeState> & Partial<TypeBlock> & { blockEnabled?: boolean }) => void,
): { sync: (state: TypeState) => void } {
  container.innerHTML = "";
  container.className = "type-panel";

  let state = clampTypeState(initial);

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

  const block0 = buildBlock(body, 0, state.blocks[0], onChange);
  const block1 = buildBlock(body, 1, state.blocks[1], onChange);

  return {
    sync(next: TypeState) {
      state = clampTypeState(next);
      toggle.classList.toggle("active", state.enabled);
      toggle.textContent = state.enabled ? "On" : "Off";
      container.classList.toggle("type-disabled", !state.enabled);
      block0.sync(state.blocks[0]);
      block1.sync(state.blocks[1]);
    },
  };
}

export { defaultTypeState };
