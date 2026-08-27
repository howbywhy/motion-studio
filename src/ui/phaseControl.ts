import type { ClockMode } from "../core/phaseClock";

export interface PhaseControlHandle {
  setDisplayedPhase(phase: number): void;
  setMode(mode: ClockMode): void;
  setPairCount(count: number): void;
}

/** Compact AUTO / HOLD + one scrubber.
 *  AUTO + drag: preview that point; on release AUTO resumes from there.
 *  HOLD + drag: change the held phase; release remains held.
 *  The scrubber never switches Auto → Hold. */
export function buildPhaseControl(
  container: HTMLElement,
  onMode: (mode: ClockMode) => void,
  onScrub: (phase: number) => void,
  onScrubLock?: (active: boolean) => void,
): PhaseControlHandle {
  container.innerHTML = "";
  container.className = "phase-control";

  const label = document.createElement("span");
  label.className = "phase-label";
  label.textContent = "Loop";
  container.appendChild(label);

  const toggle = document.createElement("div");
  toggle.className = "seg-toggle phase-mode-toggle";
  const autoBtn = document.createElement("button");
  autoBtn.type = "button";
  autoBtn.textContent = "Auto";
  autoBtn.setAttribute("data-mode", "auto");
  const holdBtn = document.createElement("button");
  holdBtn.type = "button";
  holdBtn.textContent = "Hold";
  holdBtn.setAttribute("data-mode", "hold");
  toggle.appendChild(autoBtn);
  toggle.appendChild(holdBtn);
  container.appendChild(toggle);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "1";
  slider.step = "0.01";
  slider.value = "0";
  slider.className = "phase-slider";
  slider.title = "Sequence position. Auto resumes from the released point.";
  container.appendChild(slider);

  const dots = document.createElement("div");
  dots.className = "loop-dots";
  dots.setAttribute("aria-hidden", "true");
  container.appendChild(dots);

  const readout = document.createElement("span");
  readout.className = "phase-readout";
  readout.textContent = "0.00";
  readout.hidden = true;
  container.appendChild(readout);

  let mode: ClockMode = "auto";
  let suppress = false;
  let pairCount = 2;
  let lastPhase = 0;
  let scrubbing = false;

  function paintDots(phase: number): void {
    const n = Math.max(1, pairCount);
    if (dots.childElementCount !== n) {
      dots.innerHTML = "";
      for (let i = 0; i < n; i++) {
        const d = document.createElement("span");
        d.className = "loop-dot";
        dots.appendChild(d);
      }
    }
    const active = Math.min(n - 1, Math.floor(phase * n));
    Array.from(dots.children).forEach((el, i) => {
      el.classList.toggle("is-on", i === active);
    });
  }

  function syncModeUi(): void {
    autoBtn.classList.toggle("active", mode === "auto");
    holdBtn.classList.toggle("active", mode === "hold");
    readout.hidden = mode !== "hold" && !scrubbing;
  }

  function emitScrub(): void {
    const phase = parseFloat(slider.value);
    lastPhase = phase;
    readout.textContent = phase.toFixed(2);
    paintDots(phase);
    onScrub(phase);
  }

  function endScrub(): void {
    if (!scrubbing) return;
    scrubbing = false;
    syncModeUi();
    onScrubLock?.(false);
  }

  autoBtn.addEventListener("click", () => {
    mode = "auto";
    syncModeUi();
    onMode("auto");
  });
  holdBtn.addEventListener("click", () => {
    mode = "hold";
    syncModeUi();
    onMode("hold");
  });
  slider.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    slider.setPointerCapture(e.pointerId);
    syncModeUi();
    onScrubLock?.(true);
  });
  slider.addEventListener("pointerup", endScrub);
  slider.addEventListener("pointercancel", endScrub);
  slider.addEventListener("lostpointercapture", endScrub);
  slider.addEventListener("input", () => {
    if (suppress) return;
    emitScrub();
  });

  paintDots(0);
  syncModeUi();

  return {
    setDisplayedPhase(phase: number): void {
      const v = Math.min(1, Math.max(0, phase));
      lastPhase = v;
      if (scrubbing) return;
      suppress = true;
      slider.value = String(v);
      readout.textContent = v.toFixed(2);
      suppress = false;
      paintDots(v);
    },
    setMode(next: ClockMode): void {
      mode = next;
      syncModeUi();
    },
    setPairCount(count: number): void {
      pairCount = Math.max(1, count | 0);
      paintDots(lastPhase);
    },
  };
}
