/* ==========================================================================
   Utilidades compartidas por las 17 escenas.
   ========================================================================== */

import { icon, katex, escapeHtml } from '../core/format.js';

export const q = (sel, root = document) => root.querySelector(sel);
export const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function heading({ eyebrow = '', title = '', lead = '', right = '' }) {
  return `
    <div class="scene__heading">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <div class="row row--between wrap">
        <h2>${title}</h2>
        ${right}
      </div>
      ${lead ? `<p class="lead">${lead}</p>` : ''}
    </div>`;
}

export function panel({ title = '', eyebrow = '', body = '', footer = '', className = '', iconName = '', headRight = '' }) {
  return `
    <section class="panel glass ${className}">
      ${title || eyebrow ? `
        <header class="panel__head">
          <div>
            ${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
            ${title ? `<h3 class="panel__title">${iconName ? icon(iconName) : ''}${title}</h3>` : ''}
          </div>
          ${headRight}
        </header>` : ''}
      <div class="panel__body">${body}</div>
      ${footer ? `<footer class="panel__footer">${footer}</footer>` : ''}
    </section>`;
}

export function tags(items = []) {
  return `<div class="tags">${items.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>`;
}

export function formula(expr, caption = '') {
  return `<div class="formula">${katex(expr, true)}${caption ? `<div class="formula__caption">${caption}</div>` : ''}</div>`;
}

export function metric(value, label, variant = '') {
  return `<div class="metric ${variant}"><span class="metric__value">${value}</span><span class="metric__label">${escapeHtml(label)}</span></div>`;
}

export function legend(items = []) {
  return `<div class="legend">${items.map((it) => `
    <span class="legend__item">
      ${it.dot ? `<i class="legend__dot ${it.dot}"></i>` : it.line ? `<i class="legend__line ${it.line}"></i>` : ''}
      ${escapeHtml(it.label)}
    </span>`).join('')}</div>`;
}

export function on(root, selector, event, handler, options) {
  const el = typeof selector === 'string' ? q(selector, root) : selector;
  if (el) el.addEventListener(event, handler, options);
  return el;
}

export function setText(root, selector, text) {
  const el = typeof selector === 'string' ? q(selector, root) : selector;
  if (el) el.textContent = text;
  return el;
}

export function setHTML(root, selector, markup) {
  const el = typeof selector === 'string' ? q(selector, root) : selector;
  if (el) el.innerHTML = markup;
  return el;
}

export function toggleClass(el, name, value) {
  if (el) el.classList.toggle(name, Boolean(value));
}

export function destroyChart(chart) {
  try {
    chart?.destroy?.();
  } catch {
    /* el canvas pudo haber sido reemplazado */
  }
  return null;
}

/** Configuración global de Chart.js acorde a la identidad visual. */
export function configureCharts() {
  if (!window.Chart) return;
  const C = window.Chart;
  C.defaults.color = '#A7A2B5';
  C.defaults.borderColor = 'rgba(167, 162, 181, 0.12)';
  C.defaults.font.family = "'Inter', system-ui, sans-serif";
  C.defaults.font.size = 9;
  C.defaults.animation.duration = 450;
  C.defaults.plugins.legend.labels.usePointStyle = true;
  C.defaults.plugins.legend.labels.boxWidth = 7;
  C.defaults.plugins.legend.labels.padding = 12;
  C.defaults.plugins.tooltip.backgroundColor = '#120B1D';
  C.defaults.plugins.tooltip.borderColor = 'rgba(176, 38, 255, 0.45)';
  C.defaults.plugins.tooltip.borderWidth = 1;
  C.defaults.plugins.tooltip.titleFont = { size: 10 };
  C.defaults.plugins.tooltip.bodyFont = { size: 9 };
  C.defaults.scale.grid.color = 'rgba(167, 162, 181, 0.08)';
  C.defaults.scale.ticks.color = '#777187';
}

/** Reemplaza el contenido de forma segura y devuelve el nodo. */
export function render(root, markup) {
  root.innerHTML = markup;
  return root;
}

export function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

export function mapNotice(text) {
  return `<div class="map-offline-msg">${escapeHtml(text)}</div>`;
}

export function button(label, id, variant = 'btn--ghost', attrs = '') {
  return `<button class="btn ${variant} btn--sm" id="${id}" type="button" ${attrs}>${label}</button>`;
}

/** Punto aleatorio sobre una arista real del grafo. */
export function puntoEnRed(graph, rng) {
  const edge = rng.pick(graph.edges);
  const coords = [
    { lat: graph.node(edge.a).lat, lon: graph.node(edge.a).lon },
    ...edge.via.map(([lat, lon]) => ({ lat, lon })),
    { lat: graph.node(edge.b).lat, lon: graph.node(edge.b).lon },
  ];
  const idx = Math.min(coords.length - 2, Math.floor(rng.float(0, coords.length - 1)));
  const f = rng.float(0.08, 0.92);
  const a = coords[idx];
  const b = coords[idx + 1];
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
  };
}

export function canvasSize(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

export function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function nowStamp() {
  return new Date().toLocaleTimeString('es-PE', { hour12: false });
}
