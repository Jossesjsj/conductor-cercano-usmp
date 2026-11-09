"""Clase Conductor (nomenclatura obligatoria)."""
from __future__ import annotations

from dataclasses import dataclass, field

DISPONIBLE = "disponible"
OCUPADO = "ocupado"
ASIGNADO = "asignado"  # en camino a recoger a un pasajero
ESTADOS = (DISPONIBLE, OCUPADO, ASIGNADO)


@dataclass(eq=False)
class Conductor:
    id: int
    lat: float
    lon: float
    x: float                      # metros (proyección local), lo usa el Quadtree
    y: float
    estado: str = DISPONIBLE
    velocidad_kmh: float = 30.0
    # Posición sobre el grafo: está en la arista (nodo_origen → nodo_destino)
    # a `avance_m` metros de nodo_origen. Con avance 0 está en la intersección.
    nodo_origen: int = 0
    nodo_destino: int = 0
    avance_m: float = 0.0
    ruta: list = field(default_factory=list)  # nodos que faltan recorrer después de nodo_destino
    turnos_ocupado: int = 0
    pasajero_id: int | None = None

    @property
    def nodo(self) -> int:
        """Nodo vial asociado: la intersección donde está o la que acaba de dejar."""
        return self.nodo_origen

    def esta_disponible(self) -> bool:
        return self.estado == DISPONIBLE

    def a_dict(self) -> dict:
        return {
            "id": self.id, "lat": round(self.lat, 6), "lon": round(self.lon, 6),
            "x": round(self.x, 2), "y": round(self.y, 2), "estado": self.estado,
            "velocidad_kmh": self.velocidad_kmh, "nodo": self.nodo_origen,
            "arista": [self.nodo_origen, self.nodo_destino], "avance_m": round(self.avance_m, 1),
            "pasajero_id": self.pasajero_id,
        }
