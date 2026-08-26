import { clampFrequency, FREQUENCY_DEFAULT, markPeriodCss } from "../sources/field";

export function buildFrequencyControl(
  container: HTMLElement,
  value: number,
  onChange: (frequency: number) => void,
): void {
  const group = document.createElement("div");
  group.className = "fragment-control frequency-control";

  const heading = document.createElement("label");
  heading.textContent = "Frequency";
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
  svg.setAttribute("aria-label", "Graphic frequency");
  body.appendChild(svg);

  const track = document.createElementNS(svgNS, "rect");
  track.setAttribute("x", String(PAD));
  track.setAttribute("y", "8");
  track.setAttribute("width", String(INNER));
  track.setAttribute("height", "24");
  track.setAttribute("rx", "3");
  track.setAttribute("class", "fragment-track");
  svg.appendChild(track);

  const marks = document.createElementNS(svgNS, "g");
  marks.setAttribute("class", "fragment-bars");
  svg.appendChild(marks);

  const valueEl = document.createElement("span");
  valueEl.className = "control-value fragment-value";
  body.appendChild(valueEl);

  function place(v: number): void {
    const f = clampFrequency(v);
    while (marks.childNodes.length > 0) marks.removeChild(marks.lastChild!);
    const period = Math.max(2.2, markPeriodCss(f) * 3.6);
    let x = PAD + 1;
    let i = 0;
    while (x < PAD + INNER - 1.5) {
      const mark = document.createElementNS(svgNS, "rect");
      const mw = f > 78 ? 1.1 : f > 45 ? 1.5 : 2.1;
      const mh = 5 + ((i * 5) % 13);
      mark.setAttribute("x", String(x));
      mark.setAttribute("y", String(20 - mh * 0.5));
      mark.setAttribute("width", String(mw));
      mark.setAttribute("height", String(mh));
      mark.setAttribute("class", "fragment-bar");
      marks.appendChild(mark);
      x += period;
      i++;
    }
    valueEl.textContent = `${Math.round(f)}`;
  }

  function valueFromEvent(e: PointerEvent): number {
    const r = svg.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left - PAD) / INNER));
    return t * 100;
  }

  svg.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    const next = valueFromEvent(e);
    place(next);
    onChange(next);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!svg.hasPointerCapture(e.pointerId)) return;
    const next = valueFromEvent(e);
    place(next);
    onChange(next);
  });

  container.appendChild(group);
  place(value ?? FREQUENCY_DEFAULT);
}
