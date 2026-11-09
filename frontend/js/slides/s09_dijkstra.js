import { COLOR } from '../city3d.js';
import { herramientasMapa, nodoAleatorio, viewport } from '../componentes.js';
import { accion, encabezado, fmt, h, kpi, legend, toast } from '../ui.js';

// Reproduce la TRAZA de una ejecución real del Dijkstra propio (backend):
// cada paso es una extracción de la cola o una relajación de aristas.
export default {
  titulo: 'Dijkstra', capitulo: 'ALGORITMOS',
  notas: 'RF-05: Dijkstra propio con heapq sobre el grafo dirigido. Azul = en la cola (pendiente), amarillo = nodo extraído, verde = procesado (distancia definitiva), violeta = ruta final reconstruida con los predecesores. La animación reproduce la traza de la ejecución real del backend.',
  crear({ city, sim, api, num, raiz }) {
    const vp = viewport();
    vp.append(h('div', { class: 'vp-overlay vp-tr' }, herramientasMapa(city, sim, { capas: ['edificios', 'flota', 'nodos'], seguir: false, pausa: false })),
      h('div', { class: 'vp-overlay vp-bl' }, legend([['#2f7bff', 'Pendiente (en cola)'], ['#FACC15', 'Nodo actual'], ['#22E39B', 'Procesado'], ['#B18CFF', 'Ruta final'], ['#FF7BF6', 'Pasajero']])));
    const k = { paso: kpi('Paso', '—', 'c-cyan'), nodo: kpi('Nodo extraído', '—', 'c-yellow'), dist: kpi('Distancia', '—', 'c-yellow'), proc: kpi('Procesados', '—', 'c-green'), pend: kpi('En la cola', '—'), relaj: kpi('Relajaciones', '—') };
    const info = h('p', { class: 'note' }, 'Cargando caso…');
    const ultimo = h('div', { class: 'log', style: { height: '7.5rem' } });
    const vel = h('input', { type: 'range', min: 1, max: 60, value: 12 });
    const b = (t, c, f) => { const x = h('button', { class: `btn btn--sm ${c}`, type: 'button', onclick: f }, t); return x; };
    const btnPlay = b('▶ Iniciar', 'btn--neon', () => (timer ? pausar() : iniciar()));
    const btnNuevo = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Nuevo caso');
    raiz.append(
      encabezado(num, 'ALGORITMOS · RF-05', '<em>Dijkstra</em> sobre las calles', 'Del conductor hacia el pasajero, por calles reales.'),
      h('div', { class: 'slide__body cols-73' }, vp,
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' }, h('div', { class: 'kpis' }, k.paso, k.nodo, k.dist, k.proc, k.pend, k.relaj), info),
          h('div', { class: 'card' }, h('h4', {}, 'Controles'),
            h('div', { class: 'row' }, btnPlay, b('‹ Anterior', 'btn--ghost', () => { pausar(); irA(idx - 1); }), b('Siguiente ›', 'btn--ghost', () => { pausar(); irA(idx + 1); })),
            h('div', { class: 'row', style: { marginTop: '.45rem' } }, b('↺ Reiniciar', 'btn--ghost', () => { pausar(); irA(0); }), b('Mostrar solución', 'btn--violet', () => { pausar(); irA(pasos.length - 1); }), btnNuevo),
            h('label', { class: 'field', style: { marginTop: '.5rem' } }, 'Velocidad de reproducción', vel)),
          h('div', { class: 'card' }, h('h4', {}, 'Último paso'), ultimo))));

    let pasos = [], idx = 0, timer = null, ruta = null, total = null;
    // Estado reconstruido hasta el paso i (permite retroceder con exactitud).
    function estadoHasta(i) {
      const color = new Map();
      let actual = null, procesados = 0, relaj = 0, ultimoPaso = null;
      for (let j = 0; j <= i && j < pasos.length; j++) {
        const p = pasos[j];
        ultimoPaso = p;
        if (p.tipo === 'inicio') color.set(p.nodo, COLOR.pendiente);
        else if (p.tipo === 'extraer') { if (actual != null) color.set(actual, COLOR.procesado); actual = p.nodo; color.set(p.nodo, COLOR.actual); procesados++; }
        else if (p.tipo === 'relajar') { for (const [v] of p.mejoras) if (color.get(v) !== COLOR.procesado) color.set(v, COLOR.pendiente); relaj += p.mejoras.length; }
        else if (p.tipo === 'ruta') { if (actual != null) color.set(actual, COLOR.procesado); for (const n of p.camino) color.set(n, COLOR.ruta); }
      }
      return { color, actual, procesados, relaj, ultimoPaso };
    }
    function irA(i) {
      if (!pasos.length) return;
      idx = Math.max(0, Math.min(pasos.length - 1, i));
      const e = estadoHasta(idx);
      city.pintarNodos(e.color, null, 13);
      const p = e.ultimoPaso;
      const ext = [...pasos.slice(0, idx + 1)].reverse().find((x) => x.tipo === 'extraer');
      k.paso.set(`${idx + 1}/${pasos.length}`);
      k.nodo.set(ext ? ext.nodo : '—'); k.dist.set(ext ? fmt.m(ext.dist) : '—');
      k.proc.set(fmt.n(e.procesados)); k.pend.set(ext ? fmt.n(ext.pendientes) : '1'); k.relaj.set(fmt.n(e.relaj));
      const desc = p.tipo === 'inicio' ? `Inicio en el nodo ${p.nodo} (distancia 0).`
        : p.tipo === 'extraer' ? `heappop → nodo ${p.nodo} con d = ${p.dist} m. Su distancia ya es definitiva.`
          : p.tipo === 'relajar' ? `Relajar aristas de ${p.nodo}: ${p.mejoras.map(([v, d]) => `${v} ← ${d} m`).join(', ')}`
            : p.tipo === 'ruta' ? `Destino extraído. Ruta reconstruida: ${p.camino.length} nodos, ${fmt.m(p.dist)}.` : 'No existe ruta alcanzable.';
      ultimo.replaceChildren(h('div', { class: p.tipo === 'ruta' ? 'ok' : 'inf' }, desc));
      city.limpiar('rutas');
      if (p.tipo === 'ruta' && ruta) city.ruta(ruta.geometria, COLOR.violeta, { ancho: 11 });
    }
    function iniciar() {
      if (idx >= pasos.length - 1) irA(0);
      btnPlay.textContent = '⏸ Pausar';
      timer = setInterval(() => { const n = Math.ceil(Number(vel.value) / 6); if (idx >= pasos.length - 1) { pausar(); return; } irA(idx + n); }, 60);
    }
    function pausar() { clearInterval(timer); timer = null; btnPlay.textContent = '▶ Iniciar'; }

    async function nuevoCaso() {
      pausar();
      const p = nodoAleatorio(0.22);
      const rp = await api('/api/pasajeros', { x: p.x, y: p.y });
      const pas = rp.pasajero;
      // Ruta real del despacho para el candidato #1 (más cercano en línea recta), con traza.
      const r = await api('/api/rutas/calcular', { pasajero_id: pas.id, k: 1, traza: true });
      ruta = r.rutas[0];
      pasos = ruta.traza || [];
      total = ruta;
      city.limpiar('overlay'); city.limpiar('rutas');
      city.ponerPasajero(pas.x, pas.y);
      const c = ruta.conductor;
      sim.resaltar({ candidatos: [c.id], asignado: null, pasajero: pas });
      city.marca(c.x, c.y, COLOR.amarillo, 7);
      city.etiqueta(c.x, c.y, `Conductor ${c.id} (origen)`, '', 40);
      city.etiqueta(pas.x, pas.y, 'Pasajero (destino)', '', 60);
      city.visible('nodos', true);
      city.vista('arriba-cerca', { x: (c.x + pas.x) / 2, y: (c.y + pas.y) / 2, distancia: Math.max(900, Math.hypot(c.x - pas.x, c.y - pas.y) * 1.9) });
      info.textContent = `Conductor ${c.id} → pasajero ${pas.id}. Nodo origen ${ruta.nodo_origen}${ruta.metros_hasta_interseccion > 0 ? ` (+${fmt.m(ruta.metros_hasta_interseccion)} para terminar su cuadra)` : ''}. Resultado: ${fmt.m(total.distancia_vial_m)}, ${ruta.nodos_explorados} nodos explorados en ${fmt.ms(ruta.tiempo_dijkstra_ms)}.`;
      irA(0);
    }
    btnNuevo.addEventListener('click', () => accion(btnNuevo, nuevoCaso));
    return {
      viewport: vp,
      entrar() { city.limpiarTodo(); city.visible('flota', true); nuevoCaso().catch((e) => toast(e.message, 'error')); },
      salir() { pausar(); city.visible('nodos', false); sim.limpiarResaltado(); },
    };
  },
};
