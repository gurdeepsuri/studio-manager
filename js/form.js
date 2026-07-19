// ============================================================================
// form.js — declarative field builders so each view's forms stay short.
// ============================================================================

import { escapeHtml } from './util.js';

export function field(label, control, hint = '') {
  return `<label class="field">
    <span class="field__label">${escapeHtml(label)}</span>
    ${control}
    ${hint ? `<span class="field__hint">${escapeHtml(hint)}</span>` : ''}
  </label>`;
}

export function input(name, value = '', { type = 'text', placeholder = '', required = false, step, min, attrs = '' } = {}) {
  return `<input class="control" type="${type}" name="${name}"
    value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"
    ${required ? 'required' : ''} ${step != null ? `step="${step}"` : ''} ${min != null ? `min="${min}"` : ''} ${attrs}>`;
}

export function textarea(name, value = '', { placeholder = '', rows = 3 } = {}) {
  return `<textarea class="control" name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
}

// options: [{value,label}] or [string]
export function select(name, value, options, { placeholder = '' } = {}) {
  const opts = options.map((o) => {
    const val = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    const sel = String(val) === String(value) ? 'selected' : '';
    return `<option value="${escapeHtml(val)}" ${sel}>${escapeHtml(label)}</option>`;
  }).join('');
  const ph = placeholder ? `<option value="" ${!value ? 'selected' : ''}>${escapeHtml(placeholder)}</option>` : '';
  return `<select class="control" name="${name}">${ph}${opts}</select>`;
}

export function checkbox(name, checked, label) {
  return `<label class="checkbox">
    <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
    <span>${escapeHtml(label)}</span>
  </label>`;
}

export function row(...cols) {
  return `<div class="field-row">${cols.join('')}</div>`;
}

export function formActions(saveLabel = 'Save') {
  return `<div class="form-actions">
    <button type="button" class="btn btn--ghost" data-close>Cancel</button>
    <button type="submit" class="btn btn--primary">${escapeHtml(saveLabel)}</button>
  </div>`;
}
