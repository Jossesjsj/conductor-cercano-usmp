"""Aplicación FastAPI: API del sistema + archivos de la presentación web."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.estado import RAIZ, EstadoApp
from backend.routes import algoritmos, extras, simulacion
from simulacion.errores import ErrorDespacho

DESCRIPCION = """
API del **Proyecto Integrador N.º 2 — Asignación del conductor más cercano**
(USMP · Algoritmos y Estructura de Datos II).

Flujo: Pasajero → Quadtree → Haversine → Heap → Dijkstra → ETA → Conductor asignado.

Quadtree, Haversine y Dijkstra son implementación propia del equipo.
"""


def crear_app(red=None) -> FastAPI:
    """Crea la aplicación. `red` permite inyectar una red de prueba (pytest)."""
    estado = EstadoApp(red)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI):
        estado.iniciar()
        yield

    app = FastAPI(title="Conductor Cercano · USMP", version="2.0.0",
                  description=DESCRIPCION, lifespan=ciclo_de_vida)
    app.state.estado = estado

    @app.exception_handler(ErrorDespacho)
    async def error_despacho(_: Request, exc: ErrorDespacho):
        return JSONResponse(status_code=exc.estado_http,
                            content={"detail": {"codigo": exc.codigo, "mensaje": exc.mensaje}})

    @app.exception_handler(RequestValidationError)
    async def error_validacion(_: Request, exc: RequestValidationError):
        mensajes = []
        for e in exc.errors():
            campo = ".".join(str(p) for p in e.get("loc", []) if p != "body")
            mensajes.append(f"{campo}: {e.get('msg')}" if campo else e.get("msg"))
        return JSONResponse(status_code=422, content={"detail": {
            "codigo": "entrada_invalida", "mensaje": "; ".join(mensajes)}})

    app.include_router(simulacion.router)
    app.include_router(algoritmos.router)
    app.include_router(extras.router)

    for ruta, carpeta in [("/mapas", "mapas"), ("/graficos", "benchmark"),
                          ("/entregables", "entregables")]:
        (RAIZ / carpeta).mkdir(exist_ok=True)
        app.mount(ruta, StaticFiles(directory=RAIZ / carpeta), name=carpeta)
    app.mount("/", StaticFiles(directory=RAIZ / "frontend", html=True), name="frontend")
    return app
