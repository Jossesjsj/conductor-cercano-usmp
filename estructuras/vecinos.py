"""k vecinos más cercanos con Quadtree + heap (RF-04).

Búsqueda espacial PROGRESIVA (no recorre toda la flota):

1. Se consulta un cuadrado de semilado r centrado en el pasajero
   (Quadtree.buscar_en_rectangulo, que poda los cuadrantes que no intersectan).
2. A cada conductor disponible encontrado se le calcula la distancia Haversine
   y se mantiene un MAX-HEAP de tamaño k (heapq con distancias negativas):
   costo O(m log k) para m conductores dentro del cuadrado.
3. ¿Es correcto detenerse? Todo conductor que NO apareció está fuera del
   cuadrado, por lo tanto a más de r del pasajero. Si ya hay k candidatos y el
   k-ésimo está a distancia ≤ r, ningún conductor no visto puede ser mejor:
   el resultado es exacto. Se usa un margen (0,995·r) para cubrir la mínima
   diferencia entre la proyección local y Haversine.
4. Si no se cumple (pocos conductores o el k-ésimo está en una esquina del
   cuadrado, fuera del círculo de radio r), se DUPLICA r y se repite.
   Se detiene también cuando el cuadrado ya cubre toda el área indexada
   (entonces se devuelven los que haya, aunque sean menos de k).
"""
from __future__ import annotations

import heapq
import itertools

from estructuras.haversine import haversine_m
from estructuras.quadtree import Quadtree, Rectangulo

MARGEN = 0.995


def k_mas_cercanos(quadtree: Quadtree, lat: float, lon: float, x: float, y: float,
                   k: int, filtro=None, radio_inicial_m: float = 250.0,
                   registrar_heap: bool = False) -> dict:
    """Devuelve {"candidatos": [(distancia_m, elemento), ...] ordenados, "traza": [...]}."""
    if k < 1:
        raise ValueError("k debe ser al menos 1.")
    raiz = quadtree.raiz.limites
    r = radio_inicial_m
    traza = []
    desempate = itertools.count()
    while True:
        rect = Rectangulo(x - r, y - r, x + r, y + r)
        stats: dict = {}
        encontrados = quadtree.buscar_en_rectangulo(rect, filtro=filtro, estadisticas=stats)
        heap: list = []  # max-heap de tamaño k: (-distancia, desempate, elemento)
        operaciones = [] if registrar_heap else None
        for e in encontrados:
            d = haversine_m(lat, lon, e.lat, e.lon)
            if len(heap) < k:
                heapq.heappush(heap, (-d, next(desempate), e))
                op = "insertar"
            elif d < -heap[0][0]:
                saliente = heap[0][2].id
                heapq.heapreplace(heap, (-d, next(desempate), e))
                op = "reemplazar_raiz"
            else:
                op = "descartar"
            if operaciones is not None and len(operaciones) < 300:
                registro = {"op": op, "id": e.id, "d": round(d, 1),
                            # arreglo interno del heap (la raíz es el más LEJANO de los k)
                            "heap": [[round(-nd, 1), x.id] for nd, _, x in heap]}
                if op == "reemplazar_raiz":
                    registro["sale"] = saliente
                operaciones.append(registro)
        cubre_todo = (rect.xmin <= raiz.xmin and rect.ymin <= raiz.ymin
                      and rect.xmax >= raiz.xmax and rect.ymax >= raiz.ymax)
        kesima = -heap[0][0] if len(heap) == k else None
        exacto = kesima is not None and kesima <= r * MARGEN
        traza.append({
            "radio_m": round(r, 1),
            "rectangulo": [round(v, 2) for v in rect.a_lista()],
            "encontrados": len(encontrados),
            "nodos_visitados": len(stats.get("visitados", [])),
            "nodos_descartados": len(stats.get("descartados", [])),
            "elementos_revisados": stats.get("elementos_revisados", 0),
            "kesima_distancia_m": None if kesima is None else round(kesima, 1),
            "suficiente": bool(exacto or cubre_todo),
            "motivo": ("k candidatos dentro del radio: resultado exacto" if exacto else
                       "el cuadrado ya cubre toda el área" if cubre_todo else
                       "menos de k candidatos" if kesima is None else
                       "el k-ésimo está fuera del círculo de radio r: se amplía"),
            "visitados": stats.get("visitados", []),
            "descartados": stats.get("descartados", []),
            "operaciones_heap": operaciones,
        })
        if exacto or cubre_todo:
            ordenados = sorted(((-nd, e) for nd, _, e in heap), key=lambda t: t[0])
            return {"candidatos": ordenados, "traza": traza}
        r *= 2


def k_mas_cercanos_lineal(elementos, lat: float, lon: float, k: int, filtro=None) -> list:
    """Línea base para el benchmark: revisa TODOS los elementos. O(n log k)."""
    heap: list = []
    contador = itertools.count()
    for e in elementos:
        if filtro is not None and not filtro(e):
            continue
        d = haversine_m(lat, lon, e.lat, e.lon)
        if len(heap) < k:
            heapq.heappush(heap, (-d, next(contador), e))
        elif d < -heap[0][0]:
            heapq.heapreplace(heap, (-d, next(contador), e))
    return sorted(((-nd, e) for nd, _, e in heap), key=lambda t: t[0])
