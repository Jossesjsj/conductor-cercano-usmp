/* ==========================================================================
   QUADTREE PROPIO — Universidad de San Martín de Porres
   Proyecto Integrador N.º 2 · Asignación del conductor más cercano

   Nomenclatura académica:
     NodoQuadtree, Quadtree, insertar, eliminar, actualizar_posicion,
     buscar_rectangulo, k_mas_cercanos.

   El índice trabaja en un plano local en metros (proyección equirectangular)
   para podar regiones. La distancia final de los candidatos se recalcula
   con Haversine en el Despachador.
   ========================================================================== */

import { MinHeap, MaxHeap } from './heap.js';
import { haversineKm, planarDistance } from './haversine.js';

let _autoId = 0;
export const nextId = (prefix = 'C') => `${prefix}-${String(++_autoId).padStart(4, '0')}`;

export class NodoQuadtree {
  constructor(limites, profundidad = 0, capacidad = 4, profundidadMaxima = 8) {
    this.limites = { ...limites }; // { x, y, w, h } — x,y es la esquina mínima
    this.profundidad = profundidad;
    this.capacidad = capacidad;
    this.profundidadMaxima = profundidadMaxima;
    this.puntos = [];
    this.hijos = [];
    this.dividido = false;
  }

  contiene(punto) {
    const { x, y, w, h } = this.limites;
    return punto.x >= x && punto.x <= x + w && punto.y >= y && punto.y <= y + h;
  }

  intersecta(rect) {
    const { x, y, w, h } = this.limites;
    return !(rect.x > x + w || rect.x + rect.w < x || rect.y > y + h || rect.y + rect.h < y);
  }

  contieneRect(rect) {
    const { x, y, w, h } = this.limites;
    return rect.x <= x && rect.y <= y && rect.x + rect.w >= x + w && rect.y + rect.h >= y + h;
  }

  subdividir() {
    const { x, y, w, h } = this.limites;
    const hw = w / 2;
    const hh = h / 2;
    const d = this.profundidad + 1;
    this.hijos = [
      new NodoQuadtree({ x, y, w: hw, h: hh }, d, this.capacidad, this.profundidadMaxima),
      new NodoQuadtree({ x: x + hw, y, w: hw, h: hh }, d, this.capacidad, this.profundidadMaxima),
      new NodoQuadtree({ x, y: y + hh, w: hw, h: hh }, d, this.capacidad, this.profundidadMaxima),
      new NodoQuadtree({ x: x + hw, y: y + hh, w: hw, h: hh }, d, this.capacidad, this.profundidadMaxima),
    ];
    this.dividido = true;
    // Redistribuir los puntos existentes.
    const existentes = this.puntos;
    this.puntos = [];
    for (const p of existentes) {
      const hijo = this._hijoPara(p);
      hijo.insertar(p);
    }
    return this.hijos;
  }

  _hijoPara(punto) {
    const { x, y, w, h } = this.limites;
    const derecha = punto.x >= x + w / 2;
    const abajo = punto.y >= y + h / 2;
    return this.hijos[(derecha ? 1 : 0) + (abajo ? 2 : 0)];
  }

  insertar(punto) {
    if (!this.contiene(punto)) return { ok: false, motivo: 'fuera_de_limites' };
    if (this.dividido) return this._hijoPara(punto).insertar(punto);
    // Puntos coincidentes: al llegar a la profundidad máxima se acumulan
    // en la misma hoja (bucket overflow). No se subdivide infinitamente.
    if (this.puntos.length < this.capacidad || this.profundidad >= this.profundidadMaxima) {
      this.puntos.push(punto);
      return { ok: true, profundidad: this.profundidad, overflow: this.puntos.length > this.capacidad };
    }
    this.subdividir();
    return this._hijoPara(punto).insertar(punto);
  }

  eliminar(id) {
    if (this.dividido) {
      for (const h of this.hijos) {
        if (h.eliminar(id)) return true;
      }
      return false;
    }
    const idx = this.puntos.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.puntos.splice(idx, 1);
    return true;
  }

  buscarRectangulo(rect, acc) {
    if (!this.intersecta(rect)) {
      acc.nodosPodados++;
      return;
    }
    acc.nodosVisitados++;
    if (this.contieneRect(rect)) {
      this._recolectar(acc, true);
      return;
    }
    if (this.dividido) {
      for (const h of this.hijos) h.buscarRectangulo(rect, acc);
    } else {
      for (const p of this.puntos) {
        acc.puntosExaminados++;
        if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
          acc.puntos.push(p);
        }
      }
    }
  }

  _recolectar(acc, coincide) {
    if (this.dividido) {
      for (const h of this.hijos) h._recolectar(acc, coincide);
    } else {
      acc.puntosExaminados += this.puntos.length;
      if (coincide) acc.puntos.push(...this.puntos);
    }
  }

  /** Distancia mínima al cuadrado entre el punto y este rectángulo. */
  distanciaMinima2(x, y) {
    const { x: rx, y: ry, w, h } = this.limites;
    const dx = x < rx ? rx - x : x > rx + w ? x - (rx + w) : 0;
    const dy = y < ry ? ry - y : y > ry + h ? y - (ry + h) : 0;
    return dx * dx + dy * dy;
  }

  recolectarPuntos(out) {
    if (this.dividido) {
      for (const h of this.hijos) h.recolectarPuntos(out);
    } else {
      out.push(...this.puntos);
    }
  }

  contarPuntos() {
    if (this.dividido) return this.hijos.reduce((s, h) => s + h.contarPuntos(), 0);
    return this.puntos.length;
  }

  contarNodos() {
    if (this.dividido) return 1 + this.hijos.reduce((s, h) => s + h.contarNodos(), 0);
    return 1;
  }

  profundidadReal() {
    if (!this.dividido) return this.profundidad;
    return Math.max(...this.hijos.map((h) => h.profundidadReal()));
  }
}

export class Quadtree {
  /**
   * @param {{x:number,y:number,w:number,h:number}} limites
   * @param {{capacidad?:number, profundidadMaxima?:number}} opciones
   */
  constructor(limites, { capacidad = 4, profundidadMaxima = 8 } = {}) {
    if (!limites || limites.w <= 0 || limites.h <= 0) {
      throw new Error('El Quadtree necesita límites válidos.');
    }
    this.capacidad = capacidad;
    this.profundidadMaxima = profundidadMaxima;
    this.limites = { ...limites };
    this.raiz = new NodoQuadtree(this.limites, 0, capacidad, profundidadMaxima);
    this._indice = new Map(); // id -> punto
    this.operaciones = { insertar: 0, eliminar: 0, actualizar: 0, rectangulo: 0, kVecinos: 0 };
  }

  get tamaño() {
    return this._indice.size;
  }

  get vacio() {
    return this.tamaño === 0;
  }

  limpiar() {
    this.raiz = new NodoQuadtree(this.limites, 0, this.capacidad, this.profundidadMaxima);
    this._indice.clear();
  }

  /**
   * Inserta un punto { id, x, y, ... }. Si el id ya existe, actualiza.
   */
  insertar(punto) {
    if (!punto || punto.id === undefined || !Number.isFinite(punto.x) || !Number.isFinite(punto.y)) {
      return { ok: false, motivo: 'punto_invalido' };
    }
    this.operaciones.insertar++;
    if (!this.raiz.contiene(punto)) {
      return { ok: false, motivo: 'fuera_de_limites' };
    }
    if (this._indice.has(punto.id)) {
      this.actualizar_posicion(punto.id, punto.x, punto.y, punto);
      return { ok: true, actualizado: true };
    }
    const copia = { ...punto };
    const res = this.raiz.insertar(copia);
    if (res.ok) this._indice.set(copia.id, copia);
    return res;
  }

  eliminar(id) {
    this.operaciones.eliminar++;
    const punto = this._indice.get(id);
    if (!punto) return false;
    const ok = this.raiz.eliminar(id);
    if (ok) this._indice.delete(id);
    return ok;
  }

  actualizar_posicion(id, x, y, extra = null) {
    this.operaciones.actualizar++;
    const anterior = this._indice.get(id);
    if (!anterior) {
      return this.insertar({ ...(extra || {}), id, x, y });
    }
    if (!this.raiz.contiene({ x, y })) return { ok: false, motivo: 'fuera_de_limites' };
    this.raiz.eliminar(id);
    const actualizado = { ...anterior, ...(extra || {}), id, x, y };
    const res = this.raiz.insertar(actualizado);
    if (res.ok) this._indice.set(id, actualizado);
    return res;
  }

  /** Actualiza solo propiedades (por ejemplo, estado) sin mover el punto. */
  actualizar_estado(id, cambios) {
    const p = this._indice.get(id);
    if (!p) return false;
    Object.assign(p, cambios);
    return true;
  }

  buscar_rectangulo(rect) {
    this.operaciones.rectangulo++;
    const acc = { puntos: [], nodosVisitados: 0, nodosPodados: 0, puntosExaminados: 0 };
    this.raiz.buscarRectangulo(rect, acc);
    return acc;
  }

  /**
   * K vecinos más cercanos con búsqueda best-first sobre el árbol.
   * Usa un MinHeap de nodos (por distancia mínima al rectángulo) y un
   * MaxHeap de tamaño k para conservar los k puntos más cercanos.
   * `filtro` permite considerar solo conductores disponibles.
   */
  k_mas_cercanos(x, y, k = 5, filtro = null) {
    this.operaciones.kVecinos++;
    const kk = Math.max(0, Math.floor(k));
    if (!kk) return { puntos: [], nodosVisitados: 0, puntosExaminados: 0, nodosPodados: 0 };
    const nodos = new MinHeap((a, b) => a.d2 - b.d2);
    nodos.push({ nodo: this.raiz, d2: this.raiz.distanciaMinima2(x, y) });
    const mejores = new MaxHeap((a, b) => a.d2 - b.d2); // raíz = el más lejano de los k
    let nodosVisitados = 0;
    let puntosExaminados = 0;

    while (!nodos.isEmpty) {
      const actual = nodos.peek();
      // Si ya tenemos k y la siguiente región no puede mejorar al k-ésimo, poda.
      if (mejores.size === kk && actual.d2 > mejores.peek().d2) break;
      nodos.pop();
      const nodo = actual.nodo;
      nodosVisitados++;

      if (nodo.dividido) {
        for (const h of nodo.hijos) {
          nodos.push({ nodo: h, d2: h.distanciaMinima2(x, y) });
        }
        continue;
      }

      for (const p of nodo.puntos) {
        puntosExaminados++;
        if (filtro && !filtro(p)) continue;
        const dx = p.x - x;
        const dy = p.y - y;
        const d2 = dx * dx + dy * dy;
        if (mejores.size < kk) {
          mejores.push({ punto: p, d2 });
        } else if (d2 < mejores.peek().d2) {
          mejores.pop();
          mejores.push({ punto: p, d2 });
        }
      }
    }

    const puntos = mejores.items
      .slice()
      .sort((a, b) => a.d2 - b.d2)
      .map((item) => ({
        ...item.punto,
        distancia_plana_m: Math.sqrt(item.d2),
        distancia_haversine_km:
          item.punto.lat !== undefined && item.punto.lon !== undefined
            ? haversineKm(item.punto.lat, item.punto.lon, ...this._geoDe(x, y))
            : undefined,
      }));

    return {
      puntos,
      nodosVisitados,
      puntosExaminados,
      nodosPodados: Math.max(0, this.raiz.contarNodos() - nodosVisitados),
    };
  }

  _geoDe(x, y) {
    // El Quadtree no conoce la proyección; el Despachador recalcula Haversine
    // con las coordenadas reales. Este método queda como hook opcional.
    return [0, 0];
  }

  /** Fija una función para convertir (x,y) local a (lat,lon). */
  setProyeccion(fn) {
    this._geoDe = fn;
    return this;
  }

  /** Todos los puntos, útil para dibujar y para pruebas. */
  todos() {
    const out = [];
    this.raiz.recolectarPuntos(out);
    return out;
  }

  estadisticas() {
    let hojas = 0;
    let nodosConPuntos = 0;
    let puntosEnHojas = 0;
    const visitar = (n) => {
      if (n.dividido) {
        n.hijos.forEach(visitar);
      } else {
        hojas++;
        if (n.puntos.length) {
          nodosConPuntos++;
          puntosEnHojas += n.puntos.length;
        }
      }
    };
    visitar(this.raiz);
    return {
      puntos: this.tamaño,
      nodos: this.raiz.contarNodos(),
      hojas,
      nodosConPuntos,
      puntosEnHojas,
      profundidad: this.raiz.profundidadReal(),
      capacidad: this.capacidad,
      profundidadMaxima: this.profundidadMaxima,
      operaciones: { ...this.operaciones },
      overflow: this._contarOverflow(),
    };
  }

  _contarOverflow() {
    let count = 0;
    const visitar = (n) => {
      if (n.dividido) n.hijos.forEach(visitar);
      else if (n.puntos.length > n.capacidad) count += n.puntos.length - n.capacidad;
    };
    visitar(this.raiz);
    return count;
  }

  /** Lista plana de nodos para dibujar subdivisiones y depurar. */
  nodos() {
    const out = [];
    const visitar = (n) => {
      out.push({
        limites: n.limites,
        profundidad: n.profundidad,
        dividido: n.dividido,
        puntos: n.dividido ? n.contarPuntos() : n.puntos.length,
        esHoja: !n.dividido,
      });
      if (n.dividido) n.hijos.forEach(visitar);
    };
    visitar(this.raiz);
    return out;
  }

  /** Puntos con sus nodos hoja (para resaltar el cuadrante de un conductor). */
  hojasConPuntos() {
    const out = [];
    const visitar = (n) => {
      if (n.dividido) n.hijos.forEach(visitar);
      else out.push({ limites: n.limites, profundidad: n.profundidad, puntos: n.puntos });
    };
    visitar(this.raiz);
    return out;
  }
}

/** Distancia euclidiana en el plano local. */
export const distanciaPlana = planarDistance;
