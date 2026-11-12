import { encabezado, fmt, h, kpi, legend } from '../ui.js';

// CDN: red de servidores de borde (PoP) que guardan copias del contenido cerca
// del usuario. Elegir el PoP es OTRO problema de "el más cercano": se resuelve
// aquí con la misma fórmula de Haversine del proyecto. Latencias estimadas con
// física simple (luz en fibra ≈ 200 000 km/s), sin colas ni procesamiento real.
const ORIGEN = { n: 'Origen (Virginia, EE.UU.)', lat: 39.04, lon: -77.49 };
const POPS = [
  { n: 'Lima', lat: -12.05, lon: -77.04 }, { n: 'Bogotá', lat: 4.71, lon: -74.07 },
  { n: 'Santiago', lat: -33.45, lon: -70.67 }, { n: 'São Paulo', lat: -23.55, lon: -46.63 },
  { n: 'Buenos Aires', lat: -34.6, lon: -58.38 }, { n: 'Miami', lat: 25.76, lon: -80.19 },
  { n: 'Ciudad de México', lat: 19.43, lon: -99.13 }, { n: 'Madrid', lat: 40.42, lon: -3.7 },
];
const USUARIOS = [
  { n: 'Comas', lat: -11.94, lon: -77.06 }, { n: 'Arequipa', lat: -16.41, lon: -71.54 },
  { n: 'Cusco', lat: -13.53, lon: -71.97 }, { n: 'Quito', lat: -0.18, lon: -78.47 },
  { n: 'Montevideo', lat: -34.9, lon: -56.16 }, { n: 'Monterrey', lat: 25.67, lon: -100.31 },
];
const LON = [-125, 10], LAT = [-58, 52];

function haversineKm(a, b) {
  const R = 6371.0088, rad = Math.PI / 180;
  const dp = (b.lat - a.lat) * rad, dl = (b.lon - a.lon) * rad;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const rttMs = (km) => km / 100; // ida y vuelta: 2·km / 200 000 km/s

export default {
  titulo: 'CDN y su funcionamiento', capitulo: 'CONTEXTO',
  notas: 'Una CDN copia el contenido estático (JS, CSS, imágenes, teselas de mapa) en servidores de borde repartidos por el mundo. El DNS o anycast envía al usuario al PoP más cercano —otra vez el problema del vecino más cercano, resuelto aquí con Haversine—. Primer pedido: MISS, el PoP lo trae del origen y lo guarda según Cache-Control (TTL). Siguientes pedidos: HIT, responde el borde. En el proyecto: la presentación sirve Three.js, GSAP, Chart.js y KaTeX desde frontend/vendor (funciona sin Internet); los mapas Folium cargan Leaflet desde jsDelivr/cdnjs y las teselas desde la CDN de CARTO. Latencias: estimación física, no mediciones.',
  crear({ num, raiz }) {
    const cv = h('canvas', { class: 'heap-canvas', style: { cursor: 'crosshair' } });
    const caja = h('div', { class: 'chart-box', style: { flex: 1 } }, cv);
    const k = { hit: kpi('HIT', '0', 'c-green'), miss: kpi('MISS', '0', 'c-red'), ratio: kpi('Tasa de aciertos', '—', 'c-cyan'), lat: kpi('Latencia (última)', '—', 'c-yellow'), sin: kpi('Sin CDN', '—', 'c-dim') };
    const log = h('div', { class: 'log', style: { height: '7rem' } });
    const pasos = ['DNS / anycast → PoP más cercano', '¿Está en la caché del PoP?', 'MISS: el PoP lo pide al origen y lo guarda (TTL)', 'HIT: responde el PoP, sin ir al origen'].map((t, i) => h('li', { dataset: { i } }, t));
    const est = { ttl: 60, cache: new Map(), hits: 0, miss: 0, anim: [], ultimo: null };
    const segTtl = h('div', { class: 'seg' }, ...[[15, '15 s'], [60, '60 s'], [Infinity, 'sin vencer']].map(([v, t]) =>
      h('button', { type: 'button', class: v === 60 ? 'is-on' : '', onclick: (e) => { est.ttl = v; [...segTtl.children].forEach((b) => b.classList.toggle('is-on', b === e.currentTarget)); } }, t)));
    const btnPurgar = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { est.cache.clear(); log.prepend(h('div', { class: 'inf' }, 'Caché purgada en todos los PoP (nueva versión publicada).')); } }, '🧹 Purgar caché');
    const usuarios = h('div', { class: 'row' }, USUARIOS.map((u) => h('button', { class: 'btn btn--sm', type: 'button', onclick: () => pedir(u) }, u.n)));

    raiz.append(
      encabezado(num, 'CONTEXTO · INFRAESTRUCTURA WEB', '<em>CDN</em>: el contenido, cerca del usuario', 'Red de entrega de contenidos: copias en el borde, origen protegido.'),
      h('div', { class: 'slide__body cols-64' },
        h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', minHeight: 0 } },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h4', { style: { margin: 0 } }, 'Clic en el mapa o elige un usuario: pide app.js'),
            legend([['#8B5CF6', 'Origen'], ['#00D9FF', 'PoP (borde)'], ['#22E39B', 'HIT'], ['#FF4D6D', 'MISS → origen']])),
          caja, h('div', { style: { marginTop: '.5rem' } }, usuarios)),
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' }, h('div', { class: 'kpis' }, k.hit, k.miss, k.ratio, k.lat, k.sin)),
          h('div', { class: 'card' }, h('h4', {}, 'Funcionamiento'), h('ol', { class: 'cdn-pasos', style: { margin: 0, paddingLeft: '1.1rem' } }, pasos),
            h('div', { class: 'row', style: { marginTop: '.55rem' } }, h('span', { class: 'hint' }, 'TTL (Cache-Control: max-age):'), segTtl, btnPurgar)),
          h('div', { class: 'card' }, h('h4', {}, 'Registro'), log),
          h('div', { class: 'card' }, h('h4', {}, 'En este proyecto'), h('ul', { style: { margin: 0 } },
            h('li', {}, 'Three.js, GSAP, Chart.js y KaTeX se sirven desde ', h('code', {}, 'frontend/vendor'), ': la sustentación no depende de Internet.'),
            h('li', {}, 'Los mapas Folium cargan Leaflet desde jsDelivr y cdnjs, y las teselas desde la CDN de CARTO.'),
            h('li', {}, 'Elegir el PoP es otro "más cercano": aquí con nuestra Haversine.'))),
          h('p', { class: 'note' }, 'Latencias estimadas: luz en fibra ≈ 200 000 km/s (1 ms por cada 100 km ida y vuelta) + 2 ms por servidor. No son mediciones.'))));

    function pedir(u) {
      const t = performance.now();
      const ds = POPS.map((p) => ({ p, km: haversineKm(u, p) })).sort((a, b) => a.km - b.km);
      const { p, km } = ds[0];
      const vence = est.cache.get(p.n);
      const hit = vence !== undefined && vence > t;
      const kmO = haversineKm(p, ORIGEN), kmDirecto = haversineKm(u, ORIGEN);
      const lat = rttMs(km) + 2 + (hit ? 0 : rttMs(kmO) + 2);
      if (hit) est.hits++; else { est.miss++; est.cache.set(p.n, t + est.ttl * 1000); }
      k.hit.set(fmt.n(est.hits)); k.miss.set(fmt.n(est.miss)); k.ratio.set(`${Math.round(100 * est.hits / (est.hits + est.miss))} %`);
      k.lat.set(`${lat.toFixed(0)} ms`); k.sin.set(`${(rttMs(kmDirecto) + 2).toFixed(0)} ms`);
      log.prepend(h('div', { class: hit ? 'ok' : 'err' }, `${u.n} → PoP ${p.n} (${fmt.n(Math.round(km))} km) · ${hit ? 'HIT' : `MISS → origen (${fmt.n(Math.round(kmO))} km)`} · ≈ ${lat.toFixed(0)} ms`));
      pasos.forEach((li, i) => li.classList.toggle('c-cyan', i === 0 || i === 1 || (hit ? i === 3 : i === 2)));
      est.ultimo = { u, p };
      est.anim.push({ a: u, b: p, t0: t, dur: 700, color: hit ? '#22E39B' : '#FACC15' });
      if (!hit) est.anim.push({ a: p, b: ORIGEN, t0: t + 700, dur: 900, color: '#FF4D6D', ida: true });
    }

    let activo = false, raf = 0, vista = null;
    function proy(lat, lon) {
      const { W, H, m } = vista;
      return [m + (lon - LON[0]) / (LON[1] - LON[0]) * (W - 2 * m), m + (LAT[1] - lat) / (LAT[1] - LAT[0]) * (H - 2 * m)];
    }
    function dibujar(ahora = performance.now()) {
      const r = cv.getBoundingClientRect(); if (!r.width) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
      vista = { W: cv.width, H: cv.height, m: 18 * dpr, dpr };
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      // Retícula de meridianos y paralelos (cada 15°) y ecuador.
      g.lineWidth = dpr;
      for (let lon = -120; lon <= 0; lon += 15) { g.strokeStyle = 'rgba(120,160,255,.08)'; const [a, b] = proy(LAT[1], lon), [, d] = proy(LAT[0], lon); g.beginPath(); g.moveTo(a, b); g.lineTo(a, d); g.stroke(); }
      for (let lat = -45; lat <= 45; lat += 15) { g.strokeStyle = lat === 0 ? 'rgba(0,217,255,.25)' : 'rgba(120,160,255,.08)'; const [a, b] = proy(lat, LON[0]), [c] = proy(lat, LON[1]); g.beginPath(); g.moveTo(a, b); g.lineTo(c, b); g.stroke(); }
      g.font = `600 ${11 * dpr}px Inter`; g.textAlign = 'left';
      // Enlaces PoP ↔ origen (red troncal).
      for (const p of POPS) { const [a, b] = proy(p.lat, p.lon), [c, d] = proy(ORIGEN.lat, ORIGEN.lon); g.strokeStyle = 'rgba(139,92,246,.18)'; g.setLineDash([4 * dpr, 5 * dpr]); g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
      g.setLineDash([]);
      for (const p of POPS) {
        const [a, b] = proy(p.lat, p.lon), lleno = (est.cache.get(p.n) ?? 0) > ahora;
        g.fillStyle = lleno ? '#00D9FF' : 'rgba(0,217,255,.25)'; g.strokeStyle = '#00D9FF'; g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.rect(a - 6 * dpr, b - 6 * dpr, 12 * dpr, 12 * dpr); g.fill(); g.stroke();
        g.fillStyle = '#DBE5FF'; g.fillText(`${p.n}${lleno ? ' · en caché' : ''}`, a + 10 * dpr, b + 4 * dpr);
      }
      { const [a, b] = proy(ORIGEN.lat, ORIGEN.lon); g.fillStyle = '#8B5CF6'; g.shadowColor = '#8B5CF6'; g.shadowBlur = 14 * dpr; g.beginPath(); g.arc(a, b, 9 * dpr, 0, 7); g.fill(); g.shadowBlur = 0; g.fillStyle = '#C4B5FD'; g.fillText(ORIGEN.n, a + 13 * dpr, b + 4 * dpr); }
      for (const u of USUARIOS) { const [a, b] = proy(u.lat, u.lon); g.fillStyle = 'rgba(255,123,246,.55)'; g.beginPath(); g.arc(a, b, 3 * dpr, 0, 7); g.fill(); }
      if (est.ultimo) {
        const { u, p } = est.ultimo, [a, b] = proy(u.lat, u.lon), [c, d] = proy(p.lat, p.lon);
        g.strokeStyle = 'rgba(250,204,21,.5)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
        g.fillStyle = '#FF7BF6'; g.beginPath(); g.arc(a, b, 5.5 * dpr, 0, 7); g.fill();
        g.fillStyle = '#FFD1FB'; g.textAlign = 'right'; g.fillText(u.n, a - 9 * dpr, b + 14 * dpr); g.textAlign = 'left';
      }
      // Paquetes en tránsito.
      est.anim = est.anim.filter((x) => ahora < x.t0 + x.dur * (x.ida ? 2 : 1) + 50);
      for (const x of est.anim) {
        let f = (ahora - x.t0) / x.dur; if (f < 0) continue;
        if (x.ida) f = f <= 1 ? f : 2 - f; else f = Math.min(1, f);
        const [a, b] = proy(x.a.lat, x.a.lon), [c, d] = proy(x.b.lat, x.b.lon);
        g.strokeStyle = x.color; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(a, b); g.lineTo(a + (c - a) * f, b + (d - b) * f); g.stroke();
        g.fillStyle = x.color; g.shadowColor = x.color; g.shadowBlur = 10 * dpr; g.beginPath(); g.arc(a + (c - a) * f, b + (d - b) * f, 4 * dpr, 0, 7); g.fill(); g.shadowBlur = 0;
      }
    }
    function bucle() {
      cancelAnimationFrame(raf);
      const paso = () => { dibujar(); if (activo) raf = requestAnimationFrame(paso); };
      paso();
    }

    cv.addEventListener('click', (ev) => {
      if (!vista) return;
      const r = cv.getBoundingClientRect(), { W, H, m, dpr } = vista;
      const x = (ev.clientX - r.left) * dpr, y = (ev.clientY - r.top) * dpr;
      pedir({ n: 'Usuario', lon: LON[0] + (x - m) / (W - 2 * m) * (LON[1] - LON[0]), lat: LAT[1] - (y - m) / (H - 2 * m) * (LAT[1] - LAT[0]) });
    });
    new ResizeObserver(() => dibujar()).observe(caja);
    return {
      entrar() { activo = true; bucle(); },
      salir() { activo = false; cancelAnimationFrame(raf); },
    };
  },
};
