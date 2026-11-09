"""Rutas didácticas: Haversine, traza de Dijkstra y Quadtree de demostración."""
from __future__ import annotations

import random
import threading
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, Request

from algoritmos.dijkstra import dijkstra
from backend.routes.simulacion import est
from backend.schemas import (BuscarRectangulo, DemoEliminar, DemoInsertar, DemoMover,
                             DemoReiniciar, DijkstraTraza, Haversine)
from backend.serializacion import num
from estructuras.haversine import haversine_detalle
from estructuras.quadtree import Quadtree, Rectangulo

router = APIRouter(prefix="/api", tags=["Algoritmos (didáctico)"])


@router.post("/haversine", summary="Distancia Haversine propia + distancia vial con Dijkstra")
def haversine(datos: Haversine, request: Request):
    detalle = haversine_detalle(datos.lat1, datos.lon1, datos.lat2, datos.lon2)
    respuesta = {"detalle": detalle, "distancia_m": detalle["distancia_m"], "vial": None}
    e = est(request)
    if e.sim is not None and e.sim.red.dentro_de_zona(datos.lat1, datos.lon1) \
            and e.sim.red.dentro_de_zona(datos.lat2, datos.lon2):
        red = e.sim.red
        a, da = red.nodo_mas_cercano(datos.lat1, datos.lon1)
        b, db = red.nodo_mas_cercano(datos.lat2, datos.lon2)
        r = dijkstra(red.adyacencia, a.id, b.id)
        respuesta["vial"] = {
            "nodo_a": a.id, "nodo_b": b.id, "alcanzable": r.alcanzable,
            "distancia_m": num(r.distancia_m, 1),
            "nodos_explorados": r.nodos_explorados,
            "geometria": [[round(x, 1), round(y, 1)] for x, y in red.geometria_camino(r.camino)],
            "factor_desvio": num(r.distancia_m / detalle["distancia_m"], 3)
            if r.alcanzable and detalle["distancia_m"] > 0 else None,
        }
        xa, ya = red.proyeccion.a_xy(datos.lat1, datos.lon1)
        xb, yb = red.proyeccion.a_xy(datos.lat2, datos.lon2)
        respuesta["xy"] = [[round(xa, 1), round(ya, 1)], [round(xb, 1), round(yb, 1)]]
    return respuesta


@router.post("/dijkstra/traza", summary="Ejecución real de Dijkstra con traza paso a paso")
def dijkstra_traza(datos: DijkstraTraza, request: Request):
    sim = est(request).requerir_sim()
    red = sim.red
    pa = red.proyeccion.a_latlon(datos.origen.x, datos.origen.y)
    pb = red.proyeccion.a_latlon(datos.destino.x, datos.destino.y)
    a, _ = red.nodo_mas_cercano(*pa)
    b, _ = red.nodo_mas_cercano(*pb)
    r = dijkstra(red.adyacencia, a.id, b.id, registrar_traza=True, max_pasos_traza=12000)
    return {"origen": a.id, "destino": b.id, "alcanzable": r.alcanzable,
            "distancia_m": num(r.distancia_m, 1), "nodos_explorados": r.nodos_explorados,
            "relajaciones": r.relajaciones, "camino": r.camino,
            "geometria": [[round(x, 1), round(y, 1)] for x, y in red.geometria_camino(r.camino)],
            "traza": r.traza}


# --------------------------------------------------------------------------
# Quadtree de demostración (espacio 100 × 100) para explicar la estructura
# paso a paso. Usa EXACTAMENTE la misma clase Quadtree que el despachador.
# --------------------------------------------------------------------------
@dataclass(eq=False)
class PuntoDemo:
    id: int
    x: float
    y: float


class Demo:
    def __init__(self):
        self.bloqueo = threading.Lock()
        self.reiniciar(DemoReiniciar())

    def reiniciar(self, cfg: DemoReiniciar):
        self.q = Quadtree(Rectangulo(0, 0, 100, 100), capacidad=cfg.capacidad,
                          profundidad_maxima=7)
        self.q.eventos = []
        self.puntos: dict[int, PuntoDemo] = {}
        self.sig = 1
        rng = random.Random(cfg.semilla)
        for _ in range(cfg.cantidad):
            if cfg.agrupados:
                x, y = min(100, max(0, rng.gauss(30, 8))), min(100, max(0, rng.gauss(65, 8)))
            else:
                x, y = rng.uniform(1, 99), rng.uniform(1, 99)
            self.insertar(round(x, 1), round(y, 1))

    def insertar(self, x, y) -> PuntoDemo:
        p = PuntoDemo(self.sig, x, y)
        self.sig += 1
        self.q.insertar(p)
        self.puntos[p.id] = p
        return p

    def foto(self, eventos_desde: int = 0) -> dict:
        return {"nodos": self.q.a_lista_nodos(), "estadisticas": self.q.estadisticas(),
                "puntos": [[p.id, p.x, p.y] for p in self.puntos.values()],
                "eventos": self.q.eventos[eventos_desde:]}


DEMO = Demo()


@router.get("/quadtree/demo", summary="Estado del Quadtree de demostración")
def demo_estado():
    with DEMO.bloqueo:
        return DEMO.foto(len(DEMO.q.eventos))


@router.post("/quadtree/demo/reiniciar")
def demo_reiniciar(datos: DemoReiniciar):
    with DEMO.bloqueo:
        DEMO.reiniciar(datos)
        return DEMO.foto()


@router.post("/quadtree/demo/insertar")
def demo_insertar(datos: DemoInsertar):
    with DEMO.bloqueo:
        n = len(DEMO.q.eventos)
        p = DEMO.insertar(datos.x, datos.y)
        return {**DEMO.foto(n), "id": p.id}


@router.post("/quadtree/demo/eliminar")
def demo_eliminar(datos: DemoEliminar):
    with DEMO.bloqueo:
        p = DEMO.puntos.pop(datos.id, None)
        if p is None:
            raise HTTPException(404, detail={"codigo": "punto_no_encontrado",
                                             "mensaje": f"No existe el punto {datos.id}."})
        n = len(DEMO.q.eventos)
        DEMO.q.eliminar(p)
        return DEMO.foto(n)


@router.post("/quadtree/demo/mover")
def demo_mover(datos: DemoMover):
    with DEMO.bloqueo:
        p = DEMO.puntos.get(datos.id)
        if p is None:
            raise HTTPException(404, detail={"codigo": "punto_no_encontrado",
                                             "mensaje": f"No existe el punto {datos.id}."})
        n = len(DEMO.q.eventos)
        DEMO.q.actualizar_posicion(p, datos.x, datos.y)
        return DEMO.foto(n)


@router.post("/quadtree/demo/buscar")
def demo_buscar(datos: BuscarRectangulo):
    with DEMO.bloqueo:
        stats: dict = {}
        res = DEMO.q.buscar_en_rectangulo(
            Rectangulo(datos.xmin, datos.ymin, datos.xmax, datos.ymax), estadisticas=stats)
        return {"encontrados": [p.id for p in res],
                "visitados": stats.get("visitados", []),
                "descartados": stats.get("descartados", []),
                "elementos_revisados": stats.get("elementos_revisados", 0),
                "total": len(DEMO.puntos)}
