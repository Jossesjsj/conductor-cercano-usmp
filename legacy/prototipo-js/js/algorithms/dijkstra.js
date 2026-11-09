/* ==========================================================================
   DIJKSTRA PROPIO — sin librerías de rutas.
   Grafo no dirigido con pesos no negativos (kilómetros).
   Cola de prioridad binaria implementada por el equipo (heap.js).
   ========================================================================== */

import { BinaryHeap } from './heap.js';

const EPS = 1e-12;

export function dijkstra(graph, startId, endId, { recordSteps = false, maxSettled = Infinity } = {}) {
  const start = String(startId);
  const end = String(endId);
  const t0 = performance.now();
  if (!graph.node(start) || !graph.node(end)) {
    return {
      found: false,
      motivo: 'nodo_inexistente',
      distancia_km: Infinity,
      path: [],
      edgeIds: [],
      steps: [],
      operaciones: { settles: 0, relax: 0, pushes: 0 },
      tiempo_ms: performance.now() - t0,
    };
  }

  const dist = new Map();
  const prev = new Map();
  const prevEdge = new Map();
  const settled = new Set();
  const pq = new BinaryHeap((a, b) => a.dist - b.dist);
  const steps = [];
  let relaxCount = 0;
  let settles = 0;

  const snapshot = () => {
    if (!recordSteps) return [];
    const valid = [];
    for (const item of pq.items) {
      if (dist.get(item.node) === item.dist && !settled.has(item.node)) valid.push(item);
      if (valid.length > 64) break;
    }
    return valid
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 7)
      .map((x) => ({ node: x.node, dist: x.dist }));
  };

  dist.set(start, 0);
  pq.push({ node: start, dist: 0 });
  if (recordSteps) {
    steps.push({ type: 'start', node: start, dist: 0, top: [{ node: start, dist: 0 }], settles: 0, relax: 0 });
  }

  let found = false;
  while (!pq.isEmpty) {
    const actual = pq.pop();
    if (settled.has(actual.node)) continue;
    if (actual.dist > (dist.get(actual.node) ?? Infinity) + EPS) continue;
    settled.add(actual.node);
    settles++;

    if (recordSteps) {
      steps.push({
        type: 'settle',
        node: actual.node,
        dist: actual.dist,
        top: snapshot(),
        settles,
        relax: relaxCount,
      });
    }

    if (actual.node === end) {
      found = true;
      break;
    }
    if (settles >= maxSettled) break;

    for (const edge of graph.neighbors(actual.node)) {
      if (settled.has(edge.to)) continue;
      relaxCount++;
      const candidate = actual.dist + edge.km;
      const known = dist.get(edge.to) ?? Infinity;
      if (candidate + EPS < known) {
        dist.set(edge.to, candidate);
        prev.set(edge.to, actual.node);
        prevEdge.set(edge.to, edge.edgeId);
        pq.push({ node: edge.to, dist: candidate });
        if (recordSteps) {
          steps.push({
            type: 'relax',
            from: actual.node,
            to: edge.to,
            anterior: known === Infinity ? null : known,
            nueva: candidate,
            edgeId: edge.edgeId,
            top: snapshot(),
            settles,
            relax: relaxCount,
          });
        }
      }
    }
  }

  const path = [];
  const edgeIds = [];
  if (found) {
    let cur = end;
    let guard = 0;
    while (cur !== undefined && guard < 100000) {
      path.push(cur);
      if (cur === start) break;
      edgeIds.push(prevEdge.get(cur));
      cur = prev.get(cur);
      guard++;
    }
    path.reverse();
    edgeIds.reverse();
  }

  if (recordSteps) {
    steps.push({
      type: 'finish',
      found,
      node: end,
      distancia: found ? dist.get(end) : Infinity,
      settles,
      relax: relaxCount,
      path,
      edgeIds,
    });
  }

  return {
    found,
    motivo: found ? null : 'sin_ruta',
    distancia_km: found ? dist.get(end) : Infinity,
    path,
    edgeIds,
    steps,
    operaciones: { settles, relax: relaxCount, pushes: pq.pushes },
    tiempo_ms: performance.now() - t0,
  };
}

/**
 * Bellman-Ford propio, usado únicamente como referencia independiente
 * para validar Dijkstra en las pruebas del navegador.
 * No forma parte del camino crítico del despachador.
 */
export function bellmanFord(graph, startId, endId) {
  const start = String(startId);
  const end = String(endId);
  if (!graph.node(start) || !graph.node(end)) return { found: false, distancia_km: Infinity };
  const dist = new Map();
  for (const id of graph.nodes.keys()) dist.set(id, Infinity);
  dist.set(start, 0);

  const edgeList = [];
  for (const e of graph.edges) {
    edgeList.push([String(e.a), String(e.b), e.w]);
    edgeList.push([String(e.b), String(e.a), e.w]);
  }

  const n = graph.nodes.size;
  for (let i = 0; i < n - 1; i++) {
    let changed = false;
    for (const [u, v, w] of edgeList) {
      if (dist.get(u) + w + EPS < dist.get(v)) {
        dist.set(v, dist.get(u) + w);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const d = dist.get(end);
  return { found: Number.isFinite(d), distancia_km: d };
}

/** Valida la distancia de Dijkstra contra Bellman-Ford sobre un grafo dado. */
export function validarConBellmanFord(graph, startId, endId) {
  const d = dijkstra(graph, startId, endId);
  const b = bellmanFord(graph, startId, endId);
  const iguales =
    (d.found === b.found) &&
    (!d.found || Math.abs(d.distancia_km - b.distancia_km) < 1e-9);
  return {
    start: String(startId),
    end: String(endId),
    dijkstra_km: d.distancia_km,
    referencia_km: b.distancia_km,
    iguales,
    diff: Number.isFinite(d.distancia_km) && Number.isFinite(b.distancia_km)
      ? Math.abs(d.distancia_km - b.distancia_km)
      : null,
  };
}

/**
 * Grafo de cuadrícula ponderado y reproducible para validar Dijkstra.
 * No representa la red de Comas: es un banco de pruebas algorítmico.
 */
export function createGridGraph(rows = 8, cols = 8, seed = 42) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const nodes = new Map();
  const edges = [];
  const adj = new Map();
  let edgeId = 0;
  const id = (r, c) => `G-${r}-${c}`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const nid = id(r, c);
      nodes.set(nid, { id: nid, x: c, y: r, lat: 0, lon: 0 });
      adj.set(nid, []);
    }
  }
  const connect = (a, b) => {
    const w = 1 + rnd() * 9;
    edges.push({ id: edgeId, a, b, w });
    adj.get(a).push({ to: b, km: w, edgeId });
    adj.get(b).push({ to: a, km: w, edgeId });
    edgeId++;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) connect(id(r, c), id(r, c + 1));
      if (r + 1 < rows) connect(id(r, c), id(r + 1, c));
    }
  }
  return {
    nodes,
    edges,
    adj,
    stats: { nodes: nodes.size, edges: edges.length },
    node: (x) => nodes.get(String(x)),
    neighbors: (x) => adj.get(String(x)) || [],
    edge: (x) => edges.find((e) => e.id === x),
  };
}
