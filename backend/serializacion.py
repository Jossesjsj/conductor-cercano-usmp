"""Conversión de resultados del dominio a JSON (sin infinitos ni objetos)."""
from __future__ import annotations

import math


def num(v, dec=2):
    if v is None:
        return None
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return round(v, dec)


def ruta_a_dict(r: dict, incluir_traza: bool = False) -> dict:
    c = r["conductor"]
    d = {
        "ranking": r["ranking"], "conductor_id": c.id, "estado": c.estado,
        "conductor": c.a_dict(),
        "distancia_haversine_m": num(r["distancia_haversine_m"], 1),
        "alcanzable": r["alcanzable"],
        "distancia_vial_m": num(r["distancia_vial_m"], 1),
        "velocidad_kmh": r["velocidad_kmh"],
        "eta_min": num(r["eta_min"], 2),
        "nodo_origen": r["nodo_origen"],
        "metros_hasta_interseccion": num(r["metros_hasta_interseccion"], 1),
        "nodos_explorados": r["nodos_explorados"], "relajaciones": r["relajaciones"],
        "tiempo_dijkstra_ms": num(r["tiempo_dijkstra_ms"], 3),
        "camino": r["camino"],
        "geometria": [[round(x, 1), round(y, 1)] for x, y in r["geometria"]],
    }
    if incluir_traza:
        d["traza"] = r["traza"]
    return d


def candidato_a_dict(c: dict) -> dict:
    return {"ranking": c["ranking"], "conductor_id": c["conductor"].id,
            "conductor": c["conductor"].a_dict(),
            "distancia_haversine_m": num(c["distancia_haversine_m"], 1)}


def traza_busqueda(traza: list) -> list:
    return [{k: v for k, v in paso.items()} for paso in traza]
