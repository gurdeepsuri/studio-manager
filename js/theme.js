// ============================================================================
// theme.js — apply light / dark / system appearance.
// ============================================================================

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme'); // 'system' → follow prefers-color-scheme
}
