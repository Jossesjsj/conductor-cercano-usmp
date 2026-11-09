// Panel de despacho reutilizable: Pasajero → Quadtree → Haversine → Heap →
// Dijkstra → ETA → Conductor asignado. Cada botón llama a la API real.
import { COLOR } from './city3d.js';
import { dibujarBusqueda, dibujarCandidatos, dibujarRutas, nodoAleatorio, tarjetasCandidatos, xyALatLon } from './componentes.js';
import { accion, fmt, h, toast } from './ui.js';

const ETAPAS = ['Pasajero', 'Quadtree', 'Haversine', 'Heap', 'Dijkstra', 'ETA', 'Asignado'];

export function crearPanelDespacho({ city, sim, api, compacto = false }) {
  const st = { pasajero: null, candidatos: null, rutas: null, asignado: null, modoMapa: true };
  const pasos = ETAPAS.map((t) => h('div', { class: 'pipe-step', style: { cursor: 'default', padding: '.45rem .3rem' } }, h('b', { style: { fontSize: '.78rem' } }, t)));
  const pipeline = h('div', { class: 'pipeline' }, ...pasos.flatMap((p, i) => (i < pasos.length - 1 ? [p, h('span', { class: 'pipe-arrow', style: { fontSize: '.8rem' } }, '›')] : [p])));
  const log = h('div', { class: 'log', style: { height: compacto ? '6.5rem' : '8.5rem' } });
  const resultado = h('div', { class: 'scroll-y', style: { maxHeight: compacto ? '13rem' : '16rem' } });

  const inLat = h('input', { type: 'number', step: '0.00001', placeholder: '-11.94100' });
  const inLon = h('input', { type: 'number', step: '0.00001', placeholder: '-77.05600' });
  const inDir = h('input', { type: 'text', placeholder: 'Ej.: Av. Túpac Amaru, Comas', maxlength: 200 });
  const selK = h('select', {}, ...[3, 5, 10].map((v) => h('option', { value: v, selected: v === 5 }, `k = ${v}`)));
  const inVel = h('input', { type: 'number', min: 5, max: 120, value: 30 });
  const btnCoord = h('button', { class: 'btn btn--sm', type: 'button' }, 'Crear');
  const btnDir = h('button', { class: 'btn btn--sm', type: 'button' }, 'Geocodificar');
  const panelEntrada = {
    mapa: h('p', { class: 'hint' }, '🖱 Haz clic en el mapa 3D para colocar al pasajero en la intersección más cercana.'),
    coord: h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Latitud', inLat), h('label', { class: 'field' }, 'Longitud', inLon), h('div', { class: 'field', style: { justifyContent: 'flex-end' } }, btnCoord)),
    dir: h('div', { class: 'row' }, h('label', { class: 'field', style: { flex: 1 } }, 'Dirección', inDir), btnDir),
  };
  const tabs = h('div', { class: 'tabs' });
  for (const [k2, t] of [['mapa', 'Clic en mapa'], ['coord', 'Coordenadas'], ['dir', 'Dirección']]) {
    tabs.append(h('button', { type: 'button', class: k2 === 'mapa' ? 'is-on' : '', onclick: (e) => {
      [...tabs.children].forEach((b) => b.classList.toggle('is-on', b === e.currentTarget));
      Object.entries(panelEntrada).forEach(([n, el]) => { el.hidden = n !== k2; });
      st.modoMapa = k2 === 'mapa';
    } }, t));
  }
  panelEntrada.coord.hidden = panelEntrada.dir.hidden = true;

  const b = (t, c) => h('button', { class: `btn btn--sm ${c}`, type: 'button' }, t);
  const btnAleat = b('🎲 Pasajero aleatorio', 'btn--ghost');
  const btnBuscar = b('2 · Buscar candidatos', '');
  const btnRutas = b('3 · Calcular rutas', '');
  const btnAsignar = b('4 · Asignar conductor', 'btn--violet');
  const btnTodo = b('🚕 Solicitar taxi (flujo completo)', 'btn--neon');
  const btnVer = b('🎯 Ver recorrido', 'btn--ghost');
  const btnReset = b('↺ Reiniciar despacho', 'btn--ghost');

  function etapa(hasta, error = false) {
    pasos.forEach((p, i) => { p.classList.toggle('is-done', i < hasta); p.classList.toggle('is-active', i === hasta && !error); p.classList.toggle('is-error', i === hasta && error); });
  }
  function anotar(txt, clase = 'inf') { log.prepend(h('div', { class: clase }, txt)); }
  function botones() {
    btnBuscar.disabled = !st.pasajero || !!st.asignado;
    btnRutas.disabled = !st.pasajero || !!st.asignado;
    btnAsignar.disabled = !st.pasajero || !!st.asignado;
    btnVer.disabled = !st.asignado;
  }

  async function crearPasajero(cuerpo) {
    reiniciar(false);
    try {
      const r = await api('/api/pasajeros', cuerpo, { tiempoMax: 15000 });
      st.pasajero = r.pasajero;
      city.ponerPasajero(r.pasajero.x, r.pasajero.y);
      sim.resaltar({ candidatos: [], asignado: null, pasajero: r.pasajero });
      etapa(1);
      const p = r.pasajero;
      anotar(`Pasajero ${p.id} en (${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}) → intersección ${p.nodo} a ${fmt.m(p.distancia_a_nodo_m)}${r.geocodificacion ? ` · «${r.geocodificacion.nombre.slice(0, 60)}…» (${r.geocodificacion.fuente})` : ''}`, 'ok');
      city.vista('arriba-cerca', { x: p.x, y: p.y, distancia: 1200 });
      botones();
      return p;
    } catch (e) {
      etapa(0, true);
      anotar(`✗ ${e.message}`, 'err');
      toast(e.message, 'error', mensajeTitulo(e.codigo));
      throw e;
    }
  }
  function mensajeTitulo(c) {
    return { sin_conexion_vial: 'ZONA SIN CONEXIÓN VIAL', fuera_de_zona: 'FUERA DE LA ZONA', coordenada_invalida: 'COORDENADA INVÁLIDA', direccion_no_encontrada: 'DIRECCIÓN NO ENCONTRADA', tiempo_agotado: 'LA CONSULTA TARDÓ DEMASIADO', sin_conductores_disponibles: 'SIN TAXIS DISPONIBLES', sin_ruta_alcanzable: 'SIN RUTA ALCANZABLE', servicio_no_disponible: 'SERVICIO NO DISPONIBLE' }[c];
  }
  async function conErrores(fn, etapaError) {
    try { return await fn(); } catch (e) { etapa(etapaError, true); anotar(`✗ ${e.message}`, 'err'); toast(e.message, 'error', mensajeTitulo(e.codigo)); throw e; }
  }

  async function buscar() {
    return conErrores(async () => {
      const r = await api('/api/candidatos', { pasajero_id: st.pasajero.id, k: Number(selK.value) });
      st.candidatos = r.candidatos;
      dibujarBusqueda(city, r.traza_busqueda);
      dibujarCandidatos(city, st.pasajero, r.candidatos);
      sim.resaltar({ candidatos: r.candidatos.map((c) => c.conductor_id) });
      etapa(4);
      const t = r.traza_busqueda, u = t[t.length - 1];
      anotar(`Quadtree: ${t.length} consulta(s), radio final ${fmt.m(u.radio_m)}, ${t.reduce((s, x) => s + x.elementos_revisados, 0)} conductores revisados de ${sim.conductores.size}. Heap → ${r.candidatos.length} candidatos por Haversine en ${fmt.ms(r.tiempo_ms)}.`);
      resultado.replaceChildren(tarjetasCandidatos(r.candidatos));
      return r;
    }, 1);
  }
  async function rutas() {
    if (!st.candidatos) await buscar();
    return conErrores(async () => {
      const r = await api('/api/rutas/calcular', { pasajero_id: st.pasajero.id, k: Number(selK.value), velocidad_kmh: Number(inVel.value) });
      st.rutas = r.rutas;
      city.limpiar('rutas');
      for (const x of r.rutas) if (x.alcanzable) city.ruta(x.geometria, x.conductor_id === r.mejor_conductor_id ? COLOR.violeta : COLOR.amarillo, { ancho: x.conductor_id === r.mejor_conductor_id ? 9 : 4, opacidad: 0.6 });
      etapa(6);
      const m = r.rutas.find((x) => x.conductor_id === r.mejor_conductor_id);
      anotar(`Dijkstra ×${r.rutas.length}: ${r.rutas.map((x) => `C${x.conductor_id}=${x.alcanzable ? fmt.m(x.distancia_vial_m) : 'sin ruta'}`).join(', ')}. Menor ETA: C${m.conductor_id} (${fmt.min(m.eta_min)}).`);
      resultado.replaceChildren(tarjetasCandidatos(st.candidatos || r.rutas, { mejorId: r.mejor_conductor_id, conRuta: r.rutas }));
      return r;
    }, 4);
  }
  async function asignar() {
    return conErrores(async () => {
      const r = await api('/api/despacho/asignar', { pasajero_id: st.pasajero.id, k: Number(selK.value), velocidad_kmh: Number(inVel.value) });
      st.asignado = r.asignado;
      st.candidatos = r.candidatos; st.rutas = r.rutas;
      city.limpiar('overlay');
      dibujarBusqueda(city, r.traza_busqueda);
      dibujarCandidatos(city, st.pasajero, r.candidatos, r.asignado.conductor_id);
      dibujarRutas(city, r.rutas, r.asignado.conductor_id);
      sim.resaltar({ candidatos: r.candidatos.map((c) => c.conductor_id), asignado: r.asignado.conductor_id });
      const c = sim.conductores.get(r.asignado.conductor_id); if (c) c.estado = 'asignado';
      etapa(7);
      const s = r.resumen;
      anotar(`✓ Asignado conductor ${s.conductor_id}: ${fmt.m(s.distancia_vial_m)} por calles, ETA ${fmt.min(s.eta_min)}. ${s.mas_cercano_en_linea_recta_id !== s.conductor_id ? `(El más cercano en línea recta era C${s.mas_cercano_en_linea_recta_id}.)` : '(También era el más cercano en línea recta.)'} Flujo completo: ${fmt.ms(r.tiempo_total_ms)}.`, 'ok');
      resultado.replaceChildren(tarjetasCandidatos(r.candidatos, { mejorId: s.conductor_id, conRuta: r.rutas }));
      toast(`Conductor ${s.conductor_id} asignado · ETA ${fmt.min(s.eta_min)}`, 'ok', 'TAXI ASIGNADO');
      botones();
      return r;
    }, 6);
  }
  async function solicitarCompleto({ seguir = true } = {}) {
    if (!st.pasajero || st.asignado) {
      const p = nodoAleatorio(0.2);
      await crearPasajero({ x: p.x, y: p.y });
    }
    await buscar();
    await new Promise((r) => setTimeout(r, 900));
    await rutas();
    await new Promise((r) => setTimeout(r, 900));
    const r = await asignar();
    if (seguir) verRecorrido();
    return r;
  }
  function verRecorrido() {
    if (!st.asignado) return;
    const c = sim.conductores.get(st.asignado.conductor_id);
    if (c) { city.vista('cerca', { x: c.x, y: c.y, distancia: 450 }); setTimeout(() => city.seguirTaxi(c.id), 1300); }
    sim.setAuto(true);
  }
  function reiniciar(limpiarLog = true) {
    st.pasajero = st.candidatos = st.rutas = st.asignado = null;
    city.limpiar('overlay'); city.limpiar('rutas'); city.ponerPasajero(null); city.seguir = null;
    sim.limpiarResaltado();
    etapa(-1);
    if (limpiarLog) { log.replaceChildren(); resultado.replaceChildren(); }
    botones();
  }

  btnAleat.addEventListener('click', () => accion(btnAleat, () => { const p = nodoAleatorio(0.2); return crearPasajero({ x: p.x, y: p.y }); }));
  btnCoord.addEventListener('click', () => accion(btnCoord, () => {
    const lat = parseFloat(inLat.value), lon = parseFloat(inLon.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Ingresa latitud y longitud numéricas (por ejemplo -11.941 y -77.056).');
    return crearPasajero({ lat, lon });
  }));
  btnDir.addEventListener('click', () => accion(btnDir, () => crearPasajero({ direccion: inDir.value })));
  btnBuscar.addEventListener('click', () => accion(btnBuscar, buscar));
  btnRutas.addEventListener('click', () => accion(btnRutas, rutas));
  btnAsignar.addEventListener('click', () => accion(btnAsignar, asignar));
  btnTodo.addEventListener('click', () => accion(btnTodo, () => solicitarCompleto()));
  btnVer.addEventListener('click', verRecorrido);
  btnReset.addEventListener('click', () => reiniciar());
  sim.on('llegada', ({ id }) => {
    if (st.asignado && st.asignado.conductor_id === id) {
      anotar(`✓ El conductor ${id} llegó y recogió al pasajero ${st.pasajero?.id}: su estado pasa a «ocupado».`, 'ok');
      toast(`El conductor ${id} recogió al pasajero.`, 'ok', 'LLEGADA');
      sim.resaltar({ asignado: null, candidatos: [] });
      city.ponerPasajero(null);
    }
  });

  const el = h('div', { class: 'stack' },
    h('div', { class: 'card card--neon' }, h('h4', {}, '1 · Solicitud del pasajero'), tabs, panelEntrada.mapa, panelEntrada.coord, panelEntrada.dir,
      h('div', { class: 'row', style: { marginTop: '.5rem' } }, btnAleat, h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '.35rem' } }, selK), h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '.35rem' } }, 'km/h', inVel))),
    h('div', { class: 'card' }, h('div', { class: 'row' }, btnBuscar, btnRutas, btnAsignar), h('div', { class: 'row', style: { marginTop: '.45rem' } }, btnTodo, btnVer, btnReset)),
    h('div', { class: 'card' }, h('h4', {}, 'Registro del despachador'), log),
    h('div', { class: 'card' }, h('h4', {}, 'Candidatos'), resultado));
  botones();

  const onPick = (p) => {
    if (p.tipo === 'suelo' && st.modoMapa) accion(null, () => crearPasajero({ x: p.x, y: p.y }));
  };
  return { el, pipeline, st, solicitarCompleto, reiniciar, onPick, crearPasajero, verRecorrido, coordsDe: xyALatLon };
}
