// ============================================================================
// share.js — downloads, calendar (.ics) export, and WhatsApp/email/native share
// All client-side. No external services are contacted.
// ============================================================================

import { icsStamp, waNumber, escapeHtml, fmtDateTime } from './util.js';
import { openSheet, closeSheet, toast } from './ui.js';

// ---- generic download -----------------------------------------------------
export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- calendar (.ics) ------------------------------------------------------
// Produces a single-event calendar file. Opening it on iPhone/Android adds the
// event to the native calendar, which then handles reminders/notifications.
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// The VEVENT block for one appointment (used alone or inside a multi-event file)
export function apptVEvent(appt) {
  const start = new Date(appt.datetime);
  const end = new Date(start.getTime() + (Number(appt.durationMins) || 60) * 60000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${appt.id}@studio-manager`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEsc(appt.title)}`,
    appt.location ? `LOCATION:${icsEsc(appt.location)}` : '',
    appt.notes ? `DESCRIPTION:${icsEsc(appt.notes)}` : '',
  ];
  const remind = Number(appt.remindMins);
  if (remind > 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(appt.title)}`,
      `TRIGGER:-PT${remind}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines.filter(Boolean).join('\r\n');
}

export function wrapCalendar(vevents) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Studio Manager//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...vevents, 'END:VCALENDAR'].join('\r\n');
}

export function apptToICS(appt) {
  return wrapCalendar([apptVEvent(appt)]);
}
export function addToCalendar(appt) {
  const safe = String(appt.title || 'meeting').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  download(`${safe}.ics`, apptToICS(appt), 'text/calendar');
  toast('Calendar file downloaded — open it to add & get reminders');
}

// ---- share menu -----------------------------------------------------------
export function waLink(phone, text) {
  const n = waNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
export function mailLink(email, subject, body) {
  return `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Opens the native share sheet if available, otherwise a fallback menu with
// WhatsApp / email / copy. `contact` (optional) prefills the recipient.
export async function shareText({ title, text, contact = {} }) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const s = openSheet({
    title: 'Share',
    body: `<div class="share-menu">
      <a class="share-opt" target="_blank" rel="noopener" href="${waLink(contact.phone || '', text)}"><span>💬</span>WhatsApp</a>
      <a class="share-opt" href="${mailLink(contact.email || '', title, text)}"><span>✉️</span>Email</a>
      <button class="share-opt" data-copy><span>📋</span>Copy text</button>
    </div>
    <div class="share-preview">${escapeHtml(text)}</div>`,
  });
  s.root.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch { toast('Could not copy', 'warn'); }
    closeSheet();
  });
  s.root.querySelectorAll('a.share-opt').forEach((a) => a.addEventListener('click', () => closeSheet()));
}

// re-export for callers that build their own event summaries
export { fmtDateTime };
