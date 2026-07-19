// ============================================================================
// reports.js — money in vs out: overall summary, a 6-month trend, and
// per-project profit. Colours validated for colour-blind safety + contrast.
// ============================================================================

import { db } from '../db.js';
import { emptyState } from '../ui.js';
import { escapeHtml, money, moneyShort, sum, startOfMonth } from '../util.js';
import { currency } from '../state.js';
import { invoiceTotals } from './invoices.js';
import { navigate } from '../router.js';

const C_REV = '#2a78d6';  // revenue / received  (validated categorical slot 1)
const C_EXP = '#eb6834';  // expenses            (validated categorical slot 6)

export async function render(outlet) {
  const [invoices, expenses, projects, time] = await Promise.all([
    db.list('invoices'), db.list('expenses'), db.list('projects'), db.list('timeEntries'),
  ]);
  const cur = currency();

  const live = invoices.filter((i) => i.status !== 'Cancelled');
  const invoiced = sum(live, (i) => invoiceTotals(i).total);
  const received = sum(live, (i) => invoiceTotals(i).paid);
  const outstanding = sum(live, (i) => invoiceTotals(i).balance);
  const spent = sum(expenses, (e) => e.amount);
  const net = received - spent;

  if (!invoices.length && !expenses.length) {
    outlet.innerHTML = `<div class="page-head"><div><h1>Reports</h1></div></div>${
      emptyState('📊', 'No numbers yet', 'Create invoices and log expenses to see profit and trends here.')}`;
    return;
  }

  outlet.innerHTML = `
    <div class="page-head"><div><h1>Reports</h1><p class="muted">All-time overview</p></div></div>

    <div class="stat-grid stat-grid--4">
      <div class="stat"><span class="stat__label">Invoiced</span><span class="stat__val">${moneyShort(invoiced, cur)}</span></div>
      <div class="stat"><span class="stat__label">Received</span><span class="stat__val">${moneyShort(received, cur)}</span></div>
      <div class="stat"><span class="stat__label">Outstanding</span><span class="stat__val" style="color:${outstanding > 0 ? 'var(--danger)' : 'var(--ok)'}">${moneyShort(outstanding, cur)}</span></div>
      <div class="stat"><span class="stat__label">Expenses</span><span class="stat__val">${moneyShort(spent, cur)}</span></div>
    </div>
    <div class="net-banner ${net >= 0 ? 'net-banner--pos' : 'net-banner--neg'}">
      <span>Net (received − expenses)</span>
      <strong>${net >= 0 ? '' : '− '}${money(Math.abs(net), cur)}</strong>
    </div>

    <h2 class="section-title">Last 6 months</h2>
    <div class="chart-legend">
      <span class="lg"><span class="lg__sw" style="background:${C_REV}"></span>Received</span>
      <span class="lg"><span class="lg__sw" style="background:${C_EXP}"></span>Expenses</span>
    </div>
    <div class="chart-wrap">${monthlyChart(invoices, expenses, cur)}</div>

    <h2 class="section-title">Profit by project</h2>
    <div id="projRows"></div>
  `;

  renderProjectRows(outlet.querySelector('#projRows'), projects, invoices, expenses, time, cur);
}

// ---- 6-month grouped bars (received vs expenses), shared y-scale ----------
function monthlyChart(invoices, expenses, cur) {
  const months = [];
  const base = startOfMonth();
  for (let i = 5; i >= 0; i--) months.push(new Date(base.getFullYear(), base.getMonth() - i, 1));
  const inMonth = (dateStr, m) => {
    const d = new Date(dateStr);
    return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  };
  const data = months.map((m) => ({
    label: m.toLocaleDateString('en-IN', { month: 'short' }),
    received: sum(invoices.flatMap((i) => i.payments || []).filter((p) => inMonth(p.date, m)), (p) => p.amount),
    expenses: sum(expenses.filter((e) => inMonth(e.date, m)), (e) => e.amount),
  }));
  const max = Math.max(1, ...data.map((d) => Math.max(d.received, d.expenses)));

  const W = 320, H = 150, padB = 22, padT = 8, padL = 4, padR = 4;
  const plotH = H - padB - padT;
  const groupW = (W - padL - padR) / data.length;
  const barW = Math.min(18, groupW / 2 - 3);
  const y = (v) => padT + plotH * (1 - v / max);

  const bars = data.map((d, idx) => {
    const cx = padL + groupW * idx + groupW / 2;
    const rev = `<rect x="${(cx - barW - 1).toFixed(1)}" y="${y(d.received).toFixed(1)}" width="${barW}" height="${(padT + plotH - y(d.received)).toFixed(1)}" rx="3" fill="${C_REV}"><title>${d.label} · Received ${money(d.received, cur)}</title></rect>`;
    const exp = `<rect x="${(cx + 1).toFixed(1)}" y="${y(d.expenses).toFixed(1)}" width="${barW}" height="${(padT + plotH - y(d.expenses)).toFixed(1)}" rx="3" fill="${C_EXP}"><title>${d.label} · Expenses ${money(d.expenses, cur)}</title></rect>`;
    const lbl = `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ax">${d.label}</text>`;
    return rev + exp + lbl;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Received versus expenses for the last six months">
    <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" class="ax-line"/>
    <text x="${padL}" y="${padT + 4}" class="ax ax--max">${moneyShort(max, cur)}</text>
    ${bars}
  </svg>`;
}

// ---- per-project profit rows with comparable bars ------------------------
function renderProjectRows(host, projects, invoices, expenses, time, cur) {
  const rows = projects.map((p) => {
    const pInv = invoices.filter((i) => i.projectId === p.id && i.status !== 'Cancelled');
    const revenue = sum(pInv, (i) => invoiceTotals(i).paid);
    const cost = sum(expenses.filter((e) => e.projectId === p.id), (e) => e.amount);
    const hours = sum(time.filter((t) => t.projectId === p.id), (t) => t.hours);
    return { p, revenue, cost, profit: revenue - cost, hours };
  }).filter((r) => r.revenue || r.cost || r.hours)
    .sort((a, b) => b.profit - a.profit);

  if (!rows.length) { host.innerHTML = `<p class="muted small">No project income or costs recorded yet.</p>`; return; }
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.cost)));
  const pct = (v) => (v / max * 100).toFixed(1);

  host.innerHTML = rows.map((r) => `
    <button class="proj-row" data-open="${r.p.id}">
      <div class="proj-row__head">
        <span class="proj-row__title">${escapeHtml(r.p.title)}</span>
        <span class="proj-row__profit" style="color:${r.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">
          ${r.profit >= 0 ? '+' : '−'}${money(Math.abs(r.profit), cur)}
        </span>
      </div>
      <div class="bar-line"><span class="bar" style="width:${pct(r.revenue)}%;background:${C_REV}"></span><span class="bar-val">${moneyShort(r.revenue, cur)}</span></div>
      <div class="bar-line"><span class="bar" style="width:${pct(r.cost)}%;background:${C_EXP}"></span><span class="bar-val">${moneyShort(r.cost, cur)}</span></div>
      <div class="proj-row__foot muted small">${r.hours ? r.hours.toFixed(1) + 'h logged' : ''}</div>
    </button>`).join('');
  host.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('projects/' + el.getAttribute('data-open'))));
}
