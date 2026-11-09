"""RF-08 · Geocodificación de una dirección de texto (Nominatim / OpenStreetMap).

Se hace una consulta HTTP real al servicio público Nominatim. Si la consulta
falla, tarda demasiado o no encuentra la dirección, se lanza un error explícito:
NUNCA se inventan coordenadas.

Política de uso de Nominatim: máximo 1 consulta por segundo e identificación
mediante User-Agent. Se guarda una caché local en datos/cache_geocodificacion.json
para no repetir consultas idénticas.
"""
from __future__ import annotations

import json
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from simulacion.errores import DireccionNoEncontrada, ServicioNoDisponible, TiempoAgotado

URL_NOMINATIM = "https://nominatim.openstreetmap.org/search"
AGENTE = "ConductorCercano-USMP/1.0 (proyecto academico AED II)"
RUTA_CACHE = Path(__file__).resolve().parent.parent / "datos" / "cache_geocodificacion.json"
_bloqueo = threading.Lock()
_ultima_consulta = 0.0


def _leer_cache() -> dict:
    try:
        return json.loads(RUTA_CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def geocodificar(direccion: str, caja: tuple | None = None, tiempo_max_s: float = 8.0) -> dict:
    """Devuelve {"lat", "lon", "nombre", "fuente"} o lanza un ErrorDespacho.

    caja = (oeste, sur, este, norte) para priorizar resultados en la zona.
    """
    global _ultima_consulta
    texto = (direccion or "").strip()
    if len(texto) < 3:
        raise DireccionNoEncontrada("La dirección está vacía o es demasiado corta.")
    clave = texto.lower()
    cache = _leer_cache()
    if clave in cache:
        return {**cache[clave], "fuente": "cache local de Nominatim"}

    parametros = {"q": texto, "format": "jsonv2", "limit": 1, "countrycodes": "pe"}
    if caja:
        parametros["viewbox"] = ",".join(str(v) for v in caja)
    url = f"{URL_NOMINATIM}?{urllib.parse.urlencode(parametros)}"
    peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE,
                                                    "Accept-Language": "es"})
    with _bloqueo:  # respeta 1 consulta/segundo
        espera = 1.0 - (time.monotonic() - _ultima_consulta)
        if espera > 0:
            time.sleep(espera)
        _ultima_consulta = time.monotonic()
        try:
            with urllib.request.urlopen(peticion, timeout=tiempo_max_s) as resp:
                datos = json.loads(resp.read().decode("utf-8"))
        except (socket.timeout, TimeoutError) as exc:
            raise TiempoAgotado(
                f"La geocodificación tardó más de {tiempo_max_s:.0f} s. "
                "Ingresa coordenadas o elige un punto en el mapa.") from exc
        except urllib.error.URLError as exc:
            if isinstance(getattr(exc, "reason", None), (socket.timeout, TimeoutError)):
                raise TiempoAgotado("La geocodificación tardó demasiado.") from exc
            raise ServicioNoDisponible(
                f"No se pudo contactar al servicio de geocodificación ({exc}). "
                "Usa coordenadas o un punto del mapa.") from exc
    if not datos:
        raise DireccionNoEncontrada(f"No se encontró la dirección «{texto}».")
    r = datos[0]
    resultado = {"lat": float(r["lat"]), "lon": float(r["lon"]),
                 "nombre": r.get("display_name", texto)}
    cache[clave] = resultado
    try:
        RUTA_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError:
        pass
    return {**resultado, "fuente": "Nominatim (OpenStreetMap)"}
