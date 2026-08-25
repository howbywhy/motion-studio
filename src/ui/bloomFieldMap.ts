import { lastBloomFieldMap } from "../behaviors/bloom/index";

export interface BloomFieldMapHandle {
  sync(): void;
  setVisible(on: boolean): void;
}

/** Read-only map of Bloom fields in composition space. Positions and
 *  radii come from the same resolved fields the mask already computed
 *  this frame — nothing here writes back into Bloom. */
export function buildBloomFieldMap(container: HTMLElement): BloomFieldMapHandle {
  container.innerHTML = "";
  container.className = "bloom-field-map";

  const heading = document.createElement("div");
  heading.className = "bloom-field-map-title";
  heading.textContent = "Fields";
  container.appendChild(heading);

  const caption = document.createElement("div");
  caption.className = "bloom-field-map-caption";
  caption.textContent = "Live — read only";
  container.appendChild(caption);

  const W = 84;
  const H = 105;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.classList.add("bloom-field-map-svg");
  svg.setAttribute("aria-hidden", "true");
  container.appendChild(svg);

  const frame = document.createElementNS(svgNS, "rect");
  frame.setAttribute("x", "0.5");
  frame.setAttribute("y", "0.5");
  frame.setAttribute("width", String(W - 1));
  frame.setAttribute("height", String(H - 1));
  frame.setAttribute("class", "bloom-field-map-frame");
  svg.appendChild(frame);

  const layer = document.createElementNS(svgNS, "g");
  svg.appendChild(layer);

  function sync(): void {
    if (container.hidden) return;
    const snap = lastBloomFieldMap();
    while (layer.childNodes.length > 0) layer.removeChild(layer.lastChild!);
    if (!snap || snap.width < 1) return;
    for (const field of snap.fields) {
      const cx = (field.cx / snap.width) * W;
      const cy = (field.cy / snap.height) * H;
      const r = (field.radius / snap.width) * W;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", String(Math.max(2, r)));
      circle.setAttribute("class", "bloom-field-map-field");
      circle.setAttribute("opacity", String(0.15 + field.alpha * 0.7));
      layer.appendChild(circle);
    }
  }

  return {
    sync,
    setVisible(on: boolean): void {
      container.hidden = !on;
      if (on) sync();
    },
  };
}
