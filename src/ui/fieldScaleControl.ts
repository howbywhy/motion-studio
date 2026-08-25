/** Scale as structure size: few large cells at the high end, many small
 * ones at the low end. Same visual language as Fragment, inverted meaning. */
export function buildFieldScaleControl(
  container: HTMLElement,
  value: number,
  onChange: (scale: number) => void,
): void {
  const group = document.createElement("div");
  group.className = "fragment-control field-scale-control";

  const heading = document.createElement("label");
  heading.textContent = "Scale";
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
  svg.setAttribute("aria-label", "Structure scale");
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

  function countFor(v: number): number {
    const t = Math.min(1, Math.max(0, v / 100));
    return Math.round(3 + (1 - t) * 8);
  }

  function place(v: number): void {
    const count = countFor(v);
    while (bars.childNodes.length > 0) bars.removeChild(bars.lastChild!);
    const gap = count > 10 ? 1.2 : 2.2;
    const usable = INNER - gap * (count - 1);
    let x = PAD;
    for (let i = 0; i < count; i++) {
      const bw = usable / count;
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", "10");
      rect.setAttribute("width", String(Math.max(1.5, bw)));
      rect.setAttribute("height", "20");
      rect.setAttribute("rx", count > 10 ? "0.5" : "1.5");
      rect.setAttribute("class", "fragment-bar");
      bars.appendChild(rect);
      x += bw + gap;
    }
    valueEl.textContent = `${Math.round(v)}`;
  }

  function valueFromEvent(e: PointerEvent): number {
    const r = svg.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left - PAD) / INNER));
    return t * 100;
  }

  svg.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    const v = valueFromEvent(e);
    place(v);
    onChange(v);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!svg.hasPointerCapture(e.pointerId)) return;
    const v = valueFromEvent(e);
    place(v);
    onChange(v);
  });

  container.appendChild(group);
  place(value);
}
