"""Carga de la red vial local y conversión a estructuras propias (RF-01).

- OSMnx/NetworkX se usan SOLO para leer el archivo GraphML guardado.
- El grafo se convierte a una lista de adyacencia dirigida propia
  (adyacencia[u] = [(v, longitud_m)]) que consume nuestro Dijkstra.
- Las intersecciones se indexan en un Quadtree propio para "pegar" un
  pasajero o un punto clicado a la intersección más cercana.
- Se conserva la componente fuertemente conexa más grande (cálculo propio,
  algoritmo de Kosaraju) para que desde cualquier intersección se pueda llegar
  a cualquier otra respetando los sentidos de circulación.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from estructuras.haversine import haversine_m
from estructuras.proyeccion import ProyeccionLocal
from estructuras.quadtree import Quadtree, Rectangulo
from estructuras.vecinos import k_mas_cercanos

CARPETA = Path(__file__).resolve().parent
RUTA_GRAPHML = CARPETA / "comas_red.graphml"
RUTA_EDIFICIOS = CARPETA / "comas_edificios.json"
RUTA_ZONA = CARPETA / "zona.json"
MARGEN_LIMITES_M = 400.0


@dataclass
class NodoVial:
    id: int
    lat: float
    lon: float
    x: float
    y: float


class RedVial:
    """Grafo vial dirigido con coordenadas geográficas y locales."""

    def __init__(self, nodos: dict, aristas: dict, zona: dict | None = None):
        """
        nodos:   {id: (lat, lon)}
        aristas: {(u, v): {"longitud": m, "geometria": [(lat, lon), ...],
                           "nombre": str, "tipo": str}}
        """
        if not nodos:
            raise ValueError("La red vial no tiene nodos.")
        self.zona = zona or {}
        lats = [p[0] for p in nodos.values()]
        lons = [p[1] for p in nodos.values()]
        self.proyeccion = ProyeccionLocal((min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2)

        self.nodos: dict[int, NodoVial] = {}
        for i, (lat, lon) in nodos.items():
            x, y = self.proyeccion.a_xy(lat, lon)
            self.nodos[i] = NodoVial(i, lat, lon, x, y)

        self.adyacencia: dict[int, list] = {i: [] for i in self.nodos}
        self.aristas: dict[tuple, dict] = {}
        for (u, v), datos in aristas.items():
            if u not in self.nodos or v not in self.nodos or u == v:
                continue
            geom = datos.get("geometria") or [nodos[u], nodos[v]]
            xy = [self.proyeccion.a_xy(la, lo) for la, lo in geom]
            acumulado = [0.0]
            for (x1, y1), (x2, y2) in zip(xy, xy[1:]):
                acumulado.append(acumulado[-1] + math.hypot(x2 - x1, y2 - y1))
            self.aristas[(u, v)] = {
                "longitud": float(datos["longitud"]),
                "xy": xy, "acumulado": acumulado,
                "nombre": datos.get("nombre", ""), "tipo": datos.get("tipo", ""),
            }
            self.adyacencia[u].append((v, float(datos["longitud"])))

        xs = [n.x for n in self.nodos.values()]
        ys = [n.y for n in self.nodos.values()]
        m = MARGEN_LIMITES_M
        self.limites = Rectangulo(min(xs) - m, min(ys) - m, max(xs) + m, max(ys) + m)
        self.indice_nodos = Quadtree(self.limites, capacidad=16)
        for n in self.nodos.values():
            self.indice_nodos.insertar(n)
        self.edificios: list = []

    # ------------------------------------------------------------- consultas
    def nodo_mas_cercano(self, lat: float, lon: float) -> tuple[NodoVial, float]:
        """Intersección más cercana (Haversine) usando el Quadtree de nodos."""
        x, y = self.proyeccion.a_xy(lat, lon)
        res = k_mas_cercanos(self.indice_nodos, lat, lon, x, y, 1, radio_inicial_m=100)
        distancia, nodo = res["candidatos"][0]
        return nodo, distancia

    def dentro_de_zona(self, lat: float, lon: float) -> bool:
        x, y = self.proyeccion.a_xy(lat, lon)
        return self.limites.contiene(x, y)

    def punto_en_arista(self, u: int, v: int, avance_m: float) -> tuple[float, float]:
        """Posición (x, y) a `avance_m` metros del inicio de la arista u→v."""
        a = self.aristas[(u, v)]
        fraccion = 0.0 if a["longitud"] <= 0 else min(1.0, max(0.0, avance_m / a["longitud"]))
        objetivo = fraccion * a["acumulado"][-1]
        acum, xy = a["acumulado"], a["xy"]
        for i in range(1, len(acum)):
            if acum[i] >= objetivo:
                tramo = acum[i] - acum[i - 1]
                t = 0.0 if tramo == 0 else (objetivo - acum[i - 1]) / tramo
                return (xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t,
                        xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t)
        return xy[-1]

    def tramo_de_arista(self, u: int, v: int, desde_m: float, hasta_m: float) -> list:
        """Puntos (x, y) de la geometría entre dos avances de la arista (para animar)."""
        a = self.aristas[(u, v)]
        total = a["acumulado"][-1]
        escala = total / a["longitud"] if a["longitud"] > 0 else 0
        d0, d1 = desde_m * escala, hasta_m * escala
        puntos = [self.punto_en_arista(u, v, desde_m)]
        for i, acum in enumerate(a["acumulado"]):
            if d0 < acum < d1:
                puntos.append(a["xy"][i])
        puntos.append(self.punto_en_arista(u, v, hasta_m))
        return puntos

    def geometria_camino(self, camino: list) -> list:
        """Polilínea (x, y) que sigue las calles de un camino de nodos."""
        puntos = []
        for u, v in zip(camino, camino[1:]):
            xy = self.aristas[(u, v)]["xy"]
            puntos.extend(xy if not puntos else xy[1:])
        if not puntos and camino:
            n = self.nodos[camino[0]]
            puntos = [(n.x, n.y)]
        return puntos

    def resumen(self) -> dict:
        area_km2 = ((self.limites.xmax - self.limites.xmin - 2 * MARGEN_LIMITES_M)
                    * (self.limites.ymax - self.limites.ymin - 2 * MARGEN_LIMITES_M)) / 1e6
        total_m = sum(a["longitud"] for a in self.aristas.values())
        return {
            "zona": self.zona.get("nombre", "Red vial"),
            "nodos": len(self.nodos), "aristas": len(self.aristas),
            "km_de_calles_dirigidas": round(total_m / 1000, 1),
            "area_km2": round(area_km2, 2), "edificios": len(self.edificios),
            "fuente": self.zona.get("fuente", "OpenStreetMap"),
            "descargado": self.zona.get("descargado"),
            "centro": [self.proyeccion.lat0, self.proyeccion.lon0],
        }


# ------------------------------------------------------------------ Kosaraju
def componente_fuerte_mayor(nodos: list, aristas: list) -> set:
    """Componente fuertemente conexa más grande (Kosaraju, iterativo)."""
    sucesores = {n: [] for n in nodos}
    predecesores = {n: [] for n in nodos}
    for u, v in aristas:
        sucesores[u].append(v)
        predecesores[v].append(u)
    # 1) Orden de finalización con DFS sobre el grafo original.
    visitado, orden = set(), []
    for inicio in nodos:
        if inicio in visitado:
            continue
        visitado.add(inicio)
        pila = [(inicio, iter(sucesores[inicio]))]
        while pila:
            nodo, it = pila[-1]
            siguiente = next((w for w in it if w not in visitado), None)
            if siguiente is None:
                pila.pop()
                orden.append(nodo)
            else:
                visitado.add(siguiente)
                pila.append((siguiente, iter(sucesores[siguiente])))
    # 2) DFS sobre el grafo transpuesto en orden inverso de finalización.
    asignado, mejor = set(), set()
    for inicio in reversed(orden):
        if inicio in asignado:
            continue
        comp, pila = {inicio}, [inicio]
        asignado.add(inicio)
        while pila:
            n = pila.pop()
            for w in predecesores[n]:
                if w not in asignado:
                    asignado.add(w)
                    comp.add(w)
                    pila.append(w)
        if len(comp) > len(mejor):
            mejor = comp
    return mejor


# ------------------------------------------------------------------ carga
RUTA_JSON = CARPETA / "comas_red.json"


def cargar_red(ruta: Path = RUTA_GRAPHML, solo_componente_mayor: bool = True) -> RedVial:
    """Carga la red guardada localmente.

    Usa datos/comas_red.json (copia ligera del GraphML, solo biblioteca estándar)
    si existe y está al día; así el servidor web no necesita OSMnx/geopandas.
    """
    if RUTA_JSON.exists() and (not ruta.exists() or RUTA_JSON.stat().st_mtime >= ruta.stat().st_mtime):
        nodos, aristas = leer_json(RUTA_JSON)
    elif ruta.exists():
        nodos, aristas = leer_graphml(ruta)
    else:
        raise FileNotFoundError(
            f"No existe {ruta}. Ejecuta una vez: python -m datos.descargar_red")
    if solo_componente_mayor:
        mayor = componente_fuerte_mayor(list(nodos), list(aristas))
        nodos = {n: p for n, p in nodos.items() if n in mayor}
        aristas = {k: a for k, a in aristas.items() if k[0] in mayor and k[1] in mayor}
    zona = json.loads(RUTA_ZONA.read_text(encoding="utf-8")) if RUTA_ZONA.exists() else {}
    red = RedVial(nodos, aristas, zona)
    if RUTA_EDIFICIOS.exists():
        red.edificios = json.loads(RUTA_EDIFICIOS.read_text(encoding="utf-8")).get("edificios", [])
    return red


def leer_json(ruta: Path) -> tuple[dict, dict]:
    d = json.loads(ruta.read_text(encoding="utf-8"))
    nodos = {int(k): (v[0], v[1]) for k, v in d["nodos"].items()}
    aristas = {(u, v): {"longitud": L, "geometria": [tuple(p) for p in g] if g else None,
                        "nombre": n, "tipo": t}
               for u, v, L, g, n, t in d["aristas"]}
    return nodos, aristas


def exportar_json(ruta: Path = RUTA_GRAPHML, destino: Path = RUTA_JSON) -> Path:
    """GraphML (OSMnx) → JSON ligero para el servidor web."""
    nodos, aristas = leer_graphml(ruta)
    datos = {"fuente": "OpenStreetMap contributors (ODbL)", "generado_desde": ruta.name,
             "nodos": {str(n): [round(la, 7), round(lo, 7)] for n, (la, lo) in nodos.items()},
             "aristas": [[u, v, round(a["longitud"], 3),
                          [[round(la, 7), round(lo, 7)] for la, lo in a["geometria"]] if a["geometria"] else None,
                          a["nombre"], a["tipo"]] for (u, v), a in aristas.items()]}
    destino.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return destino


def leer_graphml(ruta: Path) -> tuple[dict, dict]:
    import osmnx as ox  # solo para LEER el grafo almacenado

    g = ox.load_graphml(ruta)
    nodos = {int(n): (float(d["y"]), float(d["x"])) for n, d in g.nodes(data=True)}
    aristas: dict = {}
    for u, v, d in g.edges(data=True):
        u, v = int(u), int(v)
        longitud = float(d.get("length", 0.0))
        if (u, v) in aristas and aristas[(u, v)]["longitud"] <= longitud:
            continue  # aristas paralelas: se conserva la más corta
        geom = d.get("geometry")
        geometria = ([(float(lat), float(lon)) for lon, lat in geom.coords]
                     if geom is not None else None)
        nombre = d.get("name", "")
        if isinstance(nombre, list):
            nombre = " / ".join(map(str, nombre))
        tipo = d.get("highway", "")
        if isinstance(tipo, list):
            tipo = tipo[0]
        aristas[(u, v)] = {"longitud": longitud, "geometria": geometria,
                           "nombre": str(nombre) if nombre == nombre else "", "tipo": str(tipo)}
    return nodos, aristas


if __name__ == "__main__":
    print(f"Exportado: {exportar_json()}")


def red_desde_listas(nodos: dict, aristas: list) -> RedVial:
    """Construye una red pequeña a mano (pruebas). aristas = [(u, v), ...] con
    longitud calculada por Haversine."""
    datos = {}
    for u, v in aristas:
        (la1, lo1), (la2, lo2) = nodos[u], nodos[v]
        datos[(u, v)] = {"longitud": haversine_m(la1, lo1, la2, lo2)}
    return RedVial(nodos, datos, {"nombre": "Red de prueba"})
