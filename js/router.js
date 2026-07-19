// ============================================================================
// router.js — tiny hash router. Routes look like:  #/projects  or  #/projects/<id>
// ============================================================================

const routes = new Map();
let notFound = () => {};

export function route(name, handler) { routes.set(name, handler); }
export function setNotFound(fn) { notFound = fn; }

export function parseHash() {
  const raw = (location.hash || '#/dashboard').replace(/^#\//, '');
  const [name, ...rest] = raw.split('/');
  return { name: name || 'dashboard', param: rest.join('/') || null };
}

export function navigate(path) {
  if (location.hash === '#/' + path) start(); // re-render same route
  else location.hash = '#/' + path;
}

export async function start() {
  const { name, param } = parseHash();
  const handler = routes.get(name);
  const outlet = document.getElementById('view');
  if (!outlet) return;
  outlet.scrollTop = 0;
  window.scrollTo(0, 0);
  if (handler) await handler(outlet, param);
  else notFound(outlet);
  // reflect active nav
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-nav') === name);
  });
}

export function initRouter() {
  window.addEventListener('hashchange', start);
}
