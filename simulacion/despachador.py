"""Clase Despachador (nomenclatura obligatoria) · coordina la asignación.

Flujo:  Pasajero → Quadtree → Haversine → Heap → Dijkstra → ETA → Conductor asignado

1. El pasajero se "pega" a la intersección más cercana (Quadtree de nodos).
2. Quadtree de conductores + Haversine + heap → k candidatos DISPONIBLES más
   cercanos en línea recta (estructuras/vecinos.py).
3. Dijkstra propio desde cada candidato HACIA el pasajero → distancia por calles.
4. ETA = distancia_vial / velocidad_promedio.
5. Se asigna el candidato de MENOR ETA alcanzable (desempate: Haversine, id).
"""
from __future__ import annotations

import math
import time

from algoritmos.dijkstra import dijkstra
from datos.red_vial import RedVial
from estructuras.haversine import haversine_m, validar_coordenada
from estructuras.quadtree import Quadtree
from estructuras.vecinos import k_mas_cercanos
from simulacion.conductor import ASIGNADO, Conductor
from simulacion.errores import (CoordenadaInvalida, FueraDeZona, SinConductores,
                                SinConexionVial, SinRutaAlcanzable)
from simulacion.geocodificacion import geocodificar
from simulacion.pasajero import Pasajero

UMBRAL_SIN_CONEXION_M = 250.0  # más lejos que esto de una calle → zona sin conexión vial


def calcular_eta_min(distancia_m: float, velocidad_kmh: float) -> float:
    """ETA en minutos.  m → km (/1000);  km / (km/h) = h;  h → min (×60)."""
    if velocidad_kmh <= 0:
        raise ValueError("La velocidad promedio debe ser positiva.")
    if not math.isfinite(distancia_m):
        return math.inf
    return distancia_m / 1000.0 / velocidad_kmh * 60.0


class Despachador:
    def __init__(self, red: RedVial, quadtree: Quadtree, conductores: dict,
                 velocidad_promedio_kmh: float = 30.0, k: int = 5):
        self.red = red
        self.quadtree = quadtree
        self.conductores = conductores  # id → Conductor
        self.velocidad_promedio_kmh = velocidad_promedio_kmh
        self.k = k
        self.pasajeros: dict[int, Pasajero] = {}
        self._siguiente_pasajero = 1

    # ------------------------------------------------------------- pasajeros
    def crear_pasajero(self, lat, lon, origen: str = "coordenadas",
                       direccion: str | None = None) -> Pasajero:
        try:
            validar_coordenada(lat, lon)
        except ValueError as exc:
            raise CoordenadaInvalida(str(exc)) from exc
        if not self.red.dentro_de_zona(lat, lon):
            z = self.red.zona.get("nombre", "la zona simulada")
            raise FueraDeZona(f"La ubicación ({lat:.5f}, {lon:.5f}) está fuera de {z}.")
        nodo, distancia = self.red.nodo_mas_cercano(lat, lon)
        if distancia > UMBRAL_SIN_CONEXION_M:
            raise SinConexionVial(
                f"El punto está a {distancia:.0f} m de la calle más cercana "
                f"(máximo {UMBRAL_SIN_CONEXION_M:.0f} m): zona sin conexión vial.")
        x, y = self.red.proyeccion.a_xy(lat, lon)
        p = Pasajero(self._siguiente_pasajero, lat, lon, nodo.id, x, y, distancia,
                     origen, direccion)
        self.pasajeros[p.id] = p
        self._siguiente_pasajero += 1
        return p

    def crear_pasajero_por_direccion(self, direccion: str) -> tuple[Pasajero, dict]:
        z = self.red.zona
        caja = (z["oeste"], z["sur"], z["este"], z["norte"]) if "oeste" in z else None
        geo = geocodificar(direccion, caja)
        p = self.crear_pasajero(geo["lat"], geo["lon"], "direccion", geo["nombre"])
        return p, geo

    # ------------------------------------------------------------ candidatos
    def buscar_candidatos(self, pasajero: Pasajero, k: int | None = None) -> dict:
        """k conductores disponibles más cercanos en línea recta (Quadtree + heap)."""
        k = k or self.k
        if not any(c.esta_disponible() for c in self._muestra_disponibles()):
            raise SinConductores("No hay conductores disponibles en este momento.")
        t0 = time.perf_counter()
        res = k_mas_cercanos(self.quadtree, pasajero.lat, pasajero.lon, pasajero.x,
                             pasajero.y, k, filtro=Conductor.esta_disponible,
                             registrar_heap=True)
        ms = (time.perf_counter() - t0) * 1000
        if not res["candidatos"]:
            raise SinConductores("No hay conductores disponibles en este momento.")
        candidatos = [{"ranking": i + 1, "conductor": c, "distancia_haversine_m": d}
                      for i, (d, c) in enumerate(res["candidatos"])]
        return {"candidatos": candidatos, "traza": res["traza"], "tiempo_ms": ms}

    def _muestra_disponibles(self):
        # Comprobación O(1) amortizada: basta con encontrar uno disponible.
        for c in self.conductores.values():
            if c.esta_disponible():
                yield c
                return

    # --------------------------------------------------------------- rutas
    def origen_de_ruta(self, c: Conductor) -> tuple[int, float, list]:
        """Nodo desde donde el conductor puede iniciar la ruta y metros extra.

        Si está en una intersección parte de allí. Si está a mitad de cuadra
        debe terminar la cuadra (no hace giros en U): parte de nodo_destino y
        suma lo que le falta de la arista actual.
        """
        if c.avance_m <= 1e-6:
            return c.nodo_origen, 0.0, []
        arista = self.red.aristas[(c.nodo_origen, c.nodo_destino)]
        resto = arista["longitud"] - c.avance_m
        tramo = self.red.tramo_de_arista(c.nodo_origen, c.nodo_destino, c.avance_m,
                                         arista["longitud"])
        return c.nodo_destino, resto, tramo

    def calcular_rutas(self, pasajero: Pasajero, candidatos: list,
                       velocidad_kmh: float | None = None,
                       registrar_traza: bool = False) -> list[dict]:
        vel = velocidad_kmh or self.velocidad_promedio_kmh
        rutas = []
        for cand in candidatos:
            c = cand["conductor"]
            origen, extra_m, tramo_inicial = self.origen_de_ruta(c)
            t0 = time.perf_counter()
            r = dijkstra(self.red.adyacencia, origen, pasajero.nodo, registrar_traza)
            ms = (time.perf_counter() - t0) * 1000
            distancia = r.distancia_m + extra_m
            geometria = [list(p) for p in tramo_inicial] + \
                [list(p) for p in self.red.geometria_camino(r.camino)] if r.alcanzable else []
            rutas.append({
                **cand,
                "nodo_origen": origen, "metros_hasta_interseccion": extra_m,
                "alcanzable": r.alcanzable,
                "distancia_vial_m": distancia if r.alcanzable else math.inf,
                "velocidad_kmh": vel,
                "eta_min": calcular_eta_min(distancia, vel) if r.alcanzable else math.inf,
                "camino": r.camino, "geometria": geometria,
                "nodos_explorados": r.nodos_explorados, "relajaciones": r.relajaciones,
                "tiempo_dijkstra_ms": ms, "traza": r.traza,
            })
        return rutas

    @staticmethod
    def elegir_menor_eta(rutas: list[dict]) -> dict:
        alcanzables = [r for r in rutas if r["alcanzable"]]
        if not alcanzables:
            raise SinRutaAlcanzable(
                "Ningún candidato tiene una ruta por calles hasta el pasajero.")
        return min(alcanzables, key=lambda r: (r["eta_min"], r["distancia_haversine_m"],
                                               r["conductor"].id))

    # -------------------------------------------------------------- asignar
    def asignar(self, pasajero: Pasajero, k: int | None = None,
                velocidad_kmh: float | None = None, registrar_traza: bool = False) -> dict:
        """Ejecuta el flujo completo y cambia el estado del conductor elegido."""
        t0 = time.perf_counter()
        busqueda = self.buscar_candidatos(pasajero, k)
        rutas = self.calcular_rutas(pasajero, busqueda["candidatos"], velocidad_kmh,
                                    registrar_traza)
        elegido = self.elegir_menor_eta(rutas)
        c: Conductor = elegido["conductor"]
        camino = elegido["camino"]
        # Programar el recorrido sobre el grafo.
        if c.avance_m <= 1e-6:
            if len(camino) >= 2:
                c.nodo_destino = camino[1]
                c.ruta = camino[2:]
            else:
                c.ruta = []  # ya está en la intersección del pasajero
        else:
            c.ruta = camino[1:]
        c.estado = ASIGNADO
        c.pasajero_id = pasajero.id
        pasajero.estado = "asignado"
        cercano_linea_recta = min(rutas, key=lambda r: r["distancia_haversine_m"])
        return {
            "pasajero": pasajero, "busqueda": busqueda, "rutas": rutas,
            "elegido": elegido,
            "mas_cercano_en_linea_recta_id": cercano_linea_recta["conductor"].id,
            "tiempo_total_ms": (time.perf_counter() - t0) * 1000,
        }

    @staticmethod
    def distancia_haversine(pasajero: Pasajero, c: Conductor) -> float:
        return haversine_m(pasajero.lat, pasajero.lon, c.lat, c.lon)
