import { COLOR } from '../city3d.js';
import { dibujarRutas, nodoAleatorio, viewport } from '../componentes.js';
import { accion, encabezado, fmt, h, katex, toast } from '../ui.js';

export default {
  titulo: 'ETA', capitulo: 'ALGORITMOS',
  notas: 'ETA = Estimated Time of Arrival. Se calcula con la distancia REAL por calles (Dijkstra), no con Haversine. Botón "Buscar caso real": prueba pasajeros hasta encontrar uno donde el más cercano en línea recta no es el que llega primero (por sentidos de circulación o cuadras largas).',
  crear({ city, sim, api, num, raiz }) {
    const vp = viewport();
    const vel = h('input', { type: 'range', min: 10, max: 60, step: 1, value: 30 });
    const velTxt = h('strong', { class: 'c-cyan' }, '30 km/h');
    const tabla = h('table', { class: 'tbl' });
    const cvBox = h('div', { class: 'chart-box', style: { flex: 1 } });
    const caso = h('p', {}, 'Calculando…');
    const btnCaso = h('button', { class: 'btn btn--neon btn--sm', type: 'button' }, 'Buscar caso real');
    const btnNuevo = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Nuevo pasajero');
    raiz.append(
      encabezado(num, 'ALGORITMOS · RF-05', '<em>ETA</em>: tiempo estimado de llegada', 'Tiempo de llegada usando la distancia por calles.'),
      h('div', { class: 'slide__body cols-2' },
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' },
            katex(String.raw`\text{ETA (min)} = \frac{d_{\text{vial}}\,(\text{m}) \,/\, 1000}{v\,(\text{km/h})}\times 60`),
            h('div', { class: 'row', style: { marginTop: '.6rem', justifyContent: 'space-between' } }, h('span', { class: 'hint' }, 'Velocidad promedio:'), velTxt), vel),
          h('div', { class: 'card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h4', {}, 'Candidatos (valores del backend)'), btnNuevo), tabla)),
        h('div', { class: 'stack' },
          h('div', { class: 'card', style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Haversine vs distancia por calles'), cvBox),
          h('div', { class: 'card card--violet' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h4', {}, '¿El más cercano llega primero?'), btnCaso), caso),
          h('div', { style: { flex: 1.1, display: 'grid', minHeight: 0 } }, vp))));

    let pasajero = null, chart = null, ultimo = null;
    function pintar(r) {
      ultimo = r;
      const rutas = r.rutas;
      const mejor = r.mejor_conductor_id;
      const cercano = rutas.reduce((a, b) => (b.distancia_haversine_m < a.distancia_haversine_m ? b : a));
      tabla.replaceChildren(h('tr', {}, h('th', {}, 'Conductor'), h('th', { class: 'num' }, 'Haversine'), h('th', { class: 'num' }, 'Vial (Dijkstra)'), h('th', { class: 'num' }, 'Velocidad'), h('th', { class: 'num' }, 'ETA')),
        ...rutas.map((x) => h('tr', { class: x.conductor_id === mejor ? 'best' : x.conductor_id === cercano.conductor_id ? 'near' : '' },
          h('td', {}, `#${x.ranking} · ${x.conductor_id}${x.conductor_id === mejor ? ' ★' : ''}`), h('td', { class: 'num' }, fmt.m(x.distancia_haversine_m)),
          h('td', { class: 'num' }, x.alcanzable ? fmt.m(x.distancia_vial_m) : 'sin ruta'), h('td', { class: 'num' }, `${x.velocidad_kmh} km/h`), h('td', { class: 'num' }, fmt.min(x.eta_min)))));
      const datos = { labels: rutas.map((x) => `C${x.conductor_id}`), datasets: [
        { label: 'Haversine (m)', data: rutas.map((x) => x.distancia_haversine_m), backgroundColor: 'rgba(250,204,21,.75)', borderRadius: 6 },
        { label: 'Por calles (m)', data: rutas.map((x) => x.distancia_vial_m), backgroundColor: rutas.map((x) => (x.conductor_id === mejor ? 'rgba(139,92,246,.95)' : 'rgba(0,217,255,.6)')), borderRadius: 6 }] };
      if (!chart) {
        const cv = h('canvas'); cvBox.append(cv);
        chart = new window.Chart(cv, { type: 'bar', data: datos, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
          plugins: { legend: { labels: { color: '#A8B3CC' } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${Math.round(c.raw)} m` } } },
          scales: { x: { ticks: { color: '#A8B3CC' }, grid: { display: false } }, y: { ticks: { color: '#A8B3CC' }, grid: { color: 'rgba(120,160,255,.1)' }, title: { display: true, text: 'metros', color: '#6F7B98' } } } } });
      } else { chart.data = datos; chart.update(); }
      const m = rutas.find((x) => x.conductor_id === mejor);
      caso.replaceChildren(cercano.conductor_id === mejor
        ? h('span', {}, `En este caso sí: el conductor ${mejor} es el más cercano en línea recta (${fmt.m(cercano.distancia_haversine_m)}) y también el de menor ETA (${fmt.min(m.eta_min)}).`)
        : h('span', {}, h('strong', { class: 'c-yellow' }, `Conductor ${cercano.conductor_id}`), ` está más cerca en línea recta (${fmt.m(cercano.distancia_haversine_m)}), pero por calles recorre ${fmt.m(cercano.distancia_vial_m)}. `,
          h('strong', { class: 'c-violet' }, `Conductor ${mejor}`), ` llega primero: ${fmt.m(m.distancia_vial_m)} → ETA ${fmt.min(m.eta_min)}. Sentidos de circulación, cuadras y manzanas obligan a rodear.`));
      city.limpiar('overlay');
      dibujarRutas(city, rutas, mejor);
      city.ponerPasajero(pasajero.x, pasajero.y);
      for (const x of rutas) city.etiquetaTaxi(x.conductor_id, `C${x.conductor_id} · ${fmt.min(x.eta_min)}`);
      sim.resaltar({ candidatos: rutas.map((x) => x.conductor_id), asignado: mejor, pasajero });
      return cercano.conductor_id !== mejor;
    }
    async function calcular() {
      const r = await api('/api/rutas/calcular', { pasajero_id: pasajero.id, k: 5, velocidad_kmh: Number(vel.value) });
      return pintar(r);
    }
    async function nuevo(enfocar = true) {
      const p = nodoAleatorio(0.2);
      pasajero = (await api('/api/pasajeros', { x: p.x, y: p.y })).pasajero;
      const distinto = await calcular();
      if (enfocar) city.vista('arriba-cerca', { x: pasajero.x, y: pasajero.y, distancia: 1100 });
      return distinto;
    }
    async function buscarCaso() {
      for (let i = 0; i < 25; i++) {
        if (await nuevo(false)) { city.vista('arriba-cerca', { x: pasajero.x, y: pasajero.y, distancia: 1000 }); toast(`Caso real encontrado tras ${i + 1} intento(s).`, 'ok'); return; }
      }
      city.vista('arriba-cerca', { x: pasajero.x, y: pasajero.y, distancia: 1000 });
      toast('En 25 intentos el más cercano en línea recta coincidió con el de menor ETA.', 'info');
    }
    let deb = null;
    vel.addEventListener('input', () => { velTxt.textContent = `${vel.value} km/h`; clearTimeout(deb); deb = setTimeout(() => pasajero && calcular().catch((e) => toast(e.message, 'error')), 180); });
    btnNuevo.addEventListener('click', () => accion(btnNuevo, () => nuevo()));
    btnCaso.addEventListener('click', () => accion(btnCaso, buscarCaso));
    return {
      viewport: vp,
      entrar() { city.limpiarTodo(); city.visible('flota', true); (pasajero && ultimo ? calcular().catch(() => nuevo()) : nuevo()).catch((e) => toast(e.message, 'error')); },
      salir() { sim.limpiarResaltado(); },
    };
  },
};
