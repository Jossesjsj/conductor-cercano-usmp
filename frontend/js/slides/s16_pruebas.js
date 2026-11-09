import { accion, encabezado, h, kpi, toast } from '../ui.js';

// Mapa de casos exigidos → pruebas pytest que los cubren.
const COBERTURA = [
  ['Quadtree vacío', 'test_quadtree_vacio'],
  ['Inserción correcta', 'test_insercion_correcta_y_subdivision'],
  ['Eliminación correcta', 'test_eliminacion_correcta_y_fusion'],
  ['Actualización de posición', 'test_actualizar_posicion'],
  ['Conductores en el mismo punto', 'test_conductores_en_el_mismo_punto_no_subdividen_infinitamente'],
  ['Búsqueda en rectángulo', 'test_busqueda_en_rectangulo_igual_a_fuerza_bruta_y_poda'],
  ['Sin conductores disponibles', 'test_ausencia_de_conductores_disponibles'],
  ['Haversine con valores conocidos', 'test_haversine_resultados_conocidos'],
  ['Dijkstra con ruta válida', 'test_dijkstra_ruta_valida'],
  ['Grafo sin ruta alcanzable', 'test_grafo_sin_ruta_alcanzable'],
  ['Pasajero sin conexión vial', 'test_pasajero_en_zona_sin_conexion_vial'],
  ['Selección por menor ETA', 'test_seleccion_por_menor_eta_no_por_linea_recta'],
  ['Quadtree actualizado en turnos', 'test_quadtree_se_actualiza_durante_los_turnos'],
  ['Reproducibilidad con semilla', 'test_reproducibilidad_con_semilla_fija'],
  ['k vecinos = búsqueda lineal', 'test_k_vecinos_quadtree_igual_a_busqueda_lineal'],
  ['Dijkstra = NetworkX (validación)', 'test_coincide_con_networkx_en_grafos_aleatorios'],
  ['Endpoints de la API', 'test_flujo_completo_de_despacho'],
];

export default {
  titulo: 'Pruebas automatizadas', capitulo: 'CALIDAD',
  notas: 'Más de 10 casos con pytest, incluidos todos los casos límite exigidos. El botón ejecuta pytest de verdad en un proceso aparte y muestra el resultado del archivo JUnit. Las pruebas usan una cuadrícula pequeña además de la red real, así no dependen de Internet.',
  crear({ api, num, raiz }) {
    const k = { total: kpi('Pruebas', '—', 'c-cyan'), ok: kpi('Pasaron', '—', 'c-green'), bad: kpi('Fallaron', '—', 'c-red'), t: kpi('Duración', '—') };
    const fecha = h('p', { class: 'note' });
    const lista = h('div', { class: 'scroll-y', style: { flex: 1, minHeight: 0 } });
    const cobertura = h('div', { class: 'scroll-y', style: { flex: 1, minHeight: 0 } });
    const btn = h('button', { class: 'btn btn--neon', type: 'button' }, '▶ Ejecutar pytest');
    raiz.append(
      encabezado(num, 'CALIDAD · PYTEST', '<em>Pruebas</em> automatizadas', 'pytest ejecutado de verdad desde la presentación.'),
      h('div', { class: 'slide__body cols-2' },
        h('div', { class: 'stack' },
          h('div', { class: 'card card--neon' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h4', {}, 'Último resultado'), btn), h('div', { class: 'kpis' }, k.total, k.ok, k.bad, k.t), fecha),
          h('div', { class: 'card', style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Casos ejecutados'), lista)),
        h('div', { class: 'stack' },
          h('div', { class: 'card', style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Cobertura de requisitos'), cobertura))));

    function pintar(r) {
      if (!r.resultado) {
        lista.replaceChildren(h('div', { class: 'pending' }, h('strong', {}, 'Pendiente de ejecutar'), h('p', {}, 'Pulsa «Ejecutar pytest».')));
        return;
      }
      const R = r.resultado, fallos = R.fallos + R.errores;
      k.total.set(R.total); k.ok.set(R.total - fallos - R.omitidas); k.bad.set(fallos); k.t.set(`${R.segundos.toFixed(2)} s`);
      fecha.textContent = `Ejecutado: ${(R.fecha || '').replace('T', ' ').slice(0, 19)} · archivo tests/resultados_junit.xml`;
      lista.replaceChildren(...R.casos.map((c) => h('div', { class: 'test-item' }, h('span', { class: `st ${c.estado === 'pasó' ? 'ok' : 'bad'}` }, c.estado === 'pasó' ? '✓' : '✗'), h('code', { title: c.nombre }, `${c.archivo.split('.').pop()} · ${c.nombre}`), h('span', { class: 'hint' }, `${(c.segundos * 1000).toFixed(0)} ms`))));
      const porNombre = new Map(R.casos.map((c) => [c.nombre.replace(/\[.*\]$/, ''), c.estado]));
      cobertura.replaceChildren(...COBERTURA.map(([req, test]) => {
        const e = porNombre.get(test);
        return h('div', { class: 'test-item' }, h('span', { class: `st ${e === 'pasó' ? 'ok' : 'bad'}` }, e === 'pasó' ? '✓' : e ? '✗' : '?'), h('span', {}, req), h('code', { title: test }, test.length > 30 ? `${test.slice(0, 30)}…` : test));
      }));
    }
    async function cargar() { const r = await api('/api/pruebas/resultados'); pintar(r); return r; }
    let sondeo = null;
    btn.addEventListener('click', () => accion(btn, async () => {
      await api('/api/pruebas/ejecutar', {});
      btn.disabled = true;
      await new Promise((res) => {
        sondeo = setInterval(async () => {
          const r = await api('/api/pruebas/resultados');
          if (!r.proceso.ejecutando) { clearInterval(sondeo); pintar(r); res(); }
        }, 800);
      });
      const r = await cargar();
      if (r.resultado) toast(`pytest: ${r.resultado.total - r.resultado.fallos - r.resultado.errores} de ${r.resultado.total} pruebas pasaron.`, r.resultado.fallos + r.resultado.errores ? 'error' : 'ok');
    }));
    return { entrar() { cargar().catch((e) => toast(e.message, 'error')); }, salir() { clearInterval(sondeo); } };
  },
};
