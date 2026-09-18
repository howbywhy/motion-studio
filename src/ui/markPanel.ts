import {
  clampMarkState,
  markWindowForMode,
  type MarkMode,
  type MarkSource,
  type MarkState,
} from "../core/markState";
import { buildPositionPad } from "./positionPad";
import { buildEditableValue } from "./editableValue";

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
  onInput: (v: number) => void,
): { row: HTMLDivElement; input: HTMLInputElement } {
  const row = document.createElement("div");
  row.className = "control-row";
  const lab = document.createElement("label");
  lab.textContent = label;
  row.appendChild(lab);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const { row: valueRow, sync } = buildEditableValue(input, onInput);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    sync(v);
    onInput(v);
  });
  const inputRow = document.createElement("div");
  inputRow.className = "control-input-row";
  inputRow.appendChild(input);
  inputRow.appendChild(valueRow);
  row.appendChild(inputRow);
  parent.appendChild(row);
  return { row, input };
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

    const desc = document.createElement("p");
    desc.className = "behavior-desc";
    desc.textContent = "An animated identity event -- the wordmark or symbol cutting into the frame at a chosen moment.";
    host.appendChild(desc);

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
      const offHint = document.createElement("p");
      offHint.className = "mark-off-hint";
      offHint.textContent = "Turn on to choose when the wordmark or symbol cuts in, and its size and position.";
      host.appendChild(offHint);
      return;
    }

    seg(fields, "Mode", [
      { value: "interrupt", label: "Interrupt" },
      { value: "intro", label: "Intro" },
      { value: "end", label: "End" },
    ], state.mode, (v) => {
      const mode = v as MarkMode;
      const win = markWindowForMode(mode);
      apply({ mode, sequenceStart: win.start, sequenceStop: win.stop });
    });

    // "Horizontal" is gone here -- it rendered identical to Stacked, a
    // duplicate choice, not a second lockup. "Emblem" reads as "Symbol" in
    // the product vocabulary. "Stacked > Symbol" is the authored cut from
    // wordmark to symbol within one Mark window.
    seg(fields, "Source", [
      { value: "stacked", label: "Stacked" },
      { value: "emblem", label: "Symbol" },
      { value: "stackedToSymbol", label: "Stacked > Symbol" },
    ], state.source, (v) => {
      apply({ source: v as MarkSource });
    });

    slider(fields, "Mark Start", 0, 100, 1, Math.round(state.sequenceStart * 100), (v) => {
      set(clampMarkState({ ...get(), sequenceStart: v / 100 }));
    });
    slider(fields, "Mark Stop", 0, 100, 1, Math.round(state.sequenceStop * 100), (v) => {
      set(clampMarkState({ ...get(), sequenceStop: v / 100 }));
    });
    slider(fields, "Scale", 0, 100, 1, state.scale, (v) => {
      set(clampMarkState({ ...get(), scale: v }));
    });
    buildPositionPad(fields, state.anchor, state.offsetX, state.offsetY, (anchor, offsetX, offsetY) => {
      set(clampMarkState({ ...get(), anchor, offsetX, offsetY }));
    });
  };

  rebuild();
  return { sync: rebuild };
}
