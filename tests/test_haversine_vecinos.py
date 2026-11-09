"""Pruebas de Haversine (propio) y de k vecinos con Quadtree + heap (RF-04)."""
import math
import random
from dataclasses import dataclass

import pytest

from estructuras.haversine import RADIO_TIERRA_M, haversine_km, haversine_m, validar_coordenada
from estructuras.proyeccion import ProyeccionLocal
from estructuras.quadtree import Quadtree, Rectangulo
from estructuras.vecinos import k_mas_cercanos, k_mas_cercanos_lineal


def test_haversine_resultados_conocidos():
    assert haversine_m(-12.0, -77.0, -12.0, -77.0) == 0.0
    # Un cuarto de meridiano: del ecuador al polo = π·R/2
    assert haversine_m(0, 0, 90, 0) == pytest.approx(math.pi * RADIO_TIERRA_M / 2, rel=1e-12)
    # 1° de longitud sobre el ecuador ≈ 111,195 km
    assert haversine_km(0, 0, 0, 1) == pytest.approx(111.195, abs=0.001)
    # Antípodas: media circunferencia
    assert haversine_m(0, 0, 0, 180) == pytest.approx(math.pi * RADIO_TIERRA_M, rel=1e-12)
    # Simetría
    assert haversine_m(-11.93, -77.05, -11.95, -77.06) == pytest.approx(
        haversine_m(-11.95, -77.06, -11.93, -77.05))


def test_coordenadas_invalidas():
    for lat, lon in [(91, 0), (0, 181), (float("nan"), 0), ("a", 0)]:
        with pytest.raises(ValueError):
            validar_coordenada(lat, lon)


@dataclass(eq=False)
class C:
    id: int
    lat: float
    lon: float
    x: float
    y: float
    libre: bool = True


def flota_aleatoria(n, semilla):
    rng = random.Random(semilla)
    proy = ProyeccionLocal(-11.94, -77.056)
    flota = []
    for i in range(n):
        lat, lon = -11.94 + rng.uniform(-0.01, 0.01), -77.056 + rng.uniform(-0.01, 0.01)
        x, y = proy.a_xy(lat, lon)
        flota.append(C(i, lat, lon, x, y, rng.random() < 0.6))
    q = Quadtree(Rectangulo(-1500, -1500, 1500, 1500), capacidad=8)
    for c in flota:
        q.insertar(c)
    return flota, q, proy


@pytest.mark.parametrize("k", [1, 3, 5, 10])
def test_k_vecinos_quadtree_igual_a_busqueda_lineal(k):
    flota, q, proy = flota_aleatoria(1500, semilla=k)
    rng = random.Random(99)
    for _ in range(25):
        lat, lon = -11.94 + rng.uniform(-0.009, 0.009), -77.056 + rng.uniform(-0.009, 0.009)
        x, y = proy.a_xy(lat, lon)
        filtro = lambda c: c.libre
        rapido = k_mas_cercanos(q, lat, lon, x, y, k, filtro=filtro)["candidatos"]
        lento = k_mas_cercanos_lineal(flota, lat, lon, k, filtro=filtro)
        assert [c.id for _, c in rapido] == [c.id for _, c in lento]
        distancias = [d for d, _ in rapido]
        assert distancias == sorted(distancias), "el heap debe entregar el orden correcto"


def test_k_vecinos_amplia_la_region_cuando_faltan_candidatos():
    flota, q, proy = flota_aleatoria(40, semilla=3)
    x, y = proy.a_xy(-11.94, -77.056)
    res = k_mas_cercanos(q, -11.94, -77.056, x, y, 10, radio_inicial_m=20)
    assert len(res["traza"]) > 1, "con radio inicial pequeño debe ampliarse"
    assert len(res["candidatos"]) == 10


def test_sin_conductores_disponibles_devuelve_vacio():
    flota, q, proy = flota_aleatoria(200, semilla=5)
    x, y = proy.a_xy(-11.94, -77.056)
    res = k_mas_cercanos(q, -11.94, -77.056, x, y, 5, filtro=lambda c: False)
    assert res["candidatos"] == []
    assert res["traza"][-1]["motivo"] == "el cuadrado ya cubre toda el área"
