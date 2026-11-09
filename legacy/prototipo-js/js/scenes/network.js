/* Escena 4 — Red vial real de Comas (OpenStreetMap). */

import { MapController, CLASES_VIA } from '../maps/map-controller.js';
import { fmtInt, fmt2, icon } from '../core/format.js';
import { heading, panel, legend, tags, on, q, qa, setText } from './common.js';

const ETIQUETAS = {
  trunk: 'Troncal',
  primary: 'Primaria',
  secondary: 'Secundaria',
  tertiary: 'Terciaria',
  residential: 'Residencial',
  living_street: 'Calle local',
  service: 'Servicio',
  busway: 'Corredor',
  unclassified: 'Sin clasificar',
};

export function createNetworkScene(ctx) {
  let root;
  let map = null;
  let inicializado = false;

  function crearMapa() {
    if (inicializado) return;
    const contenedor = q('#network-map-canvas', root);
    if (!contenedor) return;
    map = new MapController(contenedor, {
      graph: ctx.graph,
      zoom: 13,
      tiles: true,
      status: true,
    });
    map.on('tiles', ({ offline }) => {
      const chip = q('#network-tile-status', root);
      if (chip) {
        chip.textContent = offline ? 'MODO LOCAL · SIN MOSAICOS' : 'OSM · CONECTADO';
        chip.className = `chip ${offline ? 'chip--amber' : 'chip--cyan'}`;
      }
    });
    map.fitGraph([14, 14]);
    inicializado = true;
    setTimeout(() => map?.invalidate(), 120);
  }

  function clases() {
    return Object.entries(ctx.graph.stats.classes)
      .filter(([cls]) => CLASES_VIA[cls])
      .sort((a, b) => b[1] - a[1]);
  }

  return {
    id: 'network',
    mount(el) {
      root = el;
      const s = ctx.graph.stats;
      const meta = ctx.graph.meta;
      const filas = clases();

      root.innerHTML = `
        <div class="network-layout">
          <div class="network-left">
            ${heading({
              eyebrow: 'ACTO I · CONTEXTO',
              title: 'OpenStreetMap · Comas',
              lead: 'La demostración no usa calles dibujadas a mano: el grafo se construyó a partir de las vías reales de Comas, Lima, descargadas de OpenStreetMap y almacenadas localmente.',
              right: '<span class="chip chip--green">DATOS REALES</span>',
            })}

            ${panel({
              title: 'Cobertura del grafo',
              eyebrow: 'ÁREA DE ESTUDIO',
              iconName: 'map',
              body: `
                <div class="network-stats">
                  <div class="metric"><span class="metric__value">${fmtInt(s.nodes)}</span><span class="metric__label">nodos viales</span></div>
                  <div class="metric"><span class="metric__value">${fmtInt(s.edges)}</span><span class="metric__label">aristas</span></div>
                  <div class="metric metric--accent"><span class="metric__value">${fmt2(s.totalKm)} <small>km</small></span><span class="metric__label">longitud total</span></div>
                  <div class="metric"><span class="metric__value">${fmt2(meta.area_km2)} <small>km²</small></span><span class="metric__label">área aproximada</span></div>
                </div>
                <div class="symbol-list" style="margin-top:10px">
                  <div><code>bbox</code><span>${meta.bbox.minlat.toFixed(5)}, ${meta.bbox.minlon.toFixed(5)} → ${meta.bbox.maxlat.toFixed(5)}, ${meta.bbox.maxlon.toFixed(5)}</span></div>
                  <div><code>centro</code><span>${meta.center.lat.toFixed(5)}, ${meta.center.lon.toFixed(5)}</span></div>
                  <div><code>corte</code><span>${meta.osm_timestamp.replace('T', ' · ').replace('Z', ' UTC')}</span></div>
                </div>
                <div style="margin-top:10px">${tags(['OpenStreetMap', 'ODbL 1.0', 'Overpass API', 'sin datos sintéticos de calles'])}</div>
                <p class="note" style="margin-top:8px">${meta.note}</p>
              `,
            })}

            ${panel({
              title: 'Capas visibles',
              eyebrow: 'CONTROL DEL MAPA',
              iconName: 'layers',
              body: `
                <div class="control-row" style="margin-bottom:8px">
                  <span class="chip chip--cyan" id="network-tile-status">OSM · CONECTANDO</span>
                  <button class="btn btn--ghost btn--sm" id="network-fit" type="button">${icon('target')} Centrar Comas</button>
                </div>
                <label class="switch" style="margin-bottom:8px">
                  <input type="checkbox" id="network-tiles" checked>
                  <span>Mosaicos de OpenStreetMap (si fallan, la red local permanece visible)</span>
                </label>
                <div id="network-classes" style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px">
                  ${filas.map(([cls, n]) => `
                    <label class="switch">
                      <input type="checkbox" data-road-class="${cls}" checked>
                      <span>${ETIQUETAS[cls] || cls} <small style="color:var(--muted-2)">(${fmtInt(n)})</small></span>
                    </label>`).join('')}
                </div>
              `,
            })}

            ${panel({
              title: 'Del mapa al algoritmo',
              eyebrow: 'CONTRATO DE ENTRADA',
              iconName: 'route',
              body: `
                <div class="pipeline-mini">
                  <span><b>1</b> vías OSM</span><span>→</span>
                  <span><b>2</b> nodos y aristas</span><span>→</span>
                  <span><b>3</b> pesos en km</span><span>→</span>
                  <span><b>4</b> grafo dirigible</span>
                </div>
                <p class="note" style="margin-top:8px">Los nodos de grado 2 se contrajeron para conservar intersecciones y extremos, pero cada arista mantiene la geometría intermedia de la calle. Por eso las rutas de Dijkstra se dibujan sobre la vía real.</p>
                <div class="btn-row" style="margin-top:10px">
                  <button class="btn btn--primary btn--sm" id="network-next" type="button">${icon('arrow')} Ver índice Quadtree</button>
                </div>
              `,
            })}
          </div>

          <div class="network-map">
            <div class="map-shell">
              <div class="map-canvas" id="network-map-canvas"></div>
              <div class="network-legend map-legend glass">
                ${legend([
                  { dot: 'legend__dot--amber', label: 'Troncal' },
                  { dot: 'legend__dot--violet', label: 'Primaria' },
                  { dot: 'legend__dot--cyan', label: 'Secundaria' },
                  { dot: 'legend__dot--gray', label: 'Locales' },
                ])}
              </div>
            </div>
          </div>
        </div>`;

      on(root, '#network-next', 'click', () => ctx.goTo(4));
      on(root, '#network-fit', 'click', () => map?.fitGraph());
      on(root, '#network-tiles', 'change', (e) => {
        map?.setTilesVisible(e.target.checked);
        if (!e.target.checked) {
          const chip = q('#network-tile-status', root);
          if (chip) {
            chip.textContent = 'MODO LOCAL · MOSAICOS OCULTOS';
            chip.className = 'chip chip--amber';
          }
        }
      });
      qa('[data-road-class]', root).forEach((input) => {
        on(input, 'change', () => map?.setRoadClassVisible(input.dataset.roadClass, input.checked));
      });
    },
    enter() {
      ctx.host.clearWorld();
      if (!inicializado) {
        requestAnimationFrame(() => {
          crearMapa();
          setTimeout(() => map?.invalidate(), 80);
        });
      } else {
        map?.invalidate();
      }
    },
    leave() {},
    pause() {},
  };
}
