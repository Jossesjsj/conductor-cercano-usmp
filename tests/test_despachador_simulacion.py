"""Pruebas del Despachador (RF-04/05/08) y de la simulación por turnos (RF-06)."""
import math

import pytest

from estructuras.quadtree import Rectangulo
from simulacion.conductor import ASIGNADO, DISPONIBLE, OCUPADO
from simulacion.despachador import calcular_eta_min
from simulacion.errores import (CoordenadaInvalida, FueraDeZona, SinConductores,
                                SinConexionVial)
from simulacion.simulador import Simulacion
from tests.conftest import LAT0, LON0, PASO, construir_cuadricula


def colocar(sim, conductor_id, u, v, estado=DISPONIBLE):
    c = sim.conductores[conductor_id]
    n = sim.red.nodos[u]
    c.nodo_origen, c.nodo_destino, c.avance_m, c.estado = u, v, 0.0, estado
    c.lat, c.lon = n.lat, n.lon
    sim.quadtree.actualizar_posicion(c, n.x, n.y)
    return c


def test_eta_convierte_unidades():
    assert calcular_eta_min(1000, 30) == pytest.approx(2.0)   # 1 km a 30 km/h = 2 min
    assert calcular_eta_min(5000, 60) == pytest.approx(5.0)
    assert math.isinf(calcular_eta_min(math.inf, 30))
    with pytest.raises(ValueError):
        calcular_eta_min(100, 0)


def test_seleccion_por_menor_eta_no_por_linea_recta():
    """El más cercano en línea recta queda detrás de una calle de un solo sentido."""
    n = 6
    # Columna 3 entre las filas 0 y 1: solo se puede ir de fila 1 hacia fila 0 por (9→3)…
    # Construimos un caso explícito: el pasajero en el nodo 2 (fila 0, col 2).
    # Conductor A en el nodo 8 (fila 1, col 2): 100 m en línea recta, pero la calle
    # 8→2 es de sentido contrario (solo 2→8) y las vecinas también obligan a rodear.
    red = construir_cuadricula(n, unidireccionales=[(2, 8), (1, 7), (3, 9), (7, 8), (9, 8)])
    sim = Simulacion(red, cantidad=2, semilla=1, proporcion_ocupados=0.0)
    a = colocar(sim, 1, 8, 14)   # cercano en línea recta pero mal orientado
    b = colocar(sim, 2, 4, 3)    # más lejos en línea recta, camino directo 4→3→2
    p = sim.despachador.crear_pasajero(LAT0, LON0 + 2 * PASO)
    res = sim.despachador.asignar(p, k=2)
    assert res["mas_cercano_en_linea_recta_id"] == a.id
    assert res["elegido"]["conductor"].id == b.id
    rutas = {r["conductor"].id: r for r in res["rutas"]}
    assert rutas[a.id]["distancia_vial_m"] > rutas[b.id]["distancia_vial_m"]
    assert b.estado == ASIGNADO and a.estado == DISPONIBLE


def test_ausencia_de_conductores_disponibles():
    red = construir_cuadricula()
    sim = Simulacion(red, cantidad=20, semilla=2, proporcion_ocupados=1.0)
    p = sim.despachador.crear_pasajero(LAT0 + PASO, LON0 + PASO)
    with pytest.raises(SinConductores):
        sim.despachador.asignar(p)


def test_pasajero_en_zona_sin_conexion_vial():
    red = construir_cuadricula()
    sim = Simulacion(red, cantidad=5, semilla=3)
    # Dentro de los límites (margen de 400 m) pero a ~300 m de cualquier calle.
    with pytest.raises(SinConexionVial):
        sim.despachador.crear_pasajero(LAT0 - 0.0028, LON0 - 0.0028)


def test_coordenada_invalida_y_fuera_de_zona():
    sim = Simulacion(construir_cuadricula(), cantidad=5, semilla=3)
    with pytest.raises(CoordenadaInvalida):
        sim.despachador.crear_pasajero(200, 0)
    with pytest.raises(FueraDeZona):
        sim.despachador.crear_pasajero(-12.5, -77.0)


def test_quadtree_se_actualiza_durante_los_turnos():
    sim = Simulacion(construir_cuadricula(), cantidad=60, semilla=4)
    for _ in range(15):
        sim.avanzar_turno()
        assert len(sim.quadtree) == 60
        for c in sim.conductores.values():
            encontrados = sim.quadtree.buscar_en_rectangulo(
                Rectangulo(c.x - 0.01, c.y - 0.01, c.x + 0.01, c.y + 0.01))
            assert c in encontrados, "el Quadtree debe reflejar la posición actual"
            assert (c.nodo_origen, c.nodo_destino) in sim.red.aristas, "siempre sobre una calle"


def test_reproducibilidad_con_semilla_fija():
    red = construir_cuadricula()
    a = Simulacion(red, cantidad=80, semilla=123)
    b = Simulacion(red, cantidad=80, semilla=123)
    c = Simulacion(red, cantidad=80, semilla=124)
    for _ in range(10):
        a.avanzar_turno()
        b.avanzar_turno()
        c.avanzar_turno()
    assert a.huella() == b.huella()
    assert a.huella() != c.huella()


def test_conductor_asignado_llega_y_cambia_de_estado():
    sim = Simulacion(construir_cuadricula(), cantidad=10, semilla=8, proporcion_ocupados=0.0)
    p = sim.despachador.crear_pasajero(LAT0 + 5 * PASO, LON0 + 5 * PASO)
    res = sim.despachador.asignar(p, k=3)
    c = res["elegido"]["conductor"]
    assert c.estado == ASIGNADO
    for _ in range(200):
        sim.avanzar_turno()
        if c.estado != ASIGNADO:
            break
    assert c.estado in (OCUPADO, DISPONIBLE)
    assert p.estado == "recogido"
