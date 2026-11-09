"""Proyección local: convierte (lat, lon) a metros (x, y) alrededor de un origen.

Se usa una proyección equirectangular local. En un área de pocos km la
diferencia frente a Haversine es muy pequeña (se mide en las pruebas), lo que
basta para INDEXAR en el Quadtree. Las distancias que se reportan y ordenan
siempre se calculan con Haversine sobre lat/lon, no con esta proyección.
"""
import math

from estructuras.haversine import RADIO_TIERRA_M


class ProyeccionLocal:
    def __init__(self, lat0: float, lon0: float):
        self.lat0 = lat0
        self.lon0 = lon0
        self._kx = math.radians(1) * RADIO_TIERRA_M * math.cos(math.radians(lat0))
        self._ky = math.radians(1) * RADIO_TIERRA_M

    def a_xy(self, lat: float, lon: float) -> tuple[float, float]:
        """(lat, lon) → (x hacia el este, y hacia el norte) en metros."""
        return (lon - self.lon0) * self._kx, (lat - self.lat0) * self._ky

    def a_latlon(self, x: float, y: float) -> tuple[float, float]:
        """(x, y) en metros → (lat, lon)."""
        return self.lat0 + y / self._ky, self.lon0 + x / self._kx
