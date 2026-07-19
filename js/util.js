// ============================================================================
// util.js — small helpers: ids, formatting, dates, DOM shortcuts
// Everything here is pure/framework-free so it survives a future backend swap.
// ============================================================================

// ---- ids ------------------------------------------------------------------
export function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ---- money ----------------------------------------------------------------
// Currency is read from settings at call sites; default INR (Indian grouping).
export function money(amount, currency = 'INR') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return '₹' + n.toFixed(2);
  }
}

// Compact money for tight tiles (e.g. ₹1.2L, ₹3.4Cr)
export function moneyShort(amount, currency = 'INR') {
  const n = Number(amount) || 0;
  const sym = currency === 'INR' ? '₹' : '';
  const abs = Math.abs(n);
  if (currency === 'INR') {
    if (abs >= 1e7) return sym + (n / 1e7).toFixed(2).replace(/\.00$/, '') + 'Cr';
    if (abs >= 1e5) return sym + (n / 1e5).toFixed(2).replace(/\.00$/, '') + 'L';
    if (abs >= 1e3) return sym + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return money(n, currency);
}

// ---- dates ----------------------------------------------------------------
export function todayISO() {
  const d = new Date();
  return isoDate(d);
}
export function isoDate(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function nowLocalDT() {
  // value for <input type="datetime-local">
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
export function fmtTime(value) {
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
// Human "in 3 days" / "2 days ago"
export function relDay(value) {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return fmtDate(value);
}

export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function monthLabel(d = new Date()) {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ---- misc -----------------------------------------------------------------
export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0] || '').join('').toUpperCase() || '?';
}
export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function sum(arr, pick = (x) => x) {
  return arr.reduce((acc, x) => acc + (Number(pick(x)) || 0), 0);
}
export function byNewest(a, b) {
  return (b.createdAt || 0) - (a.createdAt || 0);
}
// Build an id -> record map for quick name lookups.
export function indexById(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.id, r);
  return m;
}

export function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
export function sameDay(a, b) {
  const x = new Date(a); const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

// ---- calendar / sharing ---------------------------------------------------
// Format a Date as an iCalendar UTC timestamp: 20260719T143000Z
export function icsStamp(value) {
  const d = new Date(value);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
// Keep only digits for a wa.me link; assume India (+91) when no country code.
export function waNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = '91' + digits;      // bare Indian mobile
  if (digits.startsWith('0')) digits = '91' + digits.replace(/^0+/, '');
  return digits;
}

// tiny DOM helpers
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
