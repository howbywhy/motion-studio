import type { ParamValues, RangeParamDef } from "../core/types";

/** A circular direction+distance pad for a pair of params that are really
 * one polar quantity — e.g. Shift's `direction` (angle) and `overlap`
 * (displacement distance): the render math already computes
 * `dx = cos(direction) * f(overlap)`, `dy = sin(direction) * f(overlap)`
 * and uses that offset directly as a screen-space translation, so a pad
 * built in the same y-down coordinate space lets the puck's position BE
 * the displacement, not a proxy for it — drag down, the image moves down.
 *
 * Same non-ownership contract as `buildControls`: `values` is read only at
 * build time for the initial puck position and numeric readouts; every
 * interaction (drag or typed number) recomputes fresh from the pointer or
 * input and emits a two-key patch via `onChange`. Nothing here is cached
 * as authoritative state, so a parent rebuild (preset load, treatment
 * switch) always wins cleanly. */
export function buildXYPad(
  container: HTMLElement,
  angleDef: RangeParamDef,
  radiusDef: RangeParamDef,
  values: ParamValues,
  onChange: (patch: ParamValues) => void
): void {
  const group = document.createElement("div");
  group.className = "xy-pad-group";

  const heading = document.createElement("label");
  heading.textContent = `${angleDef.label} + ${radiusDef.label}`;
  group.appendChild(heading);

  const body = document.createElement("div");
  body.className = "xy-pad-body";
  group.appendChild(body);

  const SIZE = 140;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const MAX_R = SIZE / 2 - 14;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svg.classList.add("xy-pad-svg");

  const ring = document.createElementNS(svgNS, "circle");
  ring.setAttribute("cx", String(CX));
  ring.setAttribute("cy", String(CY));
  ring.setAttribute("r", String(MAX_R));
  ring.setAttribute("class", "xy-pad-ring");
  svg.appendChild(ring);

  const halfRing = document.createElementNS(svgNS, "circle");
  halfRing.setAttribute("cx", String(CX));
  halfRing.setAttribute("cy", String(CY));
  halfRing.setAttribute("r", String(MAX_R / 2));
  halfRing.setAttribute("class", "xy-pad-ring xy-pad-ring-inner");
  svg.appendChild(halfRing);

  for (const deg of [0, 90, 180, 270]) {
    const rad = (deg * Math.PI) / 180;
    const spoke = document.createElementNS(svgNS, "line");
    spoke.setAttribute("x1", String(CX));
    spoke.setAttribute("y1", String(CY));
    spoke.setAttribute("x2", String(CX + Math.cos(rad) * MAX_R));
    spoke.setAttribute("y2", String(CY + Math.sin(rad) * MAX_R));
    spoke.setAttribute("class", "xy-pad-spoke");
    svg.appendChild(spoke);
  }

  const stem = document.createElementNS(svgNS, "line");
  stem.setAttribute("class", "xy-pad-stem");
  stem.setAttribute("x1", String(CX));
  stem.setAttribute("y1", String(CY));
  svg.appendChild(stem);

  const puck = document.createElementNS(svgNS, "circle");
  puck.setAttribute("r", "6");
  puck.setAttribute("class", "xy-pad-puck");
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

  const angleInput = numberField(angleDef);
  const radiusInput = numberField(radiusDef);

  function placePuck(angleVal: number, radiusVal: number): void {
    const rad = (angleVal * Math.PI) / 180;
    const frac = Math.min(1, Math.max(0, (radiusVal - radiusDef.min) / (radiusDef.max - radiusDef.min)));
    const r = frac * MAX_R;
    const px = CX + Math.cos(rad) * r;
    const py = CY + Math.sin(rad) * r;
    puck.setAttribute("cx", String(px));
    puck.setAttribute("cy", String(py));
    stem.setAttribute("x2", String(px));
    stem.setAttribute("y2", String(py));
  }

  function setFromValues(angleVal: number, radiusVal: number): void {
    angleInput.value = String(Number(angleVal.toFixed(2)));
    radiusInput.value = String(Number(radiusVal.toFixed(2)));
    placePuck(angleVal, radiusVal);
  }

  const initialAngle = values[angleDef.key] as number;
  const initialRadius = values[radiusDef.key] as number;
  setFromValues(initialAngle, initialRadius);

  function emit(angleVal: number, radiusVal: number): void {
    setFromValues(angleVal, radiusVal);
    onChange({ [angleDef.key]: angleVal, [radiusDef.key]: radiusVal });
  }

  function fromPointer(clientX: number, clientY: number): void {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * SIZE - CX;
    const y = ((clientY - rect.top) / rect.height) * SIZE - CY;
    let angleVal = (Math.atan2(y, x) * 180) / Math.PI;
    if (angleVal < 0) angleVal += 360;
    const dist = Math.min(MAX_R, Math.hypot(x, y));
    const frac = dist / MAX_R;
    const radiusVal = radiusDef.min + frac * (radiusDef.max - radiusDef.min);
    emit(angleVal, radiusVal);
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
  const stopDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener("pointerup", stopDrag);
  svg.addEventListener("pointercancel", stopDrag);

  angleInput.addEventListener("change", () => {
    const v = Math.min(angleDef.max, Math.max(angleDef.min, parseFloat(angleInput.value)));
    emit(v, parseFloat(radiusInput.value));
  });
  radiusInput.addEventListener("change", () => {
    const v = Math.min(radiusDef.max, Math.max(radiusDef.min, parseFloat(radiusInput.value)));
    emit(parseFloat(angleInput.value), v);
  });

  container.appendChild(group);
}
