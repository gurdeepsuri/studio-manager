// ============================================================================
// quotes.js — estimates with line items, GST, status, and a printable view.
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, statusChip, readForm } from '../ui.js';
import { field, input, textarea, select, row, formActions } from '../form.js';
import { escapeHtml, money, fmtDate, byNewest, sum, indexById } from '../util.js';
import { settings, currency, updateSettings } from '../state.js';
import { shareText } from '../share.js';
import { navigate, start } from '../router.js';

export const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];
const STATUS_CLASS = { Draft: 'neutral', Sent: 'info', Accepted: 'done', Rejected: 'warn', Expired: 'neutral' };

// ---- money math -----------------------------------------------------------
export function quoteTotals(q) {
  const subtotal = sum(q.items || [], (i) => (Number(i.qty) || 0) * (Number(i.rate) || 0));
  const discount = Number(q.discount) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const taxAmt = taxable * (Number(q.taxRate) || 0) / 100;
  const total = taxable + taxAmt;
  return { subtotal, discount, taxable, taxAmt, total };
}

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const [quotes, clients] = await Promise.all([db.list('quotes'), db.list('clients')]);
  const cmap = indexById(clients);
  const list = quotes.sort(byNewest);
  const cur = currency();
  const outstanding = sum(list.filter((q) => ['Draft', 'Sent'].includes(q.status)), (q) => q.total);

  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Quotes</h1><p class="muted">${list.length} total · ${money(outstanding, cur)} open</p></div>
      <button class="btn btn--primary" id="add">+ Quote</button>
    </div>
    ${list.length ? `<div class="card-list">${list.map((q) => `
      <button class="item" data-open="${q.id}">
        <span class="item__main">
          <span class="item__title">${escapeHtml(q.number || 'Quote')}</span>
          <span class="item__sub">${escapeHtml(cmap.get(q.clientId)?.name || 'No client')} · ${fmtDate(q.date)}</span>
        </span>
        <span class="item__right">${statusChip(q.status, STATUS_CLASS)}<span class="item__amt">${money(q.total || 0, cur)}</span></span>
      </button>`).join('')}</div>`
      : emptyState('🧾', 'No quotes yet', 'Create an estimate you can print or share as PDF.')}
  `;
  outlet.querySelector('#add').addEventListener('click', () => editQuote());
  outlet.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('quotes/' + el.getAttribute('data-open'))));
}

async function renderDetail(outlet, id) {
  const q = await db.get('quotes', id);
  if (!q) { outlet.innerHTML = emptyState('🔍', 'Quote not found'); return; }
  const [clients, projects] = await Promise.all([db.list('clients'), db.list('projects')]);
  const client = clients.find((c) => c.id === q.clientId);
  const project = projects.find((p) => p.id === q.projectId);
  const cur = currency();
  const t = quoteTotals(q);

  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Quotes</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="share">Share</button>
        <button class="btn btn--ghost btn--sm" id="print">Print / PDF</button>
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <div class="quote-top">
      <h1>${escapeHtml(q.number || 'Quote')}</h1>
      ${statusChip(q.status, STATUS_CLASS)}
    </div>
    <div class="meta-line muted small">
      ${client ? escapeHtml(client.name) : 'No client'} ·
      ${fmtDate(q.date)}${q.validUntil ? ` · valid till ${fmtDate(q.validUntil)}` : ''}
      ${project ? ` · ${escapeHtml(project.title)}` : ''}
    </div>

    <div class="status-picker" id="statusPicker">
      ${STATUSES.map((sname) => `<button class="pill ${sname === q.status ? 'pill--on' : ''}" data-status="${sname}">${sname}</button>`).join('')}
    </div>

    <table class="line-table">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${(q.items || []).map((i) => `<tr>
          <td>${escapeHtml(i.desc)}</td>
          <td class="num">${Number(i.qty) || 0}</td>
          <td class="num">${money(i.rate || 0, cur)}</td>
          <td class="num">${money((Number(i.qty) || 0) * (Number(i.rate) || 0), cur)}</td>
        </tr>`).join('') || `<tr><td colspan="4" class="muted">No line items</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
      ${t.discount ? `<div><span>Discount</span><span>− ${money(t.discount, cur)}</span></div>` : ''}
      <div><span>GST (${Number(q.taxRate) || 0}%)</span><span>${money(t.taxAmt, cur)}</span></div>
      <div class="totals__grand"><span>Total</span><span>${money(t.total, cur)}</span></div>
    </div>
    ${q.notes ? `<div class="note-box">${escapeHtml(q.notes)}</div>` : ''}

    <div class="quick-row">
      <button class="btn btn--primary btn--sm" id="toInvoice">→ Convert to invoice</button>
    </div>
  `;

  outlet.querySelector('#back').addEventListener('click', () => navigate('quotes'));
  outlet.querySelector('#edit').addEventListener('click', () => editQuote(q));
  outlet.querySelector('#print').addEventListener('click', () => printQuote(q, client, project));
  outlet.querySelector('#share').addEventListener('click', () => shareQuote(q, client));
  outlet.querySelector('#toInvoice').addEventListener('click', async () => {
    if (await confirmDialog('Create an invoice from this quote? You can edit it afterwards.', { danger: false, okLabel: 'Create invoice' })) {
      (await import('./invoices.js')).invoiceFromQuote(q);
    }
  });
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog(`Delete ${q.number || 'this quote'}?`)) {
      await db.remove('quotes', id); toast('Quote deleted'); navigate('quotes');
    }
  });
  outlet.querySelectorAll('[data-status]').forEach((el) => el.addEventListener('click', async () => {
    await db.save('quotes', { ...q, status: el.getAttribute('data-status') });
    toast('Status updated');
    start();
  }));
}

// ---- editor (with dynamic line items) -------------------------------------
export async function editQuote(preset = {}) {
  const q = preset.id ? preset : {
    items: [{ desc: '', qty: 1, rate: 0 }],
    date: new Date().toISOString().slice(0, 10),
    status: 'Draft',
    taxRate: settings().taxRate,
    ...preset,
  };
  const isNew = !q.id;
  const [clients, projects] = await Promise.all([db.list('clients'), db.list('projects')]);

  const s = openSheet({
    wide: true,
    title: isNew ? 'New quote' : 'Edit quote',
    body: `<form id="f" class="form">
      ${row(
        field('Client', select('clientId', q.clientId, clients.map((c) => ({ value: c.id, label: c.name })), { placeholder: 'No client' })),
        field('Project', select('projectId', q.projectId, projects.map((p) => ({ value: p.id, label: p.title })), { placeholder: 'No project' })),
      )}
      ${row(
        field('Date', input('date', q.date, { type: 'date' })),
        field('Valid until', input('validUntil', q.validUntil, { type: 'date' })),
      )}
      <div class="field__label">Line items</div>
      <div id="items"></div>
      <button type="button" class="btn btn--soft btn--sm" id="addItem">+ Add item</button>
      ${row(
        field('Discount', input('discount', q.discount, { type: 'number', min: 0, step: '100' })),
        field('GST %', input('taxRate', q.taxRate, { type: 'number', min: 0, step: '0.5' })),
      )}
      ${field('Notes', textarea('notes', q.notes, { placeholder: 'Terms, inclusions, payment schedule…' }))}
      <div class="totals" id="liveTotals"></div>
      ${formActions(isNew ? 'Create quote' : 'Save')}
    </form>`,
  });

  const form = s.root.querySelector('#f');
  const itemsHost = form.querySelector('#items');

  function itemRow(item = { desc: '', qty: 1, rate: 0 }) {
    const div = document.createElement('div');
    div.className = 'item-edit';
    div.innerHTML = `
      <input class="control" data-k="desc" placeholder="Description" value="${escapeHtml(item.desc)}">
      <input class="control control--qty" data-k="qty" type="number" min="0" step="1" placeholder="Qty" value="${item.qty ?? ''}">
      <input class="control control--rate" data-k="rate" type="number" min="0" step="1" placeholder="Rate" value="${item.rate ?? ''}">
      <button type="button" class="icon-btn" data-rm aria-label="Remove">✕</button>`;
    div.querySelector('[data-rm]').addEventListener('click', () => { div.remove(); recompute(); });
    div.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', recompute));
    return div;
  }
  function collectItems() {
    return Array.from(itemsHost.children).map((d) => ({
      desc: d.querySelector('[data-k="desc"]').value,
      qty: Number(d.querySelector('[data-k="qty"]').value) || 0,
      rate: Number(d.querySelector('[data-k="rate"]').value) || 0,
    })).filter((i) => i.desc || i.qty || i.rate);
  }
  function recompute() {
    const cur = currency();
    const draft = { items: collectItems(), discount: Number(form.discount.value) || 0, taxRate: Number(form.taxRate.value) || 0 };
    const t = quoteTotals(draft);
    form.querySelector('#liveTotals').innerHTML = `
      <div><span>Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
      ${t.discount ? `<div><span>Discount</span><span>− ${money(t.discount, cur)}</span></div>` : ''}
      <div><span>GST</span><span>${money(t.taxAmt, cur)}</span></div>
      <div class="totals__grand"><span>Total</span><span>${money(t.total, cur)}</span></div>`;
  }

  (q.items && q.items.length ? q.items : [{ desc: '', qty: 1, rate: 0 }])
    .forEach((it) => itemsHost.appendChild(itemRow(it)));
  form.querySelector('#addItem').addEventListener('click', () => { itemsHost.appendChild(itemRow()); recompute(); });
  form.discount.addEventListener('input', recompute);
  form.taxRate.addEventListener('input', recompute);
  recompute();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = readForm(form);
    const items = collectItems();
    let number = q.number;
    if (isNew) {
      const st = settings();
      number = `${st.quotePrefix || 'QT-'}${String(st.quoteSeq || 1).padStart(4, '0')}`;
      await updateSettings({ quoteSeq: (st.quoteSeq || 1) + 1 });
    }
    const rec = { ...q, ...base, items, number };
    rec.total = quoteTotals(rec).total; // denormalized for fast lists
    await db.save('quotes', rec);
    closeSheet();
    toast(isNew ? 'Quote created' : 'Saved');
    start();
  });
}

// ---- share ----------------------------------------------------------------
function shareQuote(q, client) {
  const cur = currency();
  const t = quoteTotals(q);
  const st = settings();
  const text = [
    `${st.businessName || 'Your Studio'} — Quote ${q.number}`,
    client ? `For: ${client.name}` : '',
    `Date: ${fmtDate(q.date)}${q.validUntil ? ` · Valid till: ${fmtDate(q.validUntil)}` : ''}`,
    `Estimate: ${money(t.total, cur)} (incl. GST)`,
    q.notes ? `\n${q.notes}` : '',
  ].filter(Boolean).join('\n');
  shareText({ title: `Quote ${q.number}`, text, contact: client || {} });
}

// ---- printable view -------------------------------------------------------
function printQuote(q, client, project) {
  const cur = currency();
  const st = settings();
  const t = quoteTotals(q);
  const area = document.getElementById('print-area') || (() => {
    const d = document.createElement('div'); d.id = 'print-area'; document.body.appendChild(d); return d;
  })();
  area.innerHTML = `
    <div class="pq">
      <div class="pq__head">
        <div>
          <div class="pq__brand">${escapeHtml(st.businessName || 'Your Studio')}</div>
          <div class="pq__muted">${escapeHtml(st.address || '')}</div>
          <div class="pq__muted">${escapeHtml([st.phone, st.email].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="pq__title">QUOTATION</div>
      </div>
      <div class="pq__meta">
        <div><strong>${escapeHtml(q.number || '')}</strong><br>Date: ${fmtDate(q.date)}${q.validUntil ? `<br>Valid until: ${fmtDate(q.validUntil)}` : ''}</div>
        <div class="pq__to">
          <div class="pq__muted">Prepared for</div>
          <strong>${escapeHtml(client?.name || '')}</strong>
          ${client?.company ? `<br>${escapeHtml(client.company)}` : ''}
          ${client?.address ? `<br>${escapeHtml(client.address)}` : ''}
          ${project ? `<br><span class="pq__muted">Project: ${escapeHtml(project.title)}</span>` : ''}
        </div>
      </div>
      <table class="pq__table">
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${(q.items || []).map((i) => `<tr>
          <td>${escapeHtml(i.desc)}</td><td class="num">${Number(i.qty) || 0}</td>
          <td class="num">${money(i.rate || 0, cur)}</td>
          <td class="num">${money((Number(i.qty) || 0) * (Number(i.rate) || 0), cur)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="pq__totals">
        <div><span>Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
        ${t.discount ? `<div><span>Discount</span><span>− ${money(t.discount, cur)}</span></div>` : ''}
        <div><span>GST (${Number(q.taxRate) || 0}%)</span><span>${money(t.taxAmt, cur)}</span></div>
        <div class="pq__grand"><span>Total</span><span>${money(t.total, cur)}</span></div>
      </div>
      ${q.notes ? `<div class="pq__notes"><strong>Notes</strong><br>${escapeHtml(q.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="pq__foot">Thank you. — ${escapeHtml(st.businessName || 'Your Studio')}</div>
    </div>`;
  document.body.classList.add('printing');
  const cleanup = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 60);
}
