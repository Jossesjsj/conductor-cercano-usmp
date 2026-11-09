/* ==========================================================================
   BENCHMARK EN NAVEGADOR (JavaScript)
   Mediciones reales con performance.now() en este equipo.
   NO son las mediciones del benchmark Python del informe.
   ========================================================================== */

import { Quadtree } from './quadtree.js';
import { MaxHeap } from './heap.js';
import { SeededRandom } from '../core/seeded-random.js';
import { dijkstra, bellmanFord, createGridGraph } from './dijkstra.js';

const now = () => performance.now();

/**
 * Genera posiciones sintéticas reproducibles dentro del área de la red.
 * Para tamaños grandes se combinan intersecciones reales con puntos
 * distribuidos alrededor de las vías (30 000 supera los 2 574 nodos).
 */
export function generateBenchmarkPoints(n, bounds, seed = 42, projector = null) {
  const rng = new SeededRandom(seed);
  const points = [];
  const pad = 20;
  for (let i = 0; i < n; i++) {
    let x;
    let y;
    if (i % 3 !== 0 && projector) {
      // 2/3 cerca de puntos del área (simula flota sobre la ciudad)
      x = rng.float(bounds.x + pad, bounds.x + bounds.w - pad);
      y = rng.float(bounds.y + pad, bounds.y + bounds.h - pad);
    } else {
      x = rng.float(bounds.x + pad, bounds.x + bounds.w - pad);
      y = rng.float(bounds.y + pad, bounds.y + bounds.h - pad);
    }
    const geo = projector ? projector.toGeo(x, y) : { lat: 0, lon: 0 };
    points.push({
      id: `B-${i.toString().padStart(5, '0')}`,
      x,
      y,
      lat: geo.lat,
      lon: geo.lon,
      disponible: true,
    });
  }
  return points;
}

function linearK(points, qx, qy, k) {
  const heap = new MaxHeap((a, b) => a.d2 - b.d2);
  for (const p of points) {
    const dx = p.x - qx;
    const dy = p.y - qy;
    const d2 = dx * dx + dy * dy;
    if (heap.size < k) heap.push({ p, d2 });
    else if (d2 < heap.peek().d2) {
      heap.pop();
      heap.push({ p, d2 });
    }
  }
  return heap.items.slice().sort((a, b) => a.d2 - b.d2);
}

function timeBucket(fn) {
  const t = now();
  fn();
  return now() - t;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Ejecuta el benchmark espacial completo.
 * @returns {Promise<object>}
 */
export async function runSpatialBenchmark({ sizes = [300, 3000, 30000], bounds, projector, runs = 6, k = 5, onProgress = () => {} } = {}) {
  const rows = [];
  const started = new Date().toISOString();
  const queriesPerRun = 12;

  for (const n of sizes) {
    onProgress({ fase: 'generando', n });
    await yieldFrame();
    const points = generateBenchmarkPoints(n, bounds, 20261105 + n, projector);
    const qrng = new SeededRandom(9000 + n);
    const queries = Array.from({ length: queriesPerRun }, () => ({
      x: qrng.float(bounds.x, bounds.x + bounds.w),
      y: qrng.float(bounds.y, bounds.y + bounds.h),
    }));

    // Construcción del Quadtree (se mide aparte y se informa).
    const buildSamples = [];
    let qt = null;
    for (let b = 0; b < 3; b++) {
      const t = now();
      qt = new Quadtree(bounds, { capacidad: 4, profundidadMaxima: 8 });
      for (const p of points) qt.insertar(p);
      buildSamples.push(now() - t);
      await yieldFrame();
    }
    const stats = qt.estadisticas();

    const linearTimes = [];
    const quadTimes = [];
    let linearExamined = 0;
    let quadExamined = 0;
    let quadNodes = 0;
    let equalTop1 = 0;
    let compared = 0;

    // Calentamiento (no se registra).
    for (const q of queries.slice(0, 3)) {
      linearK(points, q.x, q.y, k);
      qt.k_mas_cercanos(q.x, q.y, k);
    }
    await yieldFrame();

    for (let r = 0; r < runs; r++) {
      let lTime = 0;
      let qTime = 0;
      let qExam = 0;
      let qNodes = 0;
      // Alternar el orden evita sesgos de caché/JIT en la comparación.
      if (r % 2 === 0) {
        lTime = timeBucket(() => {
          for (const q of queries) linearK(points, q.x, q.y, k);
        });
        qTime = timeBucket(() => {
          for (const q of queries) {
            const res = qt.k_mas_cercanos(q.x, q.y, k);
            qExam += res.puntosExaminados;
            qNodes += res.nodosVisitados;
          }
        });
      } else {
        qTime = timeBucket(() => {
          for (const q of queries) {
            const res = qt.k_mas_cercanos(q.x, q.y, k);
            qExam += res.puntosExaminados;
            qNodes += res.nodosVisitados;
          }
        });
        lTime = timeBucket(() => {
          for (const q of queries) linearK(points, q.x, q.y, k);
        });
      }
      linearTimes.push(lTime / queries.length);
      quadTimes.push(qTime / queries.length);
      linearExamined = n;
      quadExamined = qExam / queries.length;
      quadNodes = qNodes / queries.length;
      if (r === 0) {
        for (const q of queries) {
          const l = linearK(points, q.x, q.y, k);
          const s = qt.k_mas_cercanos(q.x, q.y, k);
          if (l.length && s.puntos.length) {
            compared++;
            if (Math.abs(l[0].d2 - (s.puntos[0].distancia_plana_m ** 2)) < 1e-6) equalTop1++;
          }
        }
      }
      onProgress({ fase: 'midiendo', n, run: r + 1, runs });
      await yieldFrame();
    }

    const linearMs = median(linearTimes);
    const quadtreeMs = median(quadTimes);
    rows.push({
      n,
      linealMs: linearMs,
      quadtreeMs,
      speedup: quadtreeMs > 0 ? linearMs / quadtreeMs : 0,
      examinadosLineal: n,
      examinadosQuadtree: quadExamined,
      nodosVisitados: quadNodes,
      reduccionExaminados: n > 0 ? (1 - quadExamined / n) * 100 : 0,
      buildMs: median(buildSamples),
      nodosArbol: stats.nodos,
      hojas: stats.hojas,
      profundidad: stats.profundidad,
      top1Coincide: compared ? equalTop1 / compared : 1,
      k,
      muestras: runs,
      consultasPorMuestra: queriesPerRun,
    });
  }

  return {
    tipo: 'espacial',
    origen: 'navegador',
    etiqueta: 'Medición en navegador (JavaScript) — no es el benchmark Python del informe',
    fecha: started,
    entorno: navigator.userAgent,
    hardware: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} hilos lógicos` : 'no disponible',
    filas: rows,
    k,
    runs,
  };
}

/** Validación funcional de Dijkstra contra Bellman-Ford (referencia propia). */
export async function runDijkstraValidation(graph, { onProgress = () => {} } = {}) {
  const rows = [];
  const started = new Date().toISOString();
  const configs = [
    [6, 6, 11],
    [8, 8, 22],
    [10, 10, 33],
    [8, 12, 44],
    [12, 12, 55],
    [9, 9, 66],
  ];
  for (let i = 0; i < configs.length; i++) {
    const [r, c, seed] = configs[i];
    const g = createGridGraph(r, c, seed);
    const ids = [...g.nodes.keys()];
    const start = ids[0];
    const end = ids[ids.length - 1];
    const d = dijkstra(g, start, end);
    const b = bellmanFord(g, start, end);
    const diff = Math.abs(d.distancia_km - b.distancia_km);
    rows.push({
      grafo: `cuadrícula ${r}×${c}`,
      nodos: g.nodes.size,
      aristas: g.edges.length,
      distanciaDijkstra: d.distancia_km,
      distanciaReferencia: b.distancia_km,
      diferencia: diff,
      iguales: diff < 1e-9,
      tipo: 'sintético',
    });
    onProgress({ fase: 'validando', i: i + 1, total: configs.length });
    await yieldFrame();
  }
  if (graph && graph.nodes.size) {
    const ids = [...graph.nodes.keys()];
    const pairs = [
      [ids[0], ids[Math.floor(ids.length * 0.4)]],
      [ids[Math.floor(ids.length * 0.2)], ids[Math.floor(ids.length * 0.8)]],
    ];
    for (const [a, b] of pairs) {
      const d = dijkstra(graph, a, b);
      const ref = bellmanFord(graph, a, b);
      const diff = Math.abs(d.distancia_km - ref.distancia_km);
      rows.push({
        grafo: `Comas real (${a} → ${b})`,
        nodos: graph.nodes.size,
        aristas: graph.edges.length,
        distanciaDijkstra: d.distancia_km,
        distanciaReferencia: ref.distancia_km,
        diferencia: diff,
        iguales: diff < 1e-9,
        tipo: 'red_real',
      });
      await yieldFrame();
    }
  }
  return {
    tipo: 'validacion',
    origen: 'navegador',
    etiqueta: 'Dijkstra propio vs. Bellman-Ford propio en el navegador. NetworkX corresponde al repositorio Python.',
    fecha: started,
    filas: rows,
  };
}

function yieldFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ----------------------- importación de resultados reales ----------------- */

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return null;
}

/**
 * Acepta JSON con { filas: [...] } o un arreglo, y CSV con cabecera.
 * Esquema mínimo: n, lineal_ms, quadtree_ms.
 */
export function parseImportedBenchmark(text, filename = 'archivo') {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('El archivo está vacío.');
  let rawRows;
  let meta = {};
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[') || filename.toLowerCase().endsWith('.json');
  if (isJson) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`JSON inválido: ${e.message}`);
    }
    if (Array.isArray(data)) rawRows = data;
    else if (Array.isArray(data.filas)) {
      rawRows = data.filas;
      meta = data;
    } else if (Array.isArray(data.rows)) {
      rawRows = data.rows;
      meta = data;
    } else {
      throw new Error('El JSON debe incluir un arreglo "filas" (o ser un arreglo de filas).');
    }
  } else {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error('El CSV necesita cabecera y al menos una fila.');
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map((h) => h.trim());
    rawRows = lines.slice(1).map((line) => {
      const cells = line.split(sep);
      const row = {};
      headers.forEach((h, i) => {
        row[h] = (cells[i] ?? '').trim();
      });
      return row;
    });
  }

  const filas = rawRows
    .map((row) => {
      const n = parseNumber(pick(row, ['n', 'flota', 'tamano', 'tamaño', 'size', 'drivers']));
      const linealMs = parseNumber(pick(row, ['lineal_ms', 'linear_ms', 'linealMs', 'linearMs', 'lineal', 'linear']));
      const quadtreeMs = parseNumber(pick(row, ['quadtree_ms', 'quad_ms', 'quadtreeMs', 'quadMs', 'quadtree']));
      if (n === null || linealMs === null || quadtreeMs === null) return null;
      return {
        n,
        linealMs,
        quadtreeMs,
        speedup: quadtreeMs > 0 ? linealMs / quadtreeMs : 0,
        examinadosLineal: parseNumber(pick(row, ['examinados_lineal', 'examinados', 'linear_examined'])) ?? n,
        examinadosQuadtree: parseNumber(pick(row, ['examinados_quadtree', 'quadtree_examined'])) ?? null,
        buildMs: parseNumber(pick(row, ['build_ms', 'construccion_ms'])),
        fuente: 'importado',
      };
    })
    .filter(Boolean);

  if (!filas.length) {
    throw new Error('No se encontró ninguna fila válida. Se requieren las columnas n, lineal_ms y quadtree_ms.');
  }
  const valid = filas.filter((f) => f.n > 0 && f.linealMs >= 0 && f.quadtreeMs >= 0);
  if (!valid.length) throw new Error('Las filas tienen valores negativos o inconsistentes.');
  return {
    tipo: 'espacial',
    origen: 'importado',
    etiqueta: `Resultados importados por el usuario desde ${filename}`,
    fuente: filename,
    fecha: new Date().toISOString(),
    meta,
    filas: valid.sort((a, b) => a.n - b.n),
  };
}

export function benchmarkTemplate() {
  return JSON.stringify(
    {
      tipo: 'benchmark_espacial',
      descripcion:
        'Plantilla para importar mediciones reales del proyecto Python. Complete las filas con los valores medidos. No incluya valores inventados.',
      unidad_tiempo: 'ms',
      entorno: 'Python 3.11 · hardware del equipo',
      filas: [
        { n: 300, lineal_ms: null, quadtree_ms: null, examinados_lineal: 300, examinados_quadtree: null },
        { n: 3000, lineal_ms: null, quadtree_ms: null, examinados_lineal: 3000, examinados_quadtree: null },
        { n: 30000, lineal_ms: null, quadtree_ms: null, examinados_lineal: 30000, examinados_quadtree: null },
      ],
    },
    null,
    2
  );
}
