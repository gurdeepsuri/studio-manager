// ============================================================================
// db.js — the data layer.
//
// This is the ONE module that knows *where* data lives. Today it's IndexedDB
// on the device. Tomorrow, to become a synced/multi-tenant SaaS, only this
// file changes: every method returns a Promise and mirrors a REST resource
// (list / get / save / remove), so the views and business logic never move.
// ============================================================================

import { uid } from './util.js';

const DB_NAME = 'studio-manager';
const DB_VERSION = 3;

// The "resources". Add one here + a nav entry and you have a new module.
export const STORES = [
  'projects', 'quotes', 'invoices', 'appointments', 'expenses', 'vendors',
];
// settings is a single-document store (key/value)
const KV_STORE = 'settings';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- generic resource API (async, REST-shaped) ----------------------------
export const db = {
  async list(store) {
    const os = await tx(store);
    return reqToPromise(os.getAll());
  },
  async get(store, id) {
    const os = await tx(store);
    return reqToPromise(os.get(id));
  },
  // create or update; stamps id + timestamps
  async save(store, record) {
    const os = await tx(store, 'readwrite');
    const now = Date.now();
    const rec = { ...record };
    if (!rec.id) { rec.id = uid(); rec.createdAt = now; }
    if (rec.createdAt == null) rec.createdAt = now;
    rec.updatedAt = now;
    await reqToPromise(os.put(rec));
    return rec;
  },
  async remove(store, id) {
    const os = await tx(store, 'readwrite');
    return reqToPromise(os.delete(id));
  },
  async clear(store) {
    const os = await tx(store, 'readwrite');
    return reqToPromise(os.clear());
  },

  // ---- settings (single key/value document) -------------------------------
  async getSettings() {
    const os = await tx(KV_STORE);
    const row = await reqToPromise(os.get('app'));
    return row ? row.value : {};
  },
  async saveSettings(value) {
    const os = await tx(KV_STORE, 'readwrite');
    await reqToPromise(os.put({ key: 'app', value }));
    return value;
  },

  // ---- backup / restore (the safety net for local-first) ------------------
  async exportAll() {
    const out = { _app: 'studio-manager', _version: DB_VERSION, exportedAt: Date.now(), data: {} };
    for (const s of STORES) out.data[s] = await this.list(s);
    out.data[KV_STORE] = await this.getSettings();
    return out;
  },
  async importAll(payload, { merge = false } = {}) {
    if (!payload || !payload.data) throw new Error('Not a valid Studio Manager backup file.');
    for (const s of STORES) {
      if (!merge) await this.clear(s);
      const rows = payload.data[s] || [];
      const os = await tx(s, 'readwrite');
      await Promise.all(rows.map((r) => reqToPromise(os.put(r))));
    }
    if (payload.data[KV_STORE]) await this.saveSettings(payload.data[KV_STORE]);
  },
  async wipe() {
    for (const s of STORES) await this.clear(s);
  },

  // Safely read a store that may not exist (legacy data from older versions).
  async legacyList(store) {
    try { return await this.list(store); } catch { return []; }
  },

  // v3 migration: clients merged into projects. Copy each project's client
  // record (from the old `clients` store) onto the project itself. Idempotent.
  async migrateV3() {
    const projects = await this.list('projects');
    const clients = await this.legacyList('clients');
    if (!clients.length) return;
    const cmap = new Map(clients.map((c) => [c.id, c]));
    for (const p of projects) {
      if (p.clientId && !p.clientName) {
        const c = cmap.get(p.clientId);
        if (c) {
          await this.save('projects', {
            ...p,
            clientName: c.name, clientCompany: c.company, clientPhone: c.phone,
            clientEmail: c.email, clientAddress: c.address,
          });
        }
      }
    }
  },
};
