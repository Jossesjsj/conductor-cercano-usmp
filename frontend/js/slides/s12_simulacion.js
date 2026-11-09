import { herramientasMapa, leyendaFlota, viewport } from '../componentes.js';
import { accion, encabezado, fmt, h, kpi, toast } from '../ui.js';

export default {
  titulo: 'Simulación por turnos', capitulo: 'INTEGRACIÓN', animarFlota: true,
  notas: 'RF-06: en cada turno el backend mueve a cada conductor por las aristas del grafo, actualiza el Quadtree (actualizar_posicion) y los estados. La animación interpola sobre los mismos puntos que calculó Python. Reiniciar con la misma semilla reproduce exactamente la simulación.',
  crear({ city, sim, num, raiz }) {
    const vp = viewport();
    const herr = herramientasMapa(city, sim, { capas: ['edificios', 'flota'] });
    vp.append(h('div', { class: 'vp-overlay vp-tr' }, herr), h('div', { class: 'vp-overlay vp-bl' }, leyendaFlota()));
    const k = { turno: kpi('Turno', '—', 'c-cyan'), disp: kpi('Disponibles', '—', 'c-green'), ocu: kpi('Ocupados', '—', 'c-red'), asig: kpi('Asignados', '—', 'c-violet'), qn: kpi('Nodos Quadtree', '—'), qp: kpi('Profundidad', '—') };
    const btnAuto = h('button', { class: 'btn btn--neon', type: 'button' }, '▶ Iniciar simulación');
    const btnPaso = h('button', { class: 'btn btn--violet', type: 'button' }, 'Avanzar un turno');
    const inSem = h('input', { type: 'number', min: 0, value: 42, class: 'inp', style: { width: '6rem' } });
    const btnRe = h('button', { class: 'btn btn--ghost', type: 'button' }, '↺ Reiniciar (semilla)');
    const segVel = h('div', { class: 'seg' }, ...[0.5, 1, 2, 4].map((v) => h('button', { type: 'button', class: v === 1 ? 'is-on' : '', onclick: (e) => { sim.setVelocidad(v); [...segVel.children].forEach((b) => b.classList.toggle('is-on', b === e.currentTarget)); } }, `${v}×`)));
    const eventos = h('div', { class: 'log', style: { height: '6rem' } });
    const cvBox = h('div', { class: 'chart-box', style: { flex: 1, minHeight: '8rem' } });
    raiz.append(
      encabezado(num, 'INTEGRACIÓN · RF-06', 'Simulación de <em>flota</em> por turnos', 'Los taxis avanzan por las calles y el Quadtree se actualiza.'),
      h('div', { class: 'slide__body cols-64' }, vp,
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' }, h('div', { class: 'kpis' }, k.turno, k.disp, k.ocu, k.asig, k.qn, k.qp)),
          h('div', { class: 'card' }, h('h4', {}, 'Controles'),
            h('div', { class: 'row' }, btnAuto, btnPaso),
            h('div', { class: 'row', style: { marginTop: '.5rem' } }, h('span', { class: 'hint' }, 'Velocidad:'), segVel),
            h('div', { class: 'row', style: { marginTop: '.5rem' } }, h('span', { class: 'hint' }, 'Semilla:'), inSem, btnRe)),
          h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: '11rem' } }, h('h4', {}, 'Estados por turno'), cvBox),
          h('div', { class: 'card' }, h('h4', {}, 'Eventos'), eventos))));

    let chart = null;
    const serie = { t: [], d: [], o: [], a: [] };
    function grafico() {
      if (chart) { chart.update('none'); return; }
      const cv = h('canvas'); cvBox.append(cv);
      const ds = (l, d, c) => ({ label: l, data: d, borderColor: c, backgroundColor: c, pointRadius: 0, tension: 0.3, borderWidth: 2 });
      chart = new window.Chart(cv, { type: 'line', data: { labels: serie.t, datasets: [ds('Disponibles', serie.d, '#22E39B'), ds('Ocupados', serie.o, '#FF4D6D'), ds('Asignados', serie.a, '#8B5CF6')] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#A8B3CC', boxWidth: 12 } } },
          scales: { x: { ticks: { color: '#6F7B98', maxTicksLimit: 8 }, grid: { display: false }, title: { display: true, text: 'turno', color: '#6F7B98' } }, y: { ticks: { color: '#A8B3CC' }, grid: { color: 'rgba(120,160,255,.1)' } } } } });
    }
    function pintar(r) {
      if (!r) return;
      k.turno.set(r.turno); k.disp.set(fmt.n(r.disponibles)); k.ocu.set(fmt.n(r.ocupados)); k.asig.set(fmt.n(r.asignados));
      k.qn.set(fmt.n(r.quadtree.nodos)); k.qp.set(r.quadtree.profundidad);
      if (serie.t[serie.t.length - 1] !== r.turno) {
        if (r.turno < (serie.t[serie.t.length - 1] ?? -1)) { serie.t.length = serie.d.length = serie.o.length = serie.a.length = 0; }
        serie.t.push(r.turno); serie.d.push(r.disponibles); serie.o.push(r.ocupados); serie.a.push(r.asignados);
        if (serie.t.length > 120) for (const s of Object.values(serie)) s.shift();
        if (chart) grafico();
      }
    }
    sim.on('resumen', pintar);
    sim.on('turno', (t) => { for (const e of t.eventos) eventos.prepend(h('div', { class: 'ok' }, `T${t.turno}: ${e}`)); });
    sim.on('auto', (v) => { btnAuto.textContent = v ? '⏸ Pausar simulación' : '▶ Iniciar simulación'; });
    btnAuto.addEventListener('click', () => sim.setAuto(!sim.auto));
    btnPaso.addEventListener('click', () => accion(btnPaso, async () => { sim.setAuto(false); await sim.avanzar(); }));
    btnRe.addEventListener('click', () => accion(btnRe, async () => {
      sim.setAuto(false);
      await sim.reiniciar(Number(inSem.value));
      eventos.prepend(h('div', { class: 'inf' }, `Reinicio reproducible con semilla ${inSem.value}.`));
      toast(`Simulación reiniciada con semilla ${inSem.value}.`, 'ok');
    }));
    return {
      viewport: vp,
      entrar() {
        city.limpiarTodo(); city.visible('flota', true); herr.sincronizar();
        city.vista('isometrica');
        grafico(); pintar(sim.resumen);
      },
      salir() { city.seguir = null; },
    };
  },
};
