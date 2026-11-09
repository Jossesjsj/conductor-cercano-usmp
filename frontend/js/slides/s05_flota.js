import { herramientasMapa, leyendaFlota, viewport } from '../componentes.js';
import { accion, encabezado, fmt, h, kpi, toast } from '../ui.js';

export default {
  titulo: 'Modelo de flota', capitulo: 'DATOS', animarFlota: true,
  notas: 'RF-02: flota configurable (300 por defecto) sobre intersecciones reales, con estado disponible u ocupado y semilla fija. Haz clic en un taxi para ver sus datos reales del backend. Generar otra flota con la misma semilla produce exactamente la misma distribución.',
  crear({ city, sim, num, raiz, api }) {
    const vp = viewport();
    const herr = herramientasMapa(city, sim, { capas: ['edificios', 'flota'] });
    vp.append(h('div', { class: 'vp-overlay vp-tr' }, herr), h('div', { class: 'vp-overlay vp-bl' }, leyendaFlota()));
    const k = { total: kpi('Total', '—', 'c-cyan'), disp: kpi('Disponibles', '—', 'c-green'), ocu: kpi('Ocupados', '—', 'c-red'), asig: kpi('Asignados', '—', 'c-violet') };
    const inCant = h('input', { type: 'number', min: 1, max: 6000, value: 300 });
    const inSem = h('input', { type: 'number', min: 0, value: 42 });
    const inOcu = h('input', { type: 'number', min: 0, max: 100, value: 30 });
    const detalle = h('div', { class: 'hint' }, 'Haz clic sobre un taxi del mapa para ver sus datos.');
    const btnGen = h('button', { class: 'btn btn--neon', type: 'button' }, 'Generar flota');
    btnGen.addEventListener('click', () => accion(btnGen, async () => {
      const cantidad = Number(inCant.value);
      if (!(cantidad >= 1 && cantidad <= 6000)) throw new Error('En la vista 3D la flota admite entre 1 y 6 000 conductores (el benchmark usa hasta 30 000).');
      await sim.generar({ cantidad, semilla: Number(inSem.value), proporcion_ocupados: Number(inOcu.value) / 100 });
      toast(`Flota de ${fmt.n(cantidad)} conductores generada con semilla ${inSem.value}.`, 'ok');
    }));
    const codigo = h('pre', { class: 'code', html:
`<span class="k">@dataclass</span>
<span class="k">class</span> <span class="f">Conductor</span>:
    id: int
    lat: float; lon: float      <span class="c"># posición geográfica</span>
    x: float; y: float          <span class="c"># metros (Quadtree)</span>
    estado: str = <span class="s">"disponible"</span>  <span class="c"># | ocupado | asignado</span>
    velocidad_kmh: float = <span class="n">30.0</span>
    nodo_origen: int            <span class="c"># arista actual u → v</span>
    nodo_destino: int
    avance_m: float = <span class="n">0.0</span>
    ruta: list                  <span class="c"># nodos por recorrer</span>` });
    raiz.append(
      encabezado(num, 'DATOS · RF-02', 'Modelo de <em>flota</em>', '300 conductores sobre calles reales, con semilla fija.'),
      h('div', { class: 'slide__body cols-64' }, vp,
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' }, h('h4', {}, 'Estado actual (backend)'), h('div', { class: 'kpis' }, k.total, k.disp, k.ocu, k.asig)),
          h('div', { class: 'card' }, h('h4', {}, 'Generar flota'),
            h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Conductores', inCant), h('label', { class: 'field' }, 'Semilla', inSem), h('label', { class: 'field' }, '% ocupados', inOcu)),
            h('div', { class: 'row', style: { marginTop: '.6rem' } }, btnGen)),
          h('div', { class: 'card' }, h('h4', {}, 'Conductor seleccionado'), detalle))));

    const pintar = (r) => { if (!r) return; k.total.set(fmt.n(r.total)); k.disp.set(fmt.n(r.disponibles)); k.ocu.set(fmt.n(r.ocupados)); k.asig.set(fmt.n(r.asignados)); };
    sim.on('resumen', pintar);
    return {
      viewport: vp,
      entrar() {
        city.limpiarTodo(); city.visible('flota', true); herr.sincronizar();
        city.vista('isometrica');
        pintar(sim.resumen);
        city.onPick = async (p) => {
          if (p.tipo !== 'taxi') return;
          herr.dataset.sel = p.id;
          try {
            const c = await api(`/api/conductores/${p.id}`);
            sim.resaltar({ candidatos: [c.id] });
            detalle.replaceChildren(h('div', { class: 'kpis' }, kpi('ID', c.id, 'c-yellow'), kpi('Estado', c.estado), kpi('Velocidad', `${c.velocidad_kmh} km/h`), kpi('Nodo vial', c.nodo)),
              h('p', { class: 'note' }, `Lat ${c.lat}, Lon ${c.lon} · arista ${c.arista[0]} → ${c.arista[1]} · avance ${c.avance_m} m. Usa 🎯 para seguirlo.`));
          } catch (e) { toast(e.message, 'error'); }
        };
      },
      salir() { city.onPick = null; sim.limpiarResaltado(); city.seguir = null; },
    };
  },
};
