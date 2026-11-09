import { herramientasMapa, viewport } from '../componentes.js';
import { encabezado, fmt, h, kpi, legend } from '../ui.js';

export default {
  titulo: 'Red vial de Comas', capitulo: 'DATOS',
  notas: 'RF-01: la red se descargó una sola vez con OSMnx y se guarda en datos/comas_red.graphml. Es un grafo DIRIGIDO: respeta los sentidos de circulación. Se conserva la componente fuertemente conexa mayor (Kosaraju propio). Mostrar intersecciones con el botón •.',
  crear({ city, sim, api, num, raiz }) {
    const vp = viewport();
    const k = { nodos: kpi('Intersecciones (V)', '—', 'c-cyan'), aristas: kpi('Aristas dirigidas (E)', '—', 'c-cyan'), km: kpi('Calles', '—', '', 'km dirigidos'), area: kpi('Área', '—', '', 'km²'), edif: kpi('Edificios OSM', '—', 'c-violet') };
    const fuente = h('p', { class: 'note' });
    const herr = herramientasMapa(city, sim, { capas: ['edificios', 'nodos', 'flota'], seguir: false });
    vp.append(h('div', { class: 'vp-overlay vp-tr' }, herr),
      h('div', { class: 'vp-overlay vp-bl' }, legend([['#00D9FF', 'Avenidas principales', true], ['#2f6bd0', 'Calles residenciales', true], ['#5b6cff', 'Edificios (bordes)', true], ['#8B5CF6', 'Límite de la zona', true]])));
    const nombre = h('h3', {}, 'Comas, Lima');
    raiz.append(
      encabezado(num, 'DATOS · RF-01', 'Red vial real de <em>Comas</em>', 'Intersecciones = nodos · calles = aristas dirigidas.'),
      h('div', { class: 'slide__body cols-73' }, vp,
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' }, h('h4', {}, 'Zona seleccionada'), nombre, h('div', { class: 'kpis' }, k.nodos, k.aristas, k.km, k.area, k.edif), fuente),
          h('div', { class: 'row' }, ...['OSMnx → GraphML (una vez)', 'Grafo dirigido', 'Kosaraju propio', 'Alturas ilustrativas'].map((t) => h('span', { class: 'badge' }, t))))));
    return {
      viewport: vp,
      async entrar() {
        city.limpiarTodo();
        city.visible('flota', false); city.visible('edificios', true);
        city.pintarNodos(new Map(), 0x3d7bff, 9);
        city.visible('nodos', true);
        herr.sincronizar();
        city.vista('isometrica');
        const e = await api('/api/estado');
        const r = e.red;
        nombre.textContent = r.zona;
        k.nodos.set(fmt.n(r.nodos)); k.aristas.set(fmt.n(r.aristas)); k.km.set(fmt.n(r.km_de_calles_dirigidas)); k.area.set(r.area_km2); k.edif.set(fmt.n(r.edificios));
        fuente.textContent = `Fuente: ${r.fuente}. Descargado: ${r.descargado ? r.descargado.slice(0, 10) : '—'}. Centro: ${r.centro[0].toFixed(5)}, ${r.centro[1].toFixed(5)}.`;
      },
      salir() { city.visible('flota', true); city.visible('nodos', false); },
    };
  },
};
