#!/usr/bin/env python3
"""
Preprocesa la red vial real de Comas (OpenStreetMap / Overpass API)
y genera assets/data/comas-network.json para la presentación.

Uso:
    python tools/preprocess_osm.py ruta/al/overpass.json

La consulta usada para obtener el archivo de entrada fue:
    [out:json][timeout:90];
    way["highway"](-11.955,-77.065,-11.925,-77.025);
    out geom;

El JSON de salida conserva la geometría de cada calle, de modo que el
navegador puede dibujar la red real sin volver a descargar datos.
"""
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

R_EARTH_KM = 6371.0088

DRIVABLE = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary",
    "primary_link", "secondary", "secondary_link", "tertiary",
    "tertiary_link", "unclassified", "residential", "living_street",
    "service", "busway",
}
CLASS_ORDER = {
    "motorway": 0, "trunk": 1, "primary": 2, "secondary": 3,
    "tertiary": 4, "unclassified": 5, "residential": 6,
    "living_street": 7, "service": 8, "busway": 9,
    "motorway_link": 10, "trunk_link": 11, "primary_link": 12,
    "secondary_link": 13, "tertiary_link": 14,
}


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH_KM * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main(src):
    raw = json.load(open(src, encoding="utf-8-sig"))
    ways = [e for e in raw["elements"] if e.get("type") == "way"]
    coords = {}
    kept = 0
    edge_map = {}

    for w in ways:
        tags = w.get("tags", {})
        hw = tags.get("highway")
        if hw not in DRIVABLE:
            continue
        nodes = w.get("nodes", [])
        geom = w.get("geometry", [])
        if len(nodes) < 2 or len(nodes) != len(geom):
            continue
        kept += 1
        cls = hw
        name = tags.get("name", "")
        oneway = tags.get("oneway", "")
        for nid, g in zip(nodes, geom):
            coords[nid] = (round(float(g["lat"]), 6), round(float(g["lon"]), 6))
        for i in range(len(nodes) - 1):
            a, b = nodes[i], nodes[i + 1]
            if a == b:
                continue
            la, lo = coords[a]
            lb, lob = coords[b]
            wgt = haversine(la, lo, lb, lob)
            if wgt < 0.0005:  # descartar segmentos menores a 0,5 m
                continue
            key = (a, b) if a < b else (b, a)
            prev = edge_map.get(key)
            if prev is None or wgt < prev["w"]:
                edge_map[key] = {
                    "a": a, "b": b, "w": round(wgt, 3),
                    "cls": cls, "name": name, "oneway": oneway,
                    "via": [[la, lo], [lb, lob]],
                }

    # --- grafo no dirigido para conectividad y contracción ---
    adj = defaultdict(dict)  # u -> v -> peso
    edge_info = {}
    for e in edge_map.values():
        a, b = e["a"], e["b"]
        adj[a][b] = e["w"]
        adj[b][a] = e["w"]
        edge_info[(a, b)] = e

    # componente conexa más grande
    seen = set()
    largest = set()
    for start in adj:
        if start in seen:
            continue
        q = deque([start])
        comp = set([start])
        seen.add(start)
        while q:
            u = q.popleft()
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    comp.add(v)
                    q.append(v)
        if len(comp) > len(largest):
            largest = comp
    adj = {u: {v: w for v, w in nb.items() if v in largest} for u, nb in adj.items() if u in largest}

    important = {u for u, nb in adj.items() if len(nb) != 2}

    # --- contracción de cadenas de grado 2 ---
    def oriented_edge(u, v):
        """Devuelve (peso, geometria desde u hacia v)."""
        e = edge_info.get((u, v))
        if e is not None:
            return e["w"], e["via"], e
        e = edge_info[(v, u)]
        return e["w"], list(reversed(e["via"])), e

    contracted = {}
    for u in sorted(important):
        for v0 in sorted(adj[u]):
            total = 0.0
            pts = [list(coords[u])]
            prev, cur = u, v0
            guard = 0
            while True:
                guard += 1
                if guard > 10000:
                    break
                wgt, via, e = oriented_edge(prev, cur)
                total += wgt
                pts.extend(via[1:])
                if cur in important:
                    break
                nxt = [n for n in adj[cur] if n != prev]
                if not nxt:
                    break
                prev, cur = cur, nxt[0]
            if cur == u:
                continue
            key = (u, cur) if u < cur else (cur, u)
            rec = {
                "a": u, "b": cur, "w": round(total, 3),
                "cls": e["cls"], "name": e["name"],
            }
            prev_rec = contracted.get(key)
            if prev_rec is None or total < prev_rec["w"]:
                # garantizar que la geometría empiece en rec["a"]
                if key[0] == u:
                    rec["via"] = [[round(p[0], 6), round(p[1], 6)] for p in pts]
                else:
                    rec["via"] = [[round(p[0], 6), round(p[1], 6)] for p in reversed(pts)]
                contracted[key] = rec

    # eliminar posibles nodos aislados tras la contracción
    used = set()
    for e in contracted.values():
        used.add(e["a"])
        used.add(e["b"])
    nodes_out = []
    for nid in sorted(used):
        lat, lon = coords[nid]
        nodes_out.append({"id": str(nid), "lat": lat, "lon": lon, "deg": 0})
    by_id = {n["id"]: n for n in nodes_out}
    edges_out = []
    for i, e in enumerate(sorted(contracted.values(), key=lambda x: (CLASS_ORDER.get(x["cls"], 99), -x["w"]))):
        a, b = str(e["a"]), str(e["b"])
        by_id[a]["deg"] += 1
        by_id[b]["deg"] += 1
        edges_out.append({
            "id": i, "a": a, "b": b, "w": e["w"],
            "cls": e["cls"], "name": e.get("name", ""),
            "via": e["via"],
        })

    lats = [n["lat"] for n in nodes_out]
    lons = [n["lon"] for n in nodes_out]
    minlat, maxlat = min(lats), max(lats)
    minlon, maxlon = min(lons), max(lons)
    clat, clon = (minlat + maxlat) / 2, (minlon + maxlon) / 2
    height_km = haversine(minlat, clon, maxlat, clon)
    width_km = haversine(clat, minlon, clat, maxlon)
    area_km2 = width_km * height_km

    total_len = sum(e["w"] for e in edges_out)  # km, ya calculado con Haversine
    osm_meta = raw.get("osm3s", {})
    out = {
        "meta": {
            "mode": "real-osm",
            "district": "Comas, Lima, Perú",
            "source": "OpenStreetMap contributors",
            "source_url": "https://www.openstreetmap.org",
            "license": "Open Data Commons Open Database License (ODbL) 1.0",
            "license_url": "https://opendatacommons.org/licenses/odbl/1-0/",
            "acquisition": "Overpass API (way[\"highway\"](bbox); out geom;)",
            "osm_timestamp": osm_meta.get("timestamp_osm_base", ""),
            "processed": "2026-11-05",
            "bbox": {"minlat": minlat, "minlon": minlon, "maxlat": maxlat, "maxlon": maxlon},
            "center": {"lat": round(clat, 6), "lon": round(clon, 6)},
            "width_km": round(width_km, 3),
            "height_km": round(height_km, 3),
            "area_km2": round(area_km2, 3),
            "raw_ways": len(ways),
            "drivable_ways": kept,
            "nodes": len(nodes_out),
            "edges": len(edges_out),
            "road_length_km": round(total_len, 3),
            "filter": sorted(DRIVABLE),
            "note": "Grafo peatonal y ciclovías excluidos. Los nodos de grado 2 se contrajeron para formar intersecciones y extremos. La geometría de cada arista conserva los puntos intermedios de la calle real.",
        },
        "nodes": nodes_out,
        "edges": edges_out,
    }
    dest = Path(__file__).resolve().parents[1] / "assets" / "data" / "comas-network.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"OK -> {dest}")
    print(json.dumps(out["meta"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\jorge\AppData\Local\Temp\opencode\comas_overpass.json")
