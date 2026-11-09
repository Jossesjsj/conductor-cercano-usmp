/* Escena 2 — El problema real: búsqueda lineal vs índice espacial. */

import { createCityWorld } from '../core/city-world.js';
import { haversineKm } from '../algorithms/haversine.js';
import { fmtInt, fmtMs, fmt2, icon } from '../core/format.js';
import { on, q, setText, heading, panel } from './common.js';

export function createProblemScene(ctx) {
  let root;
  let raf = 0;
  let scanning = false;
  let detenido = false;

  function detener() {
    cancelAnimationFrame(raf);
    raf = 0;
    scanning = false;
  }

  function reset() {
    detener();
    const bar = q('#scan-bar', root);
    if (bar) bar.style.width = '0%';
    setText(root, '#scan-counter', '0');
    setText(root, '#scan-verdict', 'Listo para comparar 300 conductores contra una solicitud.');
    const flash = q('#request-flash', root);
    flash?.classList.remove('is-active');
  }

  return {
    id: 'problem',
    mount(el) {
      root = el;
      root.innerHTML = `
        <div class="problem-layout">
          <div class="problem-panel glass">
            ${heading({
              eyebrow: 'ACTO I · CONTEXTO',
              title: 'El problema real',
              lead: 'Comas tiene miles de calles. Un pasajero pide un viaje y la plataforma debe elegir al conductor disponible con menor tiempo de llegada, sin revisar toda la flota en cada solicitud.',
            })}
            <div class="problem-steps">
              <div class="problem-step"><span class="n">01</span><div><strong>Llega una solicitud</strong>Latitud y longitud del pasajero, con ruido GPS y sin información de calles.</div></div>
              <div class="problem-step"><span class="n">02</span><div><strong>Hay 300+ conductores</strong>Cada uno con posición, disponibilidad y estado. Buscar uno por uno cuesta O(n).</div></div>
              <div class="problem-step"><span class="n">03</span><div><strong>La distancia recta engaña</strong>En una ciudad, 800 m en línea recta pueden ser 2,4 km de calles y giros.</div></div>
              <div class="problem-step"><span class="n">04</span><div><strong>La decisión debe ser rápida y justa</strong>El objetivo es minimizar el ETA real, no solo la proximidad geométrica.</div></div>
            </div>

            <div class="scan-card">
              <div class="scan-card__head">
                <span class="scan-card__title">BÚSQUEDA LINEAL · MEDICIÓN REAL</span>
                <span class="status status--idle" id="scan-status">en espera</span>
              </div>
              <div class="scan-counter"><span id="scan-counter">0</span> <small>/ 300 CONDUCTORES</small></div>
              <div class="scan-track"><span id="scan-bar"></span></div>
              <p class="scan-verdict" id="scan-verdict">Listo para comparar 300 conductores contra una solicitud.</p>
            </div>

            <div class="problem-actions">
              <button class="btn btn--primary btn--sm" id="scan-run" type="button">${icon('search')} Ejecutar escaneo lineal</button>
              <button class="btn btn--ghost btn--sm" id="scan-reset" type="button">${icon('reset')} Reiniciar</button>
              <button class="btn btn--ghost btn--sm" id="scan-next" type="button">${icon('arrow')} Ver solución</button>
            </div>
          </div>

          <div class="problem-right">
            <div class="request-flash" id="request-flash"></div>
            <div class="problem-float glass">
              <div class="poor"><span>CONSULTA DEL PASAJERO</span><strong id="problem-passenger">-11.9401, -77.0459</strong></div>
              <p>El escaneo se ejecuta aquí, con <strong style="color:var(--cyan)">Haversine propio</strong>, sobre 300 conductores generados en calles reales. El tiempo depende de este equipo.</p>
            </div>
            <div class="problem-float glass">
              <div class="poor"><span>RED VIAL CARGADA</span><strong>${fmtInt(ctx.graph.stats.nodes)} nodos</strong></div>
              <p>La misma ciudad que verás en 3D es la que usa el algoritmo. No hay datos dibujados “de relleno”: cada conductor está sobre una arista de OpenStreetMap.</p>
            </div>
          </div>
        </div>`;

      setText(root, '#problem-passenger', `${ctx.graph.meta.center.lat.toFixed(5)}, ${ctx.graph.meta.center.lon.toFixed(5)}`);
      on(root, '#scan-next', 'click', () => ctx.goTo(2));
      on(root, '#scan-reset', 'click', reset);
      on(root, '#scan-run', 'click', ejecutar);
    },
    enter() {
      ctx.host.setWorld('city-problem', () => createCityWorld(ctx.graph, { variant: 'problem' }));
      reset();
    },
    leave() {
      detenido = true;
      detener();
    },
    pause(paused) {
      ctx.host.setPaused(paused);
      if (paused) detener();
    },
  };

  function ejecutar() {
    if (scanning) return;
    detener();
    detenido = false;
    scanning = true;
    const flota = ctx.getFlota(300);
    const pasajero = ctx.graph.meta.center;
    const flash = q('#request-flash', root);
    flash?.classList.add('is-active');
    const status = q('#scan-status', root);
    if (status) {
      status.className = 'status status--warn';
      status.textContent = 'escaneando';
    }
    const bar = q('#scan-bar', root);
    const counter = q('#scan-counter', root);
    const verdict = q('#scan-verdict', root);
    let i = 0;
    let mejor = null;
    let mejorKm = Infinity;
    const t0 = performance.now();

    const paso = () => {
      if (detenido) return;
      const lote = 12;
      for (let j = 0; j < lote && i < flota.length; j++, i++) {
        const c = flota[i];
        const d = haversineKm(c.lat, c.lon, pasajero.lat, pasajero.lon);
        if (d < mejorKm) {
          mejorKm = d;
          mejor = c;
        }
      }
      if (counter) counter.textContent = String(i);
      if (bar) bar.style.width = `${(i / flota.length) * 100}%`;
      if (i < flota.length) {
        raf = requestAnimationFrame(paso);
        return;
      }
      const ms = performance.now() - t0;
      scanning = false;
      flash?.classList.remove('is-active');
      if (status) {
        status.className = 'status status--ok';
        status.textContent = 'completado';
      }
      if (verdict && mejor) {
        verdict.innerHTML = `Se revisaron <strong style="color:var(--white)">${flota.length}</strong> conductores. El más cercano en línea recta fue <strong style="color:var(--cyan)">${mejor.id}</strong> a ${fmt2(mejorKm)} km, en <strong style="color:var(--amber)">${fmtMs(ms)}</strong>. Repetir esto con 30 000 conductores escala de forma lineal.`;
      }
      ctx.toast('Escaneo lineal completado. Ahora compara con el Quadtree.', 'info');
    };
    raf = requestAnimationFrame(paso);
  }
}
