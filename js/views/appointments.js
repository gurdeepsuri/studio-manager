// ============================================================================
// appointments.js — meetings as an agenda AND a month calendar, with reminders
// and one-tap "Add to Calendar" (.ics) so the phone can notify her.
// ============================================================================

import { db } from '../db.js';
import { openSheet, closeSheet, toast, confirmDialog, emptyState, statusChip, readForm } from '../ui.js';
import { field, input, textarea, select, row, formActions } from '../form.js';
import { escapeHtml, fmtDate, fmtTime, relDay, indexById, sameDay, addDays, monthLabel } from '../util.js';
import { settings } from '../state.js';
import { addToCalendar, apptVEvent, wrapCalendar, download } from '../share.js';
import { navigate, start } from '../router.js';

export const TYPES = ['Meeting', 'Site Visit', 'Call', 'Consultation', 'Handover', 'Other'];
const TYPE_ICON = { Meeting: '🤝', 'Site Visit': '🏗️', Call: '📞', Consultation: '💬', Handover: '🔑', Other: '📌' };
const TYPE_CLASS = { Meeting: 'ev-blue', 'Site Visit': 'ev-yellow', Call: 'ev-green', Consultation: 'ev-blue', Handover: 'ev-maroon', Other: 'ev-grey' };
const STATUS_CLASS = { Scheduled: 'info', Done: 'done', Cancelled: 'neutral' };
const REMINDERS = [
  { value: 0, label: 'No reminder' }, { value: 10, label: '10 min before' },
  { value: 30, label: '30 min before' }, { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' }, { value: 1440, label: '1 day before' },
];

// module state for the calendar
let _view = 'agenda';
let _cursor = new Date(); // month being viewed
let _selectedDay = null;

export async function render(outlet, param) {
  if (param) return renderDetail(outlet, param);
  return renderList(outlet);
}

async function renderList(outlet) {
  const [appts, clients] = await Promise.all([db.list('appointments'), db.list('clients')]);
  const cmap = indexById(clients);

  outlet.innerHTML = `
    <div class="page-head">
      <div><h1>Schedule</h1></div>
      <button class="btn btn--primary" id="add">+ Meeting</button>
    </div>
    <div class="seg" id="seg">
      <button class="seg__btn ${_view === 'agenda' ? 'seg__btn--on' : ''}" data-view="agenda">Agenda</button>
      <button class="seg__btn ${_view === 'month' ? 'seg__btn--on' : ''}" data-view="month">Month</button>
    </div>
    <div id="schedBody"></div>
  `;
  outlet.querySelector('#add').addEventListener('click', () => editAppt());
  outlet.querySelectorAll('#seg [data-view]').forEach((b) => b.addEventListener('click', () => {
    _view = b.getAttribute('data-view'); renderList(outlet);
  }));

  const body = outlet.querySelector('#schedBody');
  if (!appts.length) { body.innerHTML = emptyState('📅', 'Nothing scheduled', 'Add a meeting, site visit or call.'); return; }
  if (_view === 'agenda') renderAgenda(body, appts, cmap);
  else renderMonth(body, appts, cmap);
}

function apptCard(a, cmap) {
  return `<button class="item" data-open="${a.id}">
    <span class="appt-when">
      <span class="appt-when__day">${relDay(a.datetime)}</span>
      <span class="appt-when__time">${fmtTime(a.datetime)}</span>
    </span>
    <span class="item__main">
      <span class="item__title">${TYPE_ICON[a.type] || '📌'} ${escapeHtml(a.title)}</span>
      <span class="item__sub">${escapeHtml(cmap.get(a.clientId)?.name || a.location || a.type || '')}</span>
    </span>
    ${a.status && a.status !== 'Scheduled' ? statusChip(a.status, STATUS_CLASS) : '<span class="item__chev">›</span>'}
  </button>`;
}

function wireOpen(host) {
  host.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => navigate('appointments/' + el.getAttribute('data-open'))));
}

function renderAgenda(body, appts, cmap) {
  const now = Date.now();
  const withTs = appts.map((a) => ({ ...a, ts: new Date(a.datetime).getTime() }));
  const upcoming = withTs.filter((a) => a.ts >= now - 3600000 && a.status !== 'Cancelled').sort((a, b) => a.ts - b.ts);
  const past = withTs.filter((a) => a.ts < now - 3600000 || a.status === 'Cancelled').sort((a, b) => b.ts - a.ts);
  body.innerHTML = `
    ${upcoming.length ? `<h2 class="section-title">Upcoming</h2><div class="card-list">${upcoming.map((a) => apptCard(a, cmap)).join('')}</div>` : '<p class="muted small">No upcoming meetings.</p>'}
    ${past.length ? `<h2 class="section-title">Past</h2><div class="card-list">${past.map((a) => apptCard(a, cmap)).join('')}</div>` : ''}
  `;
  wireOpen(body);
}

function renderMonth(body, appts, cmap) {
  const first = new Date(_cursor.getFullYear(), _cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = addDays(first, -offset);
  const byDay = new Map();
  for (const a of appts) {
    const key = new Date(a.datetime).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(a);
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const inMonth = d.getMonth() === _cursor.getMonth();
    const dayAppts = (byDay.get(d.toDateString()) || []).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const isToday = sameDay(d, new Date());
    const isSel = _selectedDay && sameDay(d, _selectedDay);
    cells.push(`<button class="cal-cell ${inMonth ? '' : 'cal-cell--dim'} ${isToday ? 'cal-cell--today' : ''} ${isSel ? 'cal-cell--sel' : ''}" data-day="${d.toISOString()}">
      <span class="cal-num">${d.getDate()}</span>
      <span class="cal-dots">${dayAppts.slice(0, 4).map((a) => `<span class="cal-dot ${TYPE_CLASS[a.type] || 'ev-grey'}"></span>`).join('')}</span>
    </button>`);
  }
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  body.innerHTML = `
    <div class="cal-head">
      <button class="icon-btn" id="prev" aria-label="Previous month">‹</button>
      <strong>${monthLabel(_cursor)}</strong>
      <button class="icon-btn" id="next" aria-label="Next month">›</button>
    </div>
    <div class="cal-grid cal-weekdays">${weekdays.map((w) => `<span class="cal-wd">${w}</span>`).join('')}</div>
    <div class="cal-grid" id="calGrid">${cells.join('')}</div>
    <div id="dayList"></div>
  `;
  body.querySelector('#prev').addEventListener('click', () => { _cursor = new Date(_cursor.getFullYear(), _cursor.getMonth() - 1, 1); _selectedDay = null; renderMonth(body, appts, cmap); });
  body.querySelector('#next').addEventListener('click', () => { _cursor = new Date(_cursor.getFullYear(), _cursor.getMonth() + 1, 1); _selectedDay = null; renderMonth(body, appts, cmap); });
  body.querySelectorAll('[data-day]').forEach((el) => el.addEventListener('click', () => {
    _selectedDay = new Date(el.getAttribute('data-day'));
    renderMonth(body, appts, cmap);
  }));

  if (_selectedDay) {
    const list = appts.filter((a) => sameDay(a.datetime, _selectedDay)).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const host = body.querySelector('#dayList');
    host.innerHTML = `<h2 class="section-title">${fmtDate(_selectedDay)}</h2>
      ${list.length ? `<div class="card-list">${list.map((a) => apptCard(a, cmap)).join('')}</div>`
        : `<p class="muted small">Nothing scheduled. <button class="link-more" id="addDay">Add a meeting</button></p>`}`;
    wireOpen(host);
    host.querySelector('#addDay')?.addEventListener('click', () => {
      const d = new Date(_selectedDay); d.setHours(10, 0, 0, 0);
      editAppt({ datetime: d.toISOString() });
    });
  }
}

async function renderDetail(outlet, id) {
  const a = await db.get('appointments', id);
  if (!a) { outlet.innerHTML = emptyState('🔍', 'Not found'); return; }
  const [clients, projects] = await Promise.all([db.list('clients'), db.list('projects')]);
  const client = clients.find((c) => c.id === a.clientId);
  const project = projects.find((p) => p.id === a.projectId);
  const rem = REMINDERS.find((r) => r.value === Number(a.remindMins));

  outlet.innerHTML = `
    <div class="detail-head">
      <button class="link-back" id="back">‹ Schedule</button>
      <div class="detail-actions">
        <button class="btn btn--ghost btn--sm" id="edit">Edit</button>
        <button class="btn btn--danger btn--sm" id="del">Delete</button>
      </div>
    </div>
    <h1>${TYPE_ICON[a.type] || '📌'} ${escapeHtml(a.title)}</h1>
    <div class="meta-line">${statusChip(a.status || 'Scheduled', STATUS_CLASS)}<span class="chip chip--neutral">${escapeHtml(a.type || 'Meeting')}</span></div>
    <div class="stat-grid">
      <div class="stat"><span class="stat__label">When</span><span class="stat__val stat__val--sm">${fmtDate(a.datetime)}<br>${fmtTime(a.datetime)}</span></div>
      ${a.durationMins ? `<div class="stat"><span class="stat__label">Duration</span><span class="stat__val">${a.durationMins} min</span></div>` : ''}
    </div>
    <div class="quick-row">
      <button class="btn btn--primary btn--sm" id="ics">📅 Add to calendar</button>
      ${rem && rem.value ? `<span class="chip chip--info">🔔 ${rem.label}</span>` : ''}
    </div>
    <div class="contact-grid">
      ${client ? `<button class="contact-cell" data-client="${client.id}"><span>👤</span>${escapeHtml(client.name)}</button>` : ''}
      ${project ? `<button class="contact-cell" data-project="${project.id}"><span>📐</span>${escapeHtml(project.title)}</button>` : ''}
      ${a.location ? `<div class="contact-cell"><span>📍</span>${escapeHtml(a.location)}</div>` : ''}
    </div>
    ${a.notes ? `<div class="note-box">${escapeHtml(a.notes)}</div>` : ''}
    <div class="quick-row">
      ${a.status !== 'Done' ? `<button class="btn btn--soft btn--sm" data-mark="Done">Mark done</button>` : ''}
      ${a.status !== 'Cancelled' ? `<button class="btn btn--soft btn--sm" data-mark="Cancelled">Cancel</button>` : ''}
      ${a.status !== 'Scheduled' ? `<button class="btn btn--soft btn--sm" data-mark="Scheduled">Reopen</button>` : ''}
    </div>
  `;
  outlet.querySelector('#back').addEventListener('click', () => navigate('appointments'));
  outlet.querySelector('#edit').addEventListener('click', () => editAppt(a));
  outlet.querySelector('#ics').addEventListener('click', () => addToCalendar(a));
  outlet.querySelector('#del').addEventListener('click', async () => {
    if (await confirmDialog('Delete this meeting?')) { await db.remove('appointments', id); toast('Deleted'); navigate('appointments'); }
  });
  outlet.querySelector('[data-client]')?.addEventListener('click', (e) => navigate('clients/' + e.currentTarget.getAttribute('data-client')));
  outlet.querySelector('[data-project]')?.addEventListener('click', (e) => navigate('projects/' + e.currentTarget.getAttribute('data-project')));
  outlet.querySelectorAll('[data-mark]').forEach((el) => el.addEventListener('click', async () => {
    await db.save('appointments', { ...a, status: el.getAttribute('data-mark') }); toast('Updated'); start();
  }));
}

export async function editAppt(preset = {}) {
  const a = preset.id ? preset
    : { datetime: defaultWhen(), status: 'Scheduled', type: 'Meeting', durationMins: 60, remindMins: settings().defaultReminder, ...preset };
  const isNew = !a.id;
  const [clients, projects] = await Promise.all([db.list('clients'), db.list('projects')]);
  const s = openSheet({
    title: isNew ? 'New meeting' : 'Edit meeting',
    body: `<form id="f" class="form">
      ${field('Title', input('title', a.title, { required: true, placeholder: 'e.g. Site visit — Whitefield' }))}
      ${row(
        field('Type', select('type', a.type, TYPES)),
        field('When', input('datetime', toLocalInput(a.datetime), { type: 'datetime-local' })),
      )}
      ${row(
        field('Duration (min)', input('durationMins', a.durationMins, { type: 'number', min: 0, step: '15' })),
        field('Reminder', select('remindMins', String(a.remindMins ?? 0), REMINDERS.map((r) => ({ value: r.value, label: r.label })))),
      )}
      ${field('Location', input('location', a.location, { placeholder: 'Address / meeting link' }))}
      ${row(
        field('Client', select('clientId', a.clientId, clients.map((c) => ({ value: c.id, label: c.name })), { placeholder: 'No client' })),
        field('Project', select('projectId', a.projectId, projects.map((p) => ({ value: p.id, label: p.title })), { placeholder: 'No project' })),
      )}
      ${field('Notes', textarea('notes', a.notes))}
      <label class="checkbox"><input type="checkbox" name="_ics" ${isNew ? 'checked' : ''}><span>Download calendar file to get a phone reminder</span></label>
      ${formActions(isNew ? 'Add meeting' : 'Save')}
    </form>`,
  });
  const form = s.root.querySelector('#f');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!data.title.trim()) return;
    const wantIcs = data._ics; delete data._ics;
    data.datetime = data.datetime ? new Date(data.datetime).toISOString() : a.datetime;
    const saved = await db.save('appointments', { ...a, ...data });
    closeSheet();
    toast(isNew ? 'Meeting added' : 'Saved');
    if (wantIcs) addToCalendar(saved);
    start();
  });
}

// Export every appointment as one .ics file (a full calendar import).
export async function exportAllICS() {
  const appts = await db.list('appointments');
  if (!appts.length) { toast('Nothing to export', 'warn'); return; }
  const cal = wrapCalendar(appts.map((a) => apptVEvent(a)));
  download('meetings.ics', cal, 'text/calendar');
  toast('All meetings exported');
}

function defaultWhen() {
  const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d.toISOString();
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
