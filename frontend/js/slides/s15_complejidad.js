import { grafico } from '../graficos.js';
import { encabezado, fmt, h } from '../ui.js';

const FILAS = [
  ['Quadtree · insertar', 'O(log n)', 'O(P)', 'Desciende una rama hasta la hoja; P = profundidad. Con datos uniformes P ≈ log₄ n; con datos concentrados P crece hasta el límite (16).'],
  ['Quadtree · construir (n inserciones)', 'O(n log n)', 'O(n·P)', 'n inserciones; cada subdivisión reparte a lo más capacidad+1 elementos.'],
  ['Quadtree · eliminar', 'O(log n)', 'O(P + c)', 'Se busca la hoja con la posición guardada; c = elementos de una hoja desbordada. Luego se fusionan hijos.'],
  ['Quadtree · actualizar posición', 'O(log n)', 'O(P + c)', 'Si sigue en la misma hoja, O(P); si no, eliminar + insertar.'],
  ['Quadtree · buscar en rectángulo', 'O(log n + m)', 'O(n)', 'm = elementos que caen en el rectángulo. Peor caso: el rectángulo cubre todo o todos están en una hoja.'],
  ['Haversine (un par)', 'O(1)', 'O(1)', 'Número fijo de operaciones trigonométricas.'],
  ['Heap de k candidatos', 'O(m log k)', 'O(m log k)', 'Cada uno de los m conductores revisados hace a lo más un heappush/heapreplace sobre un heap de tamaño k.'],
  ['k vecinos (búsqueda progresiva)', 'O(log n + m log k)', 'O(n log k)', 'Con pocos disponibles cerca, se duplica r hasta cubrir el área: termina revisando a todos.'],
  ['Búsqueda lineal (línea base)', 'O(n log k)', 'O(n log k)', 'Siempre revisa a los n conductores, sin importar dónde estén.'],
  ['Dijkstra (cola binaria)', 'O((V + E) log V)', 'O((V + E) log V)', 'Cada arista puede insertar en la cola; corte temprano al extraer el destino (en promedio explora menos).'],
  ['Despacho completo', 'O(log n + m log k + k(V+E) log V)', 'idem con m = n', 'Domina Dijkstra: se ejecuta solo k veces en lugar de n veces.'],
  ['Turno de simulación', 'O(n log n)', 'O(n·P)', 'Mover n conductores (O(1) cada uno) + actualizar_posicion en el Quadtree.'],
];

export default {
  titulo: 'Complejidad algorítmica', capitulo: 'RESULTADOS',
  notas: 'No son garantías absolutas: el Quadtree depende de la distribución espacial. El gráfico superpone las curvas teóricas con los tiempos medidos del benchmark (normalizados al tamaño 300) para contrastar teoría y observación.',
  crear({ api, num, raiz }) {
    const caja = h('div', { class: 'chart-box', style: { flex: 1 } });
    const obs = h('p', { class: 'note' });
    raiz.append(
      encabezado(num, 'RESULTADOS · ANÁLISIS BIG-O', '<em>Complejidad</em> por operación', 'n conductores · m en la región · k candidatos · V/E del grafo.'),
      h('div', { class: 'slide__body cols-64' },
        h('div', { class: 'card scroll-y' }, h('table', { class: 'tbl' },
          h('tr', {}, h('th', {}, 'Operación'), h('th', {}, 'Promedio'), h('th', {}, 'Peor caso')),
          ...FILAS.map(([op, p, w, j]) => h('tr', { title: j }, h('td', {}, h('strong', {}, op)), h('td', { class: 'mono c-cyan' }, p), h('td', { class: 'mono c-red' }, w)))), h('p', { class: 'note' }, 'Pasa el mouse sobre una fila para ver la justificación.')),
        h('div', { class: 'stack' },
          h('div', { class: 'card card--neon', style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Teoría vs observación (normalizado a n = 300)'), caja, obs),
          h('div', { class: 'card' }, h('h4', {}, 'Depende de la distribución'), h('div', { class: 'row' }, h('span', { class: 'badge badge--green' }, 'Uniforme → árbol balanceado'), h('span', { class: 'badge badge--red' }, 'Concentrada → hojas profundas'))))));

    async function pintar() {
      const ns = [300, 1000, 3000, 10000, 30000];
      const base = (f) => ns.map((n) => f(n) / f(300));
      const ds = [
        { label: 'O(n) teórico', data: base((n) => n), borderColor: 'rgba(244,114,182,.5)', borderDash: [6, 5], pointRadius: 0, borderWidth: 2 },
        { label: 'O(log n) teórico', data: base((n) => Math.log2(n)), borderColor: 'rgba(0,217,255,.5)', borderDash: [6, 5], pointRadius: 0, borderWidth: 2 },
      ];
      try {
        const d = await api('/api/benchmark/resultados');
        if (d.estado === 'listo') {
          const b = d.resultados.busqueda;
          const mapa = (clave) => ns.map((n) => { const f = b.find((x) => x.conductores === n); return f ? f[clave].mediana_ms / b[0][clave].mediana_ms : null; });
          ds.push({ label: 'Lineal medido', data: mapa('lineal'), borderColor: '#F472B6', backgroundColor: '#F472B6', pointRadius: 6, borderWidth: 3, spanGaps: true });
          ds.push({ label: 'Quadtree medido', data: mapa('quadtree'), borderColor: '#00D9FF', backgroundColor: '#00D9FF', pointRadius: 6, borderWidth: 3, spanGaps: true });
          const ul = b[b.length - 1];
          obs.textContent = `Flota ×100 (300 → 30 000): lineal ×${(ul.lineal.mediana_ms / b[0].lineal.mediana_ms).toFixed(0)}, Quadtree ×${(ul.quadtree.mediana_ms / b[0].quadtree.mediana_ms).toFixed(0)}.`;
        } else obs.textContent = 'Benchmark pendiente: ejecútalo en la diapositiva 14 para superponer las mediciones reales.';
      } catch { obs.textContent = 'No se pudieron leer los resultados del benchmark.'; }
      grafico(caja, { type: 'line', data: { labels: ns.map((n) => fmt.n(n)), datasets: ds },
        options: { scales: { x: { ticks: { color: '#A8B3CC' }, grid: { color: 'rgba(120,160,255,.08)' }, title: { display: true, text: 'conductores (n)', color: '#6F7B98' } },
          y: { type: 'logarithmic', ticks: { color: '#A8B3CC' }, grid: { color: 'rgba(120,160,255,.1)' }, title: { display: true, text: 'crecimiento relativo (log)', color: '#6F7B98' } } } } });
    }
    return { entrar() { pintar(); } };
  },
};
