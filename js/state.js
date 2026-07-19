// ============================================================================
// state.js — thin app-wide state: settings + cheap lookups used by many views.
// ============================================================================

import { db } from './db.js';

const DEFAULT_SETTINGS = {
  businessName: '',
  owner: '',
  email: '',
  phone: '',
  address: '',
  currency: 'INR',
  defaultRate: 0,      // default hourly rate
  taxRate: 18,         // GST %
  quotePrefix: 'QT-',
  quoteSeq: 1,
  invoicePrefix: 'INV-',
  invoiceSeq: 1,
  defaultReminder: 60, // default meeting reminder, minutes before
  passcode: '',        // optional privacy lock (not security-grade)
};

let _settings = null;

export async function loadSettings(force = false) {
  if (_settings && !force) return _settings;
  const saved = await db.getSettings();
  _settings = { ...DEFAULT_SETTINGS, ...saved };
  return _settings;
}
export function settings() {
  return _settings || DEFAULT_SETTINGS;
}
export async function updateSettings(patch) {
  _settings = { ...settings(), ...patch };
  await db.saveSettings(_settings);
  return _settings;
}
export function currency() {
  return settings().currency || 'INR';
}
