// ============================================================================
// app.js — bootstrap: passcode gate, nav shell, route table, service worker.
// ============================================================================

import { route, initRouter, start, navigate } from './router.js';
import { loadSettings, settings } from './state.js';
import { escapeHtml } from './util.js';
import { requestPersistent } from './storage.js';

import { render as dashboard } from './views/dashboard.js';
import { render as clients } from './views/clients.js';
import { render as projects } from './views/projects.js';
import { render as quotes } from './views/quotes.js';
import { render as invoices } from './views/invoices.js';
import { render as appointments } from './views/appointments.js';
import { render as expenses } from './views/expenses.js';
import { render as time } from './views/time.js';
import { render as vendors } from './views/vendors.js';
import { render as reports } from './views/reports.js';
import { render as settingsView } from './views/settings.js';

const NAV = [
  { id: 'dashboard', label: 'Home', icon: '🏠' },
  { id: 'projects', label: 'Projects', icon: '📐' },
  { id: 'invoices', label: 'Invoices', icon: '📄' },
  { id: 'appointments', label: 'Schedule', icon: '📅' },
];
const MORE = [
  { id: 'quotes', label: 'Quotes', icon: '🧾' },
  { id: 'clients', label: 'Clients', icon: '👥' },
  { id: 'vendors', label: 'Vendors', icon: '🧰' },
  { id: 'expenses', label: 'Expenses', icon: '💸' },
  { id: 'time', label: 'Hours', icon: '⏱️' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <aside class="sidebar">
      <div class="side-brand">
        <img src="../assets/icon.svg" alt="" class="side-mark">
        <div><div class="side-name">${escapeHtml(settings().businessName || 'Studio')}</div><div class="side-tag">Manager</div></div>
      </div>
      <nav class="side-nav">
        ${[...NAV, ...MORE].map((n) => navLink(n, 'side-link')).join('')}
      </nav>
    </aside>
    <main class="main">
      <div id="view" class="view"></div>
    </main>
    <nav class="tabbar">
      ${NAV.map((n) => navLink(n, 'tab')).join('')}
      <button class="tab" id="moreTab" aria-label="More"><span class="tab__icon">⋯</span><span class="tab__label">More</span></button>
    </nav>
  `;

  app.querySelectorAll('[data-nav]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(a.getAttribute('data-nav'));
  }));

  document.getElementById('moreTab').addEventListener('click', () => {
    import('./ui.js').then(({ openSheet }) => {
      const s = openSheet({
        title: 'More',
        body: `<div class="more-grid">${MORE.map((n) =>
          `<button class="more-item" data-to="${n.id}"><span>${n.icon}</span>${n.label}</button>`).join('')}</div>`,
      });
      s.root.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => {
        s.close(); navigate(b.getAttribute('data-to'));
      }));
    });
  });
}

function navLink(n, cls) {
  return `<a href="#/${n.id}" class="${cls}" data-nav="${n.id}">
    <span class="tab__icon">${n.icon}</span><span class="tab__label">${n.label}</span>
  </a>`;
}

// ---- passcode gate --------------------------------------------------------
function needsUnlock() {
  return settings().passcode && sessionStorage.getItem('studio-unlocked') !== '1';
}
function showLock() {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="lock">
        <img src="../assets/icon.svg" alt="" class="lock-mark">
        <h1>${escapeHtml(settings().businessName || 'Studio Manager')}</h1>
        <p class="muted">Enter your passcode</p>
        <form id="lockForm">
          <input class="control lock-input" type="password" inputmode="numeric" autocomplete="off" autofocus aria-label="Passcode">
          <p class="lock-error" id="lockError"></p>
          <button class="btn btn--primary" type="submit">Unlock</button>
        </form>
      </div>`;
    const form = app.querySelector('#lockForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = form.querySelector('input').value;
      if (val === settings().passcode) {
        sessionStorage.setItem('studio-unlocked', '1');
        resolve();
      } else {
        app.querySelector('#lockError').textContent = 'Incorrect passcode';
        form.querySelector('input').value = '';
      }
    });
  });
}

// ---- boot -----------------------------------------------------------------
async function boot() {
  await loadSettings();

  route('dashboard', dashboard);
  route('projects', projects);
  route('quotes', quotes);
  route('invoices', invoices);
  route('appointments', appointments);
  route('clients', clients);
  route('vendors', vendors);
  route('expenses', expenses);
  route('time', time);
  route('reports', reports);
  route('settings', settingsView);

  if (needsUnlock()) await showLock();

  renderShell();
  initRouter();
  await start();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // ask the browser to keep our data durably (not auto-evicted)
  requestPersistent();
}

boot();
