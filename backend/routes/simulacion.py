"""Rutas de estado, flota, pasajeros, despacho y simulación por turnos."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request

from backend.estado import EstadoApp
from backend.schemas import (Avanzar, BuscarRectangulo, ConsultaPasajero, CrearPasajero,
                             GenerarFlota, Reiniciar)
from backend.serializacion import candidato_a_dict, num, ruta_a_dict
from estructuras.quadtree import Rectangulo
from simulacion.errores import PasajeroNoEncontrado

router = APIRouter(prefix="/api", tags=["Simulación y despacho"])


def est(request: Request) -> EstadoApp:
    return request.app.state.estado


def _pasajero(sim, pasajero_id: int):
    p = sim.despachador.pasajeros.get(pasajero_id)
    if p is None:
        raise PasajeroNoEncontrado(f"No existe el pasajero {pasajero_id}. Crea uno primero.")
    return p


@router.get("/estado", summary="Resumen del sistema")
def estado(request: Request):
    e = est(request)
    if e.sim is None:
        return {"listo": False, "error": e.error_red}
    sim = e.sim
    with sim.bloqueo:
        return {"listo": True, "red": sim.red.resumen(), "simulacion": sim.resumen(),
                "eventos": sim.eventos[-10:],
                "ultima_asignacion": sim.asignaciones[-1] if sim.asignaciones else None}


@router.get("/grafo", summary="Red vial (nodos y calles con geometría real)")
def grafo(request: Request):
    return est(request).grafo_json()


@router.get("/edificios", summary="Huellas de edificios de OSM (alturas reales o ilustrativas)")
def edificios(request: Request):
    return {"edificios": est(request).edificios_json()}


@router.get("/conductores", summary="Estado y posición de todos los conductores")
def conductores(request: Request):
    sim = est(request).requerir_sim()
    with sim.bloqueo:
        return {"turno": sim.turno,
                "conductores": [[c.id, round(c.x, 1), round(c.y, 1), c.estado]
                                for c in sim.conductores.values()],
                "formato": ["id", "x", "y", "estado"]}


@router.get("/conductores/{conductor_id}", summary="Detalle de un conductor")
def conductor(conductor_id: int, request: Request):
    sim = est(request).requerir_sim()
    c = sim.conductores.get(conductor_id)
    if c is None:
        raise HTTPException(404, detail={"codigo": "conductor_no_encontrado",
                                         "mensaje": f"No existe el conductor {conductor_id}."})
    return {**c.a_dict(), "ruta_pendiente": len(c.ruta)}


@router.post("/flota/generar", summary="Genera una flota nueva (RF-02)")
def generar_flota(datos: GenerarFlota, request: Request):
    sim = est(request).requerir_sim()
    sim.reiniciar(cantidad=datos.cantidad, semilla=datos.semilla,
                  proporcion_ocupados=datos.proporcion_ocupados,
                  velocidad_kmh=datos.velocidad_kmh,
                  segundos_por_turno=datos.segundos_por_turno, k=datos.k)
    return {"ok": True, "simulacion": sim.resumen()}


@router.post("/simulacion/reiniciar", summary="Reinicio reproducible con la misma (o nueva) semilla")
def reiniciar(datos: Reiniciar, request: Request):
    sim = est(request).requerir_sim()
    sim.reiniciar(semilla=datos.semilla)
    return {"ok": True, "simulacion": sim.resumen()}


@router.post("/simulacion/avanzar", summary="Avanza uno o más turnos (RF-06)")
def avanzar(datos: Avanzar, request: Request):
    sim = est(request).requerir_sim()
    resultado = None
    for _ in range(datos.turnos):
        resultado = sim.avanzar_turno()
    return resultado


@router.post("/pasajeros", summary="Crea un pasajero por coordenadas, clic en el mapa o dirección (RF-08)")
async def crear_pasajero(datos: CrearPasajero, request: Request):
    sim = est(request).requerir_sim()
    geo = None
    if datos.direccion:
        # La geocodificación hace E/S de red: se ejecuta en un hilo para no bloquear.
        p, geo = await asyncio.to_thread(sim.despachador.crear_pasajero_por_direccion,
                                         datos.direccion)
    elif datos.x is not None:
        lat, lon = sim.red.proyeccion.a_latlon(datos.x, datos.y)
        with sim.bloqueo:
            p = sim.despachador.crear_pasajero(lat, lon, "mapa")
    else:
        with sim.bloqueo:
            p = sim.despachador.crear_pasajero(datos.lat, datos.lon, "coordenadas")
    nodo = sim.red.nodos[p.nodo]
    return {"pasajero": p.a_dict(), "nodo_xy": [round(nodo.x, 1), round(nodo.y, 1)],
            "geocodificacion": geo}


@router.post("/quadtree/buscar", summary="Búsqueda en rectángulo sobre el Quadtree de conductores")
def quadtree_buscar(datos: BuscarRectangulo, request: Request):
    sim = est(request).requerir_sim()
    stats: dict = {}
    with sim.bloqueo:
        encontrados = sim.quadtree.buscar_en_rectangulo(
            Rectangulo(datos.xmin, datos.ymin, datos.xmax, datos.ymax), estadisticas=stats)
        return {"encontrados": [[c.id, round(c.x, 1), round(c.y, 1), c.estado] for c in encontrados],
                "nodos_visitados": len(stats.get("visitados", [])),
                "nodos_descartados": len(stats.get("descartados", [])),
                "elementos_revisados": stats.get("elementos_revisados", 0),
                "total_flota": len(sim.conductores),
                "visitados": stats.get("visitados", []),
                "descartados": stats.get("descartados", [])}


@router.get("/quadtree", summary="Estructura actual del Quadtree de conductores")
def quadtree(request: Request):
    sim = est(request).requerir_sim()
    with sim.bloqueo:
        return {"estadisticas": sim.quadtree.estadisticas(),
                "nodos": sim.quadtree.a_lista_nodos()}


@router.post("/candidatos", summary="k candidatos más cercanos: Quadtree + Haversine + heap (RF-04)")
def candidatos(datos: ConsultaPasajero, request: Request):
    sim = est(request).requerir_sim()
    with sim.bloqueo:
        p = _pasajero(sim, datos.pasajero_id)
        res = sim.despachador.buscar_candidatos(p, datos.k)
        return {"pasajero": p.a_dict(), "k": datos.k or sim.despachador.k,
                "candidatos": [candidato_a_dict(c) for c in res["candidatos"]],
                "traza_busqueda": res["traza"], "tiempo_ms": num(res["tiempo_ms"], 3)}


@router.post("/rutas/calcular", summary="Dijkstra propio + ETA para cada candidato (RF-05)")
def rutas(datos: ConsultaPasajero, request: Request):
    sim = est(request).requerir_sim()
    with sim.bloqueo:
        p = _pasajero(sim, datos.pasajero_id)
        busq = sim.despachador.buscar_candidatos(p, datos.k)
        rs = sim.despachador.calcular_rutas(p, busq["candidatos"], datos.velocidad_kmh,
                                            datos.traza)
        alcanzables = [r for r in rs if r["alcanzable"]]
        mejor = min(alcanzables, key=lambda r: (r["eta_min"], r["distancia_haversine_m"],
                                                r["conductor"].id)) if alcanzables else None
        return {"pasajero": p.a_dict(), "rutas": [ruta_a_dict(r, datos.traza) for r in rs],
                "mejor_conductor_id": mejor["conductor"].id if mejor else None,
                "traza_busqueda": busq["traza"]}


@router.post("/despacho/asignar", summary="Flujo completo y asignación del menor ETA (RF-05)")
def asignar(datos: ConsultaPasajero, request: Request):
    sim = est(request).requerir_sim()
    with sim.bloqueo:
        p = _pasajero(sim, datos.pasajero_id)
        if p.estado != "esperando":
            raise HTTPException(409, detail={"codigo": "pasajero_ya_atendido",
                                             "mensaje": f"El pasajero {p.id} ya tiene conductor."})
        res = sim.despachador.asignar(p, datos.k, datos.velocidad_kmh, datos.traza)
        elegido = res["elegido"]
        resumen = {
            "turno": sim.turno, "pasajero_id": p.id,
            "conductor_id": elegido["conductor"].id,
            "eta_min": num(elegido["eta_min"]),
            "distancia_vial_m": num(elegido["distancia_vial_m"], 1),
            "distancia_haversine_m": num(elegido["distancia_haversine_m"], 1),
            "mas_cercano_en_linea_recta_id": res["mas_cercano_en_linea_recta_id"],
        }
        sim.asignaciones.append(resumen)
        return {"pasajero": p.a_dict(),
                "candidatos": [candidato_a_dict(c) for c in res["busqueda"]["candidatos"]],
                "traza_busqueda": res["busqueda"]["traza"],
                "rutas": [ruta_a_dict(r, datos.traza) for r in res["rutas"]],
                "asignado": ruta_a_dict(elegido),
                "resumen": resumen,
                "tiempo_total_ms": num(res["tiempo_total_ms"], 3)}
