// ============================================================================
// ui.js — shared UI primitives: toasts, modal sheets, confirm, chips, spinner.
// Views build their HTML with template strings and rely on these for chrome.
// ============================================================================

import { escapeHtml, debounce } from './util.js';

// ---- filter bar (search + status chips) -----------------------------------
// Renders a search box and a row of filter pills. Wire it with wireFilterBar,
// which repaints only the list host so the search box keeps focus.
export function filterBar({ q = '', placeholder = 'Search…', chips = [], active = '' }) {
  return `
    <input class="control search" data-fb-search type="search" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(q)}" aria-label="Search">
    <div class="chip-row" data-fb-chips>
      ${chips.map((c) => `<button class="pill ${String(c.value) === String(active) ? 'pill--on' : ''}" data-fb="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>`).join('')}
    </div>`;
}
// state: a mutable object with { q, status }. onChange() runs after each change.
export function wireFilterBar(root, state, onChange) {
  const search = root.querySelector('[data-fb-search]');
  if (search) search.addEventListener('input', debounce((e) => { state.q = e.target.value; onChange(); }, 150));
  root.querySelectorAll('[data-fb]').forEach((btn) => btn.addEventListener('click', () => {
    state.status = btn.getAttribute('data-fb');
    root.querySelectorAll('[data-fb-chips] .pill').forEach((p) => p.classList.toggle('pill--on', p === btn));
    onChange();
  }));
}

// ---- toast ----------------------------------------------------------------
let toastTimer;
export function toast(message, kind = 'ok') {
  let host = document.getElementById('toast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast';
    document.body.appendChild(host);
  }
  host.className = `toast toast--${kind} show`;
  host.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('show'), 2600);
}

// ---- modal / bottom sheet -------------------------------------------------
// openSheet({ title, body, actions }) returns a controller with .close().
// body may be a string of HTML or a DOM node.
let _sheetCloser = null;
export function openSheet({ title = '', body = '', wide = false } = {}) {
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet ${wide ? 'sheet--wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="sheet__head">
        <h3>${escapeHtml(title)}</h3>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </header>
      <div class="sheet__body"></div>
    </div>`;
  const bodyHost = overlay.querySelector('.sheet__body');
  if (typeof body === 'string') bodyHost.innerHTML = body;
  else bodyHost.appendChild(body);

  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('show'));

  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) closeSheet();
  });
  document.addEventListener('keydown', onKey);

  _sheetCloser = () => {
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('show');
    document.body.classList.remove('no-scroll');
    setTimeout(() => overlay.remove(), 200);
    _sheetCloser = null;
  };
  return { close: closeSheet, root: overlay };
}
export function closeSheet() {
  if (_sheetCloser) _sheetCloser();
}

// ---- confirm dialog (Promise<boolean>) ------------------------------------
export function confirmDialog(message, { danger = true, okLabel = 'Delete' } = {}) {
  return new Promise((resolve) => {
    const s = openSheet({
      title: 'Please confirm',
      body: `
        <p class="confirm-msg">${escapeHtml(message)}</p>
        <div class="form-actions">
          <button class="btn btn--ghost" data-no>Cancel</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>${escapeHtml(okLabel)}</button>
        </div>`,
    });
    s.root.querySelector('[data-no]').addEventListener('click', () => { s.close(); resolve(false); });
    s.root.querySelector('[data-yes]').addEventListener('click', () => { s.close(); resolve(true); });
  });
}

// ---- small builders -------------------------------------------------------
export function statusChip(value, map) {
  const cls = (map && map[value]) || 'neutral';
  return `<span class="chip chip--${cls}">${escapeHtml(value || '—')}</span>`;
}

export function emptyState(icon, title, hint = '') {
  return `<div class="empty">
    <div class="empty__icon">${icon}</div>
    <p class="empty__title">${escapeHtml(title)}</p>
    ${hint ? `<p class="empty__hint">${escapeHtml(hint)}</p>` : ''}
  </div>`;
}

// Serialize a <form> into a plain object (numbers/checkboxes coerced).
export function readForm(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.type === 'number') data[el.name] = el.value === '' ? '' : Number(el.value);
    else data[el.name] = el.value;
  }
  return data;
}
