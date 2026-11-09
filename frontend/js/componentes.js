// Componentes reutilizables: viewport 3D, herramientas de cámara y dibujo
// de cada etapa del despacho a partir de las respuestas REALES del backend.
import { COLOR } from './city3d.js';
import { h, fmt } from './ui.js';

export function viewport(clase = '') {
  return h('div', { class: `viewport ${clase}` });
}

/** Barra de herramientas del mapa. Cada botón tiene una función real. */
export function herramientasMapa(city, sim, { capas = ['edificios', 'flota', 'rutas'], seguir = true, pausa = true } = {}) {
  const nombres = { edificios: ['🏢', 'Mostrar/ocultar edificios'], flota: ['🚕', 'Mostrar/ocultar conductores'], rutas: ['〰', 'Mostrar/ocultar rutas'], nodos: ['•', 'Mostrar/ocultar intersecciones'], overlay: ['▦', 'Mostrar/ocultar búsqueda y Quadtree'] };
  const b = (txt, titulo, fn) => h('button', { type: 'button', title: titulo, 'aria-label': titulo, onclick: fn }, txt);
  const caja = h('div', { class: 'vp-tools' },
    b('＋', 'Acercar (zoom)', () => city.zoom(0.7)),
    b('－', 'Alejar (zoom)', () => city.zoom(1.4)),
    b('⟲', 'Rotar 45°', () => city.rotar(Math.PI / 4)),
    h('hr'),
    b('⊤', 'Vista superior', () => city.vista('superior')),
    b('◇', 'Vista isométrica', () => city.vista('isometrica')),
    b('◎', 'Centrar cámara (en el pasajero si existe)', () => {
      const p = sim.pasajero;
      if (p) city.vista('cerca', { x: p.x, y: p.y, distancia: 700 }); else city.vista('isometrica');
    }),
    b('⌂', 'Restablecer vista', () => city.vista('inicial')));
  if (seguir) {
    const bt = b('🎯', 'Seguir al taxi seleccionado / asignado', () => {
      if (city.seguir != null) { city.seguir = null; bt.classList.remove('is-on'); return; }
      const id = sim.asignado ?? caja.dataset.sel;
      if (id == null || id === '') { bt.title = 'Selecciona un taxi con clic primero'; return; }
      const c = sim.conductores.get(Number(id));
      if (c) { city.vista('cerca', { x: c.x, y: c.y, distancia: 420 }); setTimeout(() => city.seguirTaxi(Number(id)), 1300); bt.classList.add('is-on'); }
    });
    caja.append(bt);
  }
  caja.append(h('hr'));
  for (const capa of capas) {
    const [ic, tit] = nombres[capa];
    const bt = b(ic, tit, () => { const v = !city.grupos[capa].visible; city.visible(capa, v); bt.classList.toggle('is-on', v); });
    bt.classList.toggle('is-on', capa !== 'nodos');
    bt.dataset.capa = capa;
    caja.append(bt);
  }
  if (pausa) {
    const bp = b('⏸', 'Pausar/reanudar animaciones', () => {
      city.pausado = !city.pausado; sim.pausaGlobal = city.pausado;
      bp.textContent = city.pausado ? '▶' : '⏸'; bp.classList.toggle('is-on', city.pausado);
    });
    caja.append(bp);
  }
  caja.sincronizar = () => caja.querySelectorAll('[data-capa]').forEach((x) => x.classList.toggle('is-on', city.grupos[x.dataset.capa].visible));
  return caja;
}

export function leyendaFlota() {
  const l = h('div', { class: 'legend' });
  for (const [c, t] of [['#22E39B', 'Disponible'], ['#FF4D6D', 'Ocupado'], ['#FACC15', 'Candidato'], ['#8B5CF6', 'Asignado'], ['#FF7BF6', 'Pasajero']]) {
    l.append(h('span', {}, h('i', { style: { background: c, boxShadow: `0 0 8px ${c}` } }), t));
  }
  return l;
}

// ---------------------------------------------------- etapas del despacho
export function dibujarBusqueda(city, traza, { todosLosPasos = false } = {}) {
  city.limpiar('overlay');
  const pasos = todosLosPasos ? traza : [traza[traza.length - 1]];
  traza.forEach((p, i) => {
    if (i < traza.length - 1) city.rectangulos([p.rectangulo], COLOR.cian, { opacidad: 0.35, altura: 4 });
  });
  const ultimo = traza[traza.length - 1];
  for (const p of pasos) city.rectangulos(p.descartados, 0x3a4a7a, { opacidad: 0.35, altura: 2.5 });
  city.rectangulos(ultimo.visitados, COLOR.cian, { opacidad: 0.75, altura: 3 });
  city.area(ultimo.rectangulo, COLOR.amarillo, 0.07);
}

export function dibujarCandidatos(city, pasajero, candidatos, mejorId = null) {
  for (const c of candidatos) {
    const x = c.conductor.x, y = c.conductor.y;
    const color = c.conductor_id === mejorId ? COLOR.violeta : COLOR.amarillo;
    if (!city.arcoTaxi([pasajero.x, pasajero.y], c.conductor_id, color)) city.arco([pasajero.x, pasajero.y], [x, y], color, { radio: 1.8 });
    if (!city.etiquetaTaxi(c.conductor_id, `#${c.ranking} · ${fmt.m(c.distancia_haversine_m)}`)) city.etiqueta(x, y, `#${c.ranking}`, '', 34);
  }
}

export function dibujarRutas(city, rutas, elegidoId) {
  city.limpiar('rutas');
  for (const r of rutas) {
    if (!r.alcanzable || r.conductor_id === elegidoId) continue;
    city.ruta(r.geometria, COLOR.amarillo, { ancho: 4, opacidad: 0.45, altura: 1.6 });
  }
  const e = rutas.find((r) => r.conductor_id === elegidoId);
  if (e) city.ruta(e.geometria, COLOR.violeta, { ancho: 11, opacidad: 1, altura: 2.2 });
}

/** Tarjetas de candidatos (ranking por Haversine; el elegido por ETA se marca aparte). */
export function tarjetasCandidatos(candidatos, { mejorId = null, conRuta = null } = {}) {
  return h('div', { class: 'cand-list' }, candidatos.map((c, i) => {
    const r = conRuta?.find((x) => x.conductor_id === c.conductor_id);
    return h('div', { class: `cand ${c.conductor_id === mejorId ? 'best' : ''}`, style: { animationDelay: `${i * 70}ms` } },
      h('span', { class: 'rk' }, `#${c.ranking}`),
      h('div', {}, h('div', { class: 'id' }, `Conductor ${c.conductor_id}`),
        h('div', { class: 'meta' }, `Estado: ${c.conductor.estado}${r ? ` · vial ${fmt.m(r.distancia_vial_m)} · ETA ${fmt.min(r.eta_min)}` : ''}`)),
      h('span', { class: 'd' }, fmt.m(c.distancia_haversine_m)));
  }));
}

/** Inversa de la proyección local del backend (estructuras/proyeccion.py). */
export function xyALatLon(x, y) {
  const [lat0, lon0] = window.__grafo.resumen.centro;
  const R = 6371008.8, ky = Math.PI / 180 * R, kx = ky * Math.cos(lat0 * Math.PI / 180);
  return [lat0 + y / ky, lon0 + x / kx];
}

/** Elige un punto aleatorio sobre una intersección real (para demos). */
export function nodoAleatorio(margen = 0.15) {
  const g = window.__grafo;
  const [xmin, ymin, xmax, ymax] = g.limites;
  const mx = (xmax - xmin) * margen, my = (ymax - ymin) * margen;
  for (let i = 0; i < 50; i++) {
    const n = g.nodos[Math.floor(Math.random() * g.nodos.length)];
    if (n[1] > xmin + mx && n[1] < xmax - mx && n[2] > ymin + my && n[2] < ymax - my) return { x: n[1], y: n[2] };
  }
  const n = g.nodos[0];
  return { x: n[1], y: n[2] };
}
