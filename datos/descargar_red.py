"""RF-01 · Descarga la red vial real de Comas (OpenStreetMap) y la guarda localmente.

Se ejecuta UNA sola vez:
    python -m datos.descargar_red

Genera:
    datos/comas_red.graphml       grafo vial dirigido (OSMnx, network_type="drive")
    datos/comas_edificios.json    huellas de edificios (si existen en OSM)
    datos/zona.json               metadatos de la zona seleccionada

OSMnx y NetworkX se usan aquí SOLO para descargar, cargar y almacenar el grafo,
tal como permite el documento del proyecto.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

CARPETA = Path(__file__).resolve().parent

# Zona documentada: sector central de Comas (Lima, Perú).
# Incluye la Av. Túpac Amaru, la Av. Universitaria y urbanizaciones aledañas.
ZONA = {
    "nombre": "Comas (sector central), Lima, Perú",
    "norte": -11.9300,
    "sur": -11.9520,
    "oeste": -77.0680,
    "este": -77.0460,
}


# Servidores Overpass alternativos: si el principal está saturado se prueba el siguiente.
SERVIDORES_OVERPASS = [
    "https://overpass-api.de/api",
    "https://overpass.private.coffee/api",
    "https://overpass.kumi.systems/api",
]


def _con_reintentos(funcion, *args, **kwargs):
    import time
    import osmnx as ox
    ultimo_error = None
    for intento in range(10):
        for servidor in SERVIDORES_OVERPASS:
            ox.settings.overpass_url = servidor
            try:
                return funcion(*args, **kwargs)
            except Exception as exc:  # servidor saturado o caído
                ultimo_error = exc
                print(f"  {servidor} falló ({type(exc).__name__}); probando otro servidor …")
        espera = min(120, 15 * 2 ** intento)  # espera exponencial
        print(f"  Reintento {intento + 1}: esperando {espera} s …", flush=True)
        time.sleep(espera)
    raise RuntimeError(f"Ningún servidor Overpass respondió: {ultimo_error}")


def descargar(zona: dict = ZONA, con_edificios: bool = True) -> None:
    import osmnx as ox

    ox.settings.use_cache = True
    ox.settings.cache_folder = str(CARPETA / "cache_osm")
    ox.settings.requests_timeout = 240
    ox.settings.overpass_rate_limit = False
    ox.settings.http_user_agent = "ConductorCercano-USMP/1.0 (proyecto academico)"
    bbox = (zona["oeste"], zona["sur"], zona["este"], zona["norte"])  # (left, bottom, right, top)

    print(f"Descargando red vial: {zona['nombre']} …")
    grafo = _con_reintentos(ox.graph_from_bbox, bbox, network_type="drive", simplify=True)
    ox.save_graphml(grafo, CARPETA / "comas_red.graphml")
    print(f"  nodos={grafo.number_of_nodes()} aristas={grafo.number_of_edges()}")

    n_edificios = 0
    if con_edificios:
        print("Descargando huellas de edificios …")
        try:
            gdf = _con_reintentos(ox.features_from_bbox, bbox, tags={"building": True})
            edificios = []
            for _, fila in gdf.iterrows():
                geom = fila.geometry
                if geom is None or geom.geom_type not in ("Polygon", "MultiPolygon"):
                    continue
                poligonos = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
                niveles = fila.get("building:levels")
                altura = fila.get("height")
                for p in poligonos:
                    anillo = [[round(y, 6), round(x, 6)] for x, y in p.exterior.coords]
                    edificios.append({
                        "contorno": anillo,  # [lat, lon]
                        "niveles": _num(niveles),
                        "altura_m": _num(altura),
                    })
            (CARPETA / "comas_edificios.json").write_text(
                json.dumps({"fuente": "OpenStreetMap contributors (ODbL)", "edificios": edificios}),
                encoding="utf-8")
            n_edificios = len(edificios)
            print(f"  edificios={n_edificios}")
        except Exception as exc:  # sin edificios en OSM o error de red
            print(f"  No se pudieron obtener edificios: {exc}")

    meta = dict(zona)
    meta.update({
        "fuente": "OpenStreetMap contributors (ODbL 1.0)",
        "herramienta": f"OSMnx {ox.__version__} · graph_from_bbox(network_type='drive')",
        "descargado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "nodos_originales": grafo.number_of_nodes(),
        "aristas_originales": grafo.number_of_edges(),
        "edificios": n_edificios,
    })
    (CARPETA / "zona.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    from datos.red_vial import exportar_json
    exportar_json()
    print("Listo. Archivos guardados en datos/ (incluye comas_red.json para el servidor web)")


def _num(valor):
    try:
        if valor is None:
            return None
        v = float(str(valor).replace("m", "").strip())
        return v if v == v else None  # descarta NaN
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sin-edificios", action="store_true")
    args = ap.parse_args()
    descargar(con_edificios=not args.sin_edificios)
