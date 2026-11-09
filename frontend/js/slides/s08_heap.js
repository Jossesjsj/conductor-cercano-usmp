import { dibujarBusqueda, dibujarCandidatos, nodoAleatorio, tarjetasCandidatos, viewport } from '../componentes.js';
import { accion, encabezado, fmt, h } from '../ui.js';

// Reproduce la secuencia REAL de operaciones del heap (registrada por el
// backend en estructuras/vecinos.py) durante la última ampliación de la búsqueda.
export default {
  titulo: 'Heap y k candidatos', capitulo: 'ALGORITMOS',
  notas: 'RF-04: el Quadtree entrega los conductores del cuadrado; para cada uno se calcula Haversine y un max-heap de tamaño k conserva los k más cercanos. La raíz es el más lejano de los k: si llega uno más cercano, reemplaza a la raíz. Si faltan candidatos, se duplica el radio. Ojo: este orden es por Haversine, NO por ETA.',
  crear({ city, sim, api, num, raiz }) {
    const vp = viewport();
    const cv = h('canvas', { class: 'heap-canvas' });
    const lista = h('div', { class: 'scroll-y', style: { flex: 1, minHeight: 0 } });
    const tablaTraza = h('table', { class: 'tbl' });
    const estadoOp = h('div', { class: 'row' });
    let k = 5;
    const segK = h('div', { class: 'seg' }, ...[3, 5, 10].map((v) => h('button', { type: 'button', class: v === k ? 'is-on' : '', onclick: (e) => { k = v; [...segK.children].forEach((b) => b.classList.toggle('is-on', b === e.currentTarget)); if (pasajero) buscar().catch(() => {}); } }, `k = ${v}`)));
    const btnNuevo = h('button', { class: 'btn btn--neon', type: 'button' }, 'Nuevo pasajero');
    const btnRep = h('button', { class: 'btn btn--violet btn--sm', type: 'button' }, '↻ Repetir animación');
    raiz.append(
      encabezado(num, 'ALGORITMOS · RF-04', '<em>Heap</em>: los k disponibles más cercanos', 'Cuadrado de radio r → Haversine → max-heap de tamaño k.'),
      h('div', { class: 'slide__body', style: { gridTemplateColumns: 'minmax(0,3fr) minmax(0,4fr) minmax(0,3fr)' } },
        h('div', { class: 'stack' },
          h('div', { class: 'card card--neon' }, h('h4', {}, 'Parámetros'), h('div', { class: 'row' }, segK, btnNuevo)),
          h('div', { class: 'card', style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Ranking por distancia Haversine'), lista)),
        h('div', { class: 'stack' },
          h('div', { class: 'card card--violet', style: { flex: 1.25, display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h4', {}, 'Max-heap de tamaño k (raíz = más lejano)'), btnRep),
            estadoOp, h('div', { class: 'chart-box', style: { flex: 1 } }, cv)),
          h('div', { class: 'card', style: { flex: 0.75, overflow: 'auto' } }, h('h4', {}, 'Ampliaciones de la región'), tablaTraza)),
        vp));

    let pasajero = null, ops = [], idx = 0, timer = null;
    function dibujarHeap(op) {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      if (!op) return;
      const heap = op.heap;
      const niveles = Math.max(1, Math.ceil(Math.log2(heap.length + 1)));
      const pos = heap.map((_, i) => {
        const nivel = Math.floor(Math.log2(i + 1)), enNivel = i - (2 ** nivel - 1), total = 2 ** nivel;
        return [cv.width * (enNivel + 0.5) / total, 34 * dpr + nivel * (cv.height - 70 * dpr) / Math.max(1, niveles - 1 || 1)];
      });
      g.strokeStyle = 'rgba(139,92,246,.6)'; g.lineWidth = 2 * dpr;
      heap.forEach((_, i) => { if (i) { const p = pos[Math.floor((i - 1) / 2)]; g.beginPath(); g.moveTo(...p); g.lineTo(...pos[i]); g.stroke(); } });
      const rad = Math.min(30 * dpr, cv.width / (2 ** (niveles - 1)) / 2.4);
      heap.forEach(([d, id], i) => {
        const [x, y] = pos[i];
        const nuevo = id === op.id && op.op !== 'descartar';
        g.fillStyle = nuevo ? 'rgba(250,204,21,.35)' : i === 0 ? 'rgba(255,77,109,.25)' : 'rgba(0,217,255,.14)';
        g.strokeStyle = nuevo ? '#FACC15' : i === 0 ? '#FF4D6D' : '#00D9FF';
        g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `700 ${Math.max(9, rad * 0.42)}px Inter`;
        g.fillText(`${Math.round(d)} m`, x, y + 2 * dpr);
        g.fillStyle = '#A8B3CC'; g.font = `${Math.max(8, rad * 0.32)}px Inter`;
        g.fillText(`id ${id}`, x, y + rad * 0.62);
      });
    }
    function mostrarOp(i) {
      const op = ops[i];
      if (!op) return;
      const etiqueta = { insertar: ['badge--green', 'heappush: insertar'], reemplazar_raiz: ['badge--yellow', `heapreplace: sale ${op.sale}`], descartar: ['badge--red', 'descartar: más lejos que la raíz'] }[op.op];
      estadoOp.replaceChildren(h('span', { class: `badge ${etiqueta[0]}` }, etiqueta[1]), h('span', { class: 'hint' }, `Operación ${i + 1}/${ops.length} · conductor ${op.id} a ${fmt.m(op.d)}`));
      dibujarHeap(op);
    }
    function reproducir() {
      clearInterval(timer); idx = 0;
      const paso = Math.max(160, Math.min(700, 9000 / Math.max(1, ops.length)));
      mostrarOp(0);
      timer = setInterval(() => { idx++; if (idx >= ops.length) { clearInterval(timer); return; } mostrarOp(idx); }, paso);
    }
    async function buscar() {
      const rc = await api('/api/candidatos', { pasajero_id: pasajero.id, k });
      const traza = rc.traza_busqueda;
      ops = traza[traza.length - 1].operaciones_heap || [];
      dibujarBusqueda(city, traza, { todosLosPasos: true });
      dibujarCandidatos(city, pasajero, rc.candidatos);
      sim.resaltar({ candidatos: rc.candidatos.map((c) => c.conductor_id), asignado: null, pasajero });
      lista.replaceChildren(tarjetasCandidatos(rc.candidatos), h('p', { class: 'note' }, `Búsqueda en ${fmt.ms(rc.tiempo_ms)} · ordenado por Haversine (no por ETA).`));
      tablaTraza.replaceChildren(h('tr', {}, h('th', {}, 'r'), h('th', { class: 'num' }, 'Hallados'), h('th', { class: 'num' }, 'k-ésimo'), h('th', {}, 'Decisión')),
        ...traza.map((t) => h('tr', {}, h('td', {}, fmt.m(t.radio_m)), h('td', { class: 'num' }, t.encontrados), h('td', { class: 'num' }, t.kesima_distancia_m == null ? '—' : fmt.m(t.kesima_distancia_m)), h('td', { class: t.suficiente ? 'c-green' : 'c-yellow' }, t.motivo))));
      reproducir();
    }
    async function nuevo() {
      const p = nodoAleatorio(0.2);
      const rp = await api('/api/pasajeros', { x: p.x, y: p.y });
      pasajero = rp.pasajero;
      city.ponerPasajero(pasajero.x, pasajero.y);
      city.vista('arriba-cerca', { x: pasajero.x, y: pasajero.y, distancia: 1300 });
      await buscar();
    }
    btnNuevo.addEventListener('click', () => accion(btnNuevo, nuevo));
    btnRep.addEventListener('click', reproducir);
    new ResizeObserver(() => mostrarOp(idx)).observe(cv);
    return {
      viewport: vp,
      entrar() { city.limpiarTodo(); city.visible('flota', true); nuevo().catch(() => {}); },
      salir() { clearInterval(timer); sim.limpiarResaltado(); },
    };
  },
};
