/* Utilidades compartidas: formato, DOM, iconos, descargas. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const round = (v, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

const nfInt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const fmtInt = (v) => nfInt.format(Number(v) || 0);
export const fmt1 = (v) => nf1.format(Number(v) || 0);
export const fmt2 = (v) => nf2.format(Number(v) || 0);
export const fmt3 = (v) => nf3.format(Number(v) || 0);

export const fmtKm = (km, digits = 2) => {
  const v = Number(km) || 0;
  if (v < 1) return `${fmtInt(v * 1000)} m`;
  return `${digits === 1 ? fmt1(v) : fmt2(v)} km`;
};
export const fmtM = (m) => (m >= 1000 ? `${fmt2(m / 1000)} km` : `${fmtInt(m)} m`);
export const fmtMin = (min) => {
  const v = Number(min) || 0;
  if (v < 1) return `${fmtInt(v * 60)} s`;
  if (v < 60) return `${fmt1(v)} min`;
  const h = Math.floor(v / 60);
  return `${h} h ${fmtInt(v % 60)} min`;
};
export const fmtMs = (ms) => {
  const v = Number(ms) || 0;
  if (v < 0.01) return `${(v * 1000).toFixed(1)} µs`;
  if (v < 1) return `${v.toFixed(3)} ms`;
  if (v < 100) return `${v.toFixed(2)} ms`;
  return `${v.toFixed(0)} ms`;
};
export const fmtPct = (v, digits = 1) => `${v >= 0 ? '' : ''}${digits === 0 ? fmtInt(v) : fmt1(v)} %`;

export const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const html = (strings, ...values) => strings.reduce((out, s, i) => out + s + (values[i] ?? ''), '');

export function katex(expr, display = false) {
  if (window.katex) {
    try {
      return window.katex.renderToString(expr, {
        displayMode: display,
        throwOnError: false,
        output: 'html',
        strict: false,
      });
    } catch {
      /* fallback */
    }
  }
  return `<code>${escapeHtml(expr)}</code>`;
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toast(message, kind = 'info', duration = 3200) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const node = document.createElement('div');
  node.className = `toast${kind === 'warn' ? ' toast--warn' : ''}`;
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 280);
  }, duration);
}

export function setRangeFill(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const val = Number(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

export function debounce(fn, wait = 160) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function compileTemplate(tpl, data) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
}

/* Iconos de línea, sin dependencias. */
const ICONS = {
  route: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.4 18H14a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h.5"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 17.5l9 5 9-5"/>',
  tree: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>',
  sigma: '<path d="M18 4H6l6 8-6 8h12"/>',
  heap: '<path d="M12 3v5M6 21v-5M18 21v-5M7 8h10M5 16h4M15 16h4"/><circle cx="12" cy="4" r="1.6"/><circle cx="5" cy="20" r="1.6"/><circle cx="19" cy="20" r="1.6"/>',
  graph: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m7.3 6h9.4M6.2 8.3l4.6 7.4M17.8 8.3l-4.6 7.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  test: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/>',
  compare: '<path d="M4 7h13M14 4l3 3-3 3M20 17H7M10 14l-3 3 3 3"/>',
  flag: '<path d="M5 22V4M5 4h12l-2 4 2 4H5"/>',
  play: '<path d="M7 4l13 8-13 8V4Z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2 7M4 4v6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  warning: '<path d="M12 3 2.7 20h18.6L12 3Z"/><path d="M12 9v5M12 17.5v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/>',
  arrow: '<path d="M5 12h14M14 6l6 6-6 6"/>',
  car: '<path d="m5 16-1-5 2-5h12l2 5-1 5"/><path d="M4 16h16v4H4zM7 20v2M17 20v2"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  node: '<circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  building: '<path d="M4 21V5l8-3v19M12 8h8v13M7 7v1M7 11v1M7 15v1M16 11v1M16 15v1M2 21h20"/>',
  spark: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M19.1 4.9l-3.5 3.5M8.4 15.6l-3.5 3.5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.node}</svg>`;
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

export function formatCoord(lat, lon) {
  return `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;
}

export function percentageChange(a, b) {
  if (!a) return 0;
  return ((b - a) / a) * 100;
}
