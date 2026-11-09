"""Dijkstra · IMPLEMENTACIÓN PROPIA DEL EQUIPO (RF-05).

No usa networkx.shortest_path, networkx.dijkstra_path ni funciones de OSMnx.
Solo usa `heapq` (permitido) como cola de prioridad.

El grafo se recibe como lista de adyacencia DIRIGIDA:
    adyacencia[u] = [(v, longitud_m), ...]
por lo que se respetan los sentidos de circulación de OpenStreetMap.

Complejidad: O((V + E) log V) con cola de prioridad binaria
(cada arista puede insertar una entrada; las entradas obsoletas se descartan
al extraerlas — "eliminación perezosa").
"""
from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field


@dataclass
class ResultadoDijkstra:
    distancia_m: float                  # math.inf si no hay ruta
    camino: list = field(default_factory=list)  # nodos origen → destino
    nodos_explorados: int = 0           # nodos extraídos (fijados) de la cola
    relajaciones: int = 0               # aristas que mejoraron una distancia
    traza: list | None = None           # pasos para la animación (opcional)

    @property
    def alcanzable(self) -> bool:
        return math.isfinite(self.distancia_m)


def dijkstra(adyacencia: dict, origen, destino, registrar_traza: bool = False,
             max_pasos_traza: int = 4000) -> ResultadoDijkstra:
    """Camino más corto de `origen` a `destino` (pesos no negativos)."""
    if origen not in adyacencia:
        raise KeyError(f"El nodo origen {origen} no existe en el grafo.")
    if destino not in adyacencia:
        raise KeyError(f"El nodo destino {destino} no existe en el grafo.")

    distancia = {origen: 0.0}
    anterior: dict = {}
    procesados: set = set()
    cola = [(0.0, origen)]
    traza = [] if registrar_traza else None
    explorados = relajaciones = 0

    if traza is not None:
        traza.append({"tipo": "inicio", "nodo": origen, "dist": 0.0})

    while cola:
        d, u = heapq.heappop(cola)
        if u in procesados or d > distancia.get(u, math.inf):
            continue  # entrada obsoleta
        procesados.add(u)
        explorados += 1
        registrar = traza is not None and len(traza) < max_pasos_traza
        if registrar:
            traza.append({"tipo": "extraer", "nodo": u, "dist": round(d, 2),
                          "pendientes": len(cola)})
        if u == destino:
            break
        mejoras = []
        for v, peso in adyacencia[u]:
            if v in procesados:
                continue
            nueva = d + peso
            if nueva < distancia.get(v, math.inf):
                distancia[v] = nueva
                anterior[v] = u
                heapq.heappush(cola, (nueva, v))
                relajaciones += 1
                if registrar:
                    mejoras.append([v, round(nueva, 2)])
        if registrar and mejoras:
            traza.append({"tipo": "relajar", "nodo": u, "mejoras": mejoras})

    if destino not in procesados:
        if traza is not None:
            traza.append({"tipo": "sin_ruta"})
        return ResultadoDijkstra(math.inf, [], explorados, relajaciones, traza)

    camino = reconstruir_camino(anterior, origen, destino)
    if traza is not None:
        traza.append({"tipo": "ruta", "camino": camino,
                      "dist": round(distancia[destino], 2)})
    return ResultadoDijkstra(distancia[destino], camino, explorados, relajaciones, traza)


def reconstruir_camino(anterior: dict, origen, destino) -> list:
    """Sigue los predecesores desde el destino hasta el origen."""
    camino = [destino]
    while camino[-1] != origen:
        camino.append(anterior[camino[-1]])
    camino.reverse()
    return camino
