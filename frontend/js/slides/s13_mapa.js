import { COLOR } from '../city3d.js';
import { herramientasMapa, leyendaFlota, viewport } from '../componentes.js';
import { crearPanelDespacho } from '../despacho.js';
import { accion, encabezado, fmt, h, toast } from '../ui.js';

// Escenario principal de exploración: todos los controles del mapa y de la
// simulación en un solo lugar. La diapositiva 18 lanza aquí la demo final.
export default {
  titulo: 'Mapa interactivo', capitulo: 'DEMOSTRACIÓN', animarFlota: true,
  notas: 'Escenario libre para la demostración en vivo. "Solicitar taxi" ejecuta el flujo completo y la cámara sigue al taxi asignado hasta recoger al pasajero. El botón ▦ superpone el Quadtree real de la flota.',
  crear({ city, sim, api, num, raiz }) {
    const vp = viewport();
    const panel = crearPanelDespacho({ city, sim, api, compacto: true });
    const herr = herramientasMapa(city, sim, { capas: ['edificios', 'flota', 'rutas', 'overlay'] });
    const btnQt = h('button', { type: 'button', title: 'Mostrar el Quadtree real de la flota', 'aria-label': 'Quadtree de la flota' }, '⊞');
    herr.append(btnQt);
    const estado = h('div', { class: 'legend' });
    vp.append(h('div', { class: 'vp-overlay vp-tr' }, herr), h('div', { class: 'vp-overlay vp-bl' }, leyendaFlota()), h('div', { class: 'vp-overlay vp-tl' }, estado));

    const btnAuto = h('button', { class: 'btn btn--sm btn--neon', type: 'button' }, '▶ Iniciar');
    const btnPaso = h('button', { class: 'btn btn--sm', type: 'button' }, 'Avanzar turno');
    const btnRe = h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, '↺ Reiniciar');
    const inCant = h('input', { type: 'number', min: 1, max: 6000, value: 300, class: 'inp', style: { width: '5.5rem' } });
    const btnGen = h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, 'Generar flota');
    const segVel = h('div', { class: 'seg' }, ...[0.5, 1, 2, 4].map((v) => h('button', { type: 'button', class: v === 1 ? 'is-on' : '', onclick: (e) => { sim.setVelocidad(v); [...segVel.children].forEach((b) => b.classList.toggle('is-on', b === e.currentTarget)); } }, `${v}×`)));

    raiz.append(
      encabezado(num, 'DEMOSTRACIÓN', '<em>Mapa interactivo</em> de Comas', 'Coloca un pasajero y solicita un taxi.'),
      h('div', { class: 'slide__body', style: { gridTemplateRows: 'auto 1fr' } }, panel.pipeline,
        h('div', { class: 'cols-73', style: { display: 'grid', gap: '1rem', minHeight: 0 } }, vp,
        h('div', { class: 'scroll-y stack' },
          h('div', { class: 'card' }, h('h4', {}, 'Simulación'),
            h('div', { class: 'row' }, btnAuto, btnPaso, btnRe),
            h('div', { class: 'row', style: { marginTop: '.45rem' } }, segVel, inCant, btnGen)),
          panel.el))));

    const pintarEstado = (r) => {
      if (!r) return;
      estado.replaceChildren(h('span', {}, `Turno ${r.turno}`), h('span', { class: 'c-green' }, `${fmt.n(r.disponibles)} disp.`), h('span', { class: 'c-red' }, `${fmt.n(r.ocupados)} ocup.`), h('span', { class: 'c-violet' }, `${fmt.n(r.asignados)} asig.`));
    };
    sim.on('resumen', pintarEstado);
    sim.on('auto', (v) => { btnAuto.textContent = v ? '⏸ Pausar' : '▶ Iniciar'; });
    btnAuto.addEventListener('click', () => sim.setAuto(!sim.auto));
    btnPaso.addEventListener('click', () => accion(btnPaso, async () => { sim.setAuto(false); await sim.avanzar(); }));
    btnRe.addEventListener('click', () => accion(btnRe, async () => { sim.setAuto(false); panel.reiniciar(); await sim.reiniciar(); toast('Simulación reiniciada (misma semilla).', 'ok'); }));
    btnGen.addEventListener('click', () => accion(btnGen, async () => {
      const n = Number(inCant.value);
      if (!(n >= 1 && n <= 6000)) throw new Error('En el mapa 3D la flota admite entre 1 y 6 000 conductores.');
      panel.reiniciar();
      await sim.generar({ cantidad: n, semilla: sim.resumen?.config?.semilla ?? 42 });
      toast(`Flota de ${fmt.n(n)} conductores generada.`, 'ok');
    }));
    let qtVisible = false;
    btnQt.addEventListener('click', async () => {
      qtVisible = !qtVisible;
      btnQt.classList.toggle('is-on', qtVisible);
      city.limpiar('quadtree');
      if (qtVisible) {
        try {
          const q = await api('/api/quadtree');
          city.rectangulos(q.nodos.filter((n) => n.hoja).map((n) => n.r), COLOR.cian, { opacidad: 0.4, altura: 2, grupo: 'quadtree' });
          toast(`Quadtree de la flota: ${q.estadisticas.nodos} nodos, profundidad ${q.estadisticas.profundidad}.`, 'info');
        } catch (e) { toast(e.message, 'error'); }
      }
    });

    const inst = {
      viewport: vp,
      entrar() {
        city.limpiarTodo(); city.visible('flota', true); city.visible('rutas', true); city.visible('overlay', true); herr.sincronizar();
        panel.reiniciar(false);
        qtVisible = false; btnQt.classList.remove('is-on');
        city.vista('isometrica');
        city.onPick = panel.onPick;
        pintarEstado(sim.resumen);
      },
      salir() { city.onPick = null; city.seguir = null; },
      demoFinal() { return panel.solicitarCompleto({ seguir: true }); },
    };
    window.__mapaInteractivo = inst;
    return inst;
  },
};
