// ============================================================================
// storage.js — ask the browser to keep our IndexedDB data durably (not auto-
// evicted), and report how much space we're using.
// ============================================================================

// Ask for persistent storage. Browsers grant it based on engagement signals
// (installed to home screen, bookmarked, frequent use). Safe to call every load.
export async function requestPersistent() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageStatus() {
  const out = { supported: false, persisted: false, usage: 0, quota: 0 };
  try {
    if (navigator.storage && navigator.storage.persisted) {
      out.supported = true;
      out.persisted = await navigator.storage.persisted();
    }
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      out.usage = est.usage || 0;
      out.quota = est.quota || 0;
    }
  } catch { /* ignore */ }
  return out;
}

export function formatBytes(n) {
  if (!n) return '0 KB';
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
