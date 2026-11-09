"""Pruebas de integración de la API (FastAPI TestClient con red de prueba)."""
import pytest
from fastapi.testclient import TestClient

from backend.app import crear_app
from tests.conftest import LAT0, LON0, PASO, construir_cuadricula


@pytest.fixture
def cliente():
    app = crear_app(red=construir_cuadricula(8))
    with TestClient(app) as c:
        c.post("/api/flota/generar", json={"cantidad": 40, "semilla": 9,
                                           "proporcion_ocupados": 0.2})
        yield c


def test_estado_grafo_y_conductores(cliente):
    e = cliente.get("/api/estado").json()
    assert e["listo"] and e["simulacion"]["total"] == 40
    g = cliente.get("/api/grafo").json()
    assert len(g["nodos"]) == 64 and g["calles"]
    assert len(cliente.get("/api/conductores").json()["conductores"]) == 40


def test_flujo_completo_de_despacho(cliente):
    p = cliente.post("/api/pasajeros", json={"lat": LAT0 + 3 * PASO, "lon": LON0 + 3 * PASO})
    assert p.status_code == 200
    pid = p.json()["pasajero"]["id"]
    cand = cliente.post("/api/candidatos", json={"pasajero_id": pid, "k": 3}).json()
    assert len(cand["candidatos"]) == 3
    dist = [c["distancia_haversine_m"] for c in cand["candidatos"]]
    assert dist == sorted(dist)
    rutas = cliente.post("/api/rutas/calcular", json={"pasajero_id": pid, "k": 3}).json()
    asign = cliente.post("/api/despacho/asignar", json={"pasajero_id": pid, "k": 3}).json()
    etas = [r["eta_min"] for r in rutas["rutas"] if r["alcanzable"]]
    assert asign["asignado"]["eta_min"] == pytest.approx(min(etas))
    assert asign["asignado"]["estado"] == "asignado"
    repetido = cliente.post("/api/despacho/asignar", json={"pasajero_id": pid})
    assert repetido.status_code == 409


def test_errores_claros(cliente):
    r = cliente.post("/api/pasajeros", json={"lat": 120, "lon": 0})
    assert r.status_code == 422 and r.json()["detail"]["codigo"] == "coordenada_invalida"
    r = cliente.post("/api/pasajeros", json={"lat": -12.6, "lon": -77.0})
    assert r.json()["detail"]["codigo"] == "fuera_de_zona"
    r = cliente.post("/api/pasajeros", json={})
    assert r.status_code == 422 and r.json()["detail"]["codigo"] == "entrada_invalida"
    r = cliente.post("/api/candidatos", json={"pasajero_id": 999})
    assert r.status_code == 404


def test_simulacion_avanzar_y_reiniciar_reproducible(cliente):
    a = cliente.post("/api/simulacion/avanzar", json={"turnos": 3}).json()
    assert a["turno"] == 3 and len(a["movimientos"]) == 40
    cliente.post("/api/simulacion/reiniciar", json={})
    c1 = cliente.get("/api/conductores").json()["conductores"]
    cliente.post("/api/simulacion/avanzar", json={"turnos": 2})
    cliente.post("/api/simulacion/reiniciar", json={})
    assert cliente.get("/api/conductores").json()["conductores"] == c1


def test_quadtree_demo_y_haversine(cliente):
    f = cliente.post("/api/quadtree/demo/reiniciar", json={"cantidad": 0, "capacidad": 1}).json()
    assert f["estadisticas"]["nodos"] == 1
    cliente.post("/api/quadtree/demo/insertar", json={"x": 10, "y": 10})
    r = cliente.post("/api/quadtree/demo/insertar", json={"x": 90, "y": 90}).json()
    assert any(e["tipo"] == "subdividir" for e in r["eventos"])
    b = cliente.post("/api/quadtree/demo/buscar",
                     json={"xmin": 0, "ymin": 0, "xmax": 20, "ymax": 20}).json()
    assert len(b["encontrados"]) == 1 and b["descartados"]
    h = cliente.post("/api/haversine", json={"lat1": LAT0, "lon1": LON0,
                                             "lat2": LAT0 + 2 * PASO, "lon2": LON0 + 2 * PASO}).json()
    assert h["distancia_m"] > 0 and h["vial"]["distancia_m"] >= h["distancia_m"]


def test_presentacion_se_sirve(cliente):
    r = cliente.get("/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
