"""RF-02 / RF-06 · Generación de la flota y movimiento sobre el grafo vial.

Los conductores SIEMPRE están sobre una arista del grafo (nunca atraviesan
manzanas en línea recta): avanzan `velocidad · Δt` metros siguiendo la
geometría real de la calle y, al llegar a una intersección, continúan por su
ruta (si están asignados) o eligen al azar la siguiente calle permitida.
"""
from __future__ import annotations

import random

from datos.red_vial import RedVial
from simulacion.conductor import ASIGNADO, DISPONIBLE, OCUPADO, Conductor


def generar_flota(red: RedVial, cantidad: int, rng: random.Random,
                  proporcion_ocupados: float = 0.3, velocidad_kmh: float = 30.0,
                  variacion_velocidad: float = 0.25) -> list[Conductor]:
    """Crea `cantidad` conductores ubicados sobre intersecciones de la red."""
    if cantidad < 0:
        raise ValueError("La cantidad de conductores no puede ser negativa.")
    if not 0.0 <= proporcion_ocupados <= 1.0:
        raise ValueError("La proporción de ocupados debe estar entre 0 y 1.")
    nodos_con_salida = sorted(n for n, ady in red.adyacencia.items() if ady)
    flota = []
    for i in range(cantidad):
        u = rng.choice(nodos_con_salida)
        v = rng.choice(red.adyacencia[u])[0]
        nodo = red.nodos[u]
        estado = OCUPADO if rng.random() < proporcion_ocupados else DISPONIBLE
        vel = round(velocidad_kmh * (1 + rng.uniform(-variacion_velocidad, variacion_velocidad)), 1)
        c = Conductor(id=i + 1, lat=nodo.lat, lon=nodo.lon, x=nodo.x, y=nodo.y,
                      estado=estado, velocidad_kmh=vel, nodo_origen=u, nodo_destino=v)
        if estado == OCUPADO:
            c.turnos_ocupado = rng.randint(5, 25)
        flota.append(c)
    return flota


def _siguiente_arista_aleatoria(red: RedVial, actual: int, anterior: int,
                                rng: random.Random) -> int:
    opciones = [v for v, _ in red.adyacencia[actual]]
    sin_retorno = [v for v in opciones if v != anterior]
    return rng.choice(sin_retorno or opciones)


def mover_conductor(red: RedVial, c: Conductor, segundos: float,
                    rng: random.Random) -> dict:
    """Avanza al conductor `segundos` de tiempo simulado.

    Devuelve {"puntos": [(x, y), ...]} con el recorrido exacto (para que la
    animación del frontend siga la misma trayectoria) y "llego" si alcanzó el
    nodo del pasajero asignado.
    """
    restante = c.velocidad_kmh / 3.6 * segundos  # metros a recorrer en el turno
    puntos = [(c.x, c.y)]
    llego = False
    while restante > 1e-9:
        u, v = c.nodo_origen, c.nodo_destino
        longitud = red.aristas[(u, v)]["longitud"]
        falta = longitud - c.avance_m
        if restante < falta:
            nuevo = c.avance_m + restante
            puntos.extend(red.tramo_de_arista(u, v, c.avance_m, nuevo)[1:])
            c.avance_m = nuevo
            restante = 0.0
            break
        # Llega a la intersección v.
        puntos.extend(red.tramo_de_arista(u, v, c.avance_m, longitud)[1:])
        restante -= falta
        c.avance_m = 0.0
        if c.estado == ASIGNADO and not c.ruta:
            # v es el nodo del pasajero: se detiene allí para recogerlo.
            c.nodo_origen = v
            c.nodo_destino = _siguiente_arista_aleatoria(red, v, u, rng)
            llego = True
            break
        siguiente = c.ruta.pop(0) if c.ruta else _siguiente_arista_aleatoria(red, v, u, rng)
        c.nodo_origen, c.nodo_destino = v, siguiente
    x, y = red.punto_en_arista(c.nodo_origen, c.nodo_destino, c.avance_m)
    c.lat, c.lon = red.proyeccion.a_latlon(x, y)
    nuevo_x, nuevo_y = x, y
    return {"puntos": puntos, "llego": llego, "x": nuevo_x, "y": nuevo_y}
