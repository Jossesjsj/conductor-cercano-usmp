"""Fórmula de Haversine · IMPLEMENTACIÓN PROPIA DEL EQUIPO (RF-04).

Calcula la distancia sobre la superficie terrestre (círculo máximo) entre dos
puntos dados por latitud y longitud en grados:

    a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
    c = 2 · atan2(√a, √(1−a))
    d = R · c

φ = latitud (rad), λ = longitud (rad), R = radio medio de la Tierra.

Es la distancia "en línea recta" sobre la esfera. NO es la distancia por calles:
esa la calcula Dijkstra sobre el grafo vial.
"""
import math

RADIO_TIERRA_M = 6_371_008.8  # radio medio (IUGG), en metros


def validar_coordenada(lat, lon) -> None:
    """Lanza ValueError si la coordenada no es válida."""
    if isinstance(lat, bool) or isinstance(lon, bool) or \
            not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        raise ValueError("La latitud y la longitud deben ser números.")
    if math.isnan(lat) or math.isnan(lon) or math.isinf(lat) or math.isinf(lon):
        raise ValueError("La coordenada contiene valores no finitos.")
    if not -90.0 <= lat <= 90.0:
        raise ValueError(f"Latitud fuera de rango [-90, 90]: {lat}")
    if not -180.0 <= lon <= 180.0:
        raise ValueError(f"Longitud fuera de rango [-180, 180]: {lon}")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia geográfica en METROS entre (lat1, lon1) y (lat2, lon2)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    a = min(1.0, max(0.0, a))  # protege contra errores de redondeo
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return RADIO_TIERRA_M * c


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia geográfica en KILÓMETROS."""
    return haversine_m(lat1, lon1, lat2, lon2) / 1000.0


def haversine_detalle(lat1, lon1, lat2, lon2) -> dict:
    """Devuelve los valores intermedios de la fórmula (para la presentación)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlam = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    a = min(1.0, max(0.0, a))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return {
        "phi1_rad": phi1, "phi2_rad": phi2,
        "delta_phi_rad": dphi, "delta_lambda_rad": dlam,
        "a": a, "c": c, "radio_m": RADIO_TIERRA_M,
        "distancia_m": RADIO_TIERRA_M * c,
    }
