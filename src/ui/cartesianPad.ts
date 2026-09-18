import type { RangeParamDef, ParamValues } from "../core/types";

/** A drag-anywhere pad for a plain X/Y pair -- unlike positionPad.ts's
 * Type/Mark placement, there's no anchor-zone meaning here (no "left"/
 * "center"/"right"), just a literal 2D offset, so dragging maps straight
 * to the two values with no quantization. Reuses the same frame+thirds-
 * guide+puck visual language as Type/Mark's Position pad (a rule-of-
 * thirds guide reads naturally for panning too).
 *
 * Same non-ownership contract as buildControls: `values` is read only at
 * build time; every interaction recomputes fresh and emits a two-key
 * patch via `onChange`. */
export function buildCartesianPad(
  container: HTMLElement,
  label: string,
  xDef: RangeParamDef,
  yDef: RangeParamDef,
  values: ParamValues,
  onChange: (patch: ParamValues) => void,
): void {
  const group = document.createElement("div");
  group.className = "xy-pad-group";

  const heading = document.createElement("label");
  heading.textContent = label;
  group.appendChild(heading);

  const body = document.createElement("div");
  body.className = "xy-pad-body";
  group.appendChild(body);

  const W = 84;
  const H = 84;
  const PAD = 10;
  const halfW = W / 2 - PAD;
  const halfH = H / 2 - PAD;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.classList.add("type-pos-svg");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", label);

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", "1");
  bg.setAttribute("y", "1");
  bg.setAttribute("width", String(W - 2));
  bg.setAttribute("height", String(H - 2));
  bg.setAttribute("rx", "5");
  bg.setAttribute("class", "type-pos-frame");
  svg.appendChild(bg);

  for (const fx of [1 / 3, 2 / 3]) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", String(W * fx));
    line.setAttribute("y1", "1");
    line.setAttribute("x2", String(W * fx));
    line.setAttribute("y2", String(H - 1));
    line.setAttribute("class", "type-pos-grid");
    svg.appendChild(line);
  }
  for (const fy of [1 / 3, 2 / 3]) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", "1");
    line.setAttribute("y1", String(H * fy));
    line.setAttribute("x2", String(W - 1));
    line.setAttribute("y2", String(H * fy));
    line.setAttribute("class", "type-pos-grid");
    svg.appendChild(line);
  }

  const puck = document.createElementNS(svgNS, "circle");
  puck.setAttribute("r", "4.5");
  puck.setAttribute("class", "type-pos-puck");
  svg.appendChild(puck);

  body.appendChild(svg);

  const numbers = document.createElement("div");
  numbers.className = "xy-pad-numbers";
  body.appendChild(numbers);

  function numberField(def: RangeParamDef): HTMLInputElement {
    const row = document.createElement("div");
    row.className = "xy-pad-number-row";
    const lbl = document.createElement("span");
    lbl.textContent = def.label;
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.className = "xy-pad-number";
    row.appendChild(lbl);
    row.appendChild(input);
    if (def.unit) {
      const unit = document.createElement("span");
      unit.className = "xy-pad-unit";
      unit.textContent = def.unit;
      row.appendChild(unit);
    }
    numbers.appendChild(row);
    return input;
  }

  const xInput = numberField(xDef);
  const yInput = numberField(yDef);

  function place(x: number, y: number): void {
    const nx = ((x - xDef.min) / (xDef.max - xDef.min)) * 2 - 1;
    const ny = ((y - yDef.min) / (yDef.max - yDef.min)) * 2 - 1;
    const px = W / 2 + nx * halfW;
    const py = H / 2 + ny * halfH;
    puck.setAttribute("cx", String(px));
    puck.setAttribute("cy", String(py));
  }

  function setFromValues(x: number, y: number): void {
    const decimals = xDef.step < 1 ? 2 : 0;
    xInput.value = String(Number(x.toFixed(decimals)));
    yInput.value = String(Number(y.toFixed(decimals)));
    place(x, y);
  }

  const initialX = values[xDef.key] as number;
  const initialY = values[yDef.key] as number;
  setFromValues(initialX, initialY);

  function emit(x: number, y: number): void {
    setFromValues(x, y);
    onChange({ [xDef.key]: x, [yDef.key]: y });
  }

  function fromPointer(clientX: number, clientY: number): void {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W - W / 2;
    const py = ((clientY - rect.top) / rect.height) * H - H / 2;
    const nx = Math.min(1, Math.max(-1, px / halfW));
    const ny = Math.min(1, Math.max(-1, py / halfH));
    const x = xDef.min + ((nx + 1) / 2) * (xDef.max - xDef.min);
    const y = yDef.min + ((ny + 1) / 2) * (yDef.max - yDef.min);
    emit(x, y);
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

  xInput.addEventListener("change", () => {
    const v = Math.min(xDef.max, Math.max(xDef.min, parseFloat(xInput.value)));
    emit(v, parseFloat(yInput.value));
  });
  yInput.addEventListener("change", () => {
    const v = Math.min(yDef.max, Math.max(yDef.min, parseFloat(yInput.value)));
    emit(parseFloat(xInput.value), v);
  });
  xInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") xInput.blur();
  });
  yInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") yInput.blur();
  });

  container.appendChild(group);
}
