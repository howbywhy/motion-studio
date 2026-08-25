import { type FieldParams, paintFieldToCanvas } from "../sources/field";

/** Density (black/white balance) and Bias (where it accumulates) as one
 * spatial control. The 4:5 field IS the parameter: pointer on the field
 * sets bias; the strip is how much of the field is black. */
export function buildDensityBiasPad(
  container: HTMLElement,
  getParams: () => FieldParams,
  onChange: (patch: Partial<FieldParams>) => void,
): { refresh: () => void } {
  const group = document.createElement("div");
  group.className = "density-bias";

  const heading = document.createElement("label");
  heading.textContent = "Density + Bias";
  group.appendChild(heading);

  const body = document.createElement("div");
  body.className = "density-bias-body";
  group.appendChild(body);

  const fieldWrap = document.createElement("div");
  fieldWrap.className = "density-bias-field";
  const preview = document.createElement("canvas");
  preview.width = 80;
  preview.height = 100;
  preview.className = "density-bias-canvas";
  fieldWrap.appendChild(preview);
  const puck = document.createElement("div");
  puck.className = "density-bias-puck";
  fieldWrap.appendChild(puck);
  body.appendChild(fieldWrap);

  const strip = document.createElement("div");
  strip.className = "density-bias-strip";
  const fill = document.createElement("div");
  fill.className = "density-bias-strip-fill";
  strip.appendChild(fill);
  body.appendChild(strip);

  const read = document.createElement("div");
  read.className = "density-bias-read";
  group.appendChild(read);

  function refresh(): void {
    const p = getParams();
    paintFieldToCanvas(preview, { ...p, motion: "static" }, 0);
    puck.style.left = `${p.biasX}%`;
    puck.style.top = `${p.biasY}%`;
    fill.style.height = `${p.density}%`;
    read.textContent = `${Math.round(p.density)} · ${Math.round(p.biasX)},${Math.round(p.biasY)}`;
  }

  function biasFromEvent(e: PointerEvent): void {
    const r = fieldWrap.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ biasX: x * 100, biasY: y * 100 });
    refresh();
  }

  function densityFromEvent(e: PointerEvent): void {
    const r = strip.getBoundingClientRect();
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ density: (1 - y) * 100 });
    refresh();
  }

  function drag(el: HTMLElement, move: (e: PointerEvent) => void): void {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      move(e);
    });
    el.addEventListener("pointermove", (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      move(e);
    });
  }

  drag(fieldWrap, biasFromEvent);
  drag(strip, densityFromEvent);

  container.appendChild(group);
  refresh();
  return { refresh };
}
