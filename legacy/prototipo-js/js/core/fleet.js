/* ==========================================================================
   Flota sintética reproducible, ubicada sobre la red vial real de Comas.
   Los conductores se generan sobre aristas existentes: no se inventan
   posiciones fuera de las calles. La semilla hace la demostración repetible.
   ========================================================================== */

import { Quadtree, nextId } from '../algorithms/quadtree.js';
import { SeededRandom } from './seeded-random.js';

/** Interpola una posición (lat, lon) a lo largo de la geometría de una arista. */
export function puntoEnArista(graph, edge, t) {
  const coords = [graph.node(edge.a), ...edge.viaLocal.map(([x, y]) => graph.projector.toGeo(x, y)), graph.node(edge.b)];
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped <= 0) return { lat: coords[0].lat, lon: coords[0].lon };
  if (clamped >= 1) return { lat: coords[coords.length - 1].lat, lon: coords[coords.length - 1].lon };
  // Reparto por longitud de cada tramo para que el punto quede sobre la calle.
  const tramos = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = Math.hypot(
      (b.lon - a.lon) * graph.projector.metersPerDegLon,
      (b.lat - a.lat) * graph.projector.metersPerDegLat,
    );
    tramos.push({ a, b, d });
    total += d;
  }
  let objetivo = clamped * total;
  for (const tramo of tramos) {
    if (objetivo <= tramo.d || tramo === tramos[tramos.length - 1]) {
      const f = tramo.d > 0 ? Math.min(1, objetivo / tramo.d) : 0;
      return {
        lat: tramo.a.lat + (tramo.b.lat - tramo.a.lat) * f,
        lon: tramo.a.lon + (tramo.b.lon - tramo.a.lon) * f,
      };
    }
    objetivo -= tramo.d;
  }
  return { lat: coords[0].lat, lon: coords[0].lon };
}

/**
 * Genera una flota sobre las vías.
 * @param {import('./graph.js').RoadGraph} graph
 */
export function generarFlota(graph, { n = 300, seed = 20261105, disponibles = 1 } = {}) {
  const rng = new SeededRandom(seed);
  const conductores = [];
  const totalPeso = graph.edges.reduce((s, e) => s + e.w, 0);
  for (let i = 0; i < n; i++) {
    // Muestreo ponderado por longitud: más conductores en calles más largas.
    let objetivo = rng.float(0, totalPeso);
    let edge = graph.edges[0];
    for (const e of graph.edges) {
      objetivo -= e.w;
      if (objetivo <= 0) {
        edge = e;
        break;
      }
    }
    const t = rng.float(0.05, 0.95);
    const geo = puntoEnArista(graph, edge, t);
    const local = graph.projector.toLocal(geo.lat, geo.lon);
    const disponible = rng.next() < disponibles;
    conductores.push({
      id: `C-${String(i + 1).padStart(4, '0')}`,
      lat: geo.lat,
      lon: geo.lon,
      x: local.x,
      y: local.y,
      edgeId: edge.id,
      t,
      disponible,
      ocupado: !disponible,
      viajes: 0,
      creado: i,
    });
  }
  return conductores;
}

/** Construye el índice espacial de una flota sobre los límites de la red. */
export function construirQuadtreeFlota(graph, conductores, { margen = 250, capacidad = 6, profundidadMaxima = 9 } = {}) {
  const b = graph.bounds;
  const limites = {
    x: b.minX - margen,
    y: b.minY - margen,
    w: b.width + margen * 2,
    h: b.height + margen * 2,
  };
  const quadtree = new Quadtree(limites, { capacidad, profundidadMaxima });
  quadtree.setProyeccion((x, y) => {
    const g = graph.projector.toGeo(x, y);
    return [g.lat, g.lon];
  });
  for (const c of conductores) {
    // Recalcula x/y locales para garantizar que el índice y el grafo usen el
    // mismo sistema de coordenadas, sin importar el origen del conductor.
    const p = graph.projector.toLocal(c.lat, c.lon);
    c.x = p.x;
    c.y = p.y;
    quadtree.insertar(c);
  }
  return { quadtree, limites };
}

/** Actualiza posiciones del índice tras mover la flota. */
export function sincronizarQuadtree(graph, quadtree, conductores) {
  for (const c of conductores) {
    const p = graph.projector.toLocal(c.lat, c.lon);
    if (Math.abs((c.x ?? 0) - p.x) > 0.01 || Math.abs((c.y ?? 0) - p.y) > 0.01) {
      c.x = p.x;
      c.y = p.y;
      quadtree.actualizar_posicion(c.id, p.x, p.y, { disponible: c.disponible });
    } else {
      quadtree.actualizar_estado(c.id, { disponible: c.disponible });
    }
  }
}

export { nextId };
