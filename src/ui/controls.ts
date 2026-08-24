import type { ParamDef, ParamValues } from "../core/types";

/** Builds a control panel for a param schema into `container`, calling
 * `onChange` with the full updated ParamValues on every input. */
export function buildControls(
  container: HTMLElement,
  defs: ParamDef[],
  values: ParamValues,
  onChange: (values: ParamValues) => void
): void {
  container.innerHTML = "";

  for (const def of defs) {
    const row = document.createElement("div");
    row.className = "control-row";

    const labelEl = document.createElement("label");
    labelEl.textContent = def.label;
    row.appendChild(labelEl);

    if (def.type === "range") {
      const valueEl = document.createElement("span");
      valueEl.className = "control-value";
      const fmt = (v: number) => `${Number(v.toFixed(2))}${def.unit ?? ""}`;
      valueEl.textContent = fmt(values[def.key] as number);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(values[def.key]);

      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        values = { ...values, [def.key]: v };
        valueEl.textContent = fmt(v);
        onChange(values);
      });

      const inputRow = document.createElement("div");
      inputRow.className = "control-input-row";
      inputRow.appendChild(input);
      inputRow.appendChild(valueEl);

      row.appendChild(inputRow);
    } else {
      const select = document.createElement("select");
      for (const opt of def.options) {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (values[def.key] === opt.value) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener("change", () => {
        values = { ...values, [def.key]: select.value };
        onChange(values);
      });
      row.appendChild(select);
    }

    container.appendChild(row);
  }
}
