/* ==========================================================================
   Grafo de la red vial real de Comas.
   Nodos = intersecciones / extremos. Aristas = calles con peso en km.
   ========================================================================== */

import { createProjector, haversineKm, planarDistance } from '../algorithms/haversine.js';

export class RoadGraph {
  constructor(network) {
    this.meta = network.meta;
    this.projector = createProjector(network.meta.center.lat, network.meta.center.lon);
    this.nodes = new Map();
    this.edges = [];
    this.edgesById = new Map();
    this.adj = new Map();

    for (const n of network.nodes) {
      const { x, y } = this.projector.toLocal(n.lat, n.lon);
      this.nodes.set(n.id, { ...n, x, y });
      this.adj.set(n.id, []);
    }

    for (const e of network.edges) {
      const a = this.nodes.get(e.a);
      const b = this.nodes.get(e.b);
      if (!a || !b) continue;
      const viaLocal = e.via.map(([lat, lon]) => {
        const p = this.projector.toLocal(lat, lon);
        return [p.x, p.y];
      });
      const edge = { ...e, viaLocal };
      this.edges.push(edge);
      this.edgesById.set(e.id, edge);
      this.adj.get(e.a).push({ to: e.b, km: e.w, edgeId: e.id, cls: e.cls, name: e.name });
      this.adj.get(e.b).push({ to: e.a, km: e.w, edgeId: e.id, cls: e.cls, name: e.name });
    }

    this._bounds = this._computeBounds();
    this._nearestCache = new Map();
    this.stats = this._computeStats();
  }

  _computeBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of this.nodes.values()) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  _computeStats() {
    const classes = {};
    let totalKm = 0;
    for (const e of this.edges) {
      classes[e.cls] = (classes[e.cls] || 0) + 1;
      totalKm += e.w;
    }
    return {
      nodes: this.nodes.size,
      edges: this.edges.length,
      components: this.countComponents(),
      degrees: [...this.nodes.values()].reduce((acc, n) => {
        const d = this.adj.get(n.id).length;
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {}),
      classes,
      totalKm,
      areaKm2: this.meta.area_km2,
    };
  }

  countComponents() {
    const seen = new Set();
    let components = 0;
    for (const id of this.nodes.keys()) {
      if (seen.has(id)) continue;
      components++;
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const u = stack.pop();
        for (const e of this.adj.get(u)) {
          if (!seen.has(e.to)) {
            seen.add(e.to);
            stack.push(e.to);
          }
        }
      }
    }
    return components;
  }

  get bounds() {
    return this._bounds;
  }

  get center() {
    return { x: (this._bounds.minX + this._bounds.maxX) / 2, y: (this._bounds.minY + this._bounds.maxY) / 2 };
  }

  nearestNode(lat, lon) {
    const { x, y } = this.projector.toLocal(lat, lon);
    return this.nearestNodeToPoint(x, y);
  }

  nearestNodeToPoint(x, y) {
    let best = null;
    let bestD2 = Infinity;
    for (const n of this.nodes.values()) {
      const dx = n.x - x;
      const dy = n.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = n;
      }
    }
    return best ? { ...best, distance_m: Math.sqrt(bestD2) } : null;
  }

  node(id) {
    return this.nodes.get(String(id));
  }

  edge(id) {
    return this.edgesById.get(id);
  }

  neighbors(id) {
    return this.adj.get(String(id)) || [];
  }

  /** Coordenadas locales de una arista, orientadas desde `fromNode`. */
  edgeCoords(edge, fromNode) {
    if (String(edge.a) === String(fromNode)) return edge.viaLocal;
    return [...edge.viaLocal].reverse();
  }

  /** Une las geometrías de una ruta para dibujarla. */
  pathCoords(path, edgeIds) {
    if (!path || path.length < 2) return [];
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.edgesById.get(edgeIds[i]);
      if (!edge) continue;
      const coords = this.edgeCoords(edge, path[i]);
      for (const c of coords) {
        if (!out.length || out[out.length - 1][0] !== c[0] || out[out.length - 1][1] !== c[1]) {
          out.push(c);
        }
      }
    }
    return out;
  }

  /** Ruta geográfica (lat, lon) para Leaflet. */
  pathGeo(path, edgeIds) {
    return this.pathCoords(path, edgeIds).map(([x, y]) => this.projector.toGeo(x, y));
  }

  pathLength(path, edgeIds) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += this.edgesById.get(edgeIds[i])?.w || 0;
    }
    return total;
  }

  /** Subgrafo conexo alrededor de un nodo, por BFS y límite de nodos. */
  subgraphAround(centerId, maxNodes = 320) {
    const start = this.node(centerId) ? String(centerId) : this.nodes.keys().next().value;
    const selected = new Set([start]);
    const queue = [start];
    while (queue.length && selected.size < maxNodes) {
      const u = queue.shift();
      const neigh = [...this.neighbors(u)].sort((a, b) => a.km - b.km);
      for (const e of neigh) {
        if (!selected.has(e.to)) {
          selected.add(e.to);
          queue.push(e.to);
          if (selected.size >= maxNodes) break;
        }
      }
    }
    const edges = this.edges.filter((e) => selected.has(e.a) && selected.has(e.b));
    return { nodeIds: selected, edges, stats: { nodes: selected.size, edges: edges.length } };
  }

  haversineBetween(aId, bId) {
    const a = this.node(aId);
    const b = this.node(bId);
    if (!a || !b) return 0;
    return haversineKm(a.lat, a.lon, b.lat, b.lon);
  }

  planarBetween(aId, bId) {
    const a = this.node(aId);
    const b = this.node(bId);
    if (!a || !b) return 0;
    return planarDistance(a.x, a.y, b.x, b.y);
  }
}

export function buildGraph(network) {
  return new RoadGraph(network);
}
