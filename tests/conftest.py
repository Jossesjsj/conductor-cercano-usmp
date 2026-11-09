"""Fixtures compartidas: una cuadrícula pequeña de calles (independiente de OSM)."""
import pytest

from datos.red_vial import red_desde_listas

LAT0, LON0 = -11.9400, -77.0560
PASO = 0.0009  # ≈ 100 m


def construir_cuadricula(n=6, unidireccionales=()):
    """Cuadrícula n×n de intersecciones con calles de doble sentido.

    `unidireccionales` = lista de (u, v) que solo se permiten en ese sentido.
    El nodo (fila, col) tiene id fila*n + col.
    """
    nodos = {}
    for f in range(n):
        for c in range(n):
            nodos[f * n + c] = (LAT0 + f * PASO, LON0 + c * PASO)
    aristas = []
    solo_ida = set(unidireccionales)
    for f in range(n):
        for c in range(n):
            u = f * n + c
            for v in ([u + 1] if c + 1 < n else []) + ([u + n] if f + 1 < n else []):
                if (u, v) in solo_ida:
                    aristas.append((u, v))
                elif (v, u) in solo_ida:
                    aristas.append((v, u))
                else:
                    aristas += [(u, v), (v, u)]
    return red_desde_listas(nodos, aristas)


@pytest.fixture
def red():
    return construir_cuadricula()
