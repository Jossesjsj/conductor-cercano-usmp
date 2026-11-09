// Cliente de la simulación: refleja el estado del backend y anima las
// transiciones entre turnos SIGUIENDO EXACTAMENTE los puntos que el backend
// recorrió (geometría de las calles). No inventa posiciones.
import { api } from './api.js';

const DURACION_BASE_MS = 1100; // duración de un turno a velocidad 1×

class SimClient {
  constructor() {
    this.conductores = new Map(); // id → {id, x, y, estado, camino, acumulado, total, rumbo}
    this.turno = 0;
    this.auto = false;
    this.velocidad = 1;
    this.ocupado = false;
    this.pausaGlobal = false;
    this.resumen = null;
    this.candidatos = new Set();
    this.asignado = null;
    this.pasajero = null; // {id, x, y, nodo}
    this.oyentes = new Map();
    this._inicioTurno = 0;
    this._duracion = DURACION_BASE_MS;
    this._ultimoTurno = 0;
    setInterval(() => this._bucle(), 120);
  }

  on(evento, fn) {
    if (!this.oyentes.has(evento)) this.oyentes.set(evento, new Set());
    this.oyentes.get(evento).add(fn);
    return () => this.oyentes.get(evento).delete(fn);
  }

  emitir(evento, datos) { (this.oyentes.get(evento) || []).forEach((fn) => { try { fn(datos); } catch (e) { console.error(e); } }); }

  async cargar() {
    const [datos, estado] = await Promise.all([api('/api/conductores'), api('/api/estado')]);
    this.conductores.clear();
    for (const [id, x, y, estado] of datos.conductores) {
      this.conductores.set(id, { id, x, y, estado, camino: null, rumbo: 0 });
    }
    this.turno = datos.turno;
    this.resumen = estado.simulacion;
    this.emitir('flota', this);
    this.emitir('resumen', this.resumen);
  }

  async avanzar() {
    if (this.ocupado) return null;
    this.ocupado = true;
    try {
      const r = await api('/api/simulacion/avanzar', { turnos: 1 });
      this._aplicar(r);
      return r;
    } finally {
      this.ocupado = false;
    }
  }

  _aplicar(r) {
    const ahora = performance.now();
    // Termina la animación anterior antes de empezar la nueva.
    for (const c of this.conductores.values()) this._posicionar(c, 1);
    for (const m of r.movimientos) {
      const c = this.conductores.get(m.id);
      if (!c) continue;
      c.estado = m.estado;
      const pts = m.puntos;
      const acumulado = [0];
      for (let i = 1; i < pts.length; i++) {
        acumulado.push(acumulado[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      c.camino = pts;
      c.acumulado = acumulado;
      c.total = acumulado[acumulado.length - 1];
    }
    this._inicioTurno = ahora;
    this._duracion = DURACION_BASE_MS / this.velocidad;
    this._ultimoTurno = ahora;
    this.turno = r.turno;
    this.resumen = r.resumen;
    if (this.asignado != null) {
      const a = this.conductores.get(this.asignado);
      if (a && a.estado !== 'asignado') this.emitir('llegada', { id: this.asignado, eventos: r.eventos });
    }
    this.emitir('turno', r);
    this.emitir('resumen', this.resumen);
  }

  /** Posición interpolada a lo largo del recorrido del turno. */
  _posicionar(c, f) {
    if (!c.camino) return;
    if (c.total <= 0.001) { c.x = c.camino[c.camino.length - 1][0]; c.y = c.camino[c.camino.length - 1][1]; return; }
    const objetivo = Math.min(1, Math.max(0, f)) * c.total;
    const a = c.acumulado;
    let i = 1;
    while (i < a.length - 1 && a[i] < objetivo) i++;
    const tramo = a[i] - a[i - 1];
    const t = tramo > 0 ? (objetivo - a[i - 1]) / tramo : 1;
    const p0 = c.camino[i - 1], p1 = c.camino[i];
    c.x = p0[0] + (p1[0] - p0[0]) * t;
    c.y = p0[1] + (p1[1] - p0[1]) * t;
    if (tramo > 0.01) c.rumbo = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    if (f >= 1) c.camino = null;
  }

  /** Llamado en cada cuadro por el motor 3D. */
  actualizarPosiciones(ahora) {
    if (this.pausaGlobal) return;
    const f = (ahora - this._inicioTurno) / this._duracion;
    for (const c of this.conductores.values()) this._posicionar(c, f);
  }

  _bucle() {
    if (!this.auto || this.ocupado || this.pausaGlobal) return;
    const ahora = performance.now();
    if (ahora - this._ultimoTurno >= DURACION_BASE_MS / this.velocidad) {
      this.avanzar().catch((e) => { this.auto = false; this.emitir('error', e); this.emitir('auto', false); });
    }
  }

  setAuto(v) { this.auto = v; this.emitir('auto', v); }
  setVelocidad(v) { this.velocidad = v; this.emitir('velocidad', v); }

  async reiniciar(semilla) {
    this.limpiarResaltado();
    await api('/api/simulacion/reiniciar', semilla == null ? {} : { semilla });
    await this.cargar();
  }

  async generar(config) {
    this.limpiarResaltado();
    await api('/api/flota/generar', config);
    await this.cargar();
  }

  limpiarResaltado() {
    this.candidatos = new Set();
    this.asignado = null;
    this.pasajero = null;
    this.emitir('resaltado', this);
  }

  resaltar({ candidatos, asignado, pasajero } = {}) {
    if (candidatos !== undefined) this.candidatos = new Set(candidatos);
    if (asignado !== undefined) this.asignado = asignado;
    if (pasajero !== undefined) this.pasajero = pasajero;
    this.emitir('resaltado', this);
  }
}

export const sim = new SimClient();
