import { encabezado, h } from '../ui.js';

const ETAPAS = [
  { ic: '🧍', t: 'Pasajero', s: 'dirección o coordenadas', mod: 'simulacion/pasajero.py', d: 'Se ubica en la intersección más cercana.', o: 'O(log n)' },
  { ic: '▦', t: 'Quadtree', s: 'consulta espacial', mod: 'estructuras/quadtree.py', d: 'Solo revisa los cuadrantes cercanos.', o: 'O(log n + m)' },
  { ic: '🌐', t: 'Haversine', s: 'distancia geográfica', mod: 'estructuras/haversine.py', d: 'Distancia en línea recta sobre la Tierra.', o: 'O(1)' },
  { ic: '⛰', t: 'Heap', s: 'k más cercanos', mod: 'estructuras/vecinos.py', d: 'Conserva los k disponibles más cercanos.', o: 'O(m log k)' },
  { ic: '🛣', t: 'Dijkstra', s: 'ruta por calles', mod: 'algoritmos/dijkstra.py', d: 'Ruta real de cada candidato al pasajero.', o: 'O((V+E) log V)' },
  { ic: '⏱', t: 'ETA', s: 'tiempo estimado', mod: 'simulacion/despachador.py', d: 'Distancia vial ÷ velocidad promedio.', o: 'O(k)' },
  { ic: '🚕', t: 'Asignación', s: 'menor ETA', mod: 'Despachador', d: 'Gana el que llega primero.', o: 'O(k)' },
];
const OBJETIVOS = [['▦', 'Quadtree propio'], ['⛰', 'Heap + grafos + Dijkstra'], ['🗺', 'Datos reales de OSM'], ['📊', 'Medir lineal vs Quadtree']];

export default {
  titulo: 'Objetivos y arquitectura', capitulo: 'CONTEXTO',
  notas: 'Objetivos: Quadtree propio para búsquedas por cercanía; combinar heap, grafos y Dijkstra; trabajar con datos geográficos reales; demostrar con mediciones por qué la búsqueda lineal no escala. Hacer clic en cada etapa del flujo para ver su archivo Python y su costo. Arquitectura: frontend Three.js → API FastAPI → módulos Python → red OSM guardada localmente.',
  crear({ num, raiz }) {
    const detalle = h('div', { class: 'card card--neon', style: { display: 'flex', alignItems: 'center', gap: '1.5rem' } });
    const pasos = ETAPAS.map((e, i) => h('button', { class: 'pipe-step', type: 'button', onclick: () => seleccionar(i) },
      h('span', { class: 'ic' }, e.ic), h('b', {}, e.t), h('small', {}, e.s)));
    const pipeline = h('div', { class: 'pipeline' });
    pasos.forEach((p, i) => { pipeline.append(p); if (i < pasos.length - 1) pipeline.append(h('span', { class: 'pipe-arrow' }, '→')); });

    function seleccionar(i) {
      pasos.forEach((p, j) => { p.classList.toggle('is-active', j === i); p.classList.toggle('is-done', j < i); });
      const e = ETAPAS[i];
      detalle.replaceChildren(h('span', { style: { fontSize: '2.4rem' } }, e.ic),
        h('div', { style: { flex: 1 } }, h('h3', {}, `${i + 1}. ${e.t}`), h('p', { style: { margin: 0 } }, e.d)),
        h('span', { class: 'badge' }, e.mod), h('span', { class: 'badge badge--violet' }, e.o));
    }
    const tile = ([ic, t]) => h('div', { class: 'card hover', style: { textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.7rem', padding: '.8rem' } },
      h('span', { style: { fontSize: '1.6rem' } }, ic), h('strong', { style: { fontSize: '1.05rem' } }, t));

    const capa = (ic, t, sub, cls) => h('div', { class: `card ${cls}`, style: { flex: 1, textAlign: 'center', display: 'grid', placeContent: 'center', gap: '.3rem' } },
      h('span', { style: { fontSize: '2rem' } }, ic), h('strong', { style: { fontSize: '1.1rem' } }, t), h('small', { class: 'hint' }, sub));
    const flecha = () => h('span', { class: 'pipe-arrow', style: { fontSize: '1.8rem', color: 'var(--cyan)' } }, '⇄');
    raiz.append(
      encabezado(num, 'CONTEXTO', 'Objetivos y <em>flujo del sistema</em>', 'Haz clic en cada etapa.'),
      h('div', { class: 'slide__body', style: { gridTemplateRows: 'auto auto auto 1fr' } },
        pipeline, detalle,
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' } }, OBJETIVOS.map(tile)),
        h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'stretch', alignSelf: 'center', minHeight: '11rem' } },
          capa('🖥', 'Navegador', 'Three.js · Chart.js', 'card--neon'), flecha(),
          capa('⚡', 'API FastAPI', 'JSON / OpenAPI', 'card--neon'), flecha(),
          capa('🐍', 'Python', 'estructuras · algoritmos · simulación', 'card--violet'), flecha(),
          capa('🗺', 'Datos OSM', 'red vial guardada', 'card--violet'))));
    return { entrar() { seleccionar(0); } };
  },
};
