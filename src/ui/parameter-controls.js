import { defaultParameters, validateParameters } from './parameters.js';

let nextControlId = 0;

export function createParameterControls(container, definition, initial, onChange = () => {}) {
  const values = { ...defaultParameters(definition), ...initial };
  const rows = [];
  container.replaceChildren();

  function refreshVisibility() {
    for (const { row, spec } of rows) row.hidden = !!spec.visible && !spec.visible(values);
  }
  for (const spec of definition.params) {
    const row = document.createElement('div'); row.className = 'parameter';
    const label = document.createElement('label');
    const id = `parameter-${nextControlId++}`;
    label.htmlFor = id; label.textContent = spec.label;
    if (spec.help) label.title = spec.help;
    row.append(label);
    const input = document.createElement(spec.type === 'select' ? 'select' : 'input');
    input.id = id; input.name = spec.key;
    if (spec.help) input.title = spec.help;
    if (spec.type === 'select') {
      for (const [value, text] of spec.options) input.add(new Option(text, value));
    } else input.type = spec.type;
    if (spec.type === 'number' || spec.type === 'range') {
      input.min = spec.min; input.max = spec.max; input.step = spec.step;
      input.required = true;
    }
    if (spec.type === 'text') input.maxLength = 128;
    input.value = values[spec.key];
    let numericInput = null;
    if (spec.type === 'range') {
      const pair = document.createElement('div'); pair.className = 'range-pair';
      numericInput = document.createElement('input'); numericInput.type = 'number';
      numericInput.min = spec.min; numericInput.max = spec.max; numericInput.step = spec.step;
      numericInput.value = values[spec.key]; numericInput.required = true;
      numericInput.setAttribute('aria-label', `${spec.label} exact value`);
      numericInput.dataset.parameter = spec.key;
      pair.append(input, numericInput); row.append(pair);
    } else row.append(input);
    const update = (source) => {
      const numeric = spec.type === 'range' || spec.type === 'number';
      values[spec.key] = numeric && source.value !== '' ? Number(source.value) : source.value;
      if (numericInput && source === input) numericInput.value = input.value;
      if (numericInput && source === numericInput && source.validity.valid) input.value = source.value;
      refreshVisibility(); onChange({ ...values });
    };
    input.addEventListener('input', () => update(input));
    if (numericInput) numericInput.addEventListener('input', () => update(numericInput));
    rows.push({ row, spec }); container.append(row);
  }
  refreshVisibility();
  return {
    getValues({ report = true } = {}) {
      const validated = validateParameters(definition, values);
      for (const { row, spec } of rows) {
        if (row.hidden) continue; // Conditional parameters, not the whole accordion.
        for (const input of row.querySelectorAll('input')) {
          if (!input.checkValidity()) {
            // Do not force focus or interrupt typing during live preview.
            if (report && input.getClientRects().length) input.reportValidity();
            throw new RangeError(`${spec.label}: ${input.validationMessage}`);
          }
        }
      }
      return validated;
    },
    peekValues: () => ({ ...values }),
  };
}
