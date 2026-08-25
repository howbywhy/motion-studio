import { fragmentContinuum } from "../behaviors/shift/timing";
import type { ParamValues, RangeParamDef } from "../core/types";

/** Fragment as density / subdivision on one axis: few large regions at
 *  the low end, many smaller ones at the high end. The bars ARE the
 *  parameter — they use the same continuum the behaviours use for piece
 *  count, so looking at the control is looking at the subdivision.
 *  Dragging along the track emits `{ fragment }` only. Numeric value is
 *  present but secondary. */
export function buildFragmentControl(
  container: HTMLElement,
  def: RangeParamDef,
  values: ParamValues,
  onChange: (patch: ParamValues) => void
): void {
  const group = document.createElement("div");
  group.className = "fragment-control";

  const heading = document.createElement("label");
  heading.textContent = def.label;
  group.appendChild(heading);

  const body = document.createElement("div");
  body.className = "fragment-body";
  group.appendChild(body);

  const W = 168;
  const H = 40;
  const PAD = 8;
  const INNER = W - PAD * 2;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.classList.add("fragment-svg");
  svg.setAttribute("role", "slider");
  svg.setAttribute("aria-label", "Fragment density");
  body.appendChild(svg);

  const track = document.createElementNS(svgNS, "rect");
  track.setAttribute("x", String(PAD));
  track.setAttribute("y", "8");
  track.setAttribute("width", String(INNER));
  track.setAttribute("height", "24");
  track.setAttribute("rx", "3");
  track.setAttribute("class", "fragment-track");
  svg.appendChild(track);

  const bars = document.createElementNS(svgNS, "g");
  bars.setAttribute("class", "fragment-bars");
  svg.appendChild(bars);

  const valueEl = document.createElement("span");
  valueEl.className = "control-value fragment-value";
  body.appendChild(valueEl);

  function weights(count: number): number[] {
    const raw = Array.from({ length: count }, (_, i) => 0.55 + ((i * 73 + 19) % 13) / 18);
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((w) => w / sum);
  }

  function place(v: number): void {
    const { count } = fragmentContinuum(v);
    const wts = weights(count);
    while (bars.childNodes.length > 0) bars.removeChild(bars.lastChild!);
    const gap = count > 8 ? 1.2 : 2;
    const usable = INNER - gap * (count - 1);
    let x = PAD;
    for (let i = 0; i < count; i++) {
      const bw = Math.max(1.5, wts[i] * usable);
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", "10");
      rect.setAttribute("width", String(bw));
      rect.setAttribute("height", "20");
      rect.setAttribute("rx", count > 12 ? "0.5" : "1.5");
      rect.setAttribute("class", "fragment-bar");
      bars.appendChild(rect);
      x += bw + gap;
    }
    valueEl.textContent = String(Math.round(v));
    svg.setAttribute("aria-valuenow", String(Math.round(v)));
    svg.setAttribute("aria-valuemin", String(def.min));
    svg.setAttribute("aria-valuemax", String(def.max));
  }

  function emitFromClientX(clientX: number): void {
    const rect = svg.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const v = def.min + t * (def.max - def.min);
    const snapped = Math.round(v / def.step) * def.step;
    place(snapped);
    onChange({ [def.key]: snapped });
  }

  place(values[def.key] as number);

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
