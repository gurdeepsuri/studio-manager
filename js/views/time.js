// ============================================================================
// time.js — hour tracker: log work per project, with weekly + billable totals.
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, readForm } from '../ui.js';
import { field, input, textarea, select, row, checkbox, formActions } from '../form.js';
import { escapeHtml, money, fmtDate, todayISO, sum, indexById, startOfWeek, startOfMonth } from '../util.js';
import { settings, currency } from '../state.js';
import { navigate, start } from '../router.js';

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const [time, projects] = await Promise.all([db.list('timeEntries'), db.list('projects')]);
  const pmap = indexById(projects);
  const list = time.sort((a, b) => new Date(b.date) - new Date(a.date));
  const cur = currency();
  const wk = startOfWeek();
  const mo = startOfMonth();
  const weekHours = sum(list.filter((t) => new Date(t.date) >= wk), (t) => t.hours);
  const monthBillable = sum(list.filter((t) => new Date(t.date) >= mo && t.billable), (t) => (Number(t.hours) || 0) * (Number(t.rate) || 0));

  const groups = new Map();
  for (const t of list) {
    const d = new Date(t.date);
    const key = isNaN(d) ? 'Undated' : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Hours</h1><p class="muted">${weekHours.toFixed(1)}h this week · ${money(monthBillable, cur)} billable this month</p></div>
      <button class="btn btn--primary" id="add">+ Log time</button>
    </div>
    ${!list.length ? emptyState('⏱️', 'No hours logged', 'Track time per project to bill accurately.') : ''}
    ${Array.from(groups.entries()).map(([label, rows]) => `
      <div class="group-head"><span>${escapeHtml(label)}</span><span>${sum(rows, (r) => r.hours).toFixed(1)}h</span></div>
      <div class="card-list">${rows.map((t) => `
        <button class="item" data-open="${t.id}">
          <span class="item__main">
            <span class="item__title">${escapeHtml(t.task || 'Work')}${t.billable ? ' <span class="tag">billable</span>' : ''}</span>
            <span class="item__sub">${escapeHtml(pmap.get(t.projectId)?.title || 'No project')} · ${fmtDate(t.date)}</span>
          </span>
          <span class="item__amt">${(Number(t.hours) || 0).toFixed(1)}h</span>
        </button>`).join('')}</div>`).join('')}
  `;
  outlet.querySelector('#add').addEventListener('click', () => editTime());
  outlet.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('time/' + el.getAttribute('data-open'))));
}

async function renderDetail(outlet, id) {
  const t = await db.get('timeEntries', id);
  if (!t) { outlet.innerHTML = emptyState('🔍', 'Not found'); return; }
  const project = t.projectId ? await db.get('projects', t.projectId) : null;
  const cur = currency();
  const value = (Number(t.hours) || 0) * (Number(t.rate) || 0);
  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Hours</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <h1>${(Number(t.hours) || 0).toFixed(1)} hours</h1>
    <div class="meta-line">${t.billable ? `<span class="chip chip--go">Billable · ${money(value, cur)}</span>` : '<span class="chip chip--neutral">Non-billable</span>'}</div>
    <div class="contact-grid">
      <div class="contact-cell"><span>📅</span>${fmtDate(t.date)}</div>
      ${project ? `<button class="contact-cell" data-project="${project.id}"><span>📐</span>${escapeHtml(project.title)}</button>` : ''}
      ${t.rate ? `<div class="contact-cell"><span>💰</span>${money(t.rate, cur)}/hr</div>` : ''}
    </div>
    ${t.task ? `<div class="note-box">${escapeHtml(t.task)}</div>` : ''}
  `;
  outlet.querySelector('#back').addEventListener('click', () => navigate('time'));
  outlet.querySelector('#edit').addEventListener('click', () => editTime(t));
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog('Delete this time entry?')) { await db.remove('timeEntries', id); toast('Deleted'); navigate('time'); }
  });
  outlet.querySelector('[data-project]')?.addEventListener('click', (ev) => navigate('projects/' + ev.currentTarget.getAttribute('data-project')));
}

export async function editTime(preset = {}) {
  const t = preset.id ? preset : { date: todayISO(), billable: true, rate: settings().defaultRate || '', ...preset };
  const isNew = !t.id;
  const projects = await db.list('projects');
  const s = openSheet({
    title: isNew ? 'Log time' : 'Edit time',
    body: `<form id="f" class="form">
      ${row(
        field('Hours', input('hours', t.hours, { type: 'number', min: 0, step: '0.25', required: true, placeholder: '0.0' })),
        field('Date', input('date', t.date, { type: 'date' })),
      )}
      ${field('Project', select('projectId', t.projectId, projects.map((p) => ({ value: p.id, label: p.title })), { placeholder: 'No project' }))}
      ${field('Task', input('task', t.task, { placeholder: 'What did you work on?' }))}
      ${row(
        field('Rate / hr', input('rate', t.rate, { type: 'number', min: 0, step: '50' })),
        field('', checkbox('billable', t.billable, 'Billable')),
      )}
      ${formActions(isNew ? 'Log time' : 'Save')}
    </form>`,
  });
  const form = s.root.querySelector('#f');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = readForm(form);
    if (!(Number(data.hours) > 0)) { toast('Enter hours', 'warn'); return; }
    await db.save('timeEntries', { ...t, ...data });
    closeSheet();
    toast(isNew ? 'Time logged' : 'Saved');
    start();
  });
}
