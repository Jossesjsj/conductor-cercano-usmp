"""Clase Pasajero (nomenclatura obligatoria)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Pasajero:
    id: int
    lat: float                 # coordenada solicitada
    lon: float
    nodo: int                  # intersección vial más cercana
    x: float                   # metros (proyección local)
    y: float
    distancia_a_nodo_m: float  # qué tan lejos quedó de la red vial
    origen: str = "coordenadas"  # "coordenadas" | "direccion" | "mapa"
    direccion: str | None = None
    estado: str = "esperando"  # "esperando" | "asignado" | "recogido"

    def a_dict(self) -> dict:
        return {"id": self.id, "lat": round(self.lat, 6), "lon": round(self.lon, 6),
                "nodo": self.nodo, "x": round(self.x, 2), "y": round(self.y, 2),
                "distancia_a_nodo_m": round(self.distancia_a_nodo_m, 1),
                "origen": self.origen, "direccion": self.direccion, "estado": self.estado}
