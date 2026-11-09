/* ==========================================================================
   DESPACHADOR — coordina la asignación completa:
   Quadtree → candidatos → filtro → K vecinos → Dijkstra → ETA → ganador.
   Nomenclatura académica: clase Despachador.
   ========================================================================== */

import { haversineKm } from './haversine.js';
import { MaxHeap } from './heap.js';
import { dijkstra } from './dijkstra.js';

const now = () => performance.now();

export class Despachador {
  constructor(graph, { k = 5, velocidadKmh = 28, maxSnapM = 400 } = {}) {
    this.graph = graph;
    this.k = k;
    this.velocidadKmh = velocidadKmh;
    this.maxSnapM = maxSnapM;
  }

  /**
   * @param {object} opciones
   * @param {{id?:string, lat:number, lon:number}} opciones.pasajero
   * @param {Quadtree} opciones.quadtree
   * @param {Array} opciones.conductores flota completa (para métricas)
   * @param {number} [opciones.k]
   * @param {number} [opciones.velocidadKmh]
   * @param {number} [opciones.maxSnapM]
   */
  asignar({ pasajero, quadtree, conductores = [], k = this.k, velocidadKmh = this.velocidadKmh, maxSnapM = this.maxSnapM }) {
    const tInicio = now();
    const fases = [];
    const log = [];
    const kk = Math.max(1, Math.floor(k));
    const speed = Math.max(1, Number(velocidadKmh) || 1);

    // 1. Ubicación del pasajero y nodo de la red más cercano.
    const t1 = now();
    const nodoPasajero = this.graph.nearestNode(pasajero.lat, pasajero.lon);
    if (!nodoPasajero) {
      return this._sinResultado('red_vial_no_disponible', fases, log, tInicio);
    }
    const snapM = nodoPasajero.distance_m;
    if (snapM > maxSnapM) {
      fases.push({
        id: 'ubicacion',
        label: 'Validar ubicación',
        detail: `El punto está a ${Math.round(snapM)} m de la red vial (límite ${Math.round(maxSnapM)} m).`,
        ms: now() - t1,
        estado: 'error',
      });
      log.push(`Sin conexión vial: el pasajero está a ${Math.round(snapM)} m del nodo más cercano.`);
      return this._sinResultado('pasajero_sin_conexion_vial', fases, log, tInicio, { nodoPasajero, snapM });
    }
    const pLocal = this.graph.projector.toLocal(pasajero.lat, pasajero.lon);
    fases.push({
      id: 'ubicacion',
      label: 'Ubicar al pasajero',
      detail: `Nodo ${nodoPasajero.id} · ajuste de ${snapM.toFixed(1)} m`,
      ms: now() - t1,
      estado: 'ok',
    });
    log.push(`Pasajero en ${pasajero.lat.toFixed(5)}, ${pasajero.lon.toFixed(5)} → nodo ${nodoPasajero.id}.`);

    if (this.graph.neighbors(nodoPasajero.id).length === 0) {
      fases.push({
        id: 'conexion',
        label: 'Comprobar conexión vial',
        detail: 'El nodo del pasajero no tiene aristas: zona sin conexión.',
        ms: 0,
        estado: 'error',
      });
      return this._sinResultado('pasajero_sin_conexion_vial', fases, log, tInicio, { nodoPasajero, snapM });
    }

    // 2. Consulta espacial (Quadtree + heap).
    const t2 = now();
    const disponibles = conductores.filter((c) => c.disponible).length;
    const consulta = quadtree.k_mas_cercanos(pLocal.x, pLocal.y, kk, (p) => p.disponible);
    fases.push({
      id: 'quadtree',
      label: 'Consultar el Quadtree',
      detail: `${consulta.nodosVisitados} nodos visitados · ${consulta.puntosExaminados} puntos examinados`,
      ms: now() - t2,
      estado: 'ok',
    });
    log.push(`Quadtree: ${consulta.nodosVisitados} nodos, ${consulta.puntosExaminados} puntos examinados, ${consulta.puntos.length} candidatos.`);

    if (!consulta.puntos.length) {
      fases.push({
        id: 'disponibles',
        label: 'Filtrar disponibles',
        detail: `0 de ${conductores.length} conductores están disponibles.`,
        ms: 0,
        estado: 'error',
      });
      log.push('No hay conductores disponibles en este momento.');
      return this._sinResultado('sin_conductores_disponibles', fases, log, tInicio, {
        nodoPasajero, snapM, consulta, disponibles,
      });
    }

    // 3. K candidatos, ya filtrados por disponibilidad dentro del índice.
    const t3 = now();
    const candidatosBase = consulta.puntos.slice(0, kk);
    fases.push({
      id: 'candidatos',
      label: 'Obtener K candidatos',
      detail: `K = ${kk} · ${candidatosBase.length} devueltos por el heap`,
      ms: now() - t3,
      estado: 'ok',
    });

    // 4. Ruta real por calles con Dijkstra propio para cada candidato.
    const t4 = now();
    const candidatos = [];
    let totalSettles = 0;
    let totalRelax = 0;
    for (const punto of candidatosBase) {
      const conductor = punto;
      let nodoConductor = conductor.nodeId ? this.graph.node(conductor.nodeId) : null;
      if (!nodoConductor) {
        nodoConductor = this.graph.nearestNode(conductor.lat, conductor.lon);
      }
      const straightKm = haversineKm(conductor.lat, conductor.lon, pasajero.lat, pasajero.lon);
      if (!nodoConductor) {
        candidatos.push({
          ...conductor,
          straightKm,
          roadKm: Infinity,
          etaMin: Infinity,
          reachable: false,
          motivo: 'sin_nodo',
          path: [],
          edgeIds: [],
          routeGeo: [],
        });
        continue;
      }
      if (nodoConductor.id === nodoPasajero.id) {
        candidatos.push({
          ...conductor,
          nodeId: nodoConductor.id,
          straightKm,
          roadKm: 0,
          etaMin: 0,
          reachable: true,
          path: [nodoPasajero.id],
          edgeIds: [],
          routeGeo: [],
          settles: 0,
          relax: 0,
        });
        continue;
      }
      const ruta = dijkstra(this.graph, nodoConductor.id, nodoPasajero.id);
      totalSettles += ruta.operaciones.settles;
      totalRelax += ruta.operaciones.relax;
      if (!ruta.found) {
        candidatos.push({
          ...conductor,
          nodeId: nodoConductor.id,
          straightKm,
          roadKm: Infinity,
          etaMin: Infinity,
          reachable: false,
          motivo: 'sin_ruta',
          path: [],
          edgeIds: [],
          routeGeo: [],
          settles: ruta.operaciones.settles,
          relax: ruta.operaciones.relax,
        });
        continue;
      }
      const etaMin = (ruta.distancia_km / speed) * 60;
      candidatos.push({
        ...conductor,
        nodeId: nodoConductor.id,
        straightKm,
        roadKm: ruta.distancia_km,
        etaMin,
        reachable: true,
        path: ruta.path,
        edgeIds: ruta.edgeIds,
        routeGeo: this.graph.pathGeo(ruta.path, ruta.edgeIds),
        settles: ruta.operaciones.settles,
        relax: ruta.operaciones.relax,
      });
    }
    const msRutas = now() - t4;
    fases.push({
      id: 'dijkstra',
      label: 'Calcular rutas por calles',
      detail: `${candidatosBase.length} rutas · ${totalSettles} nodos asentados · ${totalRelax} relajaciones`,
      ms: msRutas,
      estado: 'ok',
    });
    log.push(`Dijkstra propio: ${candidatos.length} rutas, ${totalSettles} nodos asentados, ${totalRelax} relajaciones.`);

    // 5. ETA y ordenamiento.
    const t5 = now();
    candidatos.sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
      if (!a.reachable) return a.straightKm - b.straightKm;
      if (Math.abs(a.etaMin - b.etaMin) > 1e-9) return a.etaMin - b.etaMin;
      if (Math.abs(a.roadKm - b.roadKm) > 1e-9) return a.roadKm - b.roadKm;
      return String(a.id).localeCompare(String(b.id));
    });
    const ganador = candidatos.find((c) => c.reachable) || null;
    fases.push({
      id: 'eta',
      label: 'Calcular ETA',
      detail: ganador
        ? `Ganador ${ganador.id}: ${ganador.roadKm.toFixed(2)} km ÷ ${speed} km/h = ${ganador.etaMin.toFixed(2)} min`
        : 'Ningún candidato alcanzable por la red.',
      ms: now() - t5,
      estado: ganador ? 'ok' : 'error',
    });
    if (ganador) {
      log.push(`ETA mínimo: ${ganador.id} con ${ganador.etaMin.toFixed(2)} min (${ganador.roadKm.toFixed(2)} km).`);
    } else {
      log.push('Ningún candidato tiene ruta hasta el pasajero: componente desconectado.');
    }

    // 6. Asignación.
    fases.push({
      id: 'asignar',
      label: 'Asignar conductor',
      detail: ganador ? `${ganador.id} seleccionado por menor ETA` : 'Asignación no realizada',
      ms: 0,
      estado: ganador ? 'ok' : 'error',
    });

    const totalMs = now() - tInicio;
    return {
      ok: Boolean(ganador),
      motivo: ganador ? null : 'candidatos_no_alcanzables',
      pasajero: {
        ...pasajero,
        nodoId: nodoPasajero.id,
        x: pLocal.x,
        y: pLocal.y,
        snapM,
      },
      nodoPasajero,
      snapM,
      consulta,
      candidatos,
      ganador,
      fases,
      log,
      metricas: {
        disponibles,
        flota: conductores.length,
        examinados: consulta.puntosExaminados,
        nodosQuadtree: consulta.nodosVisitados,
        rutas: candidatosBase.length,
        settles: totalSettles,
        relajaciones: totalRelax,
        tiempoTotalMs: totalMs,
        tiempoRutasMs: msRutas,
        velocidadKmh: speed,
        k: kk,
      },
    };
  }

  _sinResultado(motivo, fases, log, tInicio, extra = {}) {
    return {
      ok: false,
      motivo,
      fases,
      log,
      candidatos: [],
      ganador: null,
      consulta: extra.consulta || { puntos: [], nodosVisitados: 0, puntosExaminados: 0 },
      pasajero: extra.nodoPasajero ? { ...extra } : null,
      metricas: {
        disponibles: extra.disponibles ?? 0,
        examinados: extra.consulta?.puntosExaminados ?? 0,
        nodosQuadtree: extra.consulta?.nodosVisitados ?? 0,
        tiempoTotalMs: now() - tInicio,
      },
      ...extra,
    };
  }
}

/**
 * Búsqueda lineal de referencia: examina toda la flota.
 * Se usa para contrastar el número de elementos revisados y el tiempo.
 * La selección de K se apoya en un MaxHeap de tamaño K.
 */
export function buscarLineal(conductores, pasajero, k = 5, filtroDisponibles = true) {
  const t0 = now();
  const heap = new MaxHeap((a, b) => a.distancia - b.distancia);
  let examinados = 0;
  let evaluados = 0;
  for (const c of conductores) {
    examinados++;
    if (filtroDisponibles && !c.disponible) continue;
    evaluados++;
    const d = haversineKm(c.lat, c.lon, pasajero.lat, pasajero.lon);
    if (heap.size < k) {
      heap.push({ ...c, distancia: d });
    } else if (d < heap.peek().distancia) {
      heap.pop();
      heap.push({ ...c, distancia: d });
    }
  }
  const puntos = heap.items.sort((a, b) => a.distancia - b.distancia);
  return {
    puntos,
    examinados,
    evaluados,
    ms: now() - t0,
    comparaciones: heap.pushes + heap.pops,
  };
}

/**
 * Compara, para una misma solicitud, la exploración lineal con la del
 * Quadtree. Devuelve conteos reales; no es un benchmark de Python.
 */
export function compararEstrategias(conductores, pasajero, quadtree, k = 5, projector = null) {
  if (!projector || typeof projector.toLocal !== 'function') {
    throw new Error('compararEstrategias necesita el proyector de la red (graph.projector).');
  }
  const pLocal = projector.toLocal(pasajero.lat, pasajero.lon);
  const lineal = buscarLineal(conductores, pasajero, k);
  const t0 = now();
  const espacial = quadtree.k_mas_cercanos(pLocal.x, pLocal.y, k, (p) => p.disponible);
  const msEspacial = now() - t0;
  return {
    lineal: { ...lineal, examinados: conductores.length, puntos: lineal.puntos },
    espacial: {
      puntos: espacial.puntos,
      examinados: espacial.puntosExaminados,
      nodosVisitados: espacial.nodosVisitados,
      nodosPodados: espacial.nodosPodados,
      ms: msEspacial,
    },
    k,
    consulta: { x: pLocal.x, y: pLocal.y },
  };
}
