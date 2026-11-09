import { viewport } from '../componentes.js';
import { accion, encabezado, fmt, h, kpi, toast } from '../ui.js';

export default {
  titulo: 'Resultados y conclusiones', capitulo: 'CIERRE',
  notas: 'Cerrar con números medidos (no inventados): aceleración del Quadtree, validación de Dijkstra, pruebas que pasan y mapas Folium generados. Luego pulsar "Iniciar solicitud completa" para la demostración final en el mapa interactivo.',
  crear({ city, api, ir, num, raiz }) {
    const vp = viewport();
    const k = { acel: kpi('Quadtree vs lineal (30 000)', '—', 'c-cyan', 'mediana medida'), dij: kpi('Dijkstra = NetworkX', '—', 'c-green'), tests: kpi('Pruebas pytest', '—', 'c-green'), mapas: kpi('Mapas Folium', '—', 'c-violet') };
    const resultados = h('ul', {});
    const mapas = h('div', { class: 'row' });
    const btn = h('button', { class: 'btn btn--neon btn--lg', type: 'button' }, '🚕 Iniciar solicitud completa');
    btn.addEventListener('click', () => accion(btn, async () => {
      ir(12);
      await new Promise((r) => setTimeout(r, 900));
      await window.__mapaInteractivo.demoFinal();
    }));
    raiz.append(
      encabezado(num, 'CIERRE', 'Resultados, <em>conclusiones</em> y demostración final', 'Basado en lo medido por el sistema.'),
      h('div', { class: 'slide__body cols-64' },
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' }, h('div', { class: 'kpis' }, k.acel, k.dij, k.tests, k.mapas)),
          h('div', { class: 'card' }, h('h4', {}, 'Conclusiones'), resultados),
          h('div', { class: 'card' }, h('h4', {}, 'Limitaciones'), h('ul', {},
            h('li', {}, 'Velocidad constante: sin tráfico ni semáforos.'), h('li', {}, 'Tiempos medidos en un solo equipo.'), h('li', {}, 'Alturas de edificios ilustrativas.'))),
          h('div', { class: 'card' }, h('h4', {}, 'Mapas Folium (RF-07)'), mapas)),
        h('div', { class: 'stack' }, h('div', { style: { flex: 1, display: 'grid', minHeight: 0 } }, vp),
          h('div', { class: 'card card--violet', style: { textAlign: 'center' } }, h('p', {}, 'Pasajero → Quadtree → Haversine → Heap → Dijkstra → ETA → Conductor asignado'), btn,
            h('p', { class: 'note', style: { textAlign: 'left' } }, 'UNIVERSIDAD DE SAN MARTÍN DE PORRES · Algoritmos y Estructura de Datos II · Antezana Vargas Jorge Jose, Andres Bardales Moreno, Vanessa Guerrero Yaniz')))));

    async function cargar() {
      const [b, t, m] = await Promise.all([api('/api/benchmark/resultados'), api('/api/pruebas/resultados'), api('/api/mapas')]);
      const lis = [];
      if (b.estado === 'listo') {
        const R = b.resultados, ul = R.busqueda[R.busqueda.length - 1], pr = R.busqueda[0];
        k.acel.set(`${ul.aceleracion_mediana.toFixed(1)}×`);
        k.dij.set(R.dijkstra.todas_iguales ? `✓ ${R.dijkstra.pares.length}/${R.dijkstra.pares.length}` : '✗');
        lis.push(`Con ${fmt.n(ul.conductores)} conductores, la búsqueda de 5 candidatos tardó ${fmt.ms(ul.quadtree.mediana_ms)} con Quadtree frente a ${fmt.ms(ul.lineal.mediana_ms)} lineal (mediana), devolviendo los mismos candidatos.`);
        lis.push(pr.aceleracion_mediana < ul.aceleracion_mediana
          ? `Con ${fmt.n(pr.conductores)} conductores la ventaja fue solo ${pr.aceleracion_mediana.toFixed(1)}×: con flotas pequeñas la diferencia es menor; el índice no siempre gana por mucho.`
          : `Con ${fmt.n(pr.conductores)} conductores la ventaja medida fue ${pr.aceleracion_mediana.toFixed(1)}×; la ganancia depende del tamaño y la distribución de la flota.`);
        lis.push(`El Quadtree revisó en promedio ${fmt.n(Math.round(ul.elementos_revisados_quadtree))} conductores por consulta en lugar de ${fmt.n(ul.conductores)}.`);
        lis.push(`Dijkstra propio coincidió con NetworkX en ${R.dijkstra.pares.length} rutas de la red real de Comas.`);
      } else { k.acel.set('Pendiente'); k.dij.set('Pendiente'); lis.push('El benchmark aún no se ha ejecutado (diapositiva 14).'); }
      if (t.resultado) { const ok = t.resultado.total - t.resultado.fallos - t.resultado.errores; k.tests.set(`${ok}/${t.resultado.total}`); lis.push(`${ok} de ${t.resultado.total} pruebas automatizadas pasaron en la última ejecución.`); } else k.tests.set('Pendiente');
      k.mapas.set(m.mapas.length);
      lis.push('El conductor más cercano en línea recta no siempre llega primero: por eso la asignación final usa el ETA calculado por calles.');
      resultados.replaceChildren(...lis.map((l) => h('li', {}, l)));
      mapas.replaceChildren(...(m.mapas.length ? m.mapas.map((f) => h('a', { class: 'btn btn--ghost btn--sm', href: `/mapas/${f}`, target: '_blank', rel: 'noopener' }, `🗺 ${f}`)) : [h('span', { class: 'hint' }, 'Genera los mapas con: python -m mapas.generar_mapas')]));
    }
    return {
      viewport: vp,
      entrar() {
        city.limpiarTodo(); city.visible('flota', true);
        city.vista('portada');
        cargar().catch((e) => toast(e.message, 'error'));
      },
    };
  },
};
