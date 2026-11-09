"""Benchmark, pruebas automatizadas y mapas Folium (procesos en segundo plano)."""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Request

from backend.estado import RAIZ
from backend.routes.simulacion import est
from backend.schemas import EjecutarBenchmark

router = APIRouter(prefix="/api", tags=["Benchmark, pruebas y mapas"])


@router.get("/benchmark/resultados", summary="Resultados medidos (o 'pendiente' si no hay)")
def benchmark_resultados(request: Request):
    ruta = RAIZ / "benchmark" / "resultados.json"
    proceso = est(request).benchmark.estado()
    if not ruta.exists():
        return {"estado": "pendiente", "proceso": proceso}
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    graficos = sorted(p.name for p in (RAIZ / "benchmark").glob("*.png"))
    return {"estado": "listo", "resultados": datos, "graficos": graficos, "proceso": proceso}


@router.post("/benchmark/ejecutar", summary="Ejecuta el benchmark en otro proceso (no bloquea)")
def benchmark_ejecutar(datos: EjecutarBenchmark, request: Request):
    return est(request).benchmark.ejecutar(
        ["--repeticiones", str(datos.repeticiones),
         "--consultas-dijkstra", str(datos.consultas_dijkstra),
         "--semilla", str(datos.semilla)])


@router.get("/benchmark/estado")
def benchmark_estado(request: Request):
    return est(request).benchmark.estado()


def _leer_junit() -> dict | None:
    ruta = RAIZ / "tests" / "resultados_junit.xml"
    if not ruta.exists():
        return None
    raiz = ET.parse(ruta).getroot()
    suite = raiz if raiz.tag == "testsuite" else raiz.find("testsuite")
    casos = []
    for caso in suite.iter("testcase"):
        if caso.find("failure") is not None or caso.find("error") is not None:
            estado = "falló"
        elif caso.find("skipped") is not None:
            estado = "omitida"
        else:
            estado = "pasó"
        casos.append({"archivo": caso.get("classname", "").replace("tests.", ""),
                      "nombre": caso.get("name"), "estado": estado,
                      "segundos": float(caso.get("time", 0))})
    return {"total": int(suite.get("tests", 0)), "fallos": int(suite.get("failures", 0)),
            "errores": int(suite.get("errors", 0)), "omitidas": int(suite.get("skipped", 0)),
            "segundos": float(suite.get("time", 0)), "fecha": suite.get("timestamp"),
            "casos": casos}


@router.get("/pruebas/resultados", summary="Último resultado de pytest (JUnit XML)")
def pruebas_resultados(request: Request):
    return {"proceso": est(request).pruebas.estado(), "resultado": _leer_junit()}


@router.post("/pruebas/ejecutar", summary="Ejecuta pytest en otro proceso")
def pruebas_ejecutar(request: Request):
    return est(request).pruebas.ejecutar()


@router.get("/mapas", summary="Mapas Folium generados en mapas/")
def mapas():
    carpeta = RAIZ / "mapas"
    info = carpeta / "mapas.json"
    detalle = json.loads(info.read_text(encoding="utf-8")) if info.exists() else []
    return {"mapas": sorted(p.name for p in carpeta.glob("*.html")), "detalle": detalle}
