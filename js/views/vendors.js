// ============================================================================
// vendors.js — contractors & suppliers, organised by trade for quick lookup.
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, readForm } from '../ui.js';
import { field, input, textarea, select, formActions } from '../form.js';
import { escapeHtml, initials, byNewest, debounce, waNumber } from '../util.js';
import { navigate, start } from '../router.js';

export const TRADES = [
  'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Mason / Civil', 'POP / False Ceiling',
  'Flooring / Tiling', 'Modular Kitchen', 'Fabricator', 'Glass & Aluminium', 'Aluminium & UPVC',
  'Furniture', 'Upholstery / Curtains', 'HVAC', 'Landscaping', 'Waterproofing',
  'Material Supplier', 'Lighting', 'Sanitaryware', 'Photographer', 'Labour Contractor', 'Other',
];
const TRADE_ICON = {
  Carpenter: '🪵', Electrician: '💡', Plumber: '🚰', Painter: '🎨', 'Mason / Civil': '🧱',
  'POP / False Ceiling': '🪟', 'Flooring / Tiling': '🔲', 'Modular Kitchen': '🍽️', Fabricator: '⚙️',
  'Glass & Aluminium': '🪞', 'Aluminium & UPVC': '🪟', Furniture: '🛋️', 'Upholstery / Curtains': '🧵',
  HVAC: '❄️', Landscaping: '🌿', Waterproofing: '💧', 'Material Supplier': '📦', Lighting: '🔆',
  Sanitaryware: '🚿', Photographer: '📷', 'Labour Contractor': '👷', Other: '📇',
};

let _filter = { trade: '', q: '' };

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const vendors = (await db.list('vendors')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const trades = [...new Set(vendors.map((v) => v.trade).filter(Boolean))].sort();

  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Vendors</h1><p class="muted">${vendors.length} contacts</p></div>
      <button class="btn btn--primary" id="add">+ Vendor</button>
    </div>
    ${vendors.length ? `
      <input class="control search" id="search" type="search" placeholder="Search name, trade, company…" value="${escapeHtml(_filter.q)}">
      <div class="chip-row" id="trades">
        <button class="pill ${!_filter.trade ? 'pill--on' : ''}" data-trade="">All</button>
        ${trades.map((t) => `<button class="pill ${_filter.trade === t ? 'pill--on' : ''}" data-trade="${escapeHtml(t)}">${TRADE_ICON[t] || '📇'} ${escapeHtml(t)}</button>`).join('')}
      </div>
      <div class="card-list" id="list"></div>`
      : emptyState('🧰', 'No vendors yet', 'Save contractors and suppliers so you can find them by trade.')}
  `;

  outlet.querySelector('#add').addEventListener('click', () => editVendor());
  if (!vendors.length) return;

  const listHost = outlet.querySelector('#list');
  const paint = () => {
    const q = _filter.q.trim().toLowerCase();
    const rows = vendors.filter((v) =>
      (!_filter.trade || v.trade === _filter.trade) &&
      (!q || [v.name, v.trade, v.company].filter(Boolean).some((s) => s.toLowerCase().includes(q))));
    listHost.innerHTML = rows.length ? rows.map(card).join('')
      : `<p class="muted small">No vendors match.</p>`;
    listHost.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', () => navigate('vendors/' + el.getAttribute('data-open'))));
    listHost.querySelectorAll('[data-call]').forEach((el) =>
      el.addEventListener('click', (e) => { e.stopPropagation(); }));
    listHost.querySelectorAll('[data-wa]').forEach((el) =>
      el.addEventListener('click', (e) => { e.stopPropagation(); }));
  };
  paint();

  outlet.querySelector('#search').addEventListener('input', debounce((e) => { _filter.q = e.target.value; paint(); }, 150));
  outlet.querySelectorAll('#trades [data-trade]').forEach((el) => el.addEventListener('click', () => {
    _filter.trade = el.getAttribute('data-trade');
    outlet.querySelectorAll('#trades .pill').forEach((p) => p.classList.toggle('pill--on', p === el));
    paint();
  }));
}

function card(v) {
  const wa = waNumber(v.phone);
  return `<div class="item item--vendor">
    <button class="item__tap" data-open="${v.id}">
      <span class="avatar avatar--trade">${TRADE_ICON[v.trade] || escapeHtml(initials(v.name))}</span>
      <span class="item__main">
        <span class="item__title">${escapeHtml(v.name)}</span>
        <span class="item__sub">${escapeHtml(v.trade || '')}${v.company ? ' · ' + escapeHtml(v.company) : ''}</span>
      </span>
    </button>
    <span class="item__quick">
      ${v.phone ? `<a class="icon-btn" href="tel:${escapeHtml(v.phone)}" data-call aria-label="Call">📞</a>` : ''}
      ${wa ? `<a class="icon-btn" href="https://wa.me/${wa}" target="_blank" rel="noopener" data-wa aria-label="WhatsApp">💬</a>` : ''}
    </span>
  </div>`;
}

async function renderDetail(outlet, id) {
  const v = await db.get('vendors', id);
  if (!v) { outlet.innerHTML = emptyState('🔍', 'Vendor not found'); return; }
  const wa = waNumber(v.phone);
  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Vendors</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <div class="profile">
      <span class="avatar avatar--lg avatar--trade">${TRADE_ICON[v.trade] || escapeHtml(initials(v.name))}</span>
      <div><h1>${escapeHtml(v.name)}</h1>
      <p class="muted">${escapeHtml(v.trade || '')}${v.company ? ' · ' + escapeHtml(v.company) : ''}</p></div>
    </div>
    <div class="quick-row">
      ${v.phone ? `<a class="btn btn--soft btn--sm" href="tel:${escapeHtml(v.phone)}">📞 Call</a>` : ''}
      ${wa ? `<a class="btn btn--soft btn--sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
      ${v.email ? `<a class="btn btn--soft btn--sm" href="mailto:${escapeHtml(v.email)}">✉️ Email</a>` : ''}
    </div>
    <div class="contact-grid">
      ${v.phone ? `<div class="contact-cell"><span>📞</span>${escapeHtml(v.phone)}</div>` : ''}
      ${v.email ? `<div class="contact-cell"><span>✉️</span>${escapeHtml(v.email)}</div>` : ''}
      ${v.address ? `<div class="contact-cell"><span>📍</span>${escapeHtml(v.address)}</div>` : ''}
    </div>
    ${v.notes ? `<div class="note-box">${escapeHtml(v.notes)}</div>` : ''}
  `;
  outlet.querySelector('#back').addEventListener('click', () => navigate('vendors'));
  outlet.querySelector('#edit').addEventListener('click', () => editVendor(v));
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog(`Delete ${v.name}?`)) { await db.remove('vendors', id); toast('Deleted'); navigate('vendors'); }
  });
}

export function editVendor(v = {}) {
  const isNew = !v.id;
  const s = openSheet({
    title: isNew ? 'New vendor' : 'Edit vendor',
    body: `<form id="f" class="form">
      ${field('Name', input('name', v.name, { required: true, placeholder: 'Contact / firm name' }))}
      ${field('Trade', select('trade', v.trade, TRADES, { placeholder: 'Select trade' }))}
      ${field('Company', input('company', v.company, { placeholder: 'Optional' }))}
      ${field('Phone', input('phone', v.phone, { type: 'tel', placeholder: '+91…' }))}
      ${field('Email', input('email', v.email, { type: 'email' }))}
      ${field('Address', textarea('address', v.address, { rows: 2 }))}
      ${field('Notes', textarea('notes', v.notes, { placeholder: 'Rates, quality, who they worked with…' }))}
      ${formActions(isNew ? 'Add vendor' : 'Save')}
    </form>`,
  });
  const form = s.root.querySelector('#f');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!data.name.trim()) return;
    await db.save('vendors', { ...v, ...data });
    closeSheet();
    toast(isNew ? 'Vendor added' : 'Saved');
    start();
  });
}
