// ============================================================================
// expenses.js — spend tracker with monthly totals and per-project tagging.
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, readForm } from '../ui.js';
import { field, input, textarea, select, row, checkbox, formActions } from '../form.js';
import { escapeHtml, money, fmtDate, todayISO, sum, indexById, startOfMonth } from '../util.js';
import { currency } from '../state.js';
import { navigate, start } from '../router.js';

export const CATEGORIES = ['Materials', 'Furniture', 'Labour', 'Travel', 'Software', 'Marketing', 'Office', 'Fees', 'Misc'];

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const [expenses, projects] = await Promise.all([db.list('expenses'), db.list('projects')]);
  const pmap = indexById(projects);
  const list = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  const cur = currency();
  const monthStart = startOfMonth();
  const thisMonth = sum(list.filter((e) => new Date(e.date) >= monthStart), (e) => e.amount);
  const total = sum(list, (e) => e.amount);

  // group by month
  const groups = new Map();
  for (const e of list) {
    const d = new Date(e.date);
    const key = isNaN(d) ? 'Undated' : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Expenses</h1><p class="muted">${money(thisMonth, cur)} this month · ${money(total, cur)} all-time</p></div>
      <button class="btn btn--primary" id="add">+ Expense</button>
    </div>
    ${!list.length ? emptyState('💸', 'No expenses yet', 'Log a purchase to track spend per project.') : ''}
    ${Array.from(groups.entries()).map(([label, rows]) => `
      <div class="group-head"><span>${escapeHtml(label)}</span><span>${money(sum(rows, (r) => r.amount), cur)}</span></div>
      <div class="card-list">${rows.map((e) => `
        <button class="item" data-open="${e.id}">
          <span class="item__main">
            <span class="item__title">${escapeHtml(e.category || 'Expense')}${e.billable ? ' <span class="tag">billable</span>' : ''}</span>
            <span class="item__sub">${escapeHtml(e.vendor || '')}${e.projectId ? ' · ' + escapeHtml(pmap.get(e.projectId)?.title || '') : ''} · ${fmtDate(e.date)}</span>
          </span>
          <span class="item__amt">${money(e.amount || 0, cur)}</span>
        </button>`).join('')}</div>`).join('')}
  `;
  outlet.querySelector('#add').addEventListener('click', () => editExpense());
  outlet.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('expenses/' + el.getAttribute('data-open'))));
}

async function renderDetail(outlet, id) {
  const e = await db.get('expenses', id);
  if (!e) { outlet.innerHTML = emptyState('🔍', 'Not found'); return; }
  const project = e.projectId ? await db.get('projects', e.projectId) : null;
  const cur = currency();
  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Expenses</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <h1>${money(e.amount || 0, cur)}</h1>
    <div class="meta-line"><span class="chip chip--neutral">${escapeHtml(e.category || 'Misc')}</span>${e.billable ? '<span class="chip chip--go">Billable</span>' : ''}</div>
    <div class="contact-grid">
      <div class="contact-cell"><span>📅</span>${fmtDate(e.date)}</div>
      ${e.vendor ? `<div class="contact-cell"><span>🏬</span>${escapeHtml(e.vendor)}</div>` : ''}
      ${project ? `<button class="contact-cell" data-project="${project.id}"><span>📐</span>${escapeHtml(project.title)}</button>` : ''}
    </div>
    ${e.notes ? `<div class="note-box">${escapeHtml(e.notes)}</div>` : ''}
  `;
  outlet.querySelector('#back').addEventListener('click', () => navigate('expenses'));
  outlet.querySelector('#edit').addEventListener('click', () => editExpense(e));
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog('Delete this expense?')) { await db.remove('expenses', id); toast('Deleted'); navigate('expenses'); }
  });
  outlet.querySelector('[data-project]')?.addEventListener('click', (ev) => navigate('projects/' + ev.currentTarget.getAttribute('data-project')));
}

export async function editExpense(preset = {}) {
  const e = preset.id ? preset : { date: todayISO(), category: 'Materials', ...preset };
  const isNew = !e.id;
  const projects = await db.list('projects');
  const s = openSheet({
    title: isNew ? 'New expense' : 'Edit expense',
    body: `<form id="f" class="form">
      ${row(
        field('Amount', input('amount', e.amount, { type: 'number', min: 0, step: '1', required: true, placeholder: '0' })),
        field('Date', input('date', e.date, { type: 'date' })),
      )}
      ${row(
        field('Category', select('category', e.category, CATEGORIES)),
        field('Vendor', input('vendor', e.vendor, { placeholder: 'Paid to' })),
      )}
      ${field('Project', select('projectId', e.projectId, projects.map((p) => ({ value: p.id, label: p.title })), { placeholder: 'No project' }))}
      ${field('', checkbox('billable', e.billable, 'Billable to client'))}
      ${field('Notes', textarea('notes', e.notes, { rows: 2 }))}
      ${formActions(isNew ? 'Add expense' : 'Save')}
    </form>`,
  });
  const form = s.root.querySelector('#f');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = readForm(form);
    if (!(Number(data.amount) > 0)) { toast('Enter an amount', 'warn'); return; }
    await db.save('expenses', { ...e, ...data });
    closeSheet();
    toast(isNew ? 'Expense added' : 'Saved');
    start();
  });
}
