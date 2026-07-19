// ============================================================================
// dashboard.js — the home screen: today at a glance + quick actions.
// ============================================================================

import { db } from '../db.js';
import { emptyState } from '../ui.js';
import { escapeHtml, money, moneyShort, fmtTime, relDay, sum, indexById, startOfWeek, startOfMonth } from '../util.js';
import { settings, currency } from '../state.js';
import { invoiceTotals, displayStatus } from './invoices.js';
import { navigate } from '../router.js';

export async function render(outlet) {
  const [projects, quotes, invoices, appts, expenses, time, clients] = await Promise.all([
    db.list('projects'), db.list('quotes'), db.list('invoices'), db.list('appointments'),
    db.list('expenses'), db.list('timeEntries'), db.list('clients'),
  ]);
  const cmap = indexById(clients);
  const cur = currency();
  const st = settings();
  const now = Date.now();

  const activeProjects = projects.filter((p) => p.status === 'Active');
  const leads = projects.filter((p) => p.status === 'Lead');
  const liveInv = invoices.filter((i) => !['Draft', 'Cancelled'].includes(i.status));
  const outstanding = sum(liveInv, (i) => invoiceTotals(i).balance);
  const overdue = invoices.filter((i) => displayStatus(i) === 'Overdue');
  const weekHours = sum(time.filter((t) => new Date(t.date) >= startOfWeek()), (t) => t.hours);
  const monthExp = sum(expenses.filter((e) => new Date(e.date) >= startOfMonth()), (e) => e.amount);

  const upcoming = appts
    .map((a) => ({ ...a, ts: new Date(a.datetime).getTime() }))
    .filter((a) => a.ts >= now - 3600000 && a.status !== 'Cancelled')
    .sort((a, b) => a.ts - b.ts).slice(0, 4);

  const isEmpty = !projects.length && !quotes.length && !appts.length && !clients.length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = st.owner ? st.owner.split(' ')[0] : '';

  outlet.innerHTML = `
    <div class="hello">
      <p class="muted">${greet}${name ? ', ' + escapeHtml(name) : ''}</p>
      <h1>${escapeHtml(st.businessName || 'Studio Manager')}</h1>
    </div>

    <div class="stat-grid stat-grid--4">
      <button class="stat stat--tap" data-go="projects"><span class="stat__label">Active projects</span><span class="stat__val">${activeProjects.length}</span><span class="stat__foot">${leads.length} leads</span></button>
      <button class="stat stat--tap" data-go="invoices"><span class="stat__label">Outstanding</span><span class="stat__val">${moneyShort(outstanding, cur)}</span>${overdue.length ? `<span class="stat__foot" style="color:var(--danger)">${overdue.length} overdue</span>` : ''}</button>
      <button class="stat stat--tap" data-go="time"><span class="stat__label">Hours this week</span><span class="stat__val">${weekHours.toFixed(1)}</span></button>
      <button class="stat stat--tap" data-go="expenses"><span class="stat__label">Spend this month</span><span class="stat__val">${moneyShort(monthExp, cur)}</span></button>
    </div>

    ${isEmpty ? emptyState('✨', 'Welcome to your studio manager', 'Start by adding a client or a project — everything else links back to them.') : ''}

    ${overdue.length ? `<div class="alert-banner" data-go="invoices">
      <span>⚠️ ${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''} · ${money(sum(overdue, (i) => invoiceTotals(i).balance), cur)} due</span>
      <span class="item__chev">›</span>
    </div>` : ''}

    <div class="dash-block">
      <div class="dash-block__head"><h2 class="section-title">Up next</h2><button class="link-more" data-go="appointments">All</button></div>
      ${upcoming.length ? `<div class="card-list">${upcoming.map((a) => `
        <button class="item" data-appt="${a.id}">
          <span class="appt-when"><span class="appt-when__day">${relDay(a.datetime)}</span><span class="appt-when__time">${fmtTime(a.datetime)}</span></span>
          <span class="item__main"><span class="item__title">${escapeHtml(a.title)}</span>
          <span class="item__sub">${escapeHtml(cmap.get(a.clientId)?.name || a.location || a.type || '')}</span></span>
          <span class="item__chev">›</span>
        </button>`).join('')}</div>` : `<p class="muted small">Nothing scheduled.</p>`}
    </div>

    ${activeProjects.length ? `<div class="dash-block">
      <div class="dash-block__head"><h2 class="section-title">Active projects</h2><button class="link-more" data-go="projects">All</button></div>
      <div class="card-list">${activeProjects.slice(0, 4).map((p) => `
        <button class="item" data-project="${p.id}">
          <span class="item__main"><span class="item__title">${escapeHtml(p.title)}</span>
          <span class="item__sub">${escapeHtml(cmap.get(p.clientId)?.name || 'No client')}</span></span>
          ${p.budget ? `<span class="item__amt">${moneyShort(p.budget, cur)}</span>` : '<span class="item__chev">›</span>'}
        </button>`).join('')}</div>
    </div>` : ''}

    <h2 class="section-title">Quick add</h2>
    <div class="quick-grid">
      <button class="quick-tile" data-add="client"><span>👥</span>Client</button>
      <button class="quick-tile" data-add="project"><span>📐</span>Project</button>
      <button class="quick-tile" data-add="quote"><span>🧾</span>Quote</button>
      <button class="quick-tile" data-add="invoice"><span>📄</span>Invoice</button>
      <button class="quick-tile" data-add="appt"><span>📅</span>Meeting</button>
      <button class="quick-tile" data-add="expense"><span>💸</span>Expense</button>
      <button class="quick-tile" data-add="time"><span>⏱️</span>Hours</button>
      <button class="quick-tile" data-add="vendor"><span>🧰</span>Vendor</button>
    </div>
  `;

  outlet.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => navigate(el.getAttribute('data-go'))));
  outlet.querySelectorAll('[data-appt]').forEach((el) => el.addEventListener('click', () => navigate('appointments/' + el.getAttribute('data-appt'))));
  outlet.querySelectorAll('[data-project]').forEach((el) => el.addEventListener('click', () => navigate('projects/' + el.getAttribute('data-project'))));
  outlet.querySelectorAll('[data-add]').forEach((el) => el.addEventListener('click', async () => {
    const kind = el.getAttribute('data-add');
    if (kind === 'client') (await import('./clients.js')).editClient();
    if (kind === 'project') (await import('./projects.js')).editProject();
    if (kind === 'quote') (await import('./quotes.js')).editQuote();
    if (kind === 'invoice') (await import('./invoices.js')).editInvoice();
    if (kind === 'appt') (await import('./appointments.js')).editAppt();
    if (kind === 'expense') (await import('./expenses.js')).editExpense();
    if (kind === 'time') (await import('./time.js')).editTime();
    if (kind === 'vendor') (await import('./vendors.js')).editVendor();
  }));
}
