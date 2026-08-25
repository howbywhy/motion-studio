import type { ParamValues, RangeParamDef } from "../core/types";

/** Spread as a visual range on the transform span — the same 0..1 axis as
 *  Phase. The shaded band is how widely fragment peaks occupy that span:
 *  a narrow centre band is a single clustered beat; a band that fills the
 *  track is a full stagger. Dragging an edge (or the body, scaling from
 *  centre) IS the parameter, not a proxy. Same non-ownership contract as
 *  buildControls: values are read once at build; every gesture emits a
 *  single-key patch. */
export function buildSpreadControl(
  container: HTMLElement,
  def: RangeParamDef,
  values: ParamValues,
  onChange: (patch: ParamValues) => void
): void {
  const group = document.createElement("div");
  group.className = "spread-control";

  const heading = document.createElement("label");
  heading.textContent = def.label;
  group.appendChild(heading);

  const body = document.createElement("div");
  body.className = "spread-body";
  group.appendChild(body);

  const W = 168;
  const H = 36;
  const PAD = 10;
  const TRACK = W - PAD * 2;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.classList.add("spread-svg");

  const track = document.createElementNS(svgNS, "rect");
  track.setAttribute("x", String(PAD));
  track.setAttribute("y", "14");
  track.setAttribute("width", String(TRACK));
  track.setAttribute("height", "8");
  track.setAttribute("rx", "4");
  track.setAttribute("class", "spread-track");
  svg.appendChild(track);

  const mid = document.createElementNS(svgNS, "line");
  mid.setAttribute("x1", String(W / 2));
  mid.setAttribute("x2", String(W / 2));
  mid.setAttribute("y1", "10");
  mid.setAttribute("y2", "26");
  mid.setAttribute("class", "spread-mid");
  svg.appendChild(mid);

  const band = document.createElementNS(svgNS, "rect");
  band.setAttribute("y", "12");
  band.setAttribute("height", "12");
  band.setAttribute("rx", "3");
  band.setAttribute("class", "spread-band");
  svg.appendChild(band);

  body.appendChild(svg);

  const valueEl = document.createElement("span");
  valueEl.className = "control-value";
  body.appendChild(valueEl);

  function fracFromValue(v: number): number {
    return (v - def.min) / (def.max - def.min);
  }

  function place(v: number): void {
    const f = Math.min(1, Math.max(0, fracFromValue(v)));
    const half = (4 + f * (TRACK / 2 - 4));
    const cx = W / 2;
    band.setAttribute("x", String(cx - half));
    band.setAttribute("width", String(half * 2));
    valueEl.textContent = `${Math.round(v)}${def.unit ?? ""}`;
  }

  function emitFromClientX(clientX: number): void {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const half = Math.abs(x - W / 2);
    const maxHalf = TRACK / 2;
    const minHalf = 4;
    const f = Math.min(1, Math.max(0, (half - minHalf) / (maxHalf - minHalf)));
    const v = def.min + f * (def.max - def.min);
    const snapped = Math.round(v / def.step) * def.step;
    place(snapped);
    onChange({ [def.key]: snapped });
  }

  const initial = values[def.key] as number;
  place(initial);

  let dragging = false;
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    emitFromClientX(e.clientX);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    emitFromClientX(e.clientX);
  });
  const stop = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);

  container.appendChild(group);
}
