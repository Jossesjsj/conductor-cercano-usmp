import { COLOR } from '../city3d.js';
import { herramientasMapa, nodoAleatorio, viewport, xyALatLon } from '../componentes.js';
import { encabezado, fmt, h, katex, kpi, legend, toast } from '../ui.js';

export default {
  titulo: 'Haversine', capitulo: 'ALGORITMOS',
  notas: 'La distancia Haversine es la distancia sobre la esfera terrestre ("en línea recta"). Haz clic en dos puntos del mapa: la línea amarilla es Haversine; la violeta es la ruta real por calles calculada con Dijkstra. Nunca se usa Haversine como sustituto de la ruta.',
  crear({ city, sim, api, num, raiz }) {
    const vp = viewport();
    const msg = h('div', { class: 'vp-msg' }, 'Clic en el mapa: punto A');
    vp.append(h('div', { class: 'vp-overlay vp-tr' }, herramientasMapa(city, sim, { capas: ['edificios', 'flota'], seguir: false, pausa: false })),
      h('div', { class: 'vp-overlay vp-bl' }, legend([['#FACC15', 'Haversine (superficie terrestre)', true], ['#B18CFF', 'Ruta vial (Dijkstra)', true]])), msg);
    const k = { hav: kpi('Haversine', '—', 'c-yellow'), vial: kpi('Por calles', '—', 'c-violet'), fac: kpi('Factor de desvío', '—', 'c-cyan', 'vial / Haversine') };
    const pasos = h('table', { class: 'tbl' });
    const coords = h('p', { class: 'note' }, 'Selecciona dos puntos.');
    const btnEj = h('button', { class: 'btn btn--neon btn--sm', type: 'button' }, 'Par aleatorio');
    const btnLimpiar = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Reiniciar');
    raiz.append(
      encabezado(num, 'ALGORITMOS · RF-04', 'Fórmula de <em>Haversine</em>', 'Distancia en línea recta sobre la Tierra. Haz clic en dos puntos.'),
      h('div', { class: 'slide__body cols-37' },
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' },
            katex(String.raw`a=\sin^2\!\left(\tfrac{\Delta\varphi}{2}\right)+\cos\varphi_1\cos\varphi_2\,\sin^2\!\left(\tfrac{\Delta\lambda}{2}\right)`),
            h('div', { style: { height: '.5rem' } }),
            katex(String.raw`d = 2R\cdot\operatorname{atan2}\!\left(\sqrt{a},\sqrt{1-a}\right)`),
            h('p', { class: 'note' }, 'φ latitud · λ longitud (en radianes) · R = radio de la Tierra')),
          h('div', { class: 'card' }, h('div', { class: 'kpis' }, k.hav, k.vial, k.fac), coords, h('div', { class: 'row', style: { marginTop: '.5rem' } }, btnEj, btnLimpiar)),
          h('div', { class: 'card' }, h('h4', {}, 'Cálculo paso a paso (backend)'), pasos)),
        vp));

    let A = null;
    async function calcular(a, b) {
      city.limpiar('overlay'); city.limpiar('rutas');
      city.marca(a.x, a.y, COLOR.cian, 9); city.marca(b.x, b.y, 0xff7bf6, 9);
      city.etiqueta(a.x, a.y, 'A', '', 30); city.etiqueta(b.x, b.y, 'B', '', 30);
      const [lat1, lon1] = xyALatLon(a.x, a.y), [lat2, lon2] = xyALatLon(b.x, b.y);
      const r = await api('/api/haversine', { lat1, lon1, lat2, lon2 });
      city.arco([a.x, a.y], [b.x, b.y], COLOR.amarillo, { radio: 2.6, alturaRel: 0.18, guion: 18 });
      if (r.vial?.geometria?.length) city.ruta(r.vial.geometria, COLOR.ruta, { ancho: 10 });
      const d = r.detalle;
      k.hav.set(fmt.m(d.distancia_m));
      k.vial.set(r.vial ? fmt.m(r.vial.distancia_m) : '—');
      k.fac.set(r.vial?.factor_desvio ? `× ${r.vial.factor_desvio.toFixed(2)}` : '—');
      coords.textContent = `A = (${lat1.toFixed(6)}, ${lon1.toFixed(6)})  ·  B = (${lat2.toFixed(6)}, ${lon2.toFixed(6)})`;
      const f = (v, n = 8) => v.toFixed(n);
      pasos.replaceChildren(
        h('tr', {}, h('th', {}, 'Variable'), h('th', { class: 'num' }, 'Valor')),
        ...[['φ₁, φ₂ (rad)', `${f(d.phi1_rad, 6)}, ${f(d.phi2_rad, 6)}`], ['Δφ (rad)', f(d.delta_phi_rad)], ['Δλ (rad)', f(d.delta_lambda_rad)], ['a', d.a.toExponential(6)], ['c = 2·atan2(√a, √(1−a))', d.c.toExponential(6)], ['d = R·c', `${d.distancia_m.toFixed(2)} m`]]
          .map(([n, v]) => h('tr', {}, h('td', {}, n), h('td', { class: 'num' }, v))));
      msg.textContent = 'Clic de nuevo para elegir otro punto A';
    }
    async function aleatorio() {
      const a = nodoAleatorio(0.2), b = nodoAleatorio(0.2);
      await calcular(a, b);
      city.vista('cerca', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distancia: Math.max(600, Math.hypot(a.x - b.x, a.y - b.y) * 1.2) });
    }
    btnEj.addEventListener('click', () => aleatorio().catch((e) => toast(e.message, 'error')));
    btnLimpiar.addEventListener('click', () => { A = null; city.limpiar('overlay'); city.limpiar('rutas'); msg.textContent = 'Clic en el mapa: punto A'; });
    return {
      viewport: vp,
      entrar() {
        city.limpiarTodo(); city.visible('flota', false);
        city.onPick = async (p) => {
          if (p.tipo !== 'suelo') return;
          if (!A) { A = p; city.limpiar('overlay'); city.limpiar('rutas'); city.marca(p.x, p.y, COLOR.cian, 9); msg.textContent = 'Ahora el punto B'; return; }
          const a = A; A = null;
          try { await calcular(a, p); } catch (e) { toast(e.message, 'error'); }
        };
        aleatorio().catch(() => {});
      },
      salir() { city.onPick = null; city.visible('flota', true); A = null; },
    };
  },
};
