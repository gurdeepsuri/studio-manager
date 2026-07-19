// ============================================================================
// projects.js — the studio's work. Each project carries its own client details
// (clients were merged in), plus rollups of invoices, quotes and expenses.
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, statusChip, readForm } from '../ui.js';
import { field, input, textarea, select, row, formActions } from '../form.js';
import { escapeHtml, money, moneyShort, fmtDate, byNewest, sum, waNumber } from '../util.js';
import { currency } from '../state.js';
import { invoiceTotals as invTotals, displayStatus as invStatus } from './invoices.js';
import { navigate, start } from '../router.js';

export const STATUSES = ['Lead', 'Active', 'On Hold', 'Completed', 'Cancelled'];
export const TYPES = ['Interior', 'Architecture', 'Turnkey', 'Renovation', 'Consultation'];
const STATUS_CLASS = {
  Lead: 'info', Active: 'go', 'On Hold': 'warn', Completed: 'done', Cancelled: 'neutral',
};

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const projects = (await db.list('projects')).sort(byNewest);
  const active = projects.filter((p) => !['Completed', 'Cancelled'].includes(p.status));
  const closed = projects.filter((p) => ['Completed', 'Cancelled'].includes(p.status));
  const cur = currency();

  const card = (p) => `<button class="item" data-open="${p.id}">
    <span class="item__main">
      <span class="item__title">${escapeHtml(p.title)}</span>
      <span class="item__sub">${escapeHtml(p.clientName || 'No client')}${p.type ? ' · ' + escapeHtml(p.type) : ''}</span>
    </span>
    <span class="item__right">
      ${statusChip(p.status, STATUS_CLASS)}
      ${p.budget ? `<span class="item__amt">${moneyShort(p.budget, cur)}</span>` : ''}
    </span>
  </button>`;

  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Projects</h1><p class="muted">${active.length} active · ${projects.length} total</p></div>
      <button class="btn btn--primary" id="add">+ Project</button>
    </div>
    ${!projects.length ? emptyState('📐', 'No projects yet', 'A project holds the client, quotes, invoices and expenses for one job.') : ''}
    ${active.length ? `<div class="card-list">${active.map(card).join('')}</div>` : ''}
    ${closed.length ? `<h2 class="section-title">Closed</h2><div class="card-list">${closed.map(card).join('')}</div>` : ''}
  `;
  outlet.querySelector('#add').addEventListener('click', () => editProject());
  outlet.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('projects/' + el.getAttribute('data-open'))));
}

async function renderDetail(outlet, id) {
  const p = await db.get('projects', id);
  if (!p) { outlet.innerHTML = emptyState('🔍', 'Project not found'); return; }
  const [quotes, invoices, expenses, appts] = await Promise.all([
    db.list('quotes'), db.list('invoices'), db.list('expenses'), db.list('appointments'),
  ]);
  const pQuotes = quotes.filter((q) => q.projectId === id).sort(byNewest);
  const pInv = invoices.filter((i) => i.projectId === id).sort(byNewest);
  const pExp = expenses.filter((e) => e.projectId === id).sort(byNewest);
  const pAppts = appts.filter((a) => a.projectId === id).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  const cur = currency();

  const outInv = pInv.filter((i) => (i.direction || 'out') === 'out');
  const received = sum(outInv, (i) => invTotals(i).paid);
  const spent = sum(pExp, (e) => e.amount);
  const profit = received - spent;
  const wa = waNumber(p.clientPhone);

  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Projects</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <h1>${escapeHtml(p.title)}</h1>
    <div class="meta-line">
      ${statusChip(p.status, STATUS_CLASS)}
      ${p.type ? `<span class="chip chip--neutral">${escapeHtml(p.type)}</span>` : ''}
    </div>
    <div class="dates-line muted small">
      ${p.startDate ? `Start ${fmtDate(p.startDate)}` : ''}${p.targetDate ? ` · Target ${fmtDate(p.targetDate)}` : ''}
    </div>

    ${p.clientName || p.clientPhone || p.clientEmail ? `
      <div class="client-card">
        <div class="client-card__name">${escapeHtml(p.clientName || 'Client')}${p.clientCompany ? ` · ${escapeHtml(p.clientCompany)}` : ''}</div>
        <div class="quick-row">
          ${p.clientPhone ? `<a class="btn btn--soft btn--sm" href="tel:${escapeHtml(p.clientPhone)}">📞 Call</a>` : ''}
          ${wa ? `<a class="btn btn--soft btn--sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
          ${p.clientEmail ? `<a class="btn btn--soft btn--sm" href="mailto:${escapeHtml(p.clientEmail)}">✉️ Email</a>` : ''}
        </div>
        ${p.clientAddress ? `<div class="muted small">${escapeHtml(p.clientAddress)}</div>` : ''}
      </div>` : ''}

    ${p.description ? `<div class="note-box">${escapeHtml(p.description)}</div>` : ''}

    <div class="stat-grid">
      <div class="stat"><span class="stat__label">Received</span><span class="stat__val">${moneyShort(received, cur)}</span></div>
      <div class="stat"><span class="stat__label">Expenses</span><span class="stat__val">${moneyShort(spent, cur)}</span></div>
      <div class="stat"><span class="stat__label">Profit</span><span class="stat__val" style="color:${profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${profit < 0 ? '−' : ''}${moneyShort(Math.abs(profit), cur)}</span></div>
      <div class="stat"><span class="stat__label">Budget</span><span class="stat__val">${p.budget ? moneyShort(p.budget, cur) : '—'}</span></div>
    </div>

    <div class="quick-row">
      <button class="btn btn--soft btn--sm" data-add="invoice">+ Invoice</button>
      <button class="btn btn--soft btn--sm" data-add="quote">+ Quote</button>
      <button class="btn btn--soft btn--sm" data-add="expense">+ Expense</button>
      <button class="btn btn--soft btn--sm" data-add="appt">+ Meeting</button>
    </div>

    <h2 class="section-title">Invoices (${pInv.length})</h2>
    ${pInv.length ? `<div class="card-list">${pInv.map((i) => `
      <button class="item" data-invoice="${i.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(i.number || 'Invoice')}</span>
        <span class="item__sub">${escapeHtml(invStatus(i))} · ${fmtDate(i.date)}</span></span>
        <span class="item__amt">${money(invTotals(i).total, cur)}</span></button>`).join('')}</div>`
      : `<p class="muted small">No invoices.</p>`}

    <h2 class="section-title">Quotes (${pQuotes.length})</h2>
    ${pQuotes.length ? `<div class="card-list">${pQuotes.map((q) => `
      <button class="item" data-quote="${q.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(q.number || 'Quote')}</span>
        <span class="item__sub">${escapeHtml(q.status)} · ${fmtDate(q.date)}</span></span>
        <span class="item__amt">${money(q.total || 0, cur)}</span></button>`).join('')}</div>`
      : `<p class="muted small">No quotes.</p>`}

    <h2 class="section-title">Expenses (${pExp.length})</h2>
    ${pExp.length ? `<div class="card-list">${pExp.map((e) => `
      <button class="item" data-expense="${e.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(e.category || 'Expense')}</span>
        <span class="item__sub">${escapeHtml(e.vendor || '')} ${fmtDate(e.date)}</span></span>
        <span class="item__amt">${money(e.amount || 0, cur)}</span></button>`).join('')}</div>`
      : `<p class="muted small">No expenses.</p>`}

    ${pAppts.length ? `<h2 class="section-title">Meetings (${pAppts.length})</h2>
    <div class="card-list">${pAppts.map((a) => `
      <button class="item" data-appt="${a.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(a.title)}</span>
        <span class="item__sub">${fmtDate(a.datetime)}</span></span>
        <span class="item__chev">›</span></button>`).join('')}</div>` : ''}
  `;

  outlet.querySelector('#back').addEventListener('click', () => navigate('projects'));
  outlet.querySelector('#edit').addEventListener('click', () => editProject(p));
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog(`Delete project "${p.title}"?`)) {
      await db.remove('projects', id); toast('Project deleted'); navigate('projects');
    }
  });
  outlet.querySelectorAll('[data-invoice]').forEach((el) =>
    el.addEventListener('click', () => navigate('invoices/' + el.getAttribute('data-invoice'))));
  outlet.querySelectorAll('[data-quote]').forEach((el) =>
    el.addEventListener('click', () => navigate('quotes/' + el.getAttribute('data-quote'))));
  outlet.querySelectorAll('[data-expense]').forEach((el) =>
    el.addEventListener('click', () => navigate('expenses/' + el.getAttribute('data-expense'))));
  outlet.querySelectorAll('[data-appt]').forEach((el) =>
    el.addEventListener('click', () => navigate('appointments/' + el.getAttribute('data-appt'))));

  outlet.querySelectorAll('[data-add]').forEach((el) => el.addEventListener('click', async () => {
    const kind = el.getAttribute('data-add');
    if (kind === 'invoice') (await import('./invoices.js')).editInvoice({ projectId: p.id, partyType: 'client' });
    if (kind === 'quote') (await import('./quotes.js')).editQuote({ projectId: p.id, partyType: 'client' });
    if (kind === 'expense') (await import('./expenses.js')).editExpense({ projectId: p.id });
    if (kind === 'appt') (await import('./appointments.js')).editAppt({ projectId: p.id });
  }));
}

export async function editProject(p = {}) {
  const isNew = !p.id;
  const s = openSheet({
    wide: true,
    title: isNew ? 'New project' : 'Edit project',
    body: `<form id="f" class="form">
      ${field('Project title', input('title', p.title, { required: true, placeholder: 'e.g. Whitefield 3BHK interiors' }))}
      ${row(
        field('Type', select('type', p.type, TYPES, { placeholder: 'Type' })),
        field('Status', select('status', p.status || 'Lead', STATUSES)),
      )}
      ${row(
        field('Start', input('startDate', p.startDate, { type: 'date' })),
        field('Target', input('targetDate', p.targetDate, { type: 'date' })),
      )}
      ${field('Budget', input('budget', p.budget, { type: 'number', min: 0, step: '1000', placeholder: '0' }))}
      ${field('Description', textarea('description', p.description, { rows: 3 }))}

      <div class="field__label" style="margin-top:.4rem">Client</div>
      ${row(
        field('Name', input('clientName', p.clientName, { placeholder: 'Client name' })),
        field('Company', input('clientCompany', p.clientCompany, { placeholder: 'Optional' })),
      )}
      ${row(
        field('Phone', input('clientPhone', p.clientPhone, { type: 'tel', placeholder: '+91…' })),
        field('Email', input('clientEmail', p.clientEmail, { type: 'email' })),
      )}
      ${field('Address', textarea('clientAddress', p.clientAddress, { rows: 2, placeholder: 'Appears on quotes & invoices' }))}
      ${formActions(isNew ? 'Add project' : 'Save')}
    </form>`,
  });
  const form = s.root.querySelector('#f');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!data.title.trim()) return;
    await db.save('projects', { ...p, ...data });
    closeSheet();
    toast(isNew ? 'Project added' : 'Saved');
    start();
  });
}
