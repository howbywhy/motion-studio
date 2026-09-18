/** Wires an editable numeric readout to a paired `<input type="range">`, so
 * the value next to every slider in the app is a real input (type an exact
 * number) instead of read-only text. Typing clamps to the range's own
 * [min,max] and rounds to its `step` granularity on commit (blur or
 * Enter); Escape reverts to the slider's current value without
 * committing. A `unit` (e.g. "%", "×") renders as a small fixed suffix
 * beside the input -- an `<input type="number">` can't hold one inline. */
export function buildEditableValue(
  range: HTMLInputElement,
  onCommit: (v: number) => void,
  unit?: string,
): { row: DocumentFragment; input: HTMLInputElement; sync: (v: number) => void } {
  const min = parseFloat(range.min);
  const max = parseFloat(range.max);
  const step = parseFloat(range.step || "1");
  const decimals = step < 1 ? 2 : 0;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "control-value";
  input.min = range.min;
  input.max = range.max;
  input.step = range.step;

  function format(v: number): string {
    return String(Number(v.toFixed(decimals)));
  }

  function sync(v: number): void {
    if (document.activeElement !== input) input.value = format(v);
  }
  sync(parseFloat(range.value));

  function commit(): void {
    let v = parseFloat(input.value);
    if (!Number.isFinite(v)) v = parseFloat(range.value);
    v = Math.min(max, Math.max(min, v));
    input.value = format(v);
    if (range.value !== String(v)) range.value = String(v);
    onCommit(v);
  }

  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      input.blur();
    } else if (e.key === "Escape") {
      input.value = format(parseFloat(range.value));
      input.blur();
    }
  });
  input.addEventListener("focus", () => input.select());

  const row = document.createDocumentFragment();
  row.appendChild(input);
  if (unit) {
    const unitEl = document.createElement("span");
    unitEl.className = "control-value-unit";
    unitEl.textContent = unit;
    row.appendChild(unitEl);
  }

  return { row, input, sync };
}
