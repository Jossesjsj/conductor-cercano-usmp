/* ==========================================================================
   SUITE DE PRUEBAS REALES — JavaScript
   Se ejecuta igual en el navegador (escena 15) y en Node (`npm test`).
   No sustituye los casos de pytest del repositorio Python: valida esta
   implementación de demostración con aserciones ejecutables.
   ========================================================================== */

import { haversineKm, haversineSteps, createProjector, EARTH_RADIUS_KM } from '../algorithms/haversine.js';
import { MinHeap, MaxHeap, heapSort, PriorityQueue } from '../algorithms/heap.js';
import { Quadtree } from '../algorithms/quadtree.js';
import { dijkstra, bellmanFord, createGridGraph } from '../algorithms/dijkstra.js';
import { Despachador, buscarLineal, compararEstrategias } from '../algorithms/dispatcher.js';
import { SeededRandom } from '../core/seeded-random.js';
import { generarFlota, construirQuadtreeFlota, puntoEnArista } from '../core/fleet.js';

export const tests = [];
export const grupos = new Map();

export function definirPrueba(grupo, nombre, fn) {
  if (!grupos.has(grupo)) grupos.set(grupo, []);
  const item = { grupo, nombre, fn, orden: tests.length };
  tests.push(item);
  grupos.get(grupo).push(item);
  return item;
}

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

const fallar = (msg) => {
  throw new AssertionError(msg);
};
const ok = (cond, msg = 'Se esperaba una condición verdadera.') => {
  if (!cond) fallar(msg);
};
const igual = (a, b, msg) => {
  if (!Object.is(a, b)) fallar(msg || `Se esperaba ${JSON.stringify(b)} y se obtuvo ${JSON.stringify(a)}.`);
};
const casi = (a, b, eps = 1e-9, msg) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > eps) {
    fallar(msg || `Se esperaba ${b} ± ${eps} y se obtuvo ${a}.`);
  }
};
const lanza = (fn, msg) => {
  try {
    fn();
  } catch {
    return;
  }
  fallar(msg || 'Se esperaba una excepción.');
};

/* ------------------------- grafo sintético de prueba ---------------------- */

function crearGrafoDePrueba() {
  const base = createGridGraph(3, 3, 7);
  const projector = createProjector(-11.94, -77.045);
  const nodos = new Map();
  for (const [id, n] of base.nodes) {
    const lx = (n.x - 1) * 320;
    const ly = (n.y - 1) * 320;
    const geo = projector.toGeo(lx, ly);
    nodos.set(id, { ...n, lat: geo.lat, lon: geo.lon, geo, localX: lx, localY: ly });
  }
  const graph = {
    ...base,
    nodes: nodos,
    projector,
    meta: { center: { lat: -11.94, lon: -77.045 } },
    node(id) {
      return nodos.get(String(id));
    },
    nearestNode(lat, lon) {
      const p = projector.toLocal(lat, lon);
      let best = null;
      let bestD = Infinity;
      for (const n of nodos.values()) {
        const d = Math.hypot(n.localX - p.x, n.localY - p.y);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best ? { ...best, distance_m: bestD } : null;
    },
    pathGeo(path) {
      return path.map((id) => {
        const n = graph.node(id);
        return { lat: n.lat, lon: n.lon };
      });
    },
  };
  // El grafo de cuadrícula usa x,y en 0..2; el índice espacial del test debe
  // compartir ese plano, no el de la proyección geográfica.
  return { graph, projector };
}

function crearIndicePara(graph, puntos, limites = { x: -1, y: -1, w: 6, h: 6 }) {
  const qt = new Quadtree(limites, { capacidad: 3, profundidadMaxima: 6 });
  for (const p of puntos) qt.insertar(p);
  return qt;
}

/* --------------------------------- Haversine ------------------------------ */

definirPrueba('Haversine', 'Distancia cero al mismo punto', () => {
  casi(haversineKm(-11.94, -77.045, -11.94, -77.045), 0, 1e-12);
});

definirPrueba('Haversine', 'Un grado de latitud ≈ 111,19 km', () => {
  const d = haversineKm(0, 0, 1, 0);
  casi(d, (EARTH_RADIUS_KM * Math.PI) / 180, 1e-6);
});

definirPrueba('Haversine', 'Simetría de la distancia', () => {
  const a = haversineKm(-11.94, -77.045, -11.9, -77.01);
  const b = haversineKm(-11.9, -77.01, -11.94, -77.045);
  casi(a, b, 1e-12);
});

definirPrueba('Haversine', 'Desglose coincide con la función principal', () => {
  const s = haversineSteps(-11.94, -77.045, -11.91, -77.02);
  casi(s.km, haversineKm(-11.94, -77.045, -11.91, -77.02), 1e-12);
  casi(s.meters, s.km * 1000, 1e-9);
  ok(s.a >= 0 && s.a <= 1, 'El parámetro a debe quedar en [0,1].');
});

definirPrueba('Haversine', 'Proyección local ida y vuelta', () => {
  const p = createProjector(-11.94, -77.045);
  const local = p.toLocal(-11.931, -77.056);
  const geo = p.toGeo(local.x, local.y);
  casi(geo.lat, -11.931, 1e-12);
  casi(geo.lon, -77.056, 1e-12);
});

/* ----------------------------------- heap -------------------------------- */

definirPrueba('Heap', 'MinHeap extrae en orden ascendente', () => {
  const h = new MinHeap();
  [7, 2, 9, 1, 5, 3].forEach((v) => h.push(v));
  const out = [];
  while (!h.isEmpty) out.push(h.pop());
  igual(out.join(','), '1,2,3,5,7,9');
});

definirPrueba('Heap', 'MaxHeap mantiene el mayor en la raíz', () => {
  const h = new MaxHeap((a, b) => a.d - b.d);
  [{ d: 4 }, { d: 9 }, { d: 1 }, { d: 7 }].forEach((v) => h.push(v));
  igual(h.peek().d, 9);
  h.pop();
  igual(h.peek().d, 7);
});

definirPrueba('Heap', 'heapSort ordena sin mutar la entrada', () => {
  const original = [5, 1, 4, 2, 3];
  const out = heapSort(original);
  igual(out.join(','), '1,2,3,4,5');
  igual(original.join(','), '5,1,4,2,3');
});

definirPrueba('Heap', 'PriorityQueue respeta la clave', () => {
  const pq = new PriorityQueue((x) => x.dist);
  pq.push({ id: 'b', dist: 8 });
  pq.push({ id: 'a', dist: 2 });
  pq.push({ id: 'c', dist: 5 });
  igual(pq.pop().id, 'a');
  igual(pq.pop().id, 'c');
});

/* --------------------------------- Quadtree ------------------------------- */

definirPrueba('Quadtree', 'Consulta vacía devuelve cero candidatos', () => {
  const qt = crearIndicePara(crearGrafoDePrueba().graph, []);
  const r = qt.k_mas_cercanos(1, 1, 5);
  igual(r.puntos.length, 0);
  igual(qt.tamaño, 0);
  ok(qt.vacio, 'El índice debe reportarse vacío.');
});

definirPrueba('Quadtree', 'Rechaza puntos fuera de los límites', () => {
  const qt = crearIndicePara(crearGrafoDePrueba().graph, []);
  const r = qt.insertar({ id: 'X', x: 999, y: 0 });
  igual(r.ok, false);
  igual(r.motivo, 'fuera_de_limites');
  igual(qt.tamaño, 0);
});

definirPrueba('Quadtree', 'Insertar y contar conserva todos los puntos', () => {
  const pts = Array.from({ length: 60 }, (_, i) => ({ id: `P${i}`, x: (i * 37) % 100, y: (i * 53) % 100 }));
  const qt = crearIndicePara(crearGrafoDePrueba().graph, [], { x: 0, y: 0, w: 100, h: 100 });
  pts.forEach((p) => ok(qt.insertar(p).ok));
  igual(qt.tamaño, 60);
  igual(qt.todos().length, 60);
  ok(qt.estadisticas().nodos > 1, 'El árbol debe haberse subdividido.');
});

definirPrueba('Quadtree', 'Actualiza al insertar un id repetido', () => {
  const qt = crearIndicePara(crearGrafoDePrueba().graph, [{ id: 'A', x: 1, y: 1 }]);
  const r = qt.insertar({ id: 'A', x: 4, y: 4, disponible: false });
  igual(r.actualizado, true);
  igual(qt.tamaño, 1);
  igual(qt.todos()[0].x, 4);
});

definirPrueba('Quadtree', 'Eliminar quita el punto del índice', () => {
  const qt = crearIndicePara(crearGrafoDePrueba().graph, [{ id: 'A', x: 1, y: 1 }, { id: 'B', x: 2, y: 2 }]);
  igual(qt.eliminar('A'), true);
  igual(qt.eliminar('A'), false);
  igual(qt.tamaño, 1);
  igual(qt.todos()[0].id, 'B');
});

definirPrueba('Quadtree', 'Búsqueda por rectángulo devuelve solo el área', () => {
  const qt = crearIndicePara(crearGrafoDePrueba().graph, [], { x: 0, y: 0, w: 100, h: 100 });
  for (let i = 0; i < 40; i++) qt.insertar({ id: `R${i}`, x: i * 2, y: i * 2 });
  const r = qt.buscar_rectangulo({ x: 10, y: 10, w: 10, h: 10 });
  ok(r.puntos.length > 0, 'Debe encontrar puntos.');
  for (const p of r.puntos) {
    ok(p.x >= 10 && p.x <= 20 && p.y >= 10 && p.y <= 20, 'Punto fuera del rectángulo.');
  }
  ok(r.puntosExaminados > 0, 'Debe reportar puntos examinados.');
});

definirPrueba('Quadtree', 'Puntos coincidentes no rompen la subdivisión', () => {
  const qt = crearIndicePara(crearGrafoDePrueba().graph, [], { x: 0, y: 0, w: 100, h: 100 });
  for (let i = 0; i < 50; i++) qt.insertar({ id: `C${i}`, x: 50, y: 50 });
  igual(qt.tamaño, 50);
  const r = qt.k_mas_cercanos(50, 50, 10);
  igual(r.puntos.length, 10);
  ok(qt.estadisticas().profundidad <= 6, 'No debe superar la profundidad máxima.');
});

definirPrueba('Quadtree', 'kNN coincide con fuerza bruta (500 puntos)', () => {
  const rng = new SeededRandom(12345);
  const pts = Array.from({ length: 500 }, (_, i) => ({ id: `K${i}`, x: rng.float(0, 1000), y: rng.float(0, 1000) }));
  const qt = crearIndicePara(crearGrafoDePrueba().graph, [], { x: 0, y: 0, w: 1000, h: 1000 });
  pts.forEach((p) => qt.insertar(p));
  const qx = 412.3;
  const qy = 577.9;
  const esperado = pts
    .map((p) => ({ id: p.id, d: Math.hypot(p.x - qx, p.y - qy) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  const obtenido = qt.k_mas_cercanos(qx, qy, 8).puntos;
  igual(obtenido.length, 8);
  for (let i = 0; i < 8; i++) {
    igual(obtenido[i].id, esperado[i].id);
    casi(obtenido[i].distancia_plana_m, esperado[i].d, 1e-9);
  }
});

definirPrueba('Quadtree', 'El filtro de disponibilidad se aplica dentro del árbol', () => {
  const pts = Array.from({ length: 30 }, (_, i) => ({
    id: `F${i}`,
    x: i * 3,
    y: 50,
    disponible: i % 2 === 0,
  }));
  const qt = crearIndicePara(crearGrafoDePrueba().graph, pts, { x: 0, y: 0, w: 100, h: 100 });
  const r = qt.k_mas_cercanos(0, 50, 5, (p) => p.disponible);
  igual(r.puntos.length, 5);
  ok(r.puntos.every((p) => p.disponible), 'Solo deben aparecer disponibles.');
});

definirPrueba('Quadtree', 'kNN con k mayor que el total devuelve todo', () => {
  const pts = Array.from({ length: 7 }, (_, i) => ({ id: `N${i}`, x: i + 1, y: i + 1 }));
  const qt = crearIndicePara(crearGrafoDePrueba().graph, pts, { x: 0, y: 0, w: 100, h: 100 });
  igual(qt.k_mas_cercanos(0, 0, 50).puntos.length, 7);
});

definirPrueba('Quadtree', 'Actualizar posición mueve el punto de hoja', () => {
  const qt = crearIndicePara(crearGrafoDePrueba().graph, [{ id: 'M', x: 1, y: 1 }], { x: 0, y: 0, w: 100, h: 100 });
  ok(qt.actualizar_posicion('M', 90, 90).ok);
  const cerca = qt.k_mas_cercanos(90, 90, 1).puntos[0];
  igual(cerca.id, 'M');
  igual(qt.tamaño, 1);
});

/* --------------------------------- Dijkstra ------------------------------- */

definirPrueba('Dijkstra', 'Cuadrículas sintéticas coinciden con Bellman-Ford', () => {
  for (const [r, c, seed] of [[6, 6, 11], [8, 8, 22], [10, 10, 33], [8, 12, 44]]) {
    const g = createGridGraph(r, c, seed);
    const ids = [...g.nodes.keys()];
    const d = dijkstra(g, ids[0], ids[ids.length - 1]);
    const b = bellmanFord(g, ids[0], ids[ids.length - 1]);
    igual(d.found, true);
    casi(d.distancia_km, b.distancia_km, 1e-9);
  }
});

definirPrueba('Dijkstra', 'Distancia cero si origen = destino', () => {
  const g = createGridGraph(5, 5, 9);
  const id = [...g.nodes.keys()][12];
  const r = dijkstra(g, id, id);
  igual(r.found, true);
  casi(r.distancia_km, 0, 1e-12);
  igual(r.path.length, 1);
});

definirPrueba('Dijkstra', 'Nodo inexistente se informa sin lanzar', () => {
  const g = createGridGraph(5, 5, 9);
  const r = dijkstra(g, 'NO-EXISTE', [...g.nodes.keys()][0]);
  igual(r.found, false);
  igual(r.motivo, 'nodo_inexistente');
  igual(r.path.length, 0);
});

definirPrueba('Dijkstra', 'La ruta es continua y su peso suma la distancia', () => {
  const g = createGridGraph(9, 9, 55);
  const ids = [...g.nodes.keys()];
  const r = dijkstra(g, ids[0], ids[ids.length - 1]);
  ok(r.found, 'Debe existir ruta.');
  let suma = 0;
  for (let i = 0; i < r.path.length - 1; i++) {
    const vecinos = g.neighbors(r.path[i]);
    const arista = vecinos.find((v) => v.to === r.path[i + 1]);
    ok(arista, `El tramo ${r.path[i]} → ${r.path[i + 1]} no es una arista.`);
    suma += arista.km;
  }
  casi(suma, r.distancia_km, 1e-9);
});

definirPrueba('Dijkstra', 'Nodos aislados no son alcanzables', () => {
  const g = createGridGraph(4, 4, 3);
  const aislado = 'AISLADO';
  g.nodes.set(aislado, { id: aislado, x: 0, y: 0 });
  g.adj.set(aislado, []);
  const r = dijkstra(g, aislado, [...g.nodes.keys()][0]);
  igual(r.found, false);
  igual(r.motivo, 'sin_ruta');
});

definirPrueba('Dijkstra', 'La red real de Comas coincide con Bellman-Ford', ({ graph }) => {
  const ids = [...graph.nodes.keys()];
  for (const [a, b] of [
    [ids[0], ids[Math.floor(ids.length * 0.33)]],
    [ids[Math.floor(ids.length * 0.2)], ids[Math.floor(ids.length * 0.75)]],
  ]) {
    const d = dijkstra(graph, a, b);
    const ref = bellmanFord(graph, a, b);
    igual(d.found, ref.found);
    casi(d.distancia_km, ref.distancia_km, 1e-8);
  }
});

/* ----------------------------------- red ---------------------------------- */

definirPrueba('Red vial', 'Estadísticas del grafo de Comas', ({ graph }) => {
  igual(graph.nodes.size, 2574);
  igual(graph.edges.length, 3831);
  igual(graph.stats.components, 1);
  ok(graph.stats.totalKm > 300 && graph.stats.totalKm < 360, 'Longitud total fuera de rango.');
  ok(graph.meta.bbox, 'La metadata debe incluir el bbox.');
});

definirPrueba('Red vial', 'Todas las aristas son positivas y conectan nodos', ({ graph }) => {
  for (const e of graph.edges) {
    ok(e.w > 0, `Arista ${e.id} con peso no positivo.`);
    ok(graph.node(e.a) && graph.node(e.b), `Arista ${e.id} con extremo inexistente.`);
    ok(graph.neighbors(e.a).some((n) => n.edgeId === e.id), 'Falta adyacencia en a.');
    ok(graph.neighbors(e.b).some((n) => n.edgeId === e.id), 'Falta adyacencia en b.');
  }
});

definirPrueba('Red vial', 'El nodo más cercano cae dentro de la red', ({ graph }) => {
  const c = graph.meta.center;
  const n = graph.nearestNode(c.lat, c.lon);
  ok(n, 'Debe existir un nodo cercano.');
  ok(n.distance_m < 5000, 'El centro debería estar cerca de la red.');
});

/* ---------------------------------- flota --------------------------------- */

definirPrueba('Flota', 'Generación reproducible con la misma semilla', ({ graph }) => {
  const a = generarFlota(graph, { n: 40, seed: 99 });
  const b = generarFlota(graph, { n: 40, seed: 99 });
  igual(JSON.stringify(a), JSON.stringify(b));
  const c = generarFlota(graph, { n: 40, seed: 100 });
  ok(JSON.stringify(a) !== JSON.stringify(c), 'Semillas distintas deben diferir.');
});

definirPrueba('Flota', 'Los conductores quedan sobre aristas reales', ({ graph }) => {
  const flota = generarFlota(graph, { n: 60, seed: 7 });
  const distanciaASegmento = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  for (const c of flota) {
    const edge = graph.edge(c.edgeId);
    ok(edge, 'La arista asignada debe existir.');
    const p = graph.projector.toLocal(c.lat, c.lon);
    const coords = [graph.node(edge.a), ...edge.viaLocal.map(([x, y]) => ({ x, y })), graph.node(edge.b)];
    let mejor = Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
      mejor = Math.min(mejor, distanciaASegmento(p.x, p.y, coords[i].x, coords[i].y, coords[i + 1].x, coords[i + 1].y));
    }
    ok(mejor < 1, `Conductor ${c.id} a ${mejor.toFixed(2)} m de su arista.`);
  }
});

definirPrueba('Flota', 'El Quadtree de flota recupera los mismos ids', ({ graph }) => {
  const flota = generarFlota(graph, { n: 120, seed: 31 });
  const { quadtree } = construirQuadtreeFlota(graph, flota);
  igual(quadtree.tamaño, 120);
  const ids = new Set(quadtree.todos().map((p) => p.id));
  ok(flota.every((c) => ids.has(c.id)), 'Faltan conductores en el índice.');
});

definirPrueba('Flota', 'Interpolación en arista respeta los extremos', ({ graph }) => {
  const e = graph.edges[0];
  const a = puntoEnArista(graph, e, 0);
  const b = puntoEnArista(graph, e, 1);
  casi(a.lat, graph.node(e.a).lat, 1e-12);
  casi(a.lon, graph.node(e.a).lon, 1e-12);
  casi(b.lat, graph.node(e.b).lat, 1e-12);
  casi(b.lon, graph.node(e.b).lon, 1e-12);
});

/* -------------------------------- despachador ----------------------------- */

let ctxGrafoPrueba = null;
function contextoGrafoPrueba() {
  if (!ctxGrafoPrueba) ctxGrafoPrueba = crearGrafoDePrueba();
  return ctxGrafoPrueba;
}

definirPrueba('Despachador', 'Asigna el conductor con menor ETA por calles', () => {
  const { graph, projector } = contextoGrafoPrueba();
  const conductores = [
    { id: 'C-1', lat: projector.toGeo(0, 0).lat, lon: projector.toGeo(0, 0).lon, disponible: true },
    { id: 'C-2', lat: projector.toGeo(640, 0).lat, lon: projector.toGeo(640, 0).lon, disponible: true },
    { id: 'C-3', lat: projector.toGeo(320, 640).lat, lon: projector.toGeo(320, 640).lon, disponible: true },
  ];
  const { quadtree } = crearIndiceConProyeccion(graph, conductores);
  const pasajero = projector.toGeo(320, 0);
  const d = new Despachador(graph, { k: 5, velocidadKmh: 30 });
  const r = d.asignar({ pasajero, quadtree, conductores });
  igual(r.ok, true);
  igual(r.ganador.id, 'C-2');
  ok(r.ganador.etaMin < 2, 'El ETA debe ser pequeño en la cuadrícula.');
  ok(r.fases.length >= 5, 'Debe registrar las fases del pipeline.');
  ok(r.candidatos.every((c) => c.reachable), 'Todos los candidatos de la cuadrícula son alcanzables.');
});

definirPrueba('Despachador', 'Sin conductores disponibles devuelve motivo', () => {
  const { graph, projector } = contextoGrafoPrueba();
  const conductores = [
    { id: 'C-1', lat: projector.toGeo(0, 0).lat, lon: projector.toGeo(0, 0).lon, disponible: false },
  ];
  const { quadtree } = crearIndiceConProyeccion(graph, conductores);
  const d = new Despachador(graph);
  const r = d.asignar({ pasajero: projector.toGeo(320, 320), quadtree, conductores });
  igual(r.ok, false);
  igual(r.motivo, 'sin_conductores_disponibles');
  igual(r.ganador, null);
});

definirPrueba('Despachador', 'Pasajero lejos de la red se rechaza con snap máximo', () => {
  const { graph, projector } = contextoGrafoPrueba();
  const conductores = [{ id: 'C-1', lat: projector.toGeo(0, 0).lat, lon: projector.toGeo(0, 0).lon, disponible: true }];
  const { quadtree } = crearIndiceConProyeccion(graph, conductores);
  const pasajero = { lat: -11.8, lon: -77.2 };
  const d = new Despachador(graph, { maxSnapM: 50 });
  const r = d.asignar({ pasajero, quadtree, conductores });
  igual(r.ok, false);
  igual(r.motivo, 'pasajero_sin_conexion_vial');
});

definirPrueba('Despachador', 'Conductor en el mismo nodo tiene ETA cero', () => {
  const { graph, projector } = contextoGrafoPrueba();
  const geo = projector.toGeo(320, 320);
  const conductores = [{ id: 'C-0', lat: geo.lat, lon: geo.lon, disponible: true }];
  const { quadtree } = crearIndiceConProyeccion(graph, conductores);
  const d = new Despachador(graph);
  const r = d.asignar({ pasajero: geo, quadtree, conductores });
  igual(r.ok, true);
  igual(r.ganador.roadKm, 0);
  igual(r.ganador.etaMin, 0);
});

definirPrueba('Despachador', 'Comparación lineal y espacial comparten el top-1', ({ graph }) => {
  const flota = generarFlota(graph, { n: 200, seed: 2026 });
  const { quadtree } = construirQuadtreeFlota(graph, flota);
  const pasajero = { lat: graph.meta.center.lat, lon: graph.meta.center.lon };
  const r = compararEstrategias(flota, pasajero, quadtree, 5, graph.projector);
  igual(r.lineal.puntos.length, 5);
  igual(r.espacial.puntos.length, 5);
  igual(r.lineal.puntos[0].id, r.espacial.puntos[0].id);
  ok(r.espacial.examinados < r.lineal.examinados, 'El Quadtree debe examinar menos puntos.');
});

definirPrueba('Despachador', 'Búsqueda lineal usa heap y devuelve K ordenados', () => {
  const pasajero = { lat: 0, lon: 0 };
  const conductores = Array.from({ length: 30 }, (_, i) => ({
    id: `L${i}`,
    lat: i * 0.001,
    lon: 0,
    disponible: i % 3 !== 0,
  }));
  const r = buscarLineal(conductores, pasajero, 6);
  igual(r.puntos.length, 6);
  for (let i = 1; i < r.puntos.length; i++) {
    ok(r.puntos[i - 1].distancia <= r.puntos[i].distancia, 'Los candidatos deben estar ordenados.');
  }
  ok(r.puntos.every((p) => p.disponible), 'No deben incluirse ocupados.');
});

function crearIndiceConProyeccion(graph, puntos) {
  const b = graph.projector.toLocal(-11.9, -77.0);
  const a = graph.projector.toLocal(-11.98, -77.09);
  const limites = { x: a.x, y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  const qt = new Quadtree(limites, { capacidad: 3, profundidadMaxima: 6 });
  qt.setProyeccion((x, y) => {
    const g = graph.projector.toGeo(x, y);
    return [g.lat, g.lon];
  });
  for (const p of puntos) {
    const l = graph.projector.toLocal(p.lat, p.lon);
    qt.insertar({ ...p, x: l.x, y: l.y });
  }
  return { quadtree: qt, limites };
}

/* ------------------------------- reproducibilidad ------------------------- */

definirPrueba('Reproducibilidad', 'SeededRandom repite la secuencia', () => {
  const a = new SeededRandom(20261105);
  const b = new SeededRandom(20261105);
  const v1 = Array.from({ length: 12 }, () => a.next());
  const v2 = Array.from({ length: 12 }, () => b.next());
  igual(v1.join(','), v2.join(','));
});

definirPrueba('Reproducibilidad', 'reset vuelve al inicio de la secuencia', () => {
  const r = new SeededRandom(5);
  const a = [r.next(), r.next()];
  r.reset();
  const b = [r.next(), r.next()];
  igual(a.join(','), b.join(','));
});

/* -------------------------------- ejecución ------------------------------- */

export async function ejecutarSuite(contexto = {}, { onProgress = null } = {}) {
  const resultados = [];
  const t0 = performance.now();
  for (const test of tests) {
    const inicio = performance.now();
    let okTest = true;
    let error = null;
    try {
      await test.fn(contexto);
    } catch (e) {
      okTest = false;
      error = e instanceof AssertionError ? e.message : `${e.name}: ${e.message}`;
    }
    const ms = performance.now() - inicio;
    resultados.push({
      grupo: test.grupo,
      nombre: test.nombre,
      ok: okTest,
      error,
      ms,
    });
    if (onProgress) {
      onProgress({ ...resultados[resultados.length - 1], indice: resultados.length, total: tests.length });
      // Cede el hilo para que la interfaz pinte el avance en el navegador.
      if (typeof document !== 'undefined') {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  const totalMs = performance.now() - t0;
  const pasadas = resultados.filter((r) => r.ok).length;
  return {
    resultados,
    total: resultados.length,
    pasadas,
    fallidas: resultados.length - pasadas,
    totalMs,
    grupos: [...grupos.keys()].map((g) => ({
      nombre: g,
      total: resultados.filter((r) => r.grupo === g).length,
      pasadas: resultados.filter((r) => r.grupo === g && r.ok).length,
    })),
    entorno: typeof navigator !== 'undefined' ? navigator.userAgent : `Node ${globalThis.process?.version || ''}`.trim(),
  };
}
