"""RF-09 · Benchmark reproducible.

1. Búsqueda de los k=5 disponibles más cercanos: LINEAL vs QUADTREE
   con flotas de 300, 3 000 y 30 000 conductores sobre la red real.
   Se verifica que ambos métodos devuelvan EXACTAMENTE los mismos conductores.
2. Dijkstra PROPIO vs NetworkX (solo como validación): misma distancia,
   tiempos y nodos explorados.
3. Gráficos con Matplotlib en benchmark/*.png y datos en resultados.json/.csv.

Uso:  python -m benchmark.ejecutar_benchmark [--repeticiones 30] [--semilla 2024]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import platform
import random
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

CARPETA = Path(__file__).resolve().parent
TAMANOS = [300, 3000, 30000]
K = 5


def _resumen(muestras_s: list[float]) -> dict:
    ms = sorted(m * 1000 for m in muestras_s)
    return {"media_ms": statistics.fmean(ms), "mediana_ms": statistics.median(ms),
            "p95_ms": ms[min(len(ms) - 1, int(0.95 * len(ms)))],
            "min_ms": ms[0], "max_ms": ms[-1], "desv_ms": statistics.pstdev(ms)}


def benchmark_busqueda(red, repeticiones: int, semilla: int) -> list[dict]:
    from estructuras.quadtree import Quadtree
    from estructuras.vecinos import k_mas_cercanos, k_mas_cercanos_lineal
    from simulacion.conductor import Conductor
    from simulacion.flota import generar_flota

    filas = []
    for n in TAMANOS:
        rng = random.Random(semilla + n)
        flota = generar_flota(red, n, rng, proporcion_ocupados=0.3)
        # Se reparte cada conductor a lo largo de su calle (no todos en esquinas).
        for c in flota:
            c.avance_m = rng.uniform(0, red.aristas[(c.nodo_origen, c.nodo_destino)]["longitud"])
            c.x, c.y = red.punto_en_arista(c.nodo_origen, c.nodo_destino, c.avance_m)
            c.lat, c.lon = red.proyeccion.a_latlon(c.x, c.y)
        t0 = time.perf_counter()
        q = Quadtree(red.limites, capacidad=8)
        for c in flota:
            q.insertar(c)
        construccion_ms = (time.perf_counter() - t0) * 1000

        nodos = list(red.nodos.values())
        consultas = [rng.choice(nodos) for _ in range(repeticiones)]
        filtro = Conductor.esta_disponible
        t_quad, t_lin, revisados, ampliaciones = [], [], [], []
        coinciden = True
        for p in consultas:
            t0 = time.perf_counter()
            res = k_mas_cercanos(q, p.lat, p.lon, p.x, p.y, K, filtro=filtro)
            t_quad.append(time.perf_counter() - t0)
            t0 = time.perf_counter()
            lin = k_mas_cercanos_lineal(flota, p.lat, p.lon, K, filtro=filtro)
            t_lin.append(time.perf_counter() - t0)
            coinciden &= [c.id for _, c in res["candidatos"]] == [c.id for _, c in lin]
            revisados.append(sum(paso["elementos_revisados"] for paso in res["traza"]))
            ampliaciones.append(len(res["traza"]))
        quad, lin = _resumen(t_quad), _resumen(t_lin)
        fila = {"conductores": n, "consultas": repeticiones, "k": K,
                "quadtree": quad, "lineal": lin,
                "aceleracion_mediana": lin["mediana_ms"] / quad["mediana_ms"],
                "construccion_quadtree_ms": construccion_ms,
                "quadtree_nodos": q.estadisticas()["nodos"],
                "quadtree_profundidad": q.estadisticas()["profundidad"],
                "elementos_revisados_quadtree": statistics.fmean(revisados),
                "elementos_revisados_lineal": n,
                "ampliaciones_promedio": statistics.fmean(ampliaciones),
                "resultados_identicos": coinciden}
        filas.append(fila)
        print(f"  n={n:>6}: lineal {lin['mediana_ms']:.3f} ms · quadtree {quad['mediana_ms']:.3f} ms"
              f" · revisados {fila['elementos_revisados_quadtree']:.0f} · idénticos={coinciden}",
              flush=True)
    return filas


def benchmark_dijkstra(red, consultas: int, semilla: int) -> dict:
    import networkx as nx

    from algoritmos.dijkstra import dijkstra

    # NetworkX SOLO como referencia de validación (permitido por el documento),
    # construido con exactamente las mismas aristas y longitudes de la red.
    g = nx.DiGraph()
    g.add_weighted_edges_from(((u, v, a["longitud"]) for (u, v), a in red.aristas.items()), weight="length")
    rng = random.Random(semilla)
    ids = sorted(red.nodos)
    filas = []
    for _ in range(consultas):
        a, b = rng.choice(ids), rng.choice(ids)
        t0 = time.perf_counter()
        r = dijkstra(red.adyacencia, a, b)
        t_propio = time.perf_counter() - t0
        t0 = time.perf_counter()
        d_nx = nx.dijkstra_path_length(g, a, b, weight="length")
        t_nx = time.perf_counter() - t0
        filas.append({"origen": a, "destino": b, "distancia_propia_m": r.distancia_m,
                      "distancia_networkx_m": d_nx,
                      "diferencia_m": abs(r.distancia_m - d_nx),
                      "tiempo_propio_ms": t_propio * 1000, "tiempo_networkx_ms": t_nx * 1000,
                      "nodos_explorados": r.nodos_explorados})
    iguales = all(f["diferencia_m"] < 1e-6 for f in filas)
    print(f"  Dijkstra: {consultas} pares · distancias idénticas={iguales}", flush=True)
    return {"pares": filas, "todas_iguales": iguales,
            "propio": _resumen([f["tiempo_propio_ms"] / 1000 for f in filas]),
            "networkx": _resumen([f["tiempo_networkx_ms"] / 1000 for f in filas]),
            "nodos_red": len(red.nodos), "aristas_red": len(red.aristas)}


def graficar(res: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.facecolor": "#0A1022", "axes.facecolor": "#0A1022",
                         "axes.edgecolor": "#3B4566", "text.color": "#FFFFFF",
                         "axes.labelcolor": "#E2E8F5", "xtick.color": "#A8B3CC",
                         "ytick.color": "#A8B3CC", "grid.color": "#1E2846",
                         "font.size": 12, "axes.titleweight": "bold"})
    b = res["busqueda"]
    n = [f["conductores"] for f in b]

    fig, ax = plt.subplots(figsize=(10, 5.6))
    for clave, nombre, color in [("lineal", "Búsqueda lineal", "#F472B6"),
                                 ("quadtree", "Quadtree + heap", "#00D9FF")]:
        med = [f[clave]["mediana_ms"] for f in b]
        p95 = [f[clave]["p95_ms"] for f in b]
        ax.plot(n, med, marker="o", lw=2.5, color=color, label=f"{nombre} (mediana)")
        ax.fill_between(n, med, p95, color=color, alpha=0.15)
        for x, y in zip(n, med):
            ax.annotate(f"{y:.3f} ms", (x, y), textcoords="offset points", xytext=(0, 9),
                        ha="center", color=color, fontsize=10)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xticks(n, [f"{v:,}".replace(",", " ") for v in n])
    ax.set_xlabel("Conductores en la flota")
    ax.set_ylabel("Tiempo por consulta k=5 (ms, escala log)")
    ax.set_title("k vecinos más cercanos: búsqueda lineal vs Quadtree")
    ax.grid(True, which="both", alpha=0.5)
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(CARPETA / "grafico_busqueda.png", dpi=160)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(10, 5.6))
    x = range(len(n))
    ax.bar([i - 0.2 for i in x], [f["elementos_revisados_lineal"] for f in b], 0.4,
           color="#F472B6", label="Lineal (toda la flota)")
    ax.bar([i + 0.2 for i in x], [f["elementos_revisados_quadtree"] for f in b], 0.4,
           color="#00D9FF", label="Quadtree (promedio)")
    ax.set_yscale("log")
    ax.set_xticks(list(x), [f"{v:,}".replace(",", " ") for v in n])
    ax.set_xlabel("Conductores en la flota")
    ax.set_ylabel("Conductores revisados por consulta (log)")
    ax.set_title("Trabajo realizado por consulta")
    ax.legend(frameon=False)
    ax.grid(True, axis="y", alpha=0.5)
    fig.tight_layout()
    fig.savefig(CARPETA / "grafico_revisados.png", dpi=160)
    plt.close(fig)

    d = res["dijkstra"]["pares"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 5.4))
    a1.scatter([f["distancia_networkx_m"] / 1000 for f in d],
               [f["distancia_propia_m"] / 1000 for f in d], color="#8B5CF6", s=40)
    lim = max(f["distancia_networkx_m"] for f in d) / 1000 * 1.05
    a1.plot([0, lim], [0, lim], color="#A8B3CC", ls="--", lw=1)
    a1.set_xlabel("Distancia NetworkX (km)")
    a1.set_ylabel("Distancia Dijkstra propio (km)")
    a1.set_title("Validación: distancias idénticas")
    a1.grid(True, alpha=0.5)
    a2.scatter([f["nodos_explorados"] for f in d], [f["tiempo_propio_ms"] for f in d],
               color="#00D9FF", s=40, label="Propio")
    a2.scatter([f["nodos_explorados"] for f in d], [f["tiempo_networkx_ms"] for f in d],
               color="#F472B6", s=40, marker="^", label="NetworkX")
    a2.set_xlabel("Nodos explorados por nuestro Dijkstra")
    a2.set_ylabel("Tiempo (ms)")
    a2.set_title("Tiempo vs nodos explorados")
    a2.legend(frameon=False)
    a2.grid(True, alpha=0.5)
    fig.tight_layout()
    fig.savefig(CARPETA / "grafico_dijkstra.png", dpi=160)
    plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeticiones", type=int, default=30)
    ap.add_argument("--consultas-dijkstra", type=int, default=25)
    ap.add_argument("--semilla", type=int, default=2024)
    args = ap.parse_args()

    sys.path.insert(0, str(CARPETA.parent))
    from datos.red_vial import cargar_red

    print("Cargando red vial …", flush=True)
    red = cargar_red()
    print(f"Red: {len(red.nodos)} nodos, {len(red.aristas)} aristas", flush=True)
    print("Benchmark de búsqueda (lineal vs Quadtree) …", flush=True)
    busqueda = benchmark_busqueda(red, args.repeticiones, args.semilla)
    print("Benchmark de Dijkstra (propio vs NetworkX) …", flush=True)
    dij = benchmark_dijkstra(red, args.consultas_dijkstra, args.semilla)

    resultados = {
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "metodologia": {
            "semilla": args.semilla, "repeticiones_por_tamano": args.repeticiones,
            "k": K, "tamanos": TAMANOS, "capacidad_quadtree": 8,
            "proporcion_ocupados": 0.3,
            "descripcion": (
                "Para cada tamaño se genera una flota con semilla fija sobre la red real "
                "y se reparte cada conductor a lo largo de su calle. Se eligen "
                f"{args.repeticiones} pasajeros al azar en intersecciones. Cada consulta busca "
                "los k=5 conductores DISPONIBLES más cercanos (Haversine) con ambos métodos; "
                "se mide con time.perf_counter y se reporta mediana y p95. Se verifica que "
                "ambos métodos devuelvan los mismos conductores."),
            "limitaciones": [
                "Tiempos de Python en un solo equipo: dependen de CPU, carga y versión.",
                "La construcción del Quadtree no se incluye en el tiempo de consulta "
                "(se reporta por separado).",
                "La ventaja del Quadtree depende de la distribución espacial; con flotas "
                "pequeñas o muy concentradas la diferencia se reduce.",
                "NetworkX se usa solo como referencia de validación; su implementación "
                "tiene otras optimizaciones, por lo que el tiempo no compara solo el algoritmo.",
            ],
        },
        "entorno": {"python": platform.python_version(), "sistema": platform.platform(),
                    "procesador": platform.processor() or platform.machine()},
        "busqueda": busqueda,
        "dijkstra": dij,
    }
    (CARPETA / "resultados.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=1,
                                                         default=lambda v: None if isinstance(v, float) and math.isinf(v) else v),
                                             encoding="utf-8")
    with open(CARPETA / "resultados.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["conductores", "consultas", "lineal_mediana_ms", "quadtree_mediana_ms",
                    "lineal_p95_ms", "quadtree_p95_ms", "revisados_quadtree", "aceleracion",
                    "resultados_identicos"])
        for r in busqueda:
            w.writerow([r["conductores"], r["consultas"], f"{r['lineal']['mediana_ms']:.4f}",
                        f"{r['quadtree']['mediana_ms']:.4f}", f"{r['lineal']['p95_ms']:.4f}",
                        f"{r['quadtree']['p95_ms']:.4f}", f"{r['elementos_revisados_quadtree']:.1f}",
                        f"{r['aceleracion_mediana']:.2f}", r["resultados_identicos"]])
    print("Generando gráficos con Matplotlib …", flush=True)
    graficar(resultados)
    print("Benchmark terminado.", flush=True)


if __name__ == "__main__":
    main()
