import type { FieldParams } from "../sources/field";
import type { GraphicDriver } from "../sources/graphicAsset";
import { buildSpreadControl } from "./spreadControl";
import { buildDensityBiasPad } from "./densityBiasPad";
import { buildFieldScaleControl } from "./fieldScaleControl";
import { buildFrequencyControl } from "./frequencyControl";

function fieldControls(
  container: HTMLElement,
  getParams: () => FieldParams,
  onPatch: (p: Partial<FieldParams>) => void,
): void {
  const pad = buildDensityBiasPad(container, getParams, onPatch);

  buildFieldScaleControl(container, getParams().scale, (scale) => {
    onPatch({ scale });
    pad.refresh();
  });

  buildFrequencyControl(container, getParams().frequency, (frequency) => {
    onPatch({ frequency });
    pad.refresh();
  });

  buildSpreadControl(
    container,
    { type: "range", key: "complexity", label: "Connected — Fractured", min: 0, max: 100, step: 1, default: 46 },
    { complexity: getParams().complexity },
    (patch) => {
      onPatch({ complexity: patch.complexity as number });
      pad.refresh();
    },
  );

  const seedRow = document.createElement("div");
  seedRow.className = "graphic-seed-row";
  const seedBtn = document.createElement("button");
  seedBtn.type = "button";
  seedBtn.className = "reset-btn";
  const writeSeed = (): void => {
    seedBtn.textContent = `Seed ${getParams().seed}`;
  };
  writeSeed();
  seedBtn.addEventListener("click", () => {
    onPatch({ seed: (getParams().seed | 0) + 1 });
    writeSeed();
    pad.refresh();
  });
  seedRow.appendChild(seedBtn);

  const motion = document.createElement("div");
  motion.className = "seg-toggle";
  for (const m of ["static", "live"] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = m === "static" ? "Static" : "Live";
    b.dataset.value = m;
    if (getParams().motion === m) b.classList.add("active");
    b.addEventListener("click", () => {
      onPatch({ motion: m });
      motion.querySelectorAll("button").forEach((el) => el.classList.toggle("active", el === b));
      pad.refresh();
    });
    motion.appendChild(b);
  }
  seedRow.appendChild(motion);
  container.appendChild(seedRow);
}

export function buildGraphicPanel(
  container: HTMLElement,
  driver: GraphicDriver,
  onChange: () => void,
): void {
  container.innerHTML = "";
  container.hidden = false;

  const label = document.createElement("label");
  label.className = "panel-label";
  label.textContent = "Field";
  container.appendChild(label);

  fieldControls(container, () => driver.getField(), (p) => {
    driver.patchField(p);
    onChange();
  });
}

export function hideGraphicPanel(container: HTMLElement): void {
  container.innerHTML = "";
  container.hidden = true;
}
