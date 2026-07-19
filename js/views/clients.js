// ============================================================================
// clients.js — client directory + detail (linked projects / quotes / meetings)
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, readForm } from '../ui.js';
import { field, input, textarea, formActions } from '../form.js';
import { escapeHtml, initials, money, fmtDate, byNewest } from '../util.js';
import { currency } from '../state.js';
import { invoiceTotals as invTotals, displayStatus as invStatus } from './invoices.js';
import { navigate } from '../router.js';

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const clients = (await db.list('clients')).sort(byNewest);
  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Clients</h1><p class="muted">${clients.length} total</p></div>
      <button class="btn btn--primary" id="add">+ Client</button>
    </div>
    ${clients.length ? `<div class="card-list">${clients.map(clientCard).join('')}</div>`
      : emptyState('👥', 'No clients yet', 'Add your first client to start tracking projects and quotes.')}
  `;
  outlet.querySelector('#add').addEventListener('click', () => editClient());
  outlet.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('clients/' + el.getAttribute('data-open'))));
}

function clientCard(c) {
  return `<button class="item" data-open="${c.id}">
    <span class="avatar">${escapeHtml(initials(c.name))}</span>
    <span class="item__main">
      <span class="item__title">${escapeHtml(c.name)}</span>
      <span class="item__sub">${escapeHtml(c.company || c.phone || c.email || '—')}</span>
    </span>
    <span class="item__chev">›</span>
  </button>`;
}

async function renderDetail(outlet, id) {
  const c = await db.get('clients', id);
  if (!c) { outlet.innerHTML = emptyState('🔍', 'Client not found'); return; }
  const [projects, quotes, invoices, appts] = await Promise.all([
    db.list('projects'), db.list('quotes'), db.list('invoices'), db.list('appointments'),
  ]);
  const mine = projects.filter((p) => p.clientId === id).sort(byNewest);
  const myQuotes = quotes.filter((q) => q.clientId === id).sort(byNewest);
  const myInv = invoices.filter((i) => i.clientId === id).sort(byNewest);
  const myAppts = appts.filter((a) => a.clientId === id).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  const cur = currency();

  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Clients</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <div class="profile">
      <span class="avatar avatar--lg">${escapeHtml(initials(c.name))}</span>
      <div>
        <h1>${escapeHtml(c.name)}</h1>
        ${c.company ? `<p class="muted">${escapeHtml(c.company)}</p>` : ''}
      </div>
    </div>
    <div class="contact-grid">
      ${c.phone ? `<a class="contact-cell" href="tel:${escapeHtml(c.phone)}"><span>📞</span>${escapeHtml(c.phone)}</a>` : ''}
      ${c.email ? `<a class="contact-cell" href="mailto:${escapeHtml(c.email)}"><span>✉️</span>${escapeHtml(c.email)}</a>` : ''}
      ${c.address ? `<div class="contact-cell"><span>📍</span>${escapeHtml(c.address)}</div>` : ''}
    </div>
    ${c.notes ? `<div class="note-box">${escapeHtml(c.notes)}</div>` : ''}

    <h2 class="section-title">Projects (${mine.length})</h2>
    ${mine.length ? `<div class="card-list">${mine.map((p) => `
      <button class="item" data-project="${p.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(p.title)}</span>
        <span class="item__sub">${escapeHtml(p.status || '')}</span></span>
        <span class="item__chev">›</span>
      </button>`).join('')}</div>` : `<p class="muted small">No projects.</p>`}

    <h2 class="section-title">Quotes (${myQuotes.length})</h2>
    ${myQuotes.length ? `<div class="card-list">${myQuotes.map((q) => `
      <button class="item" data-quote="${q.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(q.number || 'Quote')}</span>
        <span class="item__sub">${escapeHtml(q.status || '')} · ${fmtDate(q.date)}</span></span>
        <span class="item__amt">${money(q.total || 0, cur)}</span>
      </button>`).join('')}</div>` : `<p class="muted small">No quotes.</p>`}

    <h2 class="section-title">Invoices (${myInv.length})</h2>
    ${myInv.length ? `<div class="card-list">${myInv.map((i) => `
      <button class="item" data-invoice="${i.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(i.number || 'Invoice')}</span>
        <span class="item__sub">${escapeHtml(invStatus(i))} · ${fmtDate(i.date)}</span></span>
        <span class="item__amt">${money(invTotals(i).total || 0, cur)}</span>
      </button>`).join('')}</div>` : `<p class="muted small">No invoices.</p>`}

    <h2 class="section-title">Meetings (${myAppts.length})</h2>
    ${myAppts.length ? `<div class="card-list">${myAppts.map((a) => `
      <button class="item" data-appt="${a.id}">
        <span class="item__main"><span class="item__title">${escapeHtml(a.title)}</span>
        <span class="item__sub">${fmtDate(a.datetime)}</span></span>
        <span class="item__chev">›</span>
      </button>`).join('')}</div>` : `<p class="muted small">No meetings.</p>`}
  `;

  outlet.querySelector('#back').addEventListener('click', () => navigate('clients'));
  outlet.querySelector('#edit').addEventListener('click', () => editClient(c));
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog(`Delete ${c.name}? Their projects, quotes and meetings will stay but lose the link.`)) {
      await db.remove('clients', id);
      toast('Client deleted');
      navigate('clients');
    }
  });
  outlet.querySelectorAll('[data-project]').forEach((el) =>
    el.addEventListener('click', () => navigate('projects/' + el.getAttribute('data-project'))));
  outlet.querySelectorAll('[data-quote]').forEach((el) =>
    el.addEventListener('click', () => navigate('quotes/' + el.getAttribute('data-quote'))));
  outlet.querySelectorAll('[data-invoice]').forEach((el) =>
    el.addEventListener('click', () => navigate('invoices/' + el.getAttribute('data-invoice'))));
  outlet.querySelectorAll('[data-appt]').forEach((el) =>
    el.addEventListener('click', () => navigate('appointments/' + el.getAttribute('data-appt'))));
}

export function editClient(c = {}) {
  const isNew = !c.id;
  const s = openSheet({
    title: isNew ? 'New client' : 'Edit client',
    body: `<form id="f" class="form">
      ${field('Name', input('name', c.name, { required: true, placeholder: 'Full name' }))}
      ${field('Company', input('company', c.company, { placeholder: 'Company (optional)' }))}
      ${field('Phone', input('phone', c.phone, { type: 'tel', placeholder: '+91…' }))}
      ${field('Email', input('email', c.email, { type: 'email' }))}
      ${field('Address', textarea('address', c.address, { rows: 2 }))}
      ${field('Notes', textarea('notes', c.notes, { placeholder: 'Anything worth remembering' }))}
      ${formActions(isNew ? 'Add client' : 'Save')}
    </form>`,
  });
  const form = s.root.querySelector('#f');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!data.name.trim()) return;
    await db.save('clients', { ...c, ...data });
    closeSheet();
    toast(isNew ? 'Client added' : 'Saved');
    // re-render current route
    const { start } = await import('../router.js');
    start();
  });
}
