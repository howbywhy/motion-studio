import {
  applyStyleChange,
  authoredLineCount,
  clampTypeState,
  defaultTypeState,
  TYPE_ANCHORS,
  TYPE_BLEND_MODES,
  TYPE_WEIGHT_MAX,
  TYPE_WEIGHT_MIN,
  type TypeBlendMode,
  type TypeBlock,
  type TypeColumn,
  type TypeDistribution,
  type TypeState,
  type TypeStyle,
  type TypeSystemMode,
  type TypeTextAlign,
  type TypeSlot,
  type SequenceTypeAnchor,
  type SequenceTypeSizeMode,
} from "../core/typeState";
import { TYPE_SLOT_LABELS } from "../core/typeSubtitle";
import { sequenceCopyPatch, sequenceModePatch } from "../core/typeAuthoring";
import {
  clampHoldLength,
  FRAME_HOLD_LENGTH_DEFAULT,
  FRAME_HOLD_LENGTH_MAX,
  FRAME_HOLD_LENGTH_MIN,
  FRAME_HOLD_LENGTH_STEP,
  SEQUENCE_WINDOW_MIN,
  TYPE_PAGE_MAX,
  typePageCuts,
} from "../core/typePages";
import { buildPositionPad } from "./positionPad";

const BLEND_LABEL: Record<TypeBlendMode, string> = {
  normal: "Normal",
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  difference: "Difference",
  exclusion: "Exclusion",
};

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
    valueEl.textContent = `${Number(v.toFixed(step < 1 ? 2 : 0))}${label === "Hold Length" ? "×" : ""}`;
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

function pct(v: number): string {
  return String(Math.round(v * 100));
}

function buildSequenceWindow(
  parent: HTMLElement,
  start: number,
  stop: number,
  onChange: (start: number, stop: number) => void,
): { row: HTMLDivElement; set: (start: number, stop: number) => void } {
  const row = document.createElement("div");
  row.className = "control-row type-sequence-window";
  const lab = document.createElement("label");
  lab.textContent = "Window";
  row.appendChild(lab);

  const legend = document.createElement("div");
  legend.className = "type-seq-legend";
  const startLab = document.createElement("span");
  const stopLab = document.createElement("span");
  legend.appendChild(startLab);
  legend.appendChild(stopLab);
  row.appendChild(legend);

  const rail = document.createElement("div");
  rail.className = "type-seq-rail";
  rail.setAttribute("role", "group");
  rail.setAttribute("aria-label", "Window");
  const track = document.createElement("div");
  track.className = "type-seq-track";
  const span = document.createElement("div");
  span.className = "type-seq-span";
  const startHandle = document.createElement("button");
  startHandle.type = "button";
  startHandle.className = "type-seq-handle";
  startHandle.setAttribute("aria-label", "Start");
  const stopHandle = document.createElement("button");
  stopHandle.type = "button";
  stopHandle.className = "type-seq-handle";
  stopHandle.setAttribute("aria-label", "Stop");
  rail.appendChild(track);
  rail.appendChild(span);
  rail.appendChild(startHandle);
  rail.appendChild(stopHandle);
  row.appendChild(rail);
  parent.appendChild(row);

  let curStart = start;
  let curStop = stop;

  function paint(): void {
    startLab.textContent = `Start ${pct(curStart)}`;
    stopLab.textContent = `Stop ${pct(curStop)}`;
    span.style.left = `${curStart * 100}%`;
    span.style.width = `${(curStop - curStart) * 100}%`;
    startHandle.style.left = `${curStart * 100}%`;
    stopHandle.style.left = `${curStop * 100}%`;
  }
  paint();

  function fracFromX(clientX: number): number {
    const r = rail.getBoundingClientRect();
    const w = Math.max(1, r.width);
    return Math.min(1, Math.max(0, (clientX - r.left) / w));
  }

  function apply(nextStart: number, nextStop: number, emit: boolean): void {
    const min = SEQUENCE_WINDOW_MIN;
    curStart = Math.min(1 - min, Math.max(0, nextStart));
    curStop = Math.min(1, Math.max(curStart + min, nextStop));
    if (curStop > 1) {
      curStop = 1;
      curStart = Math.min(curStart, 1 - min);
    }
    paint();
    if (emit) onChange(curStart, curStop);
  }

  function attachDrag(handle: HTMLButtonElement, which: "start" | "stop"): void {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const f = fracFromX(ev.clientX);
        if (which === "start") apply(Math.min(f, curStop - SEQUENCE_WINDOW_MIN), curStop, true);
        else apply(curStart, Math.max(f, curStart + SEQUENCE_WINDOW_MIN), true);
      };
      const up = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
      move(e);
    });
  }
  attachDrag(startHandle, "start");
  attachDrag(stopHandle, "stop");

  rail.addEventListener("pointerdown", (e) => {
    if (e.target !== rail && e.target !== track && e.target !== span) return;
    const f = fracFromX(e.clientX);
    const toStart = Math.abs(f - curStart);
    const toStop = Math.abs(f - curStop);
    if (toStart <= toStop) apply(Math.min(f, curStop - SEQUENCE_WINDOW_MIN), curStop, true);
    else apply(curStart, Math.max(f, curStart + SEQUENCE_WINDOW_MIN), true);
  });

  return {
    row,
    set(nextStart: number, nextStop: number) {
      apply(nextStart, nextStop, false);
    },
  };
}

function markSeg(el: HTMLDivElement, value: string): void {
  for (const b of el.querySelectorAll("button")) {
    b.classList.toggle("active", b.getAttribute("data-value") === value);
  }
}

function fitTextarea(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  const cap = el.placeholder.includes("cue") ? 140 : 96;
  el.style.height = `${Math.min(cap, Math.max(48, el.scrollHeight))}px`;
}

function styleLabel(style: TypeStyle): string {
  if (style === "paragraph") return "Paragraph";
  if (style === "subtitle") return "Subtitle";
  return "Headline";
}

function textPlaceholder(style: TypeStyle): string {
  if (style === "subtitle") return "One line = one cue";
  if (style === "paragraph") return "Type paragraph copy…";
  return "Type headline copy…";
}

function blockSummary(block: TypeBlock): string {
  const parts = [styleLabel(block.composition)];
  if (block.composition === "headline" && authoredLineCount(block.text) >= 2 && block.distribution === "between") {
    parts.push("Between");
  }
  if (block.composition === "paragraph" || block.composition === "subtitle") {
    parts.push(block.column === "narrow" ? "Narrow" : block.column === "wide" ? "Wide" : "Medium");
  }
  parts.push(block.anchor.toUpperCase());
  return parts.join(" · ");
}

function buildBlock(
  parent: HTMLElement,
  index: TypeSlot,
  initial: TypeBlock,
  expanded: boolean,
  onChange: (patch: Partial<TypeState> & Partial<TypeBlock> & { blockEnabled?: boolean }) => void,
  onExpand: (next: TypeSlot | null) => void,
  onEnabled: (on: boolean) => void,
): {
  root: HTMLElement;
  setExpanded: (open: boolean) => void;
  setCopyVisible: (visible: boolean) => void;
  sync: (block: TypeBlock) => void;
} {
  const root = document.createElement("div");
  root.className = "type-block";
  root.classList.toggle("is-off", !initial.enabled);
  root.classList.toggle("is-collapsed", !expanded);

  const head = document.createElement("div");
  head.className = "type-block-head";
  head.setAttribute("role", "button");
  head.tabIndex = 0;
  head.setAttribute("aria-expanded", expanded && initial.enabled ? "true" : "false");

  const titles = document.createElement("div");
  titles.className = "type-block-titles";
  const title = document.createElement("span");
  title.className = "type-block-title";
  title.textContent = TYPE_SLOT_LABELS[index];
  titles.appendChild(title);
  const summary = document.createElement("span");
  summary.className = "type-block-summary";
  summary.textContent = blockSummary(initial);
  titles.appendChild(summary);
  head.appendChild(titles);

  const onBtn = document.createElement("button");
  onBtn.type = "button";
  onBtn.className = "diagnostic-toggle type-block-on";
  function paintOn(on: boolean): void {
    onBtn.textContent = on ? "On" : "Off";
    onBtn.classList.toggle("active", on);
    root.classList.toggle("is-off", !on);
  }
  paintOn(initial.enabled);
  onBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = !onBtn.classList.contains("active");
    paintOn(next);
    onEnabled(next);
    onChange({ activeIndex: index, blockEnabled: next });
  });
  head.appendChild(onBtn);

  const chevron = document.createElement("span");
  chevron.className = "type-block-chevron";
  chevron.setAttribute("aria-hidden", "true");
  head.appendChild(chevron);

  function toggleExpand(): void {
    if (root.classList.contains("is-off")) return;
    const open = !root.classList.contains("is-collapsed");
    onExpand(open ? null : index);
  }
  head.addEventListener("click", toggleExpand);
  head.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggleExpand();
  });
  root.appendChild(head);

  const body = document.createElement("div");
  body.className = "type-block-body";
  root.appendChild(body);

  const textRow = document.createElement("div");
  textRow.className = "control-row";
  const textLab = document.createElement("label");
  textLab.textContent = initial.composition === "subtitle" ? "Cues" : "Copy";
  textRow.appendChild(textLab);
  const textarea = document.createElement("textarea");
  textarea.className = "type-text";
  textarea.rows = initial.composition === "subtitle" ? 4 : 2;
  textarea.placeholder = textPlaceholder(initial.composition);
  textarea.value = initial.text;
  textarea.addEventListener("input", () => {
    fitTextarea(textarea);
    paintContext();
    refreshSummary();
    onChange({ activeIndex: index, text: textarea.value });
  });
  textarea.addEventListener("keydown", (e) => e.stopPropagation());
  textRow.appendChild(textarea);
  body.appendChild(textRow);

  let currentStyle = initial.composition;
  let currentAnchor = initial.anchor;
  let currentOffsetX = initial.offsetX;
  let currentOffsetY = initial.offsetY;
  let currentDist: TypeDistribution = initial.distribution;

  const styleSeg = seg(body, "Style", [
    { value: "headline", label: "Headline" },
    { value: "paragraph", label: "Paragraph" },
    { value: "subtitle", label: "Subtitle" },
  ], initial.composition, (v) => {
    const style = v as TypeStyle;
    const patch = applyStyleChange({ composition: currentStyle, anchor: currentAnchor }, style);
    currentStyle = style;
    currentDist = (patch.distribution ?? currentDist) as TypeDistribution;
    applyPatchToControls(patch);
    paintContext();
    refreshSummary();
    onChange({ activeIndex: index, ...patch });
  });

  const scale = slider(body, "Type Size", 0, 100, 1, initial.scale, (v) => onChange({ activeIndex: index, scale: v }));
  const weight = slider(body, "Weight", TYPE_WEIGHT_MIN, TYPE_WEIGHT_MAX, 10, initial.weight, (v) => onChange({ activeIndex: index, weight: v }));

  const trackingH = slider(body, "Tracking", 0, 100, 1, initial.tracking, (v) => onChange({ activeIndex: index, tracking: v }));
  const leading = slider(body, "Leading", 0, 100, 1, initial.leading, (v) => onChange({ activeIndex: index, leading: v }));
  const trackingP = slider(body, "Tracking", 0, 100, 1, initial.tracking, (v) => onChange({ activeIndex: index, tracking: v }));
  const trackingF = slider(body, "Tracking", 0, 100, 1, initial.tracking, (v) => onChange({ activeIndex: index, tracking: v }));

  const distSeg = seg(body, "Distribution", [
    { value: "packed", label: "Packed" },
    { value: "between", label: "Between" },
  ], initial.distribution, (v) => {
    currentDist = v as TypeDistribution;
    paintContext();
    refreshSummary();
    onChange({ activeIndex: index, distribution: currentDist });
  });
  const gap = slider(body, "Gap", 0, 100, 1, initial.gap, (v) => onChange({ activeIndex: index, gap: v }));

  const alignSeg = seg(body, "Text Align", [
    { value: "left", label: "Left" },
    { value: "center", label: "Centre" },
    { value: "right", label: "Right" },
  ], initial.textAlign, (v) => onChange({ activeIndex: index, textAlign: v as TypeTextAlign }));

  const pos = buildPositionPad(body, initial.anchor, initial.offsetX, initial.offsetY, (anchor, offsetX, offsetY) => {
    currentAnchor = anchor;
    currentOffsetX = offsetX;
    currentOffsetY = offsetY;
    refreshSummary();
    onChange({ activeIndex: index, anchor, offsetX, offsetY });
  });

  const widthSeg = seg(body, "Width", [
    { value: "narrow", label: "Narrow" },
    { value: "medium", label: "Medium" },
    { value: "wide", label: "Wide" },
  ], initial.column, (v) => {
    refreshSummary();
    onChange({ activeIndex: index, column: v as TypeColumn });
  });

  const padding = slider(body, "Padding", 0, 100, 1, initial.padding, (v) => onChange({ activeIndex: index, padding: v }));

  const appear = document.createElement("div");
  appear.className = "type-appear";
  body.appendChild(appear);

  const colorRow = document.createElement("div");
  colorRow.className = "control-row type-appear-row";
  const colorLab = document.createElement("label");
  colorLab.textContent = "Colour";
  colorRow.appendChild(colorLab);
  const color = document.createElement("input");
  color.type = "color";
  color.value = initial.color;
  color.title = "Type colour";
  color.addEventListener("input", () => onChange({ activeIndex: index, color: color.value }));
  colorRow.appendChild(color);
  appear.appendChild(colorRow);

  const blendRow = document.createElement("div");
  blendRow.className = "control-row type-appear-row";
  const blendLab = document.createElement("label");
  blendLab.textContent = "Blend";
  blendLab.htmlFor = `type-blend-${index}`;
  blendRow.appendChild(blendLab);
  const blend = document.createElement("select");
  blend.id = `type-blend-${index}`;
  blend.className = "type-blend";
  for (const mode of TYPE_BLEND_MODES) {
    const opt = document.createElement("option");
    opt.value = mode;
    opt.textContent = BLEND_LABEL[mode];
    blend.appendChild(opt);
  }
  blend.value = initial.blendMode;
  blend.addEventListener("change", () => onChange({ activeIndex: index, blendMode: blend.value as TypeBlendMode }));
  blend.addEventListener("keydown", (e) => {
    if (e.key === "Escape") blend.blur();
  });
  blendRow.appendChild(blend);
  appear.appendChild(blendRow);

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
      pos.set(patch.anchor, currentOffsetX, currentOffsetY);
    }
    if (patch.blendMode) blend.value = patch.blendMode;
    if (patch.color) color.value = patch.color;
  }

  function paintContext(): void {
    const style = currentStyle;
    const rows = authoredLineCount(textarea.value);
    const showDist = style === "headline" && rows >= 2;
    trackingH.row.hidden = style !== "headline";
    leading.row.hidden = style !== "paragraph" && style !== "subtitle";
    trackingP.row.hidden = style !== "paragraph";
    trackingF.row.hidden = style !== "subtitle";
    distSeg.parentElement!.hidden = !showDist;
    gap.row.hidden = !showDist || currentDist === "between";
    widthSeg.parentElement!.hidden = style !== "paragraph" && style !== "subtitle";
    padding.row.hidden = style === "subtitle";
    textLab.textContent = style === "subtitle" ? "Cues" : "Copy";
    textarea.placeholder = textPlaceholder(style);
    textarea.rows = style === "subtitle" ? 4 : 2;
  }

  function refreshSummary(): void {
    summary.textContent = blockSummary({
      ...initial,
      text: textarea.value,
      composition: currentStyle,
      distribution: currentDist,
      column: (widthSeg.querySelector("button.active")?.getAttribute("data-value") ?? "medium") as TypeColumn,
      anchor: currentAnchor,
    });
  }

  function setExpanded(open: boolean): void {
    root.classList.toggle("is-collapsed", !open);
    head.setAttribute("aria-expanded", open && !root.classList.contains("is-off") ? "true" : "false");
  }

  paintContext();
  fitTextarea(textarea);
  parent.appendChild(root);

  return {
    root,
    setExpanded,
    setCopyVisible(visible: boolean) {
      textRow.hidden = !visible;
    },
    sync(block: TypeBlock) {
      paintOn(block.enabled);
      textarea.value = block.text;
      fitTextarea(textarea);
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
      currentOffsetX = block.offsetX;
      currentOffsetY = block.offsetY;
      pos.set(block.anchor, block.offsetX, block.offsetY);
      color.value = block.color;
      blend.value = block.blendMode;
      paintContext();
      summary.textContent = blockSummary(block);
    },
  };
}

export type TypePanelPatch = Partial<TypeState> & Partial<TypeBlock> & {
  blockEnabled?: boolean;
  typePage?: "add" | "remove";
  typePageMove?: { from: number; to: number };
  frameHold?: boolean;
  holdLength?: number;
  pinnedCutPhase?: number | null;
  typeMode?: TypeSystemMode;
  sequenceCopyAt?: { index: number; text: string };
  sequenceSizeModeAt?: { index: number; mode: SequenceTypeSizeMode };
  sequenceSizeAt?: { index: number; size: number };
  sequenceAnchorAt?: { index: number; anchor: SequenceTypeAnchor };
};

export interface TypePanelContext {
  playbackMode: "loop" | "pingpong";
  sources: { label: string }[];
  pairIndex: number;
  selectedIndex: number;
  copies: string[];
  sizeModes: SequenceTypeSizeMode[];
  sizes: number[];
  anchors: SequenceTypeAnchor[];
}

export function buildTypePanel(
  container: HTMLElement,
  initial: TypeState,
  onChange: (patch: TypePanelPatch) => void,
  onSelectState?: (index: number) => void,
): {
  sync: (state: TypeState) => void;
  setContext: (next: TypePanelContext) => void;
  setActivePair: (pairIndex: number) => void;
} {
  container.innerHTML = "";
  container.className = "type-panel";

  let state = clampTypeState(initial);
  let expanded: TypeSlot | null = 0;
  let context: TypePanelContext = {
    playbackMode: "loop",
    sources: [],
    pairIndex: 0,
    selectedIndex: 0,
    copies: [],
    sizeModes: [],
    sizes: [],
    anchors: [],
  };

  const head = document.createElement("div");
  head.className = "panel-label-row type-master";
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

  const modeHost = document.createElement("div");
  modeHost.className = "type-mode-host";
  container.appendChild(modeHost);

  const body = document.createElement("div");
  body.className = "type-panel-body";
  container.appendChild(body);

  const modeSeg = seg(modeHost, "Type", [
    { value: "global", label: "Global" },
    { value: "sequence", label: "Per Frame" },
  ], state.typeMode, (value) => {
    if (value === "sequence") {
      toggle.classList.add("active");
      toggle.textContent = "On";
      container.classList.remove("type-disabled");
    }
    onChange(sequenceModePatch(value as TypeSystemMode));
  });
  const sequenceBtn = modeSeg.querySelector<HTMLButtonElement>('button[data-value="sequence"]');

  const pulseNote = document.createElement("p");
  pulseNote.className = "type-sequence-note";
  pulseNote.textContent = "Per Frame Type is associated with Loop. Pulse uses Global Type.";
  body.appendChild(pulseNote);

  const slotsHost = document.createElement("div");
  slotsHost.className = "type-sequence-slots";
  body.appendChild(slotsHost);

  const statesHost = document.createElement("div");
  statesHost.className = "type-states";
  body.appendChild(statesHost);
  const tabsHost = document.createElement("div");
  tabsHost.className = "type-states-tabs";
  statesHost.appendChild(tabsHost);

  let suppressTabClick = false;

  function paintStates(): void {
    tabsHost.innerHTML = "";
    const lab = document.createElement("label");
    lab.textContent = "Type States";
    tabsHost.appendChild(lab);
    const row = document.createElement("div");
    row.className = "seg-toggle type-seg type-states-row";
    const n = state.pages.length;
    for (let i = 0; i < n; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(i + 1).padStart(2, "0");
      if (i === state.selected) btn.classList.add("active");
      if (n > 1) {
        btn.draggable = true;
        btn.title = "Drag to reorder";
        btn.addEventListener("dragstart", (e) => {
          suppressTabClick = true;
          e.dataTransfer?.setData("text/plain", String(i));
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          btn.classList.add("dragging");
        });
        btn.addEventListener("dragend", () => {
          btn.classList.remove("dragging");
          for (const b of row.querySelectorAll("button")) b.classList.remove("drag-over");
          window.setTimeout(() => {
            suppressTabClick = false;
          }, 0);
        });
        btn.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          btn.classList.add("drag-over");
        });
        btn.addEventListener("dragleave", () => btn.classList.remove("drag-over"));
        btn.addEventListener("drop", (e) => {
          e.preventDefault();
          btn.classList.remove("drag-over");
          const from = Number(e.dataTransfer?.getData("text/plain"));
          if (!Number.isFinite(from) || from === i) return;
          onChange({ typePageMove: { from, to: i } });
        });
      }
      btn.addEventListener("click", () => {
        if (suppressTabClick) return;
        onChange({ selected: i });
      });
      row.appendChild(btn);
    }
    if (n < TYPE_PAGE_MAX) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "type-state-add";
      add.draggable = false;
      add.textContent = "+";
      add.title = "Duplicate current frame";
      add.addEventListener("click", () => onChange({ typePage: "add" }));
      row.appendChild(add);
    }
    tabsHost.appendChild(row);
    if (state.selected > 0) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "reset-btn type-state-remove";
      remove.textContent = `Remove ${String(state.selected + 1).padStart(2, "0")}`;
      remove.addEventListener("click", () => onChange({ typePage: "remove" }));
      tabsHost.appendChild(remove);
    }
  }
  paintStates();

  const holdRow = document.createElement("div");
  holdRow.className = "control-row type-frame-hold";
  const holdLab = document.createElement("label");
  holdLab.textContent = "Frame Hold";
  holdRow.appendChild(holdLab);
  const holdSeg = document.createElement("div");
  holdSeg.className = "seg-toggle";
  const holdOff = document.createElement("button");
  holdOff.type = "button";
  holdOff.textContent = "Off";
  const holdOn = document.createElement("button");
  holdOn.type = "button";
  holdOn.textContent = "On";
  holdSeg.appendChild(holdOff);
  holdSeg.appendChild(holdOn);
  holdRow.appendChild(holdSeg);
  statesHost.appendChild(holdRow);
  holdOff.addEventListener("click", () => onChange({ frameHold: false }));
  holdOn.addEventListener("click", () => onChange({ frameHold: true }));

  const holdLen = slider(
    statesHost,
    "Hold Length",
    FRAME_HOLD_LENGTH_MIN,
    FRAME_HOLD_LENGTH_MAX,
    FRAME_HOLD_LENGTH_STEP,
    FRAME_HOLD_LENGTH_DEFAULT,
    (v) => onChange({ holdLength: v }),
  );
  holdLen.row.classList.add("type-hold-length");
  holdLen.input.title = "Relative sequence time for this frame. 1.0× — 3.0×.";

  // Pin: an absolute loop position where THIS frame begins, overriding
  // the proportional Speed/Hold placement -- unlike Hold Length (how long
  // the PREVIOUS frame holds), Pin is about where the frame you're
  // looking at starts, so it's only meaningful for any frame but the
  // first (which always begins at Sequence Start).
  const pinRow = document.createElement("div");
  pinRow.className = "control-row type-frame-hold type-pin-row";
  const pinLab = document.createElement("label");
  pinLab.textContent = "Pin Start";
  pinRow.appendChild(pinLab);
  const pinSeg = document.createElement("div");
  pinSeg.className = "seg-toggle";
  const pinOff = document.createElement("button");
  pinOff.type = "button";
  pinOff.textContent = "Off";
  const pinOn = document.createElement("button");
  pinOn.type = "button";
  pinOn.textContent = "On";
  pinSeg.appendChild(pinOff);
  pinSeg.appendChild(pinOn);
  pinRow.appendChild(pinSeg);
  statesHost.appendChild(pinRow);

  const pinPhase = slider(statesHost, "Start At", 0, 100, 1, 50, (v) => onChange({ pinnedCutPhase: v / 100 }));
  pinPhase.row.classList.add("type-pin-phase");
  pinPhase.input.title = "Absolute loop position where this frame begins. Scrub Hold to find the moment, then Pin it here.";

  pinOff.addEventListener("click", () => onChange({ pinnedCutPhase: null }));
  pinOn.addEventListener("click", () => {
    // Turning Pin on shouldn't jump the cut -- default to wherever it
    // currently, proportionally, already lands.
    const n = state.pages.length;
    const defaultCuts = typePageCuts(n, state.sequenceSpeed, state.sequenceStart, state.sequenceStop, state.frameHoldEnabled, state.frameHoldLength);
    const fallback = defaultCuts[state.selected - 1] ?? state.sequenceStart;
    onChange({ pinnedCutPhase: fallback });
  });

  const windowUi = buildSequenceWindow(
    statesHost,
    state.sequenceStart,
    state.sequenceStop,
    (start, stop) => onChange({ sequenceStart: start, sequenceStop: stop }),
  );

  const speed = slider(statesHost, "Speed", 0, 100, 1, state.sequenceSpeed, (v) => {
    onChange({ sequenceSpeed: v });
  });
  speed.row.classList.add("type-sequence-speed");
  speed.input.title = "Slow — Fast. Progression of Type sequence cuts while typography is present.";

  function paintTiming(): void {
    const n = state.pages.length;
    const canHold = n > 1 && state.selected < n - 1;
    const held = canHold && state.frameHoldEnabled[state.selected] === true;
    const len = clampHoldLength(state.frameHoldLength[state.selected]);
    holdRow.hidden = !canHold;
    holdOff.classList.toggle("active", canHold && !held);
    holdOn.classList.toggle("active", held);
    holdLen.row.hidden = !held;
    holdLen.input.value = String(len);
    holdLen.valueEl.textContent = `${len % 1 === 0 ? len.toFixed(1) : len.toFixed(2)}×`;
    const canPin = n > 1 && state.selected >= 1;
    const pin = canPin ? state.pinnedCutPhases[state.selected] : null;
    const pinned = typeof pin === "number";
    pinRow.hidden = !canPin;
    pinOff.classList.toggle("active", canPin && !pinned);
    pinOn.classList.toggle("active", pinned);
    pinPhase.row.hidden = !pinned;
    if (pinned) {
      const v = Math.round(pin * 100);
      pinPhase.input.value = String(v);
      pinPhase.valueEl.textContent = String(v);
    }
    windowUi.row.hidden = false;
    speed.row.hidden = n <= 1;
    windowUi.set(state.sequenceStart, state.sequenceStop);
    speed.input.value = String(Math.round(state.sequenceSpeed));
    speed.valueEl.textContent = String(Math.round(state.sequenceSpeed));
  }

  function sequenceUiActive(): boolean {
    return state.typeMode === "sequence" && context.playbackMode === "loop";
  }

  function buildSlot(index: number, label: string, copy: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "type-sequence-slot";
    const meta = document.createElement("div");
    meta.className = "type-sequence-slot-meta";
    const num = document.createElement("span");
    num.className = "type-sequence-slot-index";
    num.textContent = String(index + 1).padStart(2, "0");
    const src = document.createElement("span");
    src.className = "type-sequence-slot-source";
    src.textContent = label;
    meta.appendChild(num);
    meta.appendChild(src);
    meta.addEventListener("click", () => onSelectState?.(index));
    row.appendChild(meta);
    const ta = document.createElement("textarea");
    ta.className = "type-text";
    ta.rows = 2;
    ta.placeholder = "Frame copy…";
    ta.value = copy;
    ta.addEventListener("focus", () => onSelectState?.(index));
    ta.addEventListener("input", () => {
      fitTextarea(ta);
      onChange(sequenceCopyPatch(state.typeMode, index, ta.value));
    });
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    row.appendChild(ta);

    const mode = context.sizeModes[index] ?? state.sequenceSizeModes[index] ?? "auto";
    const stored = context.sizes[index] ?? state.sequenceSizes[index] ?? state.blocks[0]!.scale;
    const anchor = context.anchors[index] ?? state.sequenceAnchors[index] ?? "inherit";

    const sizeRow = document.createElement("div");
    sizeRow.className = "control-row type-sequence-compose";
    const sizeLab = document.createElement("label");
    sizeLab.textContent = "Type Size";
    sizeRow.appendChild(sizeLab);
    const sizeWrap = document.createElement("div");
    sizeWrap.className = "type-sequence-size";
    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    autoBtn.className = "type-sequence-auto";
    autoBtn.textContent = "Auto";
    autoBtn.title = "Use the block's own Type Size, set above.";
    autoBtn.classList.toggle("active", mode === "auto");
    autoBtn.addEventListener("click", () => {
      onSelectState?.(index);
      onChange({ sequenceSizeModeAt: { index, mode: "auto" } });
    });
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "0";
    sizeInput.max = "100";
    sizeInput.step = "1";
    sizeInput.className = "type-sequence-size-value";
    sizeInput.value = String(stored);
    sizeInput.title = "Manual Type Size";
    sizeInput.addEventListener("focus", () => onSelectState?.(index));
    sizeInput.addEventListener("input", () => {
      onChange({
        sequenceSizeModeAt: { index, mode: "manual" },
        sequenceSizeAt: { index, size: Number(sizeInput.value) },
      });
    });
    sizeWrap.appendChild(autoBtn);
    sizeWrap.appendChild(sizeInput);
    sizeRow.appendChild(sizeWrap);
    row.appendChild(sizeRow);

    const posRow = document.createElement("div");
    posRow.className = "control-row type-sequence-compose";
    const posLab = document.createElement("label");
    posLab.textContent = "Position";
    posRow.appendChild(posLab);
    const posWrap = document.createElement("div");
    posWrap.className = "type-sequence-pos";
    const inheritBtn = document.createElement("button");
    inheritBtn.type = "button";
    inheritBtn.className = "type-sequence-inherit";
    inheritBtn.textContent = "Auto";
    inheritBtn.title = "Use the block's own Position, set above.";
    inheritBtn.classList.toggle("active", anchor === "inherit");
    inheritBtn.addEventListener("click", () => {
      onSelectState?.(index);
      onChange({ sequenceAnchorAt: { index, anchor: "inherit" } });
    });
    posWrap.appendChild(inheritBtn);
    for (const a of TYPE_ANCHORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-sequence-anchor";
      btn.textContent = a.toUpperCase();
      btn.setAttribute("data-anchor", a);
      btn.classList.toggle("active", anchor === a);
      btn.addEventListener("click", () => {
        onSelectState?.(index);
        onChange({ sequenceAnchorAt: { index, anchor: a } });
      });
      posWrap.appendChild(btn);
    }
    posRow.appendChild(posWrap);
    row.appendChild(posRow);

    fitTextarea(ta);
    return row;
  }

  function paintActivePair(): void {
    const active = sequenceUiActive();
    slotsHost.querySelectorAll<HTMLElement>(".type-sequence-slot").forEach((row, i) => {
      row.classList.toggle("is-active", active && i === context.selectedIndex);
    });
  }

  function paintSlots(): void {
    const sources = context.sources;
    const copies = context.copies.length ? context.copies : state.sequenceCopies;
    const rows = slotsHost.querySelectorAll<HTMLElement>(".type-sequence-slot");
    const labels = Array.from(slotsHost.querySelectorAll<HTMLElement>(".type-sequence-slot-source")).map((el) => el.textContent ?? "");
    const same =
      rows.length === sources.length &&
      labels.every((label, i) => label === (sources[i]?.label ?? ""));
    if (!same) {
      slotsHost.innerHTML = "";
      for (let i = 0; i < sources.length; i++) {
        slotsHost.appendChild(buildSlot(i, sources[i]!.label, copies[i] ?? ""));
      }
    } else {
      rows.forEach((row, i) => {
        const ta = row.querySelector("textarea");
        if (ta && document.activeElement !== ta) {
          const next = copies[i] ?? "";
          if (ta.value !== next) {
            ta.value = next;
            fitTextarea(ta);
          }
        }
        const mode = context.sizeModes[i] ?? state.sequenceSizeModes[i] ?? "auto";
        const stored = context.sizes[i] ?? state.sequenceSizes[i] ?? state.blocks[0]!.scale;
        const anchor = context.anchors[i] ?? state.sequenceAnchors[i] ?? "inherit";
        row.querySelector(".type-sequence-auto")?.classList.toggle("active", mode === "auto");
        const sizeInput = row.querySelector<HTMLInputElement>(".type-sequence-size-value");
        if (sizeInput && document.activeElement !== sizeInput && sizeInput.value !== String(stored)) {
          sizeInput.value = String(stored);
        }
        row.querySelector(".type-sequence-inherit")?.classList.toggle("active", anchor === "inherit");
        row.querySelectorAll<HTMLButtonElement>(".type-sequence-anchor").forEach((btn) => {
          btn.classList.toggle("active", btn.getAttribute("data-anchor") === anchor);
        });
      });
    }
    paintActivePair();
  }

  function paintMode(): void {
    const sequence = sequenceUiActive();
    const pulse = context.playbackMode === "pingpong";
    markSeg(modeSeg, state.typeMode);
    if (sequenceBtn) {
      sequenceBtn.disabled = pulse;
      sequenceBtn.title = pulse ? "Per Frame Type is available in Loop" : "";
    }
    pulseNote.hidden = !pulse;
    statesHost.hidden = sequence;
    slotsHost.hidden = !sequence;
    block0.setCopyVisible(!sequence);
    block1.root.hidden = sequence;
    block2.root.hidden = sequence;
    if (sequence && expanded !== 0) {
      expanded = 0;
      applyExpanded();
    }
    paintSlots();
  }
  paintTiming();

  const applyExpanded = (): void => {
    block0.setExpanded(expanded === 0);
    block1.setExpanded(expanded === 1);
    block2.setExpanded(expanded === 2);
  };

  const onEnabled = (index: TypeSlot) => (on: boolean) => {
    if (on) {
      expanded = index;
      applyExpanded();
    }
  };

  const block0 = buildBlock(body, 0, state.blocks[0], true, onChange, (next) => {
    expanded = next;
    applyExpanded();
  }, onEnabled(0));
  const block1 = buildBlock(body, 1, state.blocks[1], false, onChange, (next) => {
    expanded = next;
    applyExpanded();
  }, onEnabled(1));
  const block2 = buildBlock(body, 2, state.blocks[2], false, onChange, (next) => {
    expanded = next;
    applyExpanded();
  }, onEnabled(2));

  paintMode();

  return {
    sync(next: TypeState) {
      state = clampTypeState(next);
      toggle.classList.toggle("active", state.enabled);
      toggle.textContent = state.enabled ? "On" : "Off";
      container.classList.toggle("type-disabled", !state.enabled);
      paintStates();
      paintTiming();
      block0.sync(state.blocks[0]);
      block1.sync(state.blocks[1]);
      block2.sync(state.blocks[2]);
      paintMode();
    },
    setContext(next: TypePanelContext) {
      const playbackChanged = next.playbackMode !== context.playbackMode;
      const sourcesChanged =
        next.sources.length !== context.sources.length ||
        next.sources.some((source, i) => source.label !== context.sources[i]?.label);
      const copiesChanged =
        next.copies.length !== context.copies.length ||
        next.copies.some((copy, i) => copy !== context.copies[i]);
      const composeChanged =
        next.sizeModes.some((mode, i) => mode !== context.sizeModes[i]) ||
        next.sizes.some((size, i) => size !== context.sizes[i]) ||
        next.anchors.some((anchor, i) => anchor !== context.anchors[i]) ||
        next.sizeModes.length !== context.sizeModes.length;
      const selectedChanged = next.selectedIndex !== context.selectedIndex;
      context = next;
      if (playbackChanged || sourcesChanged) paintMode();
      else if (copiesChanged || composeChanged) paintSlots();
      else if (selectedChanged) paintActivePair();
    },
    setActivePair(pairIndex: number) {
      if (context.pairIndex === pairIndex) return;
      context = { ...context, pairIndex };
      paintActivePair();
    },
  };
}

export { defaultTypeState };
