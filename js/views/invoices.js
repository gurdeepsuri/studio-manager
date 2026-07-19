// ============================================================================
// invoices.js — invoices with payment tracking, printable view and sharing.
// Can be created from scratch or converted from an accepted quote.
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, statusChip, readForm } from '../ui.js';
import { field, input, textarea, select, row, formActions } from '../form.js';
import { escapeHtml, money, fmtDate, todayISO, byNewest, sum, indexById, uid, addDays } from '../util.js';
import { settings, currency, updateSettings } from '../state.js';
import { quoteTotals } from './quotes.js';
import { shareText } from '../share.js';
import { navigate, start } from '../router.js';

const PAY_METHODS = ['UPI', 'Bank Transfer', 'Cash', 'Cheque', 'Card', 'Other'];
const STATUS_CLASS = {
  Draft: 'neutral', Sent: 'info', 'Partially Paid': 'warn', Paid: 'done', Overdue: 'warn', Cancelled: 'neutral',
};

// totals + payment rollup + effective status
export function invoiceTotals(inv) {
  const t = quoteTotals(inv);
  const paid = sum(inv.payments || [], (p) => p.amount);
  const balance = Math.max(0, +(t.total - paid).toFixed(2));
  return { ...t, paid, balance };
}
export function displayStatus(inv) {
  if (inv.status === 'Draft' || inv.status === 'Cancelled') return inv.status;
  const { total, paid } = invoiceTotals(inv);
  if (total > 0 && paid >= total) return 'Paid';
  if (paid > 0) return 'Partially Paid';
  if (inv.dueDate && new Date(inv.dueDate) < new Date(todayISO())) return 'Overdue';
  return 'Sent';
}

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const [invoices, clients] = await Promise.all([db.list('invoices'), db.list('clients')]);
  const cmap = indexById(clients);
  const list = invoices.sort(byNewest);
  const cur = currency();
  const totalBilled = sum(list.filter((i) => i.status !== 'Cancelled'), (i) => invoiceTotals(i).total);
  const outstanding = sum(list.filter((i) => !['Draft', 'Cancelled'].includes(i.status)), (i) => invoiceTotals(i).balance);

  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Invoices</h1><p class="muted">${money(outstanding, cur)} outstanding · ${money(totalBilled, cur)} billed</p></div>
      <button class="btn btn--primary" id="add">+ Invoice</button>
    </div>
    ${list.length ? `<div class="card-list">${list.map((inv) => {
      const t = invoiceTotals(inv); const st = displayStatus(inv);
      return `<button class="item" data-open="${inv.id}">
        <span class="item__main">
          <span class="item__title">${escapeHtml(inv.number || 'Invoice')}</span>
          <span class="item__sub">${escapeHtml(cmap.get(inv.clientId)?.name || 'No client')} · ${fmtDate(inv.date)}</span>
        </span>
        <span class="item__right">${statusChip(st, STATUS_CLASS)}
          <span class="item__amt">${money(t.total, cur)}${t.balance > 0 && st !== 'Draft' ? `<span class="bal"> · ${money(t.balance, cur)} due</span>` : ''}</span>
        </span>
      </button>`;
    }).join('')}</div>`
      : emptyState('📄', 'No invoices yet', 'Raise an invoice, or convert an accepted quote into one.')}
  `;
  outlet.querySelector('#add').addEventListener('click', () => editInvoice());
  outlet.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('invoices/' + el.getAttribute('data-open'))));
}

async function renderDetail(outlet, id) {
  const inv = await db.get('invoices', id);
  if (!inv) { outlet.innerHTML = emptyState('🔍', 'Invoice not found'); return; }
  const [clients, projects] = await Promise.all([db.list('clients'), db.list('projects')]);
  const client = clients.find((c) => c.id === inv.clientId);
  const project = projects.find((p) => p.id === inv.projectId);
  const cur = currency();
  const t = invoiceTotals(inv);
  const st = displayStatus(inv);
  const payments = (inv.payments || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Invoices</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="share">Share</button>
        <button class="btn btn--ghost btn--sm" id="print">Print / PDF</button>
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <div class="quote-top"><h1>${escapeHtml(inv.number || 'Invoice')}</h1>${statusChip(st, STATUS_CLASS)}</div>
    <div class="meta-line muted small">
      ${client ? escapeHtml(client.name) : 'No client'} · ${fmtDate(inv.date)}${inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ''}${project ? ` · ${escapeHtml(project.title)}` : ''}
    </div>

    <div class="stat-grid">
      <div class="stat"><span class="stat__label">Total</span><span class="stat__val stat__val--sm">${money(t.total, cur)}</span></div>
      <div class="stat"><span class="stat__label">Paid</span><span class="stat__val stat__val--sm">${money(t.paid, cur)}</span></div>
      <div class="stat"><span class="stat__label">Balance</span><span class="stat__val stat__val--sm" style="color:${t.balance > 0 ? 'var(--danger)' : 'var(--ok)'}">${money(t.balance, cur)}</span></div>
    </div>

    <div class="quick-row">
      ${t.balance > 0 && st !== 'Cancelled' ? `<button class="btn btn--primary btn--sm" id="pay">+ Record payment</button>` : ''}
      ${t.balance > 0 && st !== 'Cancelled' ? `<button class="btn btn--soft btn--sm" id="payFull">Mark fully paid</button>` : ''}
    </div>

    <table class="line-table">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${(inv.items || []).map((i) => `<tr>
        <td>${escapeHtml(i.desc)}</td><td class="num">${Number(i.qty) || 0}</td>
        <td class="num">${money(i.rate || 0, cur)}</td>
        <td class="num">${money((Number(i.qty) || 0) * (Number(i.rate) || 0), cur)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">No line items</td></tr>`}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
      ${t.discount ? `<div><span>Discount</span><span>− ${money(t.discount, cur)}</span></div>` : ''}
      <div><span>GST (${Number(inv.taxRate) || 0}%)</span><span>${money(t.taxAmt, cur)}</span></div>
      <div class="totals__grand"><span>Total</span><span>${money(t.total, cur)}</span></div>
    </div>

    <h2 class="section-title">Payments (${payments.length})</h2>
    ${payments.length ? `<div class="card-list">${payments.map((p) => `
      <div class="item item--static">
        <span class="item__main"><span class="item__title">${money(p.amount, cur)}</span>
        <span class="item__sub">${escapeHtml(p.method || '')} · ${fmtDate(p.date)}${p.note ? ' · ' + escapeHtml(p.note) : ''}</span></span>
        <button class="icon-btn" data-rmpay="${p.id}" aria-label="Remove payment">✕</button>
      </div>`).join('')}</div>` : `<p class="muted small">No payments recorded.</p>`}

    ${inv.notes ? `<div class="note-box">${escapeHtml(inv.notes)}</div>` : ''}
  `;

  outlet.querySelector('#back').addEventListener('click', () => navigate('invoices'));
  outlet.querySelector('#edit').addEventListener('click', () => editInvoice(inv));
  outlet.querySelector('#print').addEventListener('click', () => printInvoice(inv, client, project));
  outlet.querySelector('#share').addEventListener('click', () => shareInvoice(inv, client));
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog(`Delete ${inv.number || 'this invoice'}?`)) { await db.remove('invoices', id); toast('Deleted'); navigate('invoices'); }
  });
  outlet.querySelector('#pay')?.addEventListener('click', () => recordPayment(inv));
  outlet.querySelector('#payFull')?.addEventListener('click', async () => {
    const bal = invoiceTotals(inv).balance;
    const payments = [...(inv.payments || []), { id: uid(), date: todayISO(), amount: bal, method: 'UPI', note: '' }];
    await db.save('invoices', { ...inv, payments });
    toast('Marked as paid'); start();
  });
  outlet.querySelectorAll('[data-rmpay]').forEach((el) => el.addEventListener('click', async () => {
    const pid = el.getAttribute('data-rmpay');
    await db.save('invoices', { ...inv, payments: (inv.payments || []).filter((p) => p.id !== pid) });
    toast('Payment removed'); start();
  }));
}

// ---- record a payment -----------------------------------------------------
function recordPayment(inv) {
  const cur = currency();
  const bal = invoiceTotals(inv).balance;
  const s = openSheet({
    title: 'Record payment',
    body: `<form id="f" class="form">
      <p class="muted small">Balance due: <strong>${money(bal, cur)}</strong></p>
      ${row(
        field('Amount', input('amount', bal, { type: 'number', min: 0, step: '1', required: true })),
        field('Date', input('date', todayISO(), { type: 'date' })),
      )}
      ${row(
        field('Method', select('method', 'UPI', PAY_METHODS)),
        field('Reference', input('note', '', { placeholder: 'UTR / cheque no.' })),
      )}
      ${formActions('Save payment')}
    </form>`,
  });
  const form = s.root.querySelector('#f');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!(Number(data.amount) > 0)) { toast('Enter an amount', 'warn'); return; }
    const payments = [...(inv.payments || []), { id: uid(), ...data }];
    await db.save('invoices', { ...inv, payments });
    closeSheet(); toast('Payment recorded'); start();
  });
}

// ---- editor (shared with convert-from-quote) ------------------------------
export async function editInvoice(preset = {}) {
  const inv = preset.id ? preset : {
    items: [{ desc: '', qty: 1, rate: 0 }],
    date: todayISO(),
    dueDate: todayISO() ? new Date(addDays(new Date(), 15)).toISOString().slice(0, 10) : '',
    status: 'Draft',
    taxRate: settings().taxRate,
    payments: [],
    ...preset,
  };
  const isNew = !inv.id;
  const [clients, projects] = await Promise.all([db.list('clients'), db.list('projects')]);

  const s = openSheet({
    wide: true,
    title: isNew ? 'New invoice' : 'Edit invoice',
    body: `<form id="f" class="form">
      ${row(
        field('Client', select('clientId', inv.clientId, clients.map((c) => ({ value: c.id, label: c.name })), { placeholder: 'No client' })),
        field('Project', select('projectId', inv.projectId, projects.map((p) => ({ value: p.id, label: p.title })), { placeholder: 'No project' })),
      )}
      ${row(
        field('Date', input('date', inv.date, { type: 'date' })),
        field('Due date', input('dueDate', inv.dueDate, { type: 'date' })),
      )}
      ${field('Status', select('status', inv.status, ['Draft', 'Sent', 'Cancelled']))}
      <div class="field__label">Line items</div>
      <div id="items"></div>
      <button type="button" class="btn btn--soft btn--sm" id="addItem">+ Add item</button>
      ${row(
        field('Discount', input('discount', inv.discount, { type: 'number', min: 0, step: '100' })),
        field('GST %', input('taxRate', inv.taxRate, { type: 'number', min: 0, step: '0.5' })),
      )}
      ${field('Notes', textarea('notes', inv.notes, { placeholder: 'Payment terms, bank details…' }))}
      <div class="totals" id="liveTotals"></div>
      ${formActions(isNew ? 'Create invoice' : 'Save')}
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
    div.querySelectorAll('input').forEach((i) => i.addEventListener('input', recompute));
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
    const t = quoteTotals({ items: collectItems(), discount: Number(form.discount.value) || 0, taxRate: Number(form.taxRate.value) || 0 });
    form.querySelector('#liveTotals').innerHTML = `
      <div><span>Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
      ${t.discount ? `<div><span>Discount</span><span>− ${money(t.discount, cur)}</span></div>` : ''}
      <div><span>GST</span><span>${money(t.taxAmt, cur)}</span></div>
      <div class="totals__grand"><span>Total</span><span>${money(t.total, cur)}</span></div>`;
  }
  (inv.items && inv.items.length ? inv.items : [{ desc: '', qty: 1, rate: 0 }]).forEach((it) => itemsHost.appendChild(itemRow(it)));
  form.querySelector('#addItem').addEventListener('click', () => { itemsHost.appendChild(itemRow()); recompute(); });
  form.discount.addEventListener('input', recompute);
  form.taxRate.addEventListener('input', recompute);
  recompute();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = readForm(form);
    const items = collectItems();
    let number = inv.number;
    if (isNew) {
      const st = settings();
      number = `${st.invoicePrefix || 'INV-'}${String(st.invoiceSeq || 1).padStart(4, '0')}`;
      await updateSettings({ invoiceSeq: (st.invoiceSeq || 1) + 1 });
    }
    const rec = { ...inv, ...base, items, number };
    rec.total = invoiceTotals(rec).total; // denormalized for lists
    const saved = await db.save('invoices', rec);
    closeSheet();
    toast(isNew ? 'Invoice created' : 'Saved');
    if (isNew) navigate('invoices/' + saved.id); else start();
  });
}

// ---- convert an accepted quote into an invoice ----------------------------
export async function invoiceFromQuote(q) {
  const st = settings();
  const number = `${st.invoicePrefix || 'INV-'}${String(st.invoiceSeq || 1).padStart(4, '0')}`;
  await updateSettings({ invoiceSeq: (st.invoiceSeq || 1) + 1 });
  const inv = {
    clientId: q.clientId, projectId: q.projectId,
    items: (q.items || []).map((i) => ({ ...i })),
    discount: q.discount, taxRate: q.taxRate,
    notes: q.notes, date: todayISO(),
    dueDate: new Date(addDays(new Date(), 15)).toISOString().slice(0, 10),
    status: 'Sent', payments: [], number, linkedQuoteId: q.id,
  };
  inv.total = invoiceTotals(inv).total;
  const saved = await db.save('invoices', inv);
  toast('Invoice created from quote');
  navigate('invoices/' + saved.id);
}

// ---- share ----------------------------------------------------------------
function shareInvoice(inv, client) {
  const cur = currency();
  const t = invoiceTotals(inv);
  const st = settings();
  const lines = [
    `${st.businessName || 'Your Studio'} — Invoice ${inv.number}`,
    client ? `For: ${client.name}` : '',
    `Date: ${fmtDate(inv.date)}${inv.dueDate ? ` · Due: ${fmtDate(inv.dueDate)}` : ''}`,
    `Amount: ${money(t.total, cur)}`,
    t.paid ? `Paid: ${money(t.paid, cur)} · Balance: ${money(t.balance, cur)}` : '',
    inv.notes ? `\n${inv.notes}` : '',
  ].filter(Boolean).join('\n');
  shareText({ title: `Invoice ${inv.number}`, text: lines, contact: client || {} });
}

// ---- printable view -------------------------------------------------------
function printInvoice(inv, client, project) {
  const cur = currency();
  const st = settings();
  const t = invoiceTotals(inv);
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
        <div class="pq__title">INVOICE</div>
      </div>
      <div class="pq__meta">
        <div><strong>${escapeHtml(inv.number || '')}</strong><br>Date: ${fmtDate(inv.date)}${inv.dueDate ? `<br>Due: ${fmtDate(inv.dueDate)}` : ''}</div>
        <div class="pq__to">
          <div class="pq__muted">Bill to</div>
          <strong>${escapeHtml(client?.name || '')}</strong>
          ${client?.company ? `<br>${escapeHtml(client.company)}` : ''}
          ${client?.address ? `<br>${escapeHtml(client.address)}` : ''}
          ${project ? `<br><span class="pq__muted">Project: ${escapeHtml(project.title)}</span>` : ''}
        </div>
      </div>
      <table class="pq__table">
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${(inv.items || []).map((i) => `<tr>
          <td>${escapeHtml(i.desc)}</td><td class="num">${Number(i.qty) || 0}</td>
          <td class="num">${money(i.rate || 0, cur)}</td>
          <td class="num">${money((Number(i.qty) || 0) * (Number(i.rate) || 0), cur)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="pq__totals">
        <div><span>Subtotal</span><span>${money(t.subtotal, cur)}</span></div>
        ${t.discount ? `<div><span>Discount</span><span>− ${money(t.discount, cur)}</span></div>` : ''}
        <div><span>GST (${Number(inv.taxRate) || 0}%)</span><span>${money(t.taxAmt, cur)}</span></div>
        <div class="pq__grand"><span>Total</span><span>${money(t.total, cur)}</span></div>
        ${t.paid ? `<div><span>Paid</span><span>${money(t.paid, cur)}</span></div><div class="pq__grand"><span>Balance due</span><span>${money(t.balance, cur)}</span></div>` : ''}
      </div>
      ${inv.notes ? `<div class="pq__notes"><strong>Notes</strong><br>${escapeHtml(inv.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="pq__foot">Thank you for your business. — ${escapeHtml(st.businessName || 'Your Studio')}</div>
    </div>`;
  document.body.classList.add('printing');
  const cleanup = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 60);
}
