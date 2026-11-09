"""Pruebas del Dijkstra propio (RF-05)."""
import math
import random

import networkx as nx
import pytest

from algoritmos.dijkstra import dijkstra


def test_dijkstra_ruta_valida():
    g = {"A": [("B", 2), ("C", 8)], "B": [("C", 1), ("D", 7)], "C": [("D", 2)], "D": []}
    r = dijkstra(g, "A", "D")
    assert r.alcanzable
    assert r.distancia_m == 5
    assert r.camino == ["A", "B", "C", "D"]


def test_grafo_sin_ruta_alcanzable():
    g = {"A": [("B", 1)], "B": [], "C": [("A", 1)]}
    r = dijkstra(g, "A", "C")
    assert not r.alcanzable
    assert math.isinf(r.distancia_m) and r.camino == []


def test_respeta_sentido_de_circulacion():
    # B → A existe, A → B no: hay que dar la vuelta por C.
    g = {"A": [("C", 5)], "B": [("A", 1)], "C": [("B", 5)]}
    assert dijkstra(g, "A", "B").distancia_m == 10
    assert dijkstra(g, "B", "A").distancia_m == 1


def test_origen_igual_a_destino_y_nodo_inexistente():
    g = {"A": [("B", 3)], "B": []}
    r = dijkstra(g, "A", "A")
    assert r.distancia_m == 0 and r.camino == ["A"]
    with pytest.raises(KeyError):
        dijkstra(g, "A", "Z")


def test_traza_registra_extracciones_y_ruta():
    g = {"A": [("B", 1), ("C", 4)], "B": [("C", 1)], "C": []}
    r = dijkstra(g, "A", "C", registrar_traza=True)
    tipos = [p["tipo"] for p in r.traza]
    assert tipos[0] == "inicio" and tipos[-1] == "ruta"
    assert "extraer" in tipos and "relajar" in tipos
    assert r.traza[-1]["camino"] == ["A", "B", "C"]


def test_coincide_con_networkx_en_grafos_aleatorios():
    """NetworkX se usa SOLO para validar el resultado de nuestro Dijkstra."""
    rng = random.Random(11)
    for _ in range(20):
        g = nx.gnp_random_graph(60, 0.08, seed=rng.randint(0, 10_000), directed=True)
        ady = {u: [] for u in g.nodes}
        for u, v in g.edges:
            w = rng.uniform(1, 100)
            g[u][v]["w"] = w
            ady[u].append((v, w))
        for _ in range(10):
            s, t = rng.randrange(60), rng.randrange(60)
            propio = dijkstra(ady, s, t)
            try:
                esperado = nx.dijkstra_path_length(g, s, t, weight="w")
            except nx.NetworkXNoPath:
                esperado = math.inf
            assert propio.distancia_m == pytest.approx(esperado)
