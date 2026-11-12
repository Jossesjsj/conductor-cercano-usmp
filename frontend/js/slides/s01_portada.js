import { COLOR } from '../city3d.js';
import { nodoAleatorio, viewport } from '../componentes.js';
import { fmt, h } from '../ui.js';

export default {
  titulo: 'Portada', capitulo: 'INICIO', clase: 'cover', animarFlota: true,
  notas: 'Presentar al equipo y el problema en una frase: encontrar en milisegundos al conductor que llega primero. La ciudad es la red vial real de Comas; los taxis se mueven con la simulación del backend Python y las líneas amarillas son una búsqueda real de los 5 candidatos más cercanos.',
  crear({ city, api, ir, raiz }) {
    const vp = viewport('viewport--bleed');
    const stats = { flota: h('strong', { class: 'c-cyan' }, '—'), red: h('strong', {}, '—'), area: h('strong', { class: 'c-violet' }, '—'), busq: h('strong', { class: 'c-yellow' }, '—') };
    const zona = h('span', { class: 'badge' }, 'Comas, Lima');
    raiz.append(vp, h('div', { class: 'cover__shade' }),
      h('div', { class: 'cover__content' },
        h('p', { class: 'cover__uni' }, 'UNIVERSIDAD DE SAN MARTÍN DE PORRES'),
        h('p', { class: 'cover__fac' }, 'Facultad de Ingeniería y Arquitectura'),
        h('span', { class: 'cover__pi' }, 'PROYECTO INTEGRADOR N.º 2'),
        h('h1', { class: 'cover__title' }, 'ASIGNACIÓN DEL', h('span', {}, 'CONDUCTOR MÁS CERCANO')),
        h('p', { class: 'cover__sub' }, 'Cómo Uber, Cabify o InDrive encuentran tu taxi en segundos.'),
        h('dl', { class: 'cover__meta' },
          h('dt', {}, 'CURSO'), h('dd', {}, 'Algoritmos y Estructura de Datos II'),
          h('dt', {}, 'INTEGRANTES'), h('dd', {}, h('ol', {},
            h('li', {}, 'Antezana Vargas Jorge Jose'),
            h('li', {}, 'Andres Bardales Moreno'),
            h('li', {}, 'Vanessa Guerrero Yañez'))),
          h('dt', {}, 'CICLO'), h('dd', {}, 'IV')),
        h('div', { class: 'cover__btns' },
          h('button', { class: 'btn btn--neon btn--lg', type: 'button', onclick: () => ir(1) }, 'Iniciar presentación →'),
          h('button', { class: 'btn btn--violet btn--lg', type: 'button', onclick: () => ir(11) }, '🚕 Explorar simulación'))),
      h('div', { class: 'cover__stats' },
        h('div', { class: 'float-card' }, h('span', {}, 'Flota simulada'), stats.flota, h('small', {}, 'conductores')),
        h('div', { class: 'float-card' }, h('span', {}, 'Red vial real'), stats.red, h('small', {}, 'intersecciones OSM')),
        h('div', { class: 'float-card' }, h('span', {}, 'Zona'), stats.area, h('small', {}, 'km² de Comas')),
        h('div', { class: 'float-card' }, h('span', {}, 'Búsqueda k = 5'), stats.busq, h('small', {}, 'Quadtree + heap'))),
      h('div', { class: 'cover__zone' }, zona));

    let activo = false;
    // Una sola búsqueda REAL al abrir la portada (las líneas siguen a sus taxis).
    async function busqueda() {
      try {
        // Intersección en la zona visible de la cámara (derecha del título).
        const g = window.__grafo, [x0, y0, x1, y1] = g.limites, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, T = Math.max(x1 - x0, y1 - y0);
        const visibles = g.nodos.filter((n) => n[1] > cx + 0.02 * T && n[1] < cx + 0.3 * T && Math.abs(n[2] - cy) < 0.15 * T);
        const n = visibles.length ? visibles[Math.floor(Math.random() * visibles.length)] : null;
        const p = n ? { x: n[1], y: n[2] } : nodoAleatorio(0.3);
        const rp = await api('/api/pasajeros', { x: p.x, y: p.y });
        const rc = await api('/api/candidatos', { pasajero_id: rp.pasajero.id, k: 5 });
        if (!activo) return;
        city.limpiar('overlay');
        city.ponerPasajero(rp.pasajero.x, rp.pasajero.y);
        rc.candidatos.forEach((c) => city.arcoTaxi([rp.pasajero.x, rp.pasajero.y], c.conductor_id, COLOR.amarillo, { radio: 2.4 }));
        stats.busq.textContent = fmt.ms(rc.tiempo_ms);
      } catch { /* la portada no muestra errores técnicos */ }
    }

    return {
      viewport: vp,
      async entrar() {
        activo = true;
        city.limpiarTodo();
        city.visible('edificios', true); city.visible('flota', true);
        city.vista('portada');
        try {
          const e = await api('/api/estado');
          stats.flota.textContent = fmt.n(e.simulacion.total);
          stats.red.textContent = fmt.n(e.red.nodos);
          stats.area.textContent = String(e.red.area_km2).replace('.', ',');
          zona.textContent = `${e.red.zona} · ${e.red.km_de_calles_dirigidas} km de calles`;
        } catch { /* sin datos */ }
        setTimeout(busqueda, 1200);
      },
      salir() { activo = false; city.limpiarTodo(); },
    };
  },
};
