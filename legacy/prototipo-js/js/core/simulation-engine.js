/* ==========================================================================
   MOTOR DE SIMULACIÓN DE FLOTA
   Cada viaje usa el pipeline real: Quadtree → K candidatos → Dijkstra → ETA.
   Los conductores se desplazan sobre la geometría de las calles de Comas.
   ========================================================================== */

import { generarFlota, construirQuadtreeFlota } from './fleet.js';
import { Despachador } from '../algorithms/dispatcher.js';
import { dijkstra } from '../algorithms/dijkstra.js';
import { haversineKm } from '../algorithms/haversine.js';
import { SeededRandom } from './seeded-random.js';

const geoArista = (graph, edge) => {
  const a = graph.node(edge.a);
  const b = graph.node(edge.b);
  return [
    { lat: a.lat, lon: a.lon },
    ...edge.via.map(([lat, lon]) => ({ lat, lon })),
    { lat: b.lat, lon: b.lon },
  ];
};

export class SimulationEngine {
  constructor({ graph, flota = 300, seed = 20261105, k = 3, velocidadKmh = 26 }) {
    this.graph = graph;
    this.flotaInicial = flota;
    this.semilla = seed;
    this.k = k;
    this.velocidadKmh = velocidadKmh;
    this.despachador = new Despachador(graph, { k, velocidadKmh });
    this.velocidadSimulacion = 4;
    this.reiniciar({ flota, seed, k });
  }

  reiniciar({ flota = this.flotaInicial, seed = this.semilla, k = this.k } = {}) {
    this.semilla = Number(seed) >>> 0;
    this.k = k;
    this.rng = new SeededRandom(this.semilla);
    this.conductores = generarFlota(this.graph, { n: flota, seed: this.semilla, disponibles: 1 });
    const { quadtree } = construirQuadtreeFlota(this.graph, this.conductores);
    this.quadtree = quadtree;
    this.despachador = new Despachador(this.graph, { k, velocidadKmh: this.velocidadKmh });
    this.tiempo = 0;
    this.siguienteSolicitud = 1.5;
    this.corriendo = false;
    this.viajes = [];
    this.log = [];
    this.metricas = {
      solicitudes: 0,
      asignadas: 0,
      fallidas: 0,
      completadas: 0,
      esperaTotal: 0,
      viajeTotal: 0,
      distanciaTotal: 0,
      ultimoTiempoAsignacion: 0,
    };
    this.ultimoResultado = null;
    for (const c of this.conductores) {
      c.estado = 'idle';
      c.disponible = true;
      c.route = null;
      c.seg = 0;
      c.segAvance = 0;
      this._asignarAristaIdle(c);
    }
    this._qTimer = 0;
    this._log('Flota inicializada sobre la red real de Comas.', 'info');
    return this;
  }

  _log(texto, tipo = 'info') {
    this.log.unshift({ t: this.tiempo, texto, tipo });
    if (this.log.length > 40) this.log.pop();
  }

  _asignarAristaIdle(c) {
    const edge = this.rng.pick(this.graph.edges);
    c.edgeId = edge.id;
    const route = geoArista(this.graph, edge);
    if (this.rng.chance(0.5)) route.reverse();
    c.route = route;
    c.seg = 0;
    c.segAvance = 0;
    this._ubicarEnRuta(c);
  }

  _ubicarEnRuta(c) {
    if (!c.route || c.route.length < 2) return;
    const a = c.route[c.seg];
    const b = c.route[c.seg + 1] || a;
    const f = Math.min(1, c.segAvance);
    c.lat = a.lat + (b.lat - a.lat) * f;
    c.lon = a.lon + (b.lon - a.lon) * f;
  }

  _avanzarRuta(c, metros) {
    if (!c.route || c.route.length < 2) return true;
    let restante = metros;
    let guard = 0;
    while (restante > 0 && guard++ < 40) {
      const a = c.route[c.seg];
      const b = c.route[c.seg + 1];
      if (!b) return true;
      const dist = haversineKm(a.lat, a.lon, b.lat, b.lon) * 1000;
      if (dist < 1e-6) {
        c.seg++;
        c.segAvance = 0;
        continue;
      }
      const restanteTramo = dist * (1 - c.segAvance);
      if (restante < restanteTramo) {
        c.segAvance += restante / dist;
        restante = 0;
      } else {
        restante -= restanteTramo;
        c.seg++;
        c.segAvance = 0;
        if (c.seg >= c.route.length - 1) {
          c.seg = c.route.length - 2;
          c.segAvance = 1;
          this._ubicarEnRuta(c);
          return true;
        }
      }
    }
    this._ubicarEnRuta(c);
    return false;
  }

  setVelocidad(valor) {
    this.velocidadSimulacion = Math.max(0.5, Number(valor) || 1);
  }

  /** Crea una solicitud y ejecuta el pipeline completo. */
  solicitarViaje(pasajero = null) {
    const edge = this.rng.pick(this.graph.edges);
    const t = this.rng.float(0.1, 0.9);
    const coords = geoArista(this.graph, edge);
    const idx = Math.min(coords.length - 2, Math.floor(t * (coords.length - 1)));
    const f = t * (coords.length - 1) - idx;
    const a = coords[idx];
    const b = coords[idx + 1];
    const punto = pasajero || {
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
    };
    const id = `P-${String(this.metricas.solicitudes + 1).padStart(4, '0')}`;
    const solicitud = { id, ...punto, tiempo: this.tiempo };
    this.viajes.push(solicitud);
    if (this.viajes.length > 16) this.viajes.shift();
    this.metricas.solicitudes++;

    const resultado = this.despachador.asignar({
      pasajero: punto,
      quadtree: this.quadtree,
      conductores: this.conductores,
      k: this.k,
      velocidadKmh: this.velocidadKmh,
    });
    this.ultimoResultado = resultado;

    if (!resultado.ok) {
      solicitud.estado = 'fallida';
      this.metricas.fallidas++;
      this._log(`Solicitud ${id}: ${motivoLegible(resultado.motivo)}`, 'warn');
      return resultado;
    }

    const ganador = resultado.ganador;
    const conductor = this.conductores.find((c) => c.id === ganador.id);
    if (!conductor) return resultado;
    conductor.disponible = false;
    conductor.estado = 'pickup';
    this.quadtree.actualizar_estado(conductor.id, { disponible: false });
    conductor.route = ganador.routeGeo?.length > 1
      ? ganador.routeGeo
      : [{ lat: conductor.lat, lon: conductor.lon }, { lat: punto.lat, lon: punto.lon }];
    conductor.seg = 0;
    conductor.segAvance = 0;
    conductor.viaje = {
      id,
      pasajero: punto,
      estado: 'pickup',
      tiempoSolicitud: this.tiempo,
      nodoPasajero: resultado.nodoPasajero?.id,
      path: ganador.path,
      edgeIds: ganador.edgeIds,
    };
    solicitud.estado = 'asignada';
    solicitud.conductor = conductor.id;
    solicitud.eta = ganador.etaMin;
    this.metricas.asignadas++;
    this.metricas.ultimoTiempoAsignacion = resultado.metricas.tiempoTotalMs;
    this._log(`Solicitud ${id} → ${conductor.id} · ETA ${ganador.etaMin.toFixed(1)} min · ${resultado.metricas.tiempoTotalMs.toFixed(1)} ms`, 'ok');
    return resultado;
  }

  _iniciarViaje(conductor) {
    const viaje = conductor.viaje;
    if (!viaje) return;
    viaje.estado = 'trip';
    viaje.tiempoRecogida = this.tiempo;
    const espera = this.tiempo - viaje.tiempoSolicitud;
    this.metricas.esperaTotal += espera;
    const destinos = [...this.graph.nodes.values()];
    const destino = this.rng.pick(destinos);
    const desde = this.graph.nearestNode(viaje.pasajero.lat, viaje.pasajero.lon);
    let ruta = null;
    if (desde && destino) {
      const d = dijkstra(this.graph, desde.id, destino.id);
      if (d.found) {
        ruta = {
          distancia_km: d.distancia_km,
          path: d.path,
          edgeIds: d.edgeIds,
          routeGeo: this.graph.pathGeo(d.path, d.edgeIds),
        };
      }
    }
    viaje.destino = { lat: destino.lat, lon: destino.lon };
    viaje.distanciaKm = ruta?.distancia_km || haversineKm(viaje.pasajero.lat, viaje.pasajero.lon, destino.lat, destino.lon);
    viaje.route = ruta?.routeGeo?.length > 1
      ? ruta.routeGeo
      : [{ lat: viaje.pasajero.lat, lon: viaje.pasajero.lon }, { lat: destino.lat, lon: destino.lon }];
    conductor.route = viaje.route;
    conductor.seg = 0;
    conductor.segAvance = 0;
    conductor.estado = 'trip';
    this._log(`${conductor.id} recogió a ${viaje.id} · viaje ${viaje.distanciaKm.toFixed(2)} km`, 'ok');
  }

  _finalizarViaje(conductor) {
    const viaje = conductor.viaje;
    if (viaje) {
      const duracion = this.tiempo - (viaje.tiempoRecogida || this.tiempo);
      this.metricas.viajeTotal += duracion;
      this.metricas.completadas++;
      this.metricas.distanciaTotal += viaje.distanciaKm || 0;
      this._log(`${conductor.id} completó ${viaje.id} · ${duracion.toFixed(1)} s simulados`, 'ok');
    }
    const n = this.graph.nearestNode(conductor.lat, conductor.lon);
    const edge = n ? this.graph.neighbors(n.id)[0] : null;
    conductor.viaje = null;
    conductor.estado = 'idle';
    conductor.disponible = true;
    this.quadtree.actualizar_estado(conductor.id, { disponible: true });
    if (edge) {
      conductor.edgeId = edge.edgeId;
      conductor.route = geoArista(this.graph, this.graph.edge(edge.edgeId));
      conductor.seg = 0;
      conductor.segAvance = 0;
    } else {
      this._asignarAristaIdle(conductor);
    }
    conductor.viajes = (conductor.viajes || 0) + 1;
  }

  update(dtSegundos) {
    if (!this.corriendo) return;
    const dt = Math.min(0.1, dtSegundos) * this.velocidadSimulacion;
    this.tiempo += dt;

    if (this.tiempo >= this.siguienteSolicitud) {
      this.solicitarViaje();
      this.siguienteSolicitud = this.tiempo + this.rng.float(1.4, 3.4);
    }

    const metrosLibres = (this.velocidadKmh / 3.6) * dt;
    for (const c of this.conductores) {
      if (!c.route) continue;
      const metros = c.estado === 'idle' ? metrosLibres * 0.7 : metrosLibres;
      const fin = this._avanzarRuta(c, metros);
      if (fin) {
        if (c.estado === 'pickup') {
          this._iniciarViaje(c);
        } else if (c.estado === 'trip') {
          this._finalizarViaje(c);
        } else if (c.estado === 'idle') {
          // Elegir una arista vecina al nodo final.
          const ultimo = c.route[c.route.length - 1];
          const nodo = this.graph.nearestNode(ultimo.lat, ultimo.lon);
          const vecinos = nodo ? this.graph.neighbors(nodo.id) : [];
          if (!vecinos.length) {
            this._asignarAristaIdle(c);
          } else {
            const elegido = this.rng.pick(vecinos);
            const edge = this.graph.edge(elegido.edgeId);
            c.edgeId = edge.id;
            c.route = geoArista(this.graph, edge);
            if (String(edge.a) !== String(nodo.id)) c.route.reverse();
            c.seg = 0;
            c.segAvance = 0;
          }
        }
      }
    }

    // Actualización periódica del índice espacial (no en cada fotograma).
    this._qTimer += dt;
    if (this._qTimer > 0.25) {
      this._qTimer = 0;
      for (const c of this.conductores) {
        const p = this.graph.projector.toLocal(c.lat, c.lon);
        c.x = p.x;
        c.y = p.y;
        if (c.estado === 'idle') this.quadtree.actualizar_posicion(c.id, p.x, p.y, { disponible: c.disponible });
      }
    }
  }

  resumen() {
    const m = this.metricas;
    return {
      ...m,
      flota: this.conductores.length,
      disponibles: this.conductores.filter((c) => c.disponible).length,
      ocupados: this.conductores.filter((c) => !c.disponible).length,
      esperaMedia: m.completadas ? m.esperaTotal / m.completadas : 0,
      viajeMedio: m.completadas ? m.viajeTotal / m.completadas : 0,
      tiempo: this.tiempo,
      nodosQuadtree: this.quadtree.estadisticas().nodos,
    };
  }
}

export function motivoLegible(motivo) {
  return {
    sin_conductores_disponibles: 'sin conductores disponibles',
    pasajero_sin_conexion_vial: 'el pasajero no tiene conexión vial cercana',
    candidatos_no_alcanzables: 'ningún candidato alcanzable por la red',
    red_vial_no_disponible: 'red vial no disponible',
  }[motivo] || motivo || 'sin resultado';
}
