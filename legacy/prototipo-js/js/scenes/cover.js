/* Escena 1 — Portada. */

import { createCityWorld } from '../core/city-world.js';
import { fmtInt, fmt2, icon } from '../core/format.js';
import { on } from './common.js';

export function createCoverScene(ctx) {
  let root;

  return {
    id: 'cover',
    mount(el) {
      root = el;
      const s = ctx.graph.stats;
      root.innerHTML = `
        <div class="cover-scene">
          <div class="cover-corner">
            <p class="eyebrow">PROYECTO INTEGRADOR N.º 2</p>
            <strong>02</strong>
            <small>ALGORITMOS Y ESTRUCTURA II</small>
          </div>

          <div class="cover-main">
            <div class="cover-kicker">
              <span class="chip">USMP · GRUPO 2</span>
              <span class="chip chip--cyan">DEMOSTRACIÓN EJECUTABLE</span>
              <span class="chip chip--violet">COMAS · LIMA</span>
            </div>
            <h1 class="cover-title">Asignación del <span>conductor más cercano</span></h1>
            <p class="cover-subtitle">
              Una solicitud de transporte llega a la ciudad. En milisegundos hay que decidir
              <strong>qué conductor disponible llega antes</strong> usando la red vial real de Comas.
              Recorremos el pipeline completo: índice espacial <strong>Quadtree</strong>, distancia
              <strong>Haversine</strong>, selección con <strong>heap</strong> y ruta mínima con
              <strong>Dijkstra</strong>.
            </p>
            <div class="cover-cta">
              <button class="btn btn--primary" id="cover-start" type="button">
                ${icon('play')} Iniciar recorrido
              </button>
              <button class="btn btn--ghost" id="cover-sim" type="button">
                ${icon('car')} Ver simulación de flota
              </button>
              <button class="btn btn--ghost" id="cover-map" type="button">
                ${icon('map')} Abrir mapa de Comas
              </button>
            </div>
            <div class="cover-stats">
              <div class="cover-stat"><strong>${fmtInt(s.nodes)}</strong><span>nodos viales</span></div>
              <div class="cover-stat"><strong>${fmtInt(s.edges)}</strong><span>aristas reales</span></div>
              <div class="cover-stat"><strong>${fmt2(s.totalKm)} km</strong><span>red de Comas</span></div>
              <div class="cover-stat"><strong>300</strong><span>conductores por defecto</span></div>
            </div>
          </div>

          <aside class="cover-academic glass">
            <div class="uni">
              <span class="uni__seal">USMP</span>
              <div>
                <strong>UNIVERSIDAD DE SAN MARTÍN DE PORRES</strong>
                <span>Facultad de Ingeniería y Arquitectura</span>
              </div>
            </div>
            <dl>
              <dt>Curso</dt><dd>Algoritmos y Estructura de Datos II</dd>
              <dt>Proyecto</dt><dd>Integrador N.º 2 · Grupo 2</dd>
              <dt>Integrantes</dt>
              <dd class="students">
                <span><i>01</i>Antezana Vargas, Jorge Jose</span>
                <span><i>02</i>Bardales Moreno, Andres</span>
                <span><i>03</i>Guerrero Yañez, Vanessa</span>
              </dd>
              <dt>Docente</dt><dd>Curso de Algoritmos y Estructura de Datos II</dd>
              <dt>Periodo</dt><dd>2026 · Ciclo académico</dd>
            </dl>
            <div class="cover-location">
              ${icon('pin')} Comas, Lima, Perú · red vial OpenStreetMap
            </div>
          </aside>

          <div class="cover-hint">
            <span>${icon('compass')}</span>
            <span>USA ← → PARA NAVEGAR · ESPACIO PARA PAUSAR · M PARA EL ÍNDICE</span>
          </div>
        </div>`;

      on(root, '#cover-start', 'click', () => ctx.goTo(1));
      on(root, '#cover-sim', 'click', () => ctx.goTo(10));
      on(root, '#cover-map', 'click', () => ctx.goTo(11));
    },
    enter() {
      ctx.host.setWorld('city-cover', () => createCityWorld(ctx.graph, { variant: 'cover' }));
    },
    leave() {},
    pause(paused) {
      ctx.host.setPaused(paused);
    },
  };
}
