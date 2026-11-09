// Utilidades de interfaz: creación de nodos, avisos, formatos.
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function toast(mensaje, tipo = 'info', titulo) {
  const titulos = { info: 'INFORMACIÓN', ok: 'LISTO', error: 'ATENCIÓN' };
  const t = h('div', { class: `toast toast--${tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    h('b', {}, titulo || titulos[tipo] || ''), mensaje);
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, tipo === 'error' ? 6500 : 3600);
}

/** Ejecuta una acción mostrando el botón ocupado y los errores como aviso. */
export async function accion(boton, fn) {
  if (boton) { boton.classList.add('is-busy'); boton.disabled = true; }
  try {
    return await fn();
  } catch (e) {
    toast(e.message || String(e), 'error');
    return undefined;
  } finally {
    if (boton) { boton.classList.remove('is-busy'); boton.disabled = false; }
  }
}

export const fmt = {
  m: (v) => v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`,
  min: (v) => v == null ? '—' : `${v.toFixed(2)} min`,
  ms: (v) => v == null ? '—' : v < 0.1 ? `${(v * 1000).toFixed(1)} µs` : `${v.toFixed(v < 10 ? 3 : 1)} ms`,
  n: (v) => v == null ? '—' : Number(v).toLocaleString('es-PE'),
};

export function encabezado(num, eyebrow, titulo, resumen) {
  return h('header', { class: 'slide__head' },
    h('div', {},
      h('p', { class: 'eyebrow' }, eyebrow),
      h('h2', { html: titulo }),
      resumen ? h('p', { class: 'lead', html: resumen }) : null),
    h('span', { class: 'slide__num', 'aria-hidden': 'true' }, String(num).padStart(2, '0')));
}

export function kpi(etiqueta, valor = '—', clase = '', pie = '') {
  const strong = h('strong', { class: clase }, valor);
  const el = h('div', { class: 'kpi' }, h('span', {}, etiqueta), strong, pie ? h('small', {}, pie) : null);
  el.set = (v) => { strong.textContent = v; };
  return el;
}

export function legend(items) {
  return h('div', { class: 'legend' }, items.map(([color, txt, linea]) =>
    h('span', {}, h('i', { class: linea ? 'ln' : '', style: { background: color, boxShadow: `0 0 8px ${color}` } }), txt)));
}

export function katex(tex, display = true) {
  const el = h('div', { class: 'formula' });
  try { window.katex.render(tex, el, { displayMode: display, throwOnError: false }); } catch { el.textContent = tex; }
  return el;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
