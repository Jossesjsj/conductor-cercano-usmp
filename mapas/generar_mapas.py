"""RF-07 · Genera tres mapas HTML interactivos (Folium) con asignaciones distintas.

Uso:  python -m mapas.generar_mapas [--semilla 42]

Cada mapa muestra: pasajero, conductores por estado, k candidatos con su
ranking, conductor asignado, ruta por calles (Dijkstra), líneas Haversine,
leyenda y tabla de ETA.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import folium

from datos.red_vial import cargar_red
from simulacion.simulador import Simulacion

CARPETA = Path(__file__).resolve().parent
COLORES = {"disponible": "#00D9FF", "ocupado": "#EF4444", "asignado": "#8B5CF6"}

# Tres puntos de recojo dentro de la zona (lat, lon) y su descripción.
SOLICITUDES = [
    (-11.9365, -77.0590, "Sector norte (cerca de la Av. Túpac Amaru)"),
    (-11.9445, -77.0530, "Sector centro-este"),
    (-11.9480, -77.0630, "Sector suroeste"),
]


def latlon(red, x, y):
    return list(red.proyeccion.a_latlon(x, y))


def construir_mapa(sim: Simulacion, res: dict, numero: int, descripcion: str) -> dict:
    red = sim.red
    p = res["pasajero"]
    elegido = res["elegido"]
    ids_candidatos = {r["conductor"].id for r in res["rutas"]}
    mapa = folium.Map(location=[p.lat, p.lon], zoom_start=16, tiles="CartoDB dark_matter",
                      control_scale=True)
    folium.TileLayer("OpenStreetMap", name="OpenStreetMap").add_to(mapa)

    flota = folium.FeatureGroup(name="Flota (por estado)")
    for c in sim.conductores.values():
        if c.id in ids_candidatos:
            continue
        folium.CircleMarker([c.lat, c.lon], radius=3.5, color=COLORES[c.estado], weight=1,
                            fill=True, fill_opacity=0.85,
                            tooltip=f"Conductor {c.id} · {c.estado}").add_to(flota)
    flota.add_to(mapa)

    capa_cand = folium.FeatureGroup(name="Candidatos k y líneas Haversine")
    for r in res["rutas"]:
        c = r["conductor"]
        es_elegido = c.id == elegido["conductor"].id
        folium.PolyLine([[p.lat, p.lon], [c.lat, c.lon]], color="#FACC15", weight=1.5,
                        dash_array="6 6", opacity=0.8,
                        tooltip=f"Haversine {r['distancia_haversine_m']:.0f} m").add_to(capa_cand)
        eta = "sin ruta" if not r["alcanzable"] else f"{r['eta_min']:.1f} min"
        folium.CircleMarker(
            [c.lat, c.lon], radius=9 if es_elegido else 7,
            color="#8B5CF6" if es_elegido else "#FACC15", weight=3, fill=True,
            fill_color="#8B5CF6" if es_elegido else "#FACC15", fill_opacity=0.9,
            tooltip=(f"#{r['ranking']} · Conductor {c.id} · Haversine "
                     f"{r['distancia_haversine_m']:.0f} m · vial "
                     f"{(r['distancia_vial_m'] or 0):.0f} m · ETA {eta}")).add_to(capa_cand)
    capa_cand.add_to(mapa)

    ruta = [latlon(red, x, y) for x, y in elegido["geometria"]]
    folium.PolyLine(ruta, color="#8B5CF6", weight=7, opacity=0.95,
                    tooltip=f"Ruta por calles (Dijkstra): {elegido['distancia_vial_m']:.0f} m"
                    ).add_to(mapa)
    folium.Marker([p.lat, p.lon], tooltip="Pasajero",
                  icon=folium.Icon(color="white", icon_color="#C026D3", icon="user", prefix="fa")
                  ).add_to(mapa)
    folium.LayerControl(collapsed=False).add_to(mapa)

    filas = ""
    for r in res["rutas"]:
        estilo = "color:#C4B5FD;font-weight:700" if r["conductor"] is elegido["conductor"] else ""
        vial = f"{r['distancia_vial_m']:.0f} m" if r["alcanzable"] else "—"
        eta = f"{r['eta_min']:.2f} min" if r["alcanzable"] else "sin ruta"
        filas += (f"<tr style='{estilo}'><td>#{r['ranking']}</td><td>{r['conductor'].id}</td>"
                  f"<td>{r['distancia_haversine_m']:.0f} m</td><td>{vial}</td><td>{eta}</td></tr>")
    panel = f"""
    <div style="position:fixed;top:12px;left:56px;z-index:9999;background:rgba(10,16,34,.92);
         color:#fff;font:13px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:12px;
         border:1px solid #00D9FF55;max-width:420px">
      <div style="font-weight:800;font-size:15px;color:#00D9FF">Asignación {numero} · Pasajero {p.id}</div>
      <div style="color:#A8B3CC">{descripcion} · {red.zona.get('nombre', '')}</div>
      <div style="margin:6px 0">Asignado: <b style="color:#C4B5FD">Conductor {elegido['conductor'].id}</b>
        · ETA <b>{elegido['eta_min']:.2f} min</b> a {elegido['velocidad_kmh']:.0f} km/h
        · {elegido['distancia_vial_m']:.0f} m por calles</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="color:#A8B3CC"><th align=left>Rank</th><th align=left>ID</th>
        <th align=left>Haversine</th><th align=left>Vial</th><th align=left>ETA</th></tr>{filas}
      </table>
      <div style="margin-top:8px;color:#A8B3CC;font-size:12px">
        <span style="color:#00D9FF">●</span> disponible &nbsp;
        <span style="color:#EF4444">●</span> ocupado &nbsp;
        <span style="color:#FACC15">●</span> candidato &nbsp;
        <span style="color:#8B5CF6">●</span> asignado &nbsp;
        <span style="color:#FACC15">- -</span> Haversine &nbsp;
        <span style="color:#8B5CF6">━</span> ruta Dijkstra</div>
      <div style="color:#6B7795;font-size:11px;margin-top:4px">Semilla {sim.config['semilla']} ·
        {len(sim.conductores)} conductores · Datos © OpenStreetMap (ODbL)</div>
    </div>"""
    mapa.get_root().html.add_child(folium.Element(panel))
    nombre = f"asignacion_{numero}.html"
    mapa.save(CARPETA / nombre)
    return {"archivo": nombre, "descripcion": descripcion, "pasajero_id": p.id,
            "lat": p.lat, "lon": p.lon, "conductor_id": elegido["conductor"].id,
            "eta_min": round(elegido["eta_min"], 2),
            "distancia_vial_m": round(elegido["distancia_vial_m"], 1),
            "distancia_haversine_m": round(elegido["distancia_haversine_m"], 1),
            "mas_cercano_en_linea_recta_id": res["mas_cercano_en_linea_recta_id"],
            "candidatos": len(res["rutas"])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--semilla", type=int, default=42)
    ap.add_argument("--k", type=int, default=5)
    args = ap.parse_args()
    red = cargar_red()
    sim = Simulacion(red, cantidad=300, semilla=args.semilla, k=args.k)
    detalle = []
    for i, (lat, lon, desc) in enumerate(SOLICITUDES, 1):
        sim.avanzar_turno()  # el estado de la flota cambia entre solicitudes
        p = sim.despachador.crear_pasajero(lat, lon)
        res = sim.despachador.asignar(p, args.k)
        info = construir_mapa(sim, res, i, desc)
        detalle.append(info)
        print(f"Mapa {i}: pasajero {p.id} → conductor {info['conductor_id']} "
              f"(ETA {info['eta_min']} min) · {info['archivo']}")
    (CARPETA / "mapas.json").write_text(json.dumps(detalle, ensure_ascii=False, indent=1),
                                        encoding="utf-8")


if __name__ == "__main__":
    main()
