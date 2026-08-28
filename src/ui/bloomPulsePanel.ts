import {
  clampBloomPulse,
  PULSE_CYCLES,
  PULSE_RANGE_MIN,
  type BloomPulseSettings,
} from "../core/bloomPulse";

function pct(v: number): string {
  return String(Math.round(v * 100));
}

function buildPulseRange(
  parent: HTMLElement,
  start: number,
  end: number,
  onChange: (start: number, end: number) => void,
): { set: (start: number, end: number) => void } {
  const row = document.createElement("div");
  row.className = "control-row type-sequence-window bloom-pulse-window";
  const lab = document.createElement("label");
  lab.textContent = "Pulse Range";
  row.appendChild(lab);

  const legend = document.createElement("div");
  legend.className = "type-seq-legend";
  const startLab = document.createElement("span");
  const endLab = document.createElement("span");
  legend.appendChild(startLab);
  legend.appendChild(endLab);
  row.appendChild(legend);

  const rail = document.createElement("div");
  rail.className = "type-seq-rail";
  rail.setAttribute("role", "group");
  rail.setAttribute("aria-label", "Pulse range");
  const track = document.createElement("div");
  track.className = "type-seq-track";
  const span = document.createElement("div");
  span.className = "type-seq-span";
  const startHandle = document.createElement("button");
  startHandle.type = "button";
  startHandle.className = "type-seq-handle";
  startHandle.setAttribute("aria-label", "Start");
  const endHandle = document.createElement("button");
  endHandle.type = "button";
  endHandle.className = "type-seq-handle";
  endHandle.setAttribute("aria-label", "End");
  rail.appendChild(track);
  rail.appendChild(span);
  rail.appendChild(startHandle);
  rail.appendChild(endHandle);
  row.appendChild(rail);
  parent.appendChild(row);

  let curStart = start;
  let curEnd = end;

  function paint(): void {
    startLab.textContent = `Start ${pct(curStart)}`;
    endLab.textContent = `End ${pct(curEnd)}`;
    span.style.left = `${curStart * 100}%`;
    span.style.width = `${(curEnd - curStart) * 100}%`;
    startHandle.style.left = `${curStart * 100}%`;
    endHandle.style.left = `${curEnd * 100}%`;
  }
  paint();

  function fracFromX(clientX: number): number {
    const r = rail.getBoundingClientRect();
    const w = Math.max(1, r.width);
    return Math.min(1, Math.max(0, (clientX - r.left) / w));
  }

  function apply(nextStart: number, nextEnd: number, emit: boolean): void {
    const clamped = clampBloomPulse({ start: nextStart, end: nextEnd, cycles: 1 });
    curStart = clamped.start;
    curEnd = clamped.end;
    paint();
    if (emit) onChange(curStart, curEnd);
  }

  function attachDrag(handle: HTMLButtonElement, which: "start" | "end"): void {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const f = fracFromX(ev.clientX);
        if (which === "start") apply(Math.min(f, curEnd - PULSE_RANGE_MIN), curEnd, true);
        else apply(curStart, Math.max(f, curStart + PULSE_RANGE_MIN), true);
      };
      const up = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
      move(e);
    });
  }
  attachDrag(startHandle, "start");
  attachDrag(endHandle, "end");

  rail.addEventListener("pointerdown", (e) => {
    if (e.target !== rail && e.target !== track && e.target !== span) return;
    const f = fracFromX(e.clientX);
    const toStart = Math.abs(f - curStart);
    const toEnd = Math.abs(f - curEnd);
    if (toStart <= toEnd) apply(Math.min(f, curEnd - PULSE_RANGE_MIN), curEnd, true);
    else apply(curStart, Math.max(f, curStart + PULSE_RANGE_MIN), true);
  });

  return {
    set(nextStart: number, nextEnd: number) {
      apply(nextStart, nextEnd, false);
    },
  };
}

export function mountBloomPulse(
  host: HTMLElement,
  get: () => BloomPulseSettings,
  set: (next: BloomPulseSettings) => void,
): void {
  host.classList.add("bloom-pulse");
  host.innerHTML = "";
  const state = get();

  buildPulseRange(host, state.start, state.end, (start, end) => {
    set(clampBloomPulse({ ...get(), start, end }));
  });

  const row = document.createElement("div");
  row.className = "control-row";
  const lab = document.createElement("label");
  lab.textContent = "Pulse Speed";
  row.appendChild(lab);
  const toggle = document.createElement("div");
  toggle.className = "seg-toggle";
  for (const n of PULSE_CYCLES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${n}×`;
    btn.setAttribute("data-value", String(n));
    if (n === state.cycles) btn.classList.add("active");
    btn.addEventListener("click", () => {
      for (const b of toggle.querySelectorAll("button")) b.classList.remove("active");
      btn.classList.add("active");
      set(clampBloomPulse({ ...get(), cycles: n }));
    });
    toggle.appendChild(btn);
  }
  row.appendChild(toggle);
  host.appendChild(row);
}
