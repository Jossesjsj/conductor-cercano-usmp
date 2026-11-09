import { EJES, grafico } from '../graficos.js';
import { accion, encabezado, fmt, h, kpi, toast } from '../ui.js';

export default {
  titulo: 'Benchmark', capitulo: 'RESULTADOS',
  notas: 'RF-09: mediciones reales en este equipo (python -m benchmark.ejecutar_benchmark). Lineal vs Quadtree con 300, 3 000 y 30 000 conductores, ambos devuelven exactamente los mismos k candidatos. Dijkstra propio vs NetworkX: mismas distancias. Los tiempos dependen del equipo; leer la metodología y las limitaciones.',
  crear({ api, num, raiz }) {
    const cuerpo = h('div', { class: 'slide__body', style: { minHeight: 0 } });
    const btnRun = h('button', { class: 'btn btn--neon btn--sm', type: 'button' }, '▶ Ejecutar benchmark');
    const estadoProc = h('span', { class: 'hint' });
    const cabecera = encabezado(num, 'RESULTADOS · RF-09', '<em>Benchmark</em> real: lineal vs Quadtree', 'Mediciones reales en este equipo.');
    cabecera.insertBefore(h('div', { class: 'row', style: { marginLeft: 'auto' } }, estadoProc, btnRun), cabecera.lastChild);
    raiz.append(cabecera, cuerpo);

    function pendiente(proc) {
      cuerpo.replaceChildren(h('div', { class: 'card pending' }, h('strong', {}, 'Pendiente de ejecutar'),
        h('p', {}, 'Aún no existen mediciones en benchmark/resultados.json. Ejecuta el benchmark (tarda alrededor de un minuto): corre en otro proceso y no bloquea la presentación.'),
        proc?.log ? h('pre', { class: 'code', style: { maxHeight: '12rem', textAlign: 'left' } }, proc.log) : null));
    }

    function pintar(d) {
      const R = d.resultados, b = R.busqueda, dj = R.dijkstra, met = R.metodologia;
      const n = b.map((f) => f.conductores);
      const cajaT = h('div', { class: 'chart-box', style: { flex: 1 } }), cajaR = h('div', { class: 'chart-box', style: { flex: 1 } }), cajaD = h('div', { class: 'chart-box', style: { flex: 1 } });
      const filas = b.map((f) => h('tr', {}, h('td', {}, fmt.n(f.conductores)), h('td', { class: 'num' }, fmt.ms(f.lineal.mediana_ms)), h('td', { class: 'num' }, fmt.ms(f.quadtree.mediana_ms)),
        h('td', { class: 'num c-cyan' }, `${f.aceleracion_mediana.toFixed(1)}×`), h('td', { class: 'num' }, fmt.n(Math.round(f.elementos_revisados_quadtree))), h('td', {}, f.resultados_identicos ? '✓' : '✗')));
      cuerpo.style.gridTemplateColumns = 'minmax(0,1.15fr) minmax(0,1fr) minmax(0,.95fr)';
      cuerpo.replaceChildren(
        h('div', { class: 'stack' },
          h('div', { class: 'card card--neon', style: { flex: 1.3, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Tiempo por consulta k = 5 (mediana, ms · escala log)'), cajaT),
          h('div', { class: 'card', style: { overflow: 'auto' } }, h('table', { class: 'tbl' }, h('tr', {}, h('th', {}, 'Flota'), h('th', { class: 'num' }, 'Lineal'), h('th', { class: 'num' }, 'Quadtree'), h('th', { class: 'num' }, 'Mejora'), h('th', { class: 'num' }, 'Revisados'), h('th', {}, '=')), ...filas))),
        h('div', { class: 'stack' },
          h('div', { class: 'card', style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Conductores revisados por consulta (log)'), cajaR),
          h('div', { class: 'card card--violet', style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, 'Dijkstra propio vs NetworkX (validación)'), cajaD,
            h('div', { class: 'kpis', style: { marginTop: '.4rem' } }, kpi('Distancias iguales', dj.todas_iguales ? `✓ ${dj.pares.length}/${dj.pares.length}` : '✗', dj.todas_iguales ? 'c-green' : 'c-red'), kpi('Propio (mediana)', fmt.ms(dj.propio.mediana_ms), 'c-cyan'), kpi('NetworkX (mediana)', fmt.ms(dj.networkx.mediana_ms))))),
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card' }, h('h4', {}, 'Metodología'), h('details', {}, h('summary', {}, 'Ver descripción'), h('p', {}, met.descripcion)),
            h('ul', {}, h('li', {}, `Semilla: ${met.semilla} · ${met.repeticiones_por_tamano} consultas por tamaño`), h('li', {}, `Capacidad del Quadtree: ${met.capacidad_quadtree}; ${Math.round(met.proporcion_ocupados * 100)} % ocupados`), h('li', {}, `Dijkstra: ${dj.pares.length} pares aleatorios sobre ${fmt.n(dj.nodos_red)} nodos`))),
          h('div', { class: 'card' }, h('h4', {}, 'Entorno de medición'), h('ul', {}, h('li', {}, `Python ${R.entorno.python}`), h('li', {}, R.entorno.sistema), h('li', {}, R.entorno.procesador), h('li', {}, `Fecha: ${R.fecha.replace('T', ' ')}`))),
          h('div', { class: 'card' }, h('h4', {}, 'Limitaciones'), h('details', {}, h('summary', {}, `${met.limitaciones.length} limitaciones`), h('ul', {}, met.limitaciones.map((l) => h('li', {}, l))))),
          h('div', { class: 'card' }, h('h4', {}, 'Gráficos Matplotlib (entregables)'), h('div', { class: 'row' }, d.graficos.map((g) => h('a', { class: 'btn btn--ghost btn--sm', href: `/graficos/${g}`, target: '_blank', rel: 'noopener' }, g))))));
      const labels = n.map((v) => fmt.n(v));
      grafico(cajaT, { type: 'line', data: { labels, datasets: [
        { label: 'Búsqueda lineal', data: b.map((f) => f.lineal.mediana_ms), borderColor: '#F472B6', backgroundColor: '#F472B6', borderWidth: 3, pointRadius: 5 },
        { label: 'Quadtree + heap', data: b.map((f) => f.quadtree.mediana_ms), borderColor: '#00D9FF', backgroundColor: '#00D9FF', borderWidth: 3, pointRadius: 5 }] },
      options: { scales: { ...EJES('conductores', 'ms'), y: { ...EJES('', 'ms', true).y } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.ms(c.raw)}` } } } } });
      grafico(cajaR, { type: 'bar', data: { labels, datasets: [
        { label: 'Lineal', data: b.map((f) => f.elementos_revisados_lineal), backgroundColor: 'rgba(244,114,182,.75)', borderRadius: 6 },
        { label: 'Quadtree', data: b.map((f) => f.elementos_revisados_quadtree), backgroundColor: 'rgba(0,217,255,.75)', borderRadius: 6 }] },
      options: { scales: { ...EJES('conductores', ''), y: { ...EJES('', 'conductores revisados', true).y } } } });
      grafico(cajaD, { type: 'scatter', data: { datasets: [
        { label: 'Propio', data: dj.pares.map((p) => ({ x: p.nodos_explorados, y: p.tiempo_propio_ms })), backgroundColor: '#00D9FF' },
        { label: 'NetworkX', data: dj.pares.map((p) => ({ x: p.nodos_explorados, y: p.tiempo_networkx_ms })), backgroundColor: '#F472B6', pointStyle: 'triangle' }] },
      options: { scales: { x: { ...EJES('nodos explorados', '').x, type: 'linear' }, y: EJES('', 'ms').y } } });
    }

    async function cargar() {
      const d = await api('/api/benchmark/resultados');
      const p = d.proceso;
      estadoProc.textContent = p.ejecutando ? `Ejecutando… ${p.segundos ?? 0} s` : '';
      btnRun.disabled = p.ejecutando;
      if (d.estado === 'listo' && !p.ejecutando) pintar(d); else if (d.estado !== 'listo') pendiente(p);
      return d;
    }
    let sondeo = null;
    async function vigilar() {
      clearInterval(sondeo);
      sondeo = setInterval(async () => {
        try {
          const p = await api('/api/benchmark/estado');
          estadoProc.textContent = p.ejecutando ? `Ejecutando… ${p.segundos} s · ${p.log.trim().split('\n').pop()}` : '';
          if (!p.ejecutando) {
            clearInterval(sondeo); btnRun.disabled = false;
            if (p.codigo_salida === 0) { toast('Benchmark terminado. Resultados actualizados.', 'ok'); await cargar(); } else { toast('El benchmark terminó con error. Revisa el registro.', 'error'); pendiente(p); }
          }
        } catch { clearInterval(sondeo); }
      }, 1500);
    }
    btnRun.addEventListener('click', () => accion(btnRun, async () => {
      await api('/api/benchmark/ejecutar', { repeticiones: 30, consultas_dijkstra: 25, semilla: 2024 });
      btnRun.disabled = true;
      toast('Benchmark iniciado en un proceso aparte (~1 min).', 'info');
      vigilar();
    }));
    return { entrar() { cargar().then((d) => { if (d.proceso.ejecutando) vigilar(); }).catch((e) => toast(e.message, 'error')); }, salir() { clearInterval(sondeo); } };
  },
};
