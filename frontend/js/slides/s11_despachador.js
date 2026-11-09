import { herramientasMapa, leyendaFlota, viewport } from '../componentes.js';
import { crearPanelDespacho } from '../despacho.js';
import { encabezado, h } from '../ui.js';

export default {
  titulo: 'Despachador', capitulo: 'INTEGRACIÓN',
  notas: 'Clase Despachador: coordina todo el flujo. Mostrar las tres formas de ingresar al pasajero (clic, coordenadas, dirección). Ejecutar paso a paso: buscar candidatos, calcular rutas y asignar. Probar errores: una coordenada fuera de Comas o un punto lejos de las calles.',
  crear({ city, sim, api, num, raiz }) {
    const vp = viewport();
    const panel = crearPanelDespacho({ city, sim, api });
    vp.append(h('div', { class: 'vp-overlay vp-tr' }, herramientasMapa(city, sim, { capas: ['edificios', 'flota', 'rutas', 'overlay'] })),
      h('div', { class: 'vp-overlay vp-bl' }, leyendaFlota()));
    raiz.append(
      encabezado(num, 'INTEGRACIÓN · DESPACHADOR', 'El <em>Despachador</em> asigna el menor ETA', 'Todo el flujo, ejecutado en Python.'),
      h('div', { class: 'slide__body', style: { gridTemplateRows: 'auto 1fr' } },
        panel.pipeline,
        h('div', { class: 'cols-73', style: { display: 'grid', gap: '1rem', minHeight: 0 } }, vp, h('div', { class: 'scroll-y' }, panel.el))));
    return {
      viewport: vp,
      entrar() {
        city.limpiarTodo(); city.visible('flota', true); city.visible('overlay', true); city.visible('rutas', true);
        panel.reiniciar(false);
        city.vista('isometrica');
        city.onPick = panel.onPick;
      },
      salir() { city.onPick = null; city.seguir = null; },
    };
  },
};
