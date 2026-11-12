"""Verificación integral del proyecto (ejecutar antes de la sustentación).

    .venv\\Scripts\\python verificar.py           # comprobaciones + pytest
    .venv\\Scripts\\python verificar.py --e2e     # además pruebas de navegador (Playwright)
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
resultados: list[tuple[bool, str, str]] = []


def comprobar(nombre: str):
    def deco(fn):
        try:
            detalle = fn()
            resultados.append((True, nombre, detalle or ""))
        except Exception as exc:  # se reporta y se continúa
            resultados.append((False, nombre, f"{type(exc).__name__}: {exc}"))
        return fn
    return deco


@comprobar("Python 3.11 o superior")
def _():
    assert sys.version_info >= (3, 11), sys.version
    return sys.version.split()[0]


@comprobar("main.py expone la aplicación ASGI `app`")
def _():
    import main
    from fastapi import FastAPI
    assert isinstance(main.app, FastAPI)
    return "python -m uvicorn main:app"


@comprobar("RF-01 · red vial guardada localmente")
def _():
    for f in ["comas_red.graphml", "zona.json"]:
        assert (RAIZ / "datos" / f).exists(), f"falta datos/{f}"
    z = json.loads((RAIZ / "datos" / "zona.json").read_text(encoding="utf-8"))
    return f"{z['nombre']} · {z['nodos_originales']} nodos · descargado {z['descargado'][:10]}"


@comprobar("Nomenclatura obligatoria (clases)")
def _():
    from estructuras.quadtree import NodoQuadtree, Quadtree  # noqa: F401
    from simulacion.conductor import Conductor  # noqa: F401
    from simulacion.despachador import Despachador  # noqa: F401
    from simulacion.pasajero import Pasajero  # noqa: F401
    return "Conductor, Pasajero, NodoQuadtree, Quadtree, Despachador"


@comprobar("Sin bibliotecas prohibidas en la solución")
def _():
    prohibido = re.compile(r"shortest_path|dijkstra_path|single_source|KDTree|cKDTree|import rtree|"
                           r"STRtree|import h3|from h3|nearest_nodes|ox\.distance|ox\.routing")
    hallazgos = []
    for carpeta in ["estructuras", "algoritmos", "simulacion", "backend"]:
        for f in (RAIZ / carpeta).rglob("*.py"):
            for i, linea in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if prohibido.search(linea) and not linea.strip().startswith("#") and "No usa" not in linea:
                    hallazgos.append(f"{f.relative_to(RAIZ)}:{i}")
    assert not hallazgos, ", ".join(hallazgos)
    return "NetworkX solo en benchmark/ (validación) y para leer el grafo"


@comprobar("Flujo completo sobre la red real (API)")
def _():
    from fastapi.testclient import TestClient

    from backend.app import crear_app
    with TestClient(crear_app()) as c:
        e = c.get("/api/estado").json()
        assert e["listo"], e
        p = c.post("/api/pasajeros", json={"lat": -11.9410, "lon": -77.0560}).json()["pasajero"]
        r = c.post("/api/despacho/asignar", json={"pasajero_id": p["id"], "k": 5}).json()
        etas = [x["eta_min"] for x in r["rutas"] if x["alcanzable"]]
        assert r["asignado"]["eta_min"] == min(etas)
        assert c.post("/api/simulacion/avanzar", json={"turnos": 2}).json()["turno"] == 2
        g = c.post("/api/pasajeros", json={"direccion": "zz-direccion-inexistente-qwerty"})
        assert g.status_code in (404, 503, 504), g.text  # error explícito, nunca coordenadas inventadas
        return (f"{e['red']['nodos']} nodos · conductor {r['asignado']['conductor_id']} con ETA "
                f"{r['asignado']['eta_min']} min · geocodificación fallida → HTTP {g.status_code}")


@comprobar("RF-07 · al menos 3 mapas Folium")
def _():
    mapas = sorted((RAIZ / "mapas").glob("asignacion_*.html"))
    assert len(mapas) >= 3, "ejecuta python -m mapas.generar_mapas"
    return ", ".join(m.name for m in mapas)


@comprobar("RF-09 · benchmark ejecutado (300 / 3 000 / 30 000)")
def _():
    r = json.loads((RAIZ / "benchmark" / "resultados.json").read_text(encoding="utf-8"))
    tam = [f["conductores"] for f in r["busqueda"]]
    assert tam == [300, 3000, 30000], tam
    assert all(f["resultados_identicos"] for f in r["busqueda"])
    assert r["dijkstra"]["todas_iguales"]
    for g in ["grafico_busqueda.png", "grafico_revisados.png", "grafico_dijkstra.png"]:
        assert (RAIZ / "benchmark" / g).exists(), g
    u = r["busqueda"][-1]
    return f"30 000: lineal {u['lineal']['mediana_ms']:.2f} ms vs Quadtree {u['quadtree']['mediana_ms']:.2f} ms ({r['fecha'][:10]})"


@comprobar("Presentación web: 19 diapositivas")
def _():
    idx = (RAIZ / "frontend" / "js" / "slides" / "index.js").read_text(encoding="utf-8")
    n = len(re.findall(r"^import s\d\d ", idx, re.M))
    assert n == 19, n
    texto = " ".join(p.read_text(encoding="utf-8").lower() for p in (RAIZ / "frontend" / "js").rglob("*.js"))
    for prohibida in ["próximamente", "contenido pendiente", "demo placeholder", "todavía no está implementada"]:
        assert prohibida not in texto, prohibida
    return "frontend/index.html + js/slides/s01…s19"


@comprobar("PowerPoint complementario")
def _():
    from pptx import Presentation
    ruta = RAIZ / "entregables" / "Presentacion_Conductor_Cercano_USMP.pptx"
    p = Presentation(ruta)
    assert len(p.slides) == 19, len(p.slides)
    texto = " ".join(sh.text_frame.text for sh in p.slides[0].shapes if sh.has_text_frame)
    for nombre in ["Antezana Vargas Jorge Jose", "Andres Bardales Moreno", "Vanessa Guerrero Yañez"]:
        assert nombre in texto, nombre
    return f"{ruta.name} · 19 diapositivas · integrantes correctos"


def pytest_(args):
    cmd = [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider",
           "--junitxml=tests/resultados_junit.xml", "tests"] + (["tests_e2e"] if args.e2e else [])
    r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
    ultima = [l for l in r.stdout.strip().splitlines() if re.search(r"\d+ (passed|failed|error)", l)]
    resultados.append((r.returncode == 0, "pytest" + (" + E2E" if args.e2e else ""), ultima[-1] if ultima else r.stdout[-300:]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--e2e", action="store_true")
    pytest_(ap.parse_args())
    print("\n  VERIFICACIÓN · Asignación del conductor más cercano\n")
    for ok, nombre, detalle in resultados:
        print(f"  {'[OK]   ' if ok else '[FALLA]'} {nombre}\n           {detalle}")
    fallas = sum(not ok for ok, _, _ in resultados)
    print(f"\n  {len(resultados) - fallas}/{len(resultados)} comprobaciones correctas.\n")
    sys.exit(1 if fallas else 0)
