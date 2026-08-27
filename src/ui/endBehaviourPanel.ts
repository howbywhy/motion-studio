import type { PlaybackMode } from "../core/sequence";
import {
  clampEndBehaviourSettings,
  defaultsForEndMode,
  parseEndBehaviourMode,
  type EndBehaviourMode,
  type EndBehaviourSettings,
} from "../core/endBehaviour";

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
  valueEl.textContent = String(Math.round(value));
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valueEl.textContent = String(Math.round(v));
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

export function mountEndBehaviourPanel(
  host: HTMLElement,
  get: () => EndBehaviourSettings,
  set: (next: EndBehaviourSettings) => void,
  getPlaybackMode: () => PlaybackMode,
): { sync: () => void } {
  host.classList.add("end-behaviour-panel");
  host.innerHTML = "";

  const labelRow = document.createElement("div");
  labelRow.className = "panel-label-row";
  const label = document.createElement("label");
  label.className = "panel-label";
  label.textContent = "End Behaviour";
  labelRow.appendChild(label);
  host.appendChild(labelRow);

  const modeHost = document.createElement("div");
  host.appendChild(modeHost);
  const fields = document.createElement("div");
  fields.className = "end-behaviour-fields";
  host.appendChild(fields);

  const rebuildFields = (state: EndBehaviourSettings): void => {
    fields.innerHTML = "";
    if (state.mode === "off") {
      fields.hidden = true;
      return;
    }
    fields.hidden = false;
    slider(fields, "Amount", state.amount, (v) => {
      set(clampEndBehaviourSettings({ ...get(), amount: v }));
    });
    slider(fields, "End Hold", state.hold, (v) => {
      set(clampEndBehaviourSettings({ ...get(), hold: v }));
    });
    slider(fields, "End Duration", state.duration, (v) => {
      set(clampEndBehaviourSettings({ ...get(), duration: v }));
    });
  };

  const applyMode = (mode: EndBehaviourMode): void => {
    const current = get();
    if (mode === current.mode) return;
    if (mode === "off") {
      set(clampEndBehaviourSettings({ ...current, mode: "off" }));
    } else {
      set(defaultsForEndMode(mode));
    }
    sync();
  };

  const rebuildMode = (state: EndBehaviourSettings): void => {
    modeHost.innerHTML = "";
    seg(
      modeHost,
      "",
      [
        { value: "off", label: "Off" },
        { value: "flicker", label: "Flicker" },
        { value: "fracture", label: "Fracture" },
      ],
      state.mode,
      (value) => applyMode(parseEndBehaviourMode(value)),
    );
  };

  function sync(): void {
    const pingpong = getPlaybackMode() !== "loop";
    host.hidden = pingpong;
    if (pingpong) return;
    const state = get();
    rebuildMode(state);
    rebuildFields(state);
  }

  sync();
  return { sync };
}
