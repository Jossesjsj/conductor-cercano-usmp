"""Pruebas del Quadtree propio (RF-03)."""
import random
from dataclasses import dataclass

import pytest

from estructuras.quadtree import NodoQuadtree, Quadtree, Rectangulo


@dataclass(eq=False)
class P:
    id: int
    x: float
    y: float


def arbol(capacidad=4):
    return Quadtree(Rectangulo(0, 0, 100, 100), capacidad=capacidad)


def test_quadtree_vacio():
    q = arbol()
    assert len(q) == 0 and q.esta_vacio()
    assert q.buscar_en_rectangulo(Rectangulo(0, 0, 100, 100)) == []
    assert q.estadisticas()["nodos"] == 1
    assert isinstance(q.raiz, NodoQuadtree) and q.raiz.es_hoja()


def test_insercion_correcta_y_subdivision():
    q = arbol(capacidad=2)
    puntos = [P(1, 10, 10), P(2, 90, 90), P(3, 10, 90)]
    for p in puntos:
        q.insertar(p)
    assert len(q) == 3
    assert not q.raiz.es_hoja(), "al superar la capacidad debe subdividirse"
    assert {p.id for p in q.todos()} == {1, 2, 3}


def test_insertar_duplicado_o_fuera_de_limites_falla():
    q = arbol()
    q.insertar(P(1, 5, 5))
    with pytest.raises(ValueError):
        q.insertar(P(1, 6, 6))
    with pytest.raises(ValueError):
        q.insertar(P(2, 150, 5))


def test_eliminacion_correcta_y_fusion():
    q = arbol(capacidad=2)
    puntos = [P(i, 10 * i, 10 * i) for i in range(1, 6)]
    for p in puntos:
        q.insertar(p)
    assert q.estadisticas()["nodos"] > 1
    for p in puntos[:4]:
        assert q.eliminar(p)
    assert not q.eliminar(puntos[0]), "eliminar dos veces devuelve False"
    assert [p.id for p in q.todos()] == [5]
    assert q.estadisticas()["nodos"] == 1, "los nodos vacíos deben fusionarse"


def test_actualizar_posicion():
    q = arbol(capacidad=1)
    a, b = P(1, 10, 10), P(2, 80, 80)
    q.insertar(a)
    q.insertar(b)
    q.actualizar_posicion(a, 85, 85)
    assert (a.x, a.y) == (85, 85)
    assert q.buscar_en_rectangulo(Rectangulo(0, 0, 50, 50)) == []
    assert {p.id for p in q.buscar_en_rectangulo(Rectangulo(70, 70, 100, 100))} == {1, 2}
    with pytest.raises(KeyError):
        q.actualizar_posicion(P(9, 1, 1), 2, 2)


def test_conductores_en_el_mismo_punto_no_subdividen_infinitamente():
    q = arbol(capacidad=2)
    for i in range(500):
        q.insertar(P(i, 42.0, 42.0))
    est = q.estadisticas()
    assert est["elementos"] == 500
    assert est["profundidad"] <= q.profundidad_maxima
    assert est["hojas_desbordadas"] >= 1
    assert len(q.buscar_en_rectangulo(Rectangulo(41, 41, 43, 43))) == 500


def test_busqueda_en_rectangulo_igual_a_fuerza_bruta_y_poda():
    rng = random.Random(7)
    q = arbol(capacidad=4)
    puntos = [P(i, rng.uniform(0, 100), rng.uniform(0, 100)) for i in range(800)]
    for p in puntos:
        q.insertar(p)
    for _ in range(50):
        x, y = rng.uniform(0, 90), rng.uniform(0, 90)
        rect = Rectangulo(x, y, x + rng.uniform(1, 10), y + rng.uniform(1, 10))
        stats = {}
        esperado = {p.id for p in puntos if rect.contiene(p.x, p.y)}
        assert {p.id for p in q.buscar_en_rectangulo(rect, estadisticas=stats)} == esperado
        assert stats["elementos_revisados"] < len(puntos), "debe podar cuadrantes"


def test_limites_inclusivos():
    q = arbol()
    q.insertar(P(1, 100, 100))
    q.insertar(P(2, 0, 0))
    assert {p.id for p in q.todos()} == {1, 2}
