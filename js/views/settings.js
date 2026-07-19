// ============================================================================
// settings.js — business profile, defaults, data backup/restore, privacy lock.
// ============================================================================

import { db } from '../db.js';
import { toast, confirmDialog, readForm } from '../ui.js';
import { field, input, textarea, select, row, formActions } from '../form.js';
import { escapeHtml, isoDate } from '../util.js';
import { settings, updateSettings, loadSettings } from '../state.js';
import { storageStatus, requestPersistent, formatBytes } from '../storage.js';
import { start } from '../router.js';

async function paintStorage(host) {
  if (!host) return;
  const s = await storageStatus();
  const used = s.usage ? ` · using ${formatBytes(s.usage)}` : '';
  if (!s.supported) {
    host.innerHTML = `<span class="dot dot--ok"></span> Saved on this device${used}`;
    return;
  }
  if (s.persisted) {
    host.innerHTML = `<span class="dot dot--ok"></span> Storage is permanent — your data won't be auto-cleared${used}`;
  } else {
    host.innerHTML = `<span class="dot dot--warn"></span> Saved on this device${used}
      <button class="btn btn--soft btn--sm" id="mkPersist" style="margin-left:.5rem">Make permanent</button>`;
    host.querySelector('#mkPersist').addEventListener('click', async () => {
      const ok = await requestPersistent();
      toast(ok ? 'Storage is now permanent' : 'Bookmark or install the app, then try again', ok ? 'ok' : 'warn');
      paintStorage(host);
    });
  }
}

const CURRENCIES = [
  { value: 'INR', label: '₹ Indian Rupee' },
  { value: 'USD', label: '$ US Dollar' },
  { value: 'EUR', label: '€ Euro' },
  { value: 'GBP', label: '£ Pound' },
  { value: 'AED', label: 'د.إ Dirham' },
];

export async function render(outlet) {
  const st = settings();
  outlet.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1></div></div>

    <h2 class="section-title">Business profile</h2>
    <form id="profile" class="form card-form">
      ${field('Business name', input('businessName', st.businessName))}
      ${field('Your name', input('owner', st.owner, { placeholder: 'Shown on the dashboard' }))}
      ${row(
        field('Phone', input('phone', st.phone, { type: 'tel' })),
        field('Email', input('email', st.email, { type: 'email' })),
      )}
      ${field('Address', textarea('address', st.address, { rows: 2, placeholder: 'Appears on printed quotes' }))}
      ${formActions('Save profile')}
    </form>

    <h2 class="section-title">Defaults</h2>
    <form id="defaults" class="form card-form">
      ${row(
        field('Currency', select('currency', st.currency, CURRENCIES)),
        field('Default rate / hr', input('defaultRate', st.defaultRate, { type: 'number', min: 0, step: '50' })),
      )}
      ${row(
        field('GST %', input('taxRate', st.taxRate, { type: 'number', min: 0, step: '0.5' })),
        field('Default reminder (min)', input('defaultReminder', st.defaultReminder, { type: 'number', min: 0, step: '10' })),
      )}
      ${row(
        field('Quote prefix', input('quotePrefix', st.quotePrefix, { placeholder: 'QT-' })),
        field('Invoice prefix', input('invoicePrefix', st.invoicePrefix, { placeholder: 'INV-' })),
      )}
      ${formActions('Save defaults')}
    </form>

    <h2 class="section-title">Privacy lock</h2>
    <form id="lock" class="form card-form">
      <p class="muted small">Set a 4+ digit passcode to lock the app on this device. Leave blank to turn off. (Convenience lock — not bank-grade security.)</p>
      ${field('Passcode', input('passcode', st.passcode, { type: 'password', attrs: 'inputmode="numeric" autocomplete="off"' }))}
      ${formActions('Save passcode')}
    </form>

    <h2 class="section-title">Your data</h2>
    <div class="card-form">
      <div id="storageStatus" class="storage-status">Checking storage…</div>
      <p class="muted small">Everything lives on this device and stays after you close the app. Still, back up regularly — and to move to a new phone or laptop, export here and import there.</p>
      <div class="quick-row">
        <button class="btn btn--soft btn--sm" id="export">⬇ Export backup</button>
        <label class="btn btn--soft btn--sm" for="importFile">⬆ Import backup</label>
        <input type="file" id="importFile" accept="application/json" hidden>
        <button class="btn btn--soft btn--sm" id="exportIcs">📅 Export meetings (.ics)</button>
      </div>
      <div class="quick-row" style="margin-top:.6rem">
        <button class="btn btn--danger btn--sm" id="wipe">Erase all data</button>
      </div>
    </div>

    <p class="app-version muted small">Studio Manager · local-first · v1</p>
  `;

  paintStorage(outlet.querySelector('#storageStatus'));

  outlet.querySelector('#exportIcs').addEventListener('click', async () => {
    (await import('./appointments.js')).exportAllICS();
  });

  outlet.querySelector('#profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateSettings(readForm(e.target)); toast('Profile saved'); start();
  });
  outlet.querySelector('#defaults').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateSettings(readForm(e.target)); toast('Defaults saved');
  });
  outlet.querySelector('#lock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { passcode } = readForm(e.target);
    if (passcode && String(passcode).length < 4) { toast('Use at least 4 digits', 'warn'); return; }
    await updateSettings({ passcode: passcode || '' });
    toast(passcode ? 'Passcode set' : 'Passcode removed');
  });

  outlet.querySelector('#export').addEventListener('click', async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `studio-backup-${isoDate(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  });

  outlet.querySelector('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmDialog('Importing replaces all current data on this device with the backup. Continue?', { danger: false, okLabel: 'Import' }))) {
      e.target.value = ''; return;
    }
    try {
      const text = await file.text();
      await db.importAll(JSON.parse(text));
      await loadSettings(true);
      toast('Backup restored');
      start();
    } catch (err) {
      toast('Could not read that file', 'warn');
    }
    e.target.value = '';
  });

  outlet.querySelector('#wipe').addEventListener('click', async () => {
    if (await confirmDialog('Erase ALL clients, projects, quotes, expenses and hours on this device? This cannot be undone.', { okLabel: 'Erase everything' })) {
      await db.wipe();
      toast('All data erased');
      start();
    }
  });
}
