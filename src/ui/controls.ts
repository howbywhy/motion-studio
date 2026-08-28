import type { ParamDef, ParamValues } from "../core/types";

/** Builds a control panel for a param schema into `container`. `values` is
 * read ONLY to set each control's initial displayed value at build time —
 * it is never captured, mutated, or read again afterward. Every control's
 * own handler reports just the one key it owns as a PATCH (`{ [key]: v }`)
 * via `onChange`, and the caller is solely responsible for merging that
 * patch against its own live, authoritative state.
 *
 * This is deliberate, not an oversight: an earlier version had each
 * handler close over a shared local `values` object and reassign it
 * (`values = {...values, [key]: v}`) before calling `onChange(values)`.
 * That local copy diverged the moment ANYTHING updated the real state
 * through a different path without rebuilding this panel (e.g. clicking a
 * treatment toggle, whose handler updated the caller's own state object
 * directly) — the panel's sliders never saw that change. The next slider
 * drag would then spread its OWN stale copy (still holding the old
 * treatment) right back over the caller's now-current state, silently
 * reverting it. Emitting single-key patches instead of caller-merged
 * snapshots removes the stale copy entirely: there is nothing here left to
 * go out of sync, because this module never owns any state past the
 * instant a control is built. */
export function buildControls(
  container: HTMLElement,
  defs: ParamDef[],
  values: ParamValues,
  onChange: (patch: ParamValues) => void
): void {
  container.innerHTML = "";

  for (const def of defs) {
    const row = document.createElement("div");
    row.className = "control-row";
    row.dataset.param = def.key;

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
        valueEl.textContent = fmt(v);
        onChange({ [def.key]: v });
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
        onChange({ [def.key]: select.value });
      });
      row.appendChild(select);
    }

    container.appendChild(row);
  }
}
