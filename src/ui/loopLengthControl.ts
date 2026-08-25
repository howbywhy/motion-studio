import {
  LOOP_SECONDS_DEFAULT,
  LOOP_SECONDS_MAX,
  LOOP_SECONDS_MIN,
} from "../core/sequence";

export interface LoopLengthHandle {
  setSeconds(seconds: number): void;
}

export function buildLoopLengthControl(
  container: HTMLElement,
  onChange: (seconds: number) => void,
): LoopLengthHandle {
  container.innerHTML = "";
  container.className = "loop-length";

  const label = document.createElement("span");
  label.className = "phase-label";
  label.textContent = "Length";
  container.appendChild(label);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(LOOP_SECONDS_MIN);
  slider.max = String(LOOP_SECONDS_MAX);
  slider.step = "1";
  slider.value = String(LOOP_SECONDS_DEFAULT);
  slider.className = "loop-length-slider";
  slider.title = "Duration of one complete sequence cycle";
  container.appendChild(slider);

  const readout = document.createElement("span");
  readout.className = "phase-readout";
  readout.textContent = `${LOOP_SECONDS_DEFAULT}s`;
  readout.hidden = false;
  container.appendChild(readout);

  slider.addEventListener("input", () => {
    const seconds = Number(slider.value);
    readout.textContent = `${seconds}s`;
    onChange(seconds);
  });

  return {
    setSeconds(seconds: number) {
      slider.value = String(seconds);
      readout.textContent = `${seconds}s`;
    },
  };
}
