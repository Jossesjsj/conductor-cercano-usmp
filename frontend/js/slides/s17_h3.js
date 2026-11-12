import { accion, encabezado, fmt, h, kpi, legend, toast } from '../ui.js';

// H3 EXPERIMENTAL: malla hexagonal propia (coordenadas axiales) sobre el plano
// proyectado de Comas, con la flota REAL del backend. No usa la biblioteca h3
// (prohibida en la solución): reproduce su idea —celdas hexagonales y búsqueda
// por anillos (k-ring)— para compararla con nuestro Quadtree.
const TAMANOS = [150, 300, 600]; // radio del hexágono en metros
const SQ3 = Math.sqrt(3);

function aCelda(x, y, s) {
  const qf = (SQ3 / 3 * x - y / 3) / s, rf = (2 / 3 * y) / s, sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf); const t = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(t - sf);
  if (dq > dr && dq > ds) q = -r - t; else if (dr > ds) r = -q - t;
  return [q, r];
}
const centro = (q, r, s) => [s * (SQ3 * q + SQ3 / 2 * r), s * 1.5 * r];
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function anillo(q, r, k) {
  if (k === 0) return [[q, r]];
  const out = []; let a = q + DIRS[4][0] * k, b = r + DIRS[4][1] * k;
  for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push([a, b]); a += DIRS[i][0]; b += DIRS[i][1]; }
  return out;
}

export default {
  titulo: 'H3 experimental', capitulo: 'CONTEXTO',
  notas: 'Experimento: se indexa la flota real en una malla hexagonal (idea de H3 de Uber) construida a mano, sin la biblioteca h3. La búsqueda revisa la celda del pasajero y luego anillos de 6, 12, 18… celdas hasta tener k disponibles, y un anillo más si un conductor no visto aún podría estar más cerca (así el resultado es exacto). Comparar con el Quadtree del backend: mismos candidatos, distinta forma de recorrer el espacio. H3 real: icosaedro, 16 resoluciones, ID de 64 bits.',
  crear({ api, sim, num, raiz }) {
    const cv = h('canvas', { class: 'heap-canvas', style: { cursor: 'crosshair' } });
    const caja = h('div', { class: 'chart-box', style: { flex: 1 } }, cv);
    const k = { celdas: kpi('Celdas revisadas', '—', 'c-violet'), cond: kpi('Conductores revisados', '—', 'c-cyan'), anillos: kpi('Anillos', '—'), t: kpi('Tiempo (navegador)', '—', 'c-yellow') };
    const kq = { t: kpi('Quadtree (backend)', '—', 'c-cyan'), igual: kpi('Mismos candidatos', '—', 'c-green') };
    const estado = { s: 300, k: 5, pas: null, res: null, idx: null };
    const seg = (vals, act, fn, f) => { const el = h('div', { class: 'seg' }, ...vals.map((v) => h('button', { type: 'button', class: v === act ? 'is-on' : '', onclick: (e) => { [...el.children].forEach((b) => b.classList.toggle('is-on', b === e.currentTarget)); fn(v); } }, f(v)))); return el; };
    const lista = h('div', { class: 'log', style: { height: '7.5rem' } });
    const btnAzar = h('button', { class: 'btn btn--violet btn--sm', type: 'button' }, '🎲 Pasajero aleatorio');
    const btnQt = h('button', { class: 'btn btn--neon btn--sm', type: 'button' }, 'Comparar con Quadtree');

    raiz.append(
      encabezado(num, 'CONTEXTO · EXPERIMENTO', '<em>H3 experimental</em>: la flota en hexágonos', 'La idea de Uber, construida a mano sobre la flota real de Comas.'),
      h('div', { class: 'slide__body cols-64' },
        h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', minHeight: 0 } },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h4', { style: { margin: 0 } }, 'Haz clic en el mapa para colocar al pasajero'),
            legend([['#22E39B', 'Disponible'], ['#FF4D6D', 'Ocupado'], ['#FF7BF6', 'Pasajero'], ['#FACC15', 'k más cercanos']])),
          caja),
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card' }, h('h4', {}, 'Parámetros'),
            h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Radio de celda:'), seg(TAMANOS, 300, (v) => { estado.s = v; indexar(); buscar(); }, (v) => `${v} m`)),
            h('div', { class: 'row', style: { marginTop: '.45rem' } }, h('span', { class: 'hint' }, 'k:'), seg([3, 5, 10], 5, (v) => { estado.k = v; buscar(); }, String)),
            h('div', { class: 'row', style: { marginTop: '.55rem' } }, btnAzar, btnQt)),
          h('div', { class: 'card card--violet' }, h('div', { class: 'kpis' }, k.celdas, k.cond, k.anillos, k.t, kq.t, kq.igual)),
          h('div', { class: 'card' }, h('h4', {}, 'Cómo busca'), h('ol', { style: { margin: 0, paddingLeft: '1.1rem' } },
            h('li', {}, 'Cada conductor cae en una celda: ', h('code', {}, 'celda = redondear(x, y)'), ' → O(1).'),
            h('li', {}, 'Se revisa la celda del pasajero y luego anillos de 6, 12, 18… celdas.'),
            h('li', {}, 'Con k disponibles se revisa un anillo extra si alguien no visto aún podría estar más cerca.'))),
          h('div', { class: 'card' }, h('h4', {}, 'Candidatos (malla hexagonal)'), lista),
          h('p', { class: 'note' }, 'Experimental: hexágonos planos propios, no la biblioteca h3 (prohibida en la solución). H3 real proyecta la Tierra sobre un icosaedro, tiene 16 resoluciones y un ID de 64 bits por celda.'))));

    // ----------------------------------------------------------- índice
    function indexar() {
      const idx = new Map();
      for (const c of sim.conductores.values()) {
        const key = aCelda(c.x, c.y, estado.s).join(',');
        if (!idx.has(key)) idx.set(key, []);
        idx.get(key).push(c);
      }
      estado.idx = idx;
    }

    function buscar() {
      if (!estado.pas || !estado.idx) { dibujar(); return; }
      const { x, y } = estado.pas, s = estado.s, K = estado.k;
      const t0 = performance.now();
      const [q0, r0] = aCelda(x, y, s);
      const hallados = []; const celdas = []; let revisados = 0, R = 0;
      // Cota inferior de distancia a cualquier punto del anillo j (centros a ≥ 1,5·j·s; cada punto a ≤ s de su centro).
      const cota = (j) => Math.max(0, 1.5 * j * s - 2 * s);
      for (; R < 60; R++) {
        for (const [q, r] of anillo(q0, r0, R)) {
          celdas.push([q, r, R]);
          for (const c of estado.idx.get(`${q},${r}`) || []) {
            revisados++;
            if (c.estado === 'disponible') hallados.push({ c, d: Math.hypot(c.x - x, c.y - y) });
          }
        }
        hallados.sort((a, b) => a.d - b.d);
        if (hallados.length >= K && hallados[K - 1].d <= cota(R + 1)) break;
      }
      const ms = performance.now() - t0;
      estado.res = { celdas, top: hallados.slice(0, K), R };
      k.celdas.set(fmt.n(celdas.length)); k.cond.set(fmt.n(revisados)); k.anillos.set(R); k.t.set(fmt.ms(ms));
      lista.replaceChildren(...estado.res.top.map((o, i) => h('div', { class: 'ok' }, `#${i + 1} · conductor ${o.c.id} · ${fmt.m(o.d)}`)));
      if (!estado.res.top.length) lista.replaceChildren(h('div', { class: 'err' }, 'No hay conductores disponibles.'));
      kq.t.set('—'); kq.igual.set('—');
      dibujar();
    }

    // ------------------------------------------------------------ dibujo
    let vista = null;
    function dibujar() {
      const g = window.__grafo; if (!g) return;
      const rect = cv.getBoundingClientRect(); if (!rect.width) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = rect.width * dpr; cv.height = rect.height * dpr;
      const ctx = cv.getContext('2d');
      const [x0, y0, x1, y1] = g.limites;
      const e = Math.min(cv.width / (x1 - x0), cv.height / (y1 - y0)) * 0.96;
      const ox = (cv.width - (x1 - x0) * e) / 2, oy = (cv.height - (y1 - y0) * e) / 2;
      const P = (x, y) => [ox + (x - x0) * e, cv.height - oy - (y - y0) * e];
      vista = { e, ox, oy, x0, y0, dpr };
      ctx.fillStyle = 'rgba(120,160,255,.22)';
      for (const n of g.nodos) { const [a, b] = P(n[1], n[2]); ctx.fillRect(a, b, dpr, dpr); }
      const s = estado.s;
      const hex = (q, r, fill, stroke) => {
        const [cx, cy] = centro(q, r, s); ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; const [px, py] = P(cx + s * Math.cos(a), cy + s * Math.sin(a)); ctx.lineTo(px, py); }
        ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
      };
      // Mapa de calor: conductores por celda.
      let max = 1; for (const v of estado.idx?.values() ?? []) max = Math.max(max, v.length);
      ctx.lineWidth = dpr;
      for (const [key, v] of estado.idx ?? []) { const [q, r] = key.split(',').map(Number); hex(q, r, `rgba(139,92,246,${0.06 + 0.4 * v.length / max})`, 'rgba(139,92,246,.35)'); }
      if (estado.res) {
        ctx.lineWidth = 1.6 * dpr;
        for (const [q, r, R] of estado.res.celdas) hex(q, r, R === 0 ? 'rgba(255,123,246,.28)' : 'rgba(0,217,255,.12)', R === estado.res.R ? '#00D9FF' : 'rgba(0,217,255,.6)');
      }
      for (const c of sim.conductores.values()) {
        const [a, b] = P(c.x, c.y); ctx.fillStyle = c.estado === 'disponible' ? '#22E39B' : c.estado === 'ocupado' ? '#FF4D6D' : '#FACC15';
        ctx.beginPath(); ctx.arc(a, b, 1.8 * dpr, 0, 7); ctx.fill();
      }
      if (estado.pas) {
        const [px, py] = P(estado.pas.x, estado.pas.y);
        ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 1.5 * dpr;
        for (const o of estado.res?.top ?? []) { const [a, b] = P(o.c.x, o.c.y); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(a, b); ctx.stroke(); ctx.fillStyle = '#FACC15'; ctx.beginPath(); ctx.arc(a, b, 3.5 * dpr, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#FF7BF6'; ctx.shadowColor = '#FF7BF6'; ctx.shadowBlur = 12 * dpr;
        ctx.beginPath(); ctx.arc(px, py, 5.5 * dpr, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      }
    }

    cv.addEventListener('click', (ev) => {
      if (!vista) return;
      const r = cv.getBoundingClientRect(), { e, ox, oy, x0, y0, dpr } = vista;
      const px = (ev.clientX - r.left) * dpr, py = (ev.clientY - r.top) * dpr;
      estado.pas = { x: x0 + (px - ox) / e, y: y0 + (cv.height - oy - py) / e };
      buscar();
    });
    btnAzar.addEventListener('click', () => {
      const g = window.__grafo, n = g.nodos[Math.floor(Math.random() * g.nodos.length)];
      estado.pas = { x: n[1], y: n[2] }; buscar();
    });
    btnQt.addEventListener('click', () => accion(btnQt, async () => {
      if (!estado.pas) throw new Error('Primero coloca un pasajero en el mapa.');
      const rp = await api('/api/pasajeros', { x: estado.pas.x, y: estado.pas.y });
      estado.pas = { x: rp.pasajero.x, y: rp.pasajero.y }; // misma posición que usa el backend
      indexar(); buscar();
      const rc = await api('/api/candidatos', { pasajero_id: rp.pasajero.id, k: estado.k });
      const a = new Set(rc.candidatos.map((c) => c.conductor_id));
      const iguales = estado.res.top.filter((o) => a.has(o.c.id)).length;
      kq.t.set(fmt.ms(rc.tiempo_ms)); kq.igual.set(`${iguales}/${rc.candidatos.length}`);
      toast(`Quadtree (Python): ${fmt.ms(rc.tiempo_ms)} · coinciden ${iguales} de ${rc.candidatos.length} candidatos.`, 'info');
    }));

    new ResizeObserver(dibujar).observe(caja);
    return { entrar() { indexar(); buscar(); } };
  },
};
