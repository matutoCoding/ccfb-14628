// DOM 构建辅助

export const el = (
  tag: string, cls = "", text = "",
): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export const clear = (e: HTMLElement): void => { e.innerHTML = ""; };

// 数值输入行 (label + number input)
export const numField = (
  label: string, value: number, step: number,
  onChange: (v: number) => void, unit = "", min?: number, max?: number,
): HTMLElement => {
  const row = el("label", "field");
  row.append(el("span", "field-label", label));
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(step);
  input.value = String(value);
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.addEventListener("change", () => {
    const v = parseFloat(input.value);
    if (isFinite(v)) onChange(v);
  });
  row.append(input);
  if (unit) row.append(el("span", "field-unit", unit));
  return row;
};

// 滑块 + 数值联动
export const sliderField = (
  label: string, value: number, min: number, max: number, step: number,
  onChange: (v: number) => void, unit = "",
): HTMLElement => {
  const row = el("div", "field field-slider");
  row.append(el("span", "field-label", label));
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(min); range.max = String(max);
  range.step = String(step); range.value = String(value);
  const num = document.createElement("input");
  num.type = "number";
  num.min = String(min); num.max = String(max);
  num.step = String(step); num.value = String(value);
  const sync = (v: number, fire: boolean) => {
    range.value = String(v); num.value = String(v);
    if (fire) onChange(v);
  };
  range.addEventListener("input", () => sync(parseFloat(range.value), true));
  num.addEventListener("change", () => sync(parseFloat(num.value), true));
  row.append(range, num);
  if (unit) row.append(el("span", "field-unit", unit));
  return row;
};

// 勾选行
export const checkField = (
  label: string, checked: boolean, onChange: (v: boolean) => void,
): HTMLElement => {
  const row = el("label", "field field-check");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(input, el("span", "", label));
  return row;
};

// 下拉选择
export const selectField = <T extends string>(
  label: string, options: [T, string][], value: T,
  onChange: (v: T) => void,
): HTMLElement => {
  const row = el("label", "field");
  if (label) row.append(el("span", "field-label", label));
  const sel = document.createElement("select");
  for (const [v, text] of options) {
    const o = document.createElement("option");
    o.value = v; o.textContent = text;
    if (v === value) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener("change", () => onChange(sel.value as T));
  row.append(sel);
  return row;
};

export const button = (text: string, onClick: () => void, cls = "btn"): HTMLButtonElement => {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
};

// 键值读数行
export const readout = (label: string, value: string, warn = false): HTMLElement => {
  const row = el("div", "readout" + (warn ? " warn" : ""));
  row.append(el("span", "readout-label", label), el("span", "readout-value", value));
  return row;
};

export const fmt = (v: number, digits = 2): string =>
  isFinite(v) ? v.toFixed(digits) : "—";
