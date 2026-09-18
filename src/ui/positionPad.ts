import type { TypeAnchor } from "../core/typeState";

/** A drag-anywhere frame-position pad, shared by Type block placement and
 * Mark placement. Position is a 3x3 zone (which determines left/center/
 * right and top/middle/bottom alignment where the caller's model reads
 * one) plus a continuous nudge from that zone's own center -- the same
 * split a real layout tool draws between "align" and "nudge". Dragging to
 * a zone's dead-center yields offset 0, so any save with no stored offset
 * (old data, defaulting to 0) renders at exactly the classic anchor
 * position. */

export function nearestAnchor(nx: number, ny: number): TypeAnchor {
  const col = nx < -17 ? "l" : nx > 17 ? "r" : "c";
  const row = ny < -17 ? "t" : ny > 17 ? "b" : "m";
  return `${row}${col}` as TypeAnchor;
}

/** Zone x/y for the anchor's own column/row, in the same -50..50 space as
 * `alignFromAnchor`. */
export function zoneOf(anchor: TypeAnchor): { x: number; y: number } {
  const x = anchor[1] === "l" ? -50 : anchor[1] === "r" ? 50 : 0;
  const y = anchor[0] === "t" ? -50 : anchor[0] === "b" ? 50 : 0;
  return { x, y };
}

export function buildPositionPad(
  parent: HTMLElement,
  current: TypeAnchor,
  currentOffsetX: number,
  currentOffsetY: number,
  onChange: (anchor: TypeAnchor, offsetX: number, offsetY: number) => void,
): { set: (anchor: TypeAnchor, offsetX: number, offsetY: number) => void } {
  const row = document.createElement("div");
  row.className = "control-row type-pos-row";
  const labRow = document.createElement("div");
  labRow.className = "type-pos-label-row";
  const lab = document.createElement("label");
  lab.textContent = "Position";
  labRow.appendChild(lab);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "type-pos-reset";
  reset.title = "Snap back to the exact anchor position";
  reset.textContent = "Reset";
  labRow.appendChild(reset);
  row.appendChild(labRow);

  const W = 84;
  const H = 105;
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
  svg.setAttribute("aria-label", "Position");

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

  function place(nx: number, ny: number): void {
    const px = W / 2 + (nx / 50) * halfW;
    const py = H / 2 + (ny / 50) * halfH;
    puck.setAttribute("cx", String(px));
    puck.setAttribute("cy", String(py));
  }

  let liveAnchor = current;

  function set(anchor: TypeAnchor, offsetX: number, offsetY: number): void {
    liveAnchor = anchor;
    const zone = zoneOf(anchor);
    place(zone.x + offsetX, zone.y + offsetY);
  }
  set(current, currentOffsetX, currentOffsetY);

  function fromPointer(clientX: number, clientY: number, commit: boolean): void {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W - W / 2;
    const py = ((clientY - rect.top) / rect.height) * H - H / 2;
    const nx = Math.min(50, Math.max(-50, (px / halfW) * 50));
    const ny = Math.min(50, Math.max(-50, (py / halfH) * 50));
    place(nx, ny);
    if (commit) {
      const anchor = nearestAnchor(nx, ny);
      liveAnchor = anchor;
      const zone = zoneOf(anchor);
      onChange(anchor, nx - zone.x, ny - zone.y);
    }
  }

  let dragging = false;
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    fromPointer(e.clientX, e.clientY, true);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    fromPointer(e.clientX, e.clientY, true);
  });
  const stop = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);

  reset.addEventListener("click", () => {
    set(liveAnchor, 0, 0);
    onChange(liveAnchor, 0, 0);
  });

  row.appendChild(svg);
  parent.appendChild(row);
  return { set };
}
