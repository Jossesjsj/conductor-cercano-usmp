"""RF-06 · Simulación por turnos con semilla reproducible.

En cada turno:
  1. Cada conductor avanza por el grafo vial (simulacion/flota.py).
  2. Su posición se actualiza en el Quadtree (actualizar_posicion).
  3. Se actualizan estados: ocupado → disponible al terminar el viaje,
     disponible → ocupado con baja probabilidad (pasajero tomado en la calle),
     asignado → ocupado al llegar al pasajero.
"""
from __future__ import annotations

import random
import threading

from datos.red_vial import RedVial
from estructuras.quadtree import Quadtree
from simulacion.conductor import ASIGNADO, DISPONIBLE, OCUPADO, Conductor
from simulacion.despachador import Despachador
from simulacion.flota import generar_flota, mover_conductor


class Simulacion:
    def __init__(self, red: RedVial, cantidad: int = 300, semilla: int = 42,
                 proporcion_ocupados: float = 0.3, velocidad_kmh: float = 30.0,
                 segundos_por_turno: float = 10.0, prob_ocupar: float = 0.01,
                 capacidad_quadtree: int = 8, k: int = 5):
        self.red = red
        self.bloqueo = threading.RLock()
        self.config = {}
        self.reiniciar(cantidad, semilla, proporcion_ocupados, velocidad_kmh,
                       segundos_por_turno, prob_ocupar, capacidad_quadtree, k)

    def reiniciar(self, cantidad=None, semilla=None, proporcion_ocupados=None,
                  velocidad_kmh=None, segundos_por_turno=None, prob_ocupar=None,
                  capacidad_quadtree=None, k=None) -> None:
        nuevos = dict(cantidad=cantidad, semilla=semilla,
                      proporcion_ocupados=proporcion_ocupados, velocidad_kmh=velocidad_kmh,
                      segundos_por_turno=segundos_por_turno, prob_ocupar=prob_ocupar,
                      capacidad_quadtree=capacidad_quadtree, k=k)
        for clave, valor in nuevos.items():
            if valor is not None or clave not in self.config:
                self.config[clave] = valor
        cfg = self.config
        with self.bloqueo:
            self.rng = random.Random(cfg["semilla"])
            self.turno = 0
            flota = generar_flota(self.red, cfg["cantidad"], self.rng,
                                  cfg["proporcion_ocupados"], cfg["velocidad_kmh"])
            self.conductores: dict[int, Conductor] = {c.id: c for c in flota}
            self.quadtree = Quadtree(self.red.limites, capacidad=cfg["capacidad_quadtree"])
            for c in flota:
                self.quadtree.insertar(c)
            self.despachador = Despachador(self.red, self.quadtree, self.conductores,
                                           cfg["velocidad_kmh"], cfg["k"])
            self.asignaciones: list[dict] = []
            self.eventos: list[str] = []

    # ---------------------------------------------------------------- turnos
    def avanzar_turno(self) -> dict:
        with self.bloqueo:
            self.turno += 1
            dt = self.config["segundos_por_turno"]
            movimientos, eventos = [], []
            for c in sorted(self.conductores.values(), key=lambda c: c.id):
                mov = mover_conductor(self.red, c, dt, self.rng)
                self.quadtree.actualizar_posicion(c, mov["x"], mov["y"])
                if mov["llego"] and c.estado == ASIGNADO:
                    c.estado = OCUPADO
                    c.turnos_ocupado = self.rng.randint(10, 30)
                    p = self.despachador.pasajeros.get(c.pasajero_id)
                    if p:
                        p.estado = "recogido"
                    eventos.append(f"Conductor {c.id} recogió al pasajero {c.pasajero_id}")
                elif c.estado == OCUPADO:
                    c.turnos_ocupado -= 1
                    if c.turnos_ocupado <= 0:
                        c.estado = DISPONIBLE
                        c.pasajero_id = None
                elif c.estado == DISPONIBLE and self.rng.random() < self.config["prob_ocupar"]:
                    c.estado = OCUPADO
                    c.turnos_ocupado = self.rng.randint(5, 25)
                movimientos.append({
                    "id": c.id, "estado": c.estado,
                    "puntos": [[round(px, 1), round(py, 1)] for px, py in mov["puntos"]],
                })
            self.eventos = (self.eventos + eventos)[-30:]
            return {"turno": self.turno, "segundos_por_turno": dt,
                    "movimientos": movimientos, "eventos": eventos,
                    "resumen": self.resumen()}

    # ---------------------------------------------------------------- estado
    def resumen(self) -> dict:
        cuenta = {DISPONIBLE: 0, OCUPADO: 0, ASIGNADO: 0}
        for c in self.conductores.values():
            cuenta[c.estado] += 1
        return {"turno": self.turno, "total": len(self.conductores),
                "disponibles": cuenta[DISPONIBLE], "ocupados": cuenta[OCUPADO],
                "asignados": cuenta[ASIGNADO], "quadtree": self.quadtree.estadisticas(),
                "config": dict(self.config), "asignaciones": len(self.asignaciones),
                "pasajeros": len(self.despachador.pasajeros)}

    def huella(self) -> list:
        """Firma del estado (para comprobar reproducibilidad con la misma semilla)."""
        return [(c.id, round(c.x, 3), round(c.y, 3), c.estado)
                for c in sorted(self.conductores.values(), key=lambda c: c.id)]
