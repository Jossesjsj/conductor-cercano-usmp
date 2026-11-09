import { nodoAleatorio } from '../componentes.js';
import { encabezado, fmt, h, kpi } from '../ui.js';

// Dos lienzos 2D con la flota REAL: a la izquierda se revisa a todos los
// conductores; a la derecha solo los cuadrantes que el Quadtree visita.
export default {
  titulo: 'El problema real', capitulo: 'CONTEXTO',
  notas: 'Pregunta clave: ¿cómo encuentra la app al conductor que llega primero? La forma ingenua revisa a todos los conductores. Con un índice espacial se revisa solo una fracción. Los números vienen del Quadtree del backend con la flota actual.',
  crear({ api, sim, num, raiz }) {
    const cvL = h('canvas', { class: 'heap-canvas' }), cvR = h('canvas', { class: 'heap-canvas' });
    const kL = kpi('Conductores revisados', '—', 'c-red'), kR = kpi('Conductores revisados', '—', 'c-cyan');
    const kN = kpi('Nodos del Quadtree visitados', '—', 'c-cyan');
    const kD = kpi('Cuadrantes descartados', '—', 'c-dim');
    const btn = h('button', { class: 'btn btn--neon', type: 'button' }, '↻ Nueva solicitud');
    raiz.append(
      encabezado(num, 'CONTEXTO · EL PROBLEMA', '¿Cómo se encuentra al conductor que <em>llega primero</em>?', 'Revisar a todos los conductores no escala.'),
      h('div', { class: 'slide__body cols-2' },
        h('div', { class: 'card stack' },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, '❌ Búsqueda ingenua (lineal)'), h('span', { class: 'badge badge--red' }, 'O(n) por solicitud')),
          h('div', { class: 'chart-box', style: { flex: 1 } }, cvL),
          h('div', { class: 'kpis' }, kL, kpi('Rutas por calcular', 'n', 'c-red', 'una por conductor'))),
        h('div', { class: 'card card--neon stack' },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, '✅ Búsqueda espacial (Quadtree)'), btn),
          h('div', { class: 'chart-box', style: { flex: 1 } }, cvR),
          h('div', { class: 'kpis' }, kR, kN, kD, kpi('Rutas por calcular', 'k', 'c-cyan', 'solo k candidatos')))));

    let datos = null, anim = 0, raf = 0;
    function escala(cv) {
      const g = window.__grafo, [xmin, ymin, xmax, ymax] = g.limites;
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const s = Math.min(cv.width / (xmax - xmin), cv.height / (ymax - ymin));
      const ox = (cv.width - (xmax - xmin) * s) / 2, oy = (cv.height - (ymax - ymin) * s) / 2;
      return { s, f: (x, y) => [ox + (x - xmin) * s, cv.height - (oy + (y - ymin) * s)], dpr };
    }
    function dibujar() {
      if (!datos) return;
      anim = Math.min(1, anim + 0.012);
      for (const [cv, lado] of [[cvL, 'L'], [cvR, 'R']]) {
        const { s, f, dpr } = escala(cv);
        const g = cv.getContext('2d');
        g.clearRect(0, 0, cv.width, cv.height);
        g.strokeStyle = 'rgba(40,90,190,.35)'; g.lineWidth = dpr;
        for (const c of window.__grafo.calles) {
          g.beginPath();
          for (let i = 0; i < c.xy.length; i += 2) { const [px, py] = f(c.xy[i], c.xy[i + 1]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.stroke();
        }
        const [px, py] = f(datos.p.x, datos.p.y);
        if (lado === 'L') {
          const n = Math.floor(anim * datos.flota.length);
          g.strokeStyle = 'rgba(255,77,109,.18)';
          for (let i = 0; i < n; i++) { const [x, y] = f(datos.flota[i][1], datos.flota[i][2]); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); }
          kL.set(fmt.n(n));
        } else {
          g.lineWidth = 1.2 * dpr;
          g.strokeStyle = 'rgba(90,110,170,.25)';
          for (const [x0, y0, x1, y1] of datos.q.descartados) { const [a, b] = f(x0, y1); g.strokeRect(a, b, (x1 - x0) * s, (y1 - y0) * s); }
          const vis = datos.q.visitados.slice(0, Math.ceil(anim * datos.q.visitados.length));
          g.strokeStyle = 'rgba(0,217,255,.85)';
          for (const [x0, y0, x1, y1] of vis) { const [a, b] = f(x0, y1); g.strokeRect(a, b, (x1 - x0) * s, (y1 - y0) * s); }
          const [ra, rb] = f(datos.rect[0], datos.rect[3]);
          g.fillStyle = 'rgba(250,204,21,.12)'; g.fillRect(ra, rb, (datos.rect[2] - datos.rect[0]) * s, (datos.rect[3] - datos.rect[1]) * s);
          if (anim > 0.6) {
            g.strokeStyle = 'rgba(250,204,21,.9)';
            for (const c of datos.cands) { const [x, y] = f(c.conductor.x, c.conductor.y); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); }
          }
        }
        for (const [, x, y, est] of datos.flota) {
          const [a, b] = f(x, y);
          g.fillStyle = est === 'disponible' ? '#22E39B' : est === 'ocupado' ? '#FF4D6D' : '#8B5CF6';
          g.beginPath(); g.arc(a, b, 2.2 * dpr, 0, 7); g.fill();
        }
        g.fillStyle = '#FF7BF6'; g.shadowColor = '#FF7BF6'; g.shadowBlur = 16;
        g.beginPath(); g.arc(px, py, 6 * dpr, 0, 7); g.fill(); g.shadowBlur = 0;
      }
      if (anim < 1) raf = requestAnimationFrame(dibujar);
    }
    async function nueva() {
      const p = nodoAleatorio(0.2);
      const [flota, rp] = await Promise.all([api('/api/conductores'), api('/api/pasajeros', { x: p.x, y: p.y })]);
      const rc = await api('/api/candidatos', { pasajero_id: rp.pasajero.id, k: 5 });
      const ultimo = rc.traza_busqueda[rc.traza_busqueda.length - 1];
      const q = await api('/api/quadtree/buscar', { xmin: ultimo.rectangulo[0], ymin: ultimo.rectangulo[1], xmax: ultimo.rectangulo[2], ymax: ultimo.rectangulo[3] });
      datos = { p: rp.pasajero, flota: flota.conductores, q, rect: ultimo.rectangulo, cands: rc.candidatos };
      const revisados = rc.traza_busqueda.reduce((s, t) => s + t.elementos_revisados, 0);
      kR.set(`${fmt.n(revisados)} / ${fmt.n(flota.conductores.length)}`);
      kN.set(fmt.n(rc.traza_busqueda.reduce((s, t) => s + t.nodos_visitados, 0)));
      kD.set(fmt.n(rc.traza_busqueda.reduce((s, t) => s + t.nodos_descartados, 0)));
      anim = 0; cancelAnimationFrame(raf); dibujar();
    }
    btn.addEventListener('click', () => nueva().catch(() => {}));
    return { entrar() { nueva().catch(() => {}); }, salir() { cancelAnimationFrame(raf); } };
  },
};
