"""Genera entregables/Presentacion_Conductor_Cercano_USMP.pptx (versión complementaria).

Contenido estático: la interactividad 3D y los cálculos en vivo se ejecutan en la
presentación web (iniciar.ps1). Los números se leen de los resultados reales:
benchmark/resultados.json, mapas/mapas.json y tests/resultados_junit.xml.

Uso:  python -m presentacion.generar_pptx
(antes: python -m presentacion.capturar, con el servidor encendido, para las capturas)
"""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

RAIZ = Path(__file__).resolve().parent.parent
CAPTURAS = RAIZ / "entregables" / "capturas"
SALIDA = RAIZ / "entregables" / "Presentacion_Conductor_Cercano_USMP.pptx"
URL_DEMO = "http://127.0.0.1:8000"

BG, BG2 = RGBColor(0x05, 0x08, 0x16), RGBColor(0x0A, 0x10, 0x22)
CIAN, VIOLETA, MAGENTA = RGBColor(0x00, 0xD9, 0xFF), RGBColor(0x8B, 0x5C, 0xF6), RGBColor(0xC0, 0x26, 0xD3)
BLANCO, GRIS, VERDE = RGBColor(0xFF, 0xFF, 0xFF), RGBColor(0xA8, 0xB3, 0xCC), RGBColor(0x22, 0xE3, 0x9B)
INTEGRANTES = ["Antezana Vargas Jorge Jose", "Andres Bardales Moreno", "Vanessa Guerrero Yaniz"]


def leer_datos() -> dict:
    d: dict = {}
    rb = RAIZ / "benchmark" / "resultados.json"
    d["bench"] = json.loads(rb.read_text(encoding="utf-8")) if rb.exists() else None
    rm = RAIZ / "mapas" / "mapas.json"
    d["mapas"] = json.loads(rm.read_text(encoding="utf-8")) if rm.exists() else []
    rj = RAIZ / "tests" / "resultados_junit.xml"
    if rj.exists():
        s = ET.parse(rj).getroot()
        s = s if s.tag == "testsuite" else s.find("testsuite")
        total, malas = int(s.get("tests")), int(s.get("failures")) + int(s.get("errors"))
        d["tests"] = (total - malas, total)
    else:
        d["tests"] = None
    rz = RAIZ / "datos" / "zona.json"
    d["zona"] = json.loads(rz.read_text(encoding="utf-8")) if rz.exists() else {}
    try:
        from datos.red_vial import cargar_red
        d["red"] = cargar_red().resumen()
    except Exception:  # sin red descargada
        d["red"] = None
    return d


class Mazo:
    def __init__(self):
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = Inches(13.333), Inches(7.5)
        self.vacio = self.prs.slide_layouts[6]
        self.n = 0

    def nueva(self, notas: str = ""):
        self.n += 1
        s = self.prs.slides.add_slide(self.vacio)
        fondo = s.background.fill
        fondo.gradient()
        fondo.gradient_angle = 135
        fondo.gradient_stops[0].color.rgb = BG2
        fondo.gradient_stops[1].color.rgb = BG
        if notas:
            s.notes_slide.notes_text_frame.text = notas
        return s

    @staticmethod
    def texto(s, x, y, w, h, contenido, tam=16, color=BLANCO, negrita=False, fuente="Segoe UI",
              alinear=PP_ALIGN.LEFT):
        caja = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = caja.text_frame
        tf.word_wrap = True
        lineas = contenido if isinstance(contenido, list) else [contenido]
        for i, linea in enumerate(lineas):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.alignment = alinear
            r = p.add_run()
            r.text = linea
            r.font.size, r.font.bold, r.font.name = Pt(tam), negrita, fuente
            r.font.color.rgb = color
        return caja

    @staticmethod
    def vinetas(s, x, y, w, h, items, tam=15):
        caja = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = caja.text_frame
        tf.word_wrap = True
        for i, item in enumerate(items):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.space_after = Pt(9)
            b = p.add_run()
            b.text = "▸  "
            b.font.color.rgb, b.font.size, b.font.bold = CIAN, Pt(tam), True
            r = p.add_run()
            r.text = item
            r.font.size, r.font.name = Pt(tam), "Segoe UI"
            r.font.color.rgb = RGBColor(0xDB, 0xE5, 0xFF)
        return caja

    @staticmethod
    def panel(s, x, y, w, h, borde=CIAN):
        f = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
        f.adjustments[0] = 0.06
        f.fill.solid()
        f.fill.fore_color.rgb = RGBColor(0x0E, 0x16, 0x2E)
        f.line.color.rgb = borde
        f.line.width = Pt(1.25)
        f.shadow.inherit = False
        return f

    def imagen(self, s, ruta: Path, x, y, w, h, recorte=None):
        if not ruta.exists():
            self.panel(s, x, y, w, h, VIOLETA)
            self.texto(s, x + 0.3, y + h / 2 - 0.3, w - 0.6, 0.8,
                       "Captura no disponible: ejecutar python -m presentacion.capturar", 13, GRIS)
            return
        if recorte:
            img = Image.open(ruta)
            W, H = img.size
            ruta_rec = ruta.with_name(f"{ruta.stem}_rec.png")
            img.crop((int(recorte[0] * W), int(recorte[1] * H), int(recorte[2] * W), int(recorte[3] * H))).save(ruta_rec)
            ruta = ruta_rec
        img = Image.open(ruta)
        rel = img.size[0] / img.size[1]
        if w / h > rel:
            ancho, alto = h * rel, h
        else:
            ancho, alto = w, w / rel
        self.panel(s, x - 0.04 + (w - ancho) / 2, y - 0.04 + (h - alto) / 2, ancho + 0.08, alto + 0.08)
        s.shapes.add_picture(str(ruta), Inches(x + (w - ancho) / 2), Inches(y + (h - alto) / 2),
                             Inches(ancho), Inches(alto))

    def encabezado(self, s, eyebrow, titulo):
        self.texto(s, 0.6, 0.35, 10, 0.4, eyebrow.upper(), 12, CIAN, True)
        self.texto(s, 0.6, 0.7, 11.6, 0.9, titulo, 32, BLANCO, True, "Segoe UI Semibold")
        self.texto(s, 11.9, 0.35, 0.9, 0.6, f"{self.n:02d}", 26, RGBColor(0x1F, 0x4E, 0x7A), True,
                   alinear=PP_ALIGN.RIGHT)
        barra = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(7.42), Inches(13.333 * self.n / 18), Inches(0.08))
        barra.fill.solid()
        barra.fill.fore_color.rgb = CIAN
        barra.line.fill.background()
        self.texto(s, 0.6, 7.0, 12, 0.35, f"USMP · AED II · Proyecto Integrador N.º 2 · Demo interactiva: {URL_DEMO}/#s-{self.n:02d}", 10, GRIS)

    def estandar(self, eyebrow, titulo, items, captura: int | None, notas="", recorte=None):
        s = self.nueva(notas)
        self.encabezado(s, eyebrow, titulo)
        self.vinetas(s, 0.6, 1.75, 4.6, 5.1, items)
        if captura:
            self.imagen(s, CAPTURAS / f"s{captura:02d}.png", 5.45, 1.75, 7.3, 5.1, recorte)
        return s


def construir() -> Path:
    d = leer_datos()
    z = d["zona"]
    m = Mazo()
    rec = (0.0, 0.06, 1.0, 0.93)  # quita barra superior e inferior de las capturas

    # 01 · Portada -------------------------------------------------------
    s = m.nueva("Portada. Presentar al equipo y el problema. La versión interactiva se abre con iniciar.ps1.")
    m.imagen(s, CAPTURAS / "s01.png", 6.2, 0.0, 7.13, 7.5, recorte=(0.42, 0.06, 0.80, 0.93))
    m.texto(s, 0.6, 0.55, 6, 0.4, "UNIVERSIDAD DE SAN MARTÍN DE PORRES", 15, BLANCO, True)
    m.texto(s, 0.6, 0.9, 6, 0.4, "Facultad de Ingeniería y Arquitectura", 13, GRIS)
    m.texto(s, 0.6, 1.5, 6, 0.4, "PROYECTO INTEGRADOR N.º 2", 14, CIAN, True)
    m.texto(s, 0.6, 1.9, 6.2, 1.8, ["ASIGNACIÓN DEL", "CONDUCTOR MÁS CERCANO"], 34, BLANCO, True, "Segoe UI Black")
    m.texto(s, 0.6, 3.75, 6, 0.5, "Cómo Uber, Cabify o InDrive encuentran tu taxi en segundos.", 15, RGBColor(0xDB, 0xE5, 0xFF))
    m.panel(s, 0.6, 4.35, 5.4, 2.55)
    m.texto(s, 0.85, 4.45, 5, 0.3, "CURSO", 11, CIAN, True)
    m.texto(s, 0.85, 4.7, 5, 0.4, "Algoritmos y Estructura de Datos II", 15, BLANCO, True)
    m.texto(s, 0.85, 5.12, 5, 0.3, "INTEGRANTES", 11, CIAN, True)
    m.texto(s, 0.85, 5.37, 5, 1.0, [f"{i}. {n}" for i, n in enumerate(INTEGRANTES, 1)], 14, BLANCO, True)
    m.texto(s, 0.85, 6.38, 5, 0.4, "CICLO:  IV", 13, BLANCO, True)

    b = d["bench"]
    bus = b["busqueda"] if b else []
    dij = b["dijkstra"] if b else None

    m.estandar("Contexto · el problema", "¿Cómo se encuentra al conductor que llega primero?", [
        "Entre cientos o miles de conductores en movimiento, la app debe responder en milisegundos.",
        "Ingenuo: revisar a los n conductores y calcular n rutas por calles → no escala.",
        "Espacial: un índice (Quadtree) descarta regiones completas; solo k candidatos llegan a Dijkstra.",
        "La comparación usa la flota real del backend sobre la red de Comas.",
    ], 2, "Comparar ambos lienzos: a la izquierda se revisan todos; a la derecha solo los cuadrantes visitados.", rec)
    m.estandar("Contexto · objetivos y arquitectura", "Objetivos y flujo del sistema", [
        "Quadtree propio para búsquedas por cercanía.",
        "Heap, grafos y Dijkstra integrados en un sistema completo.",
        "Datos geográficos reales (OpenStreetMap, Comas) y mapas.",
        "Mediciones que muestran por qué la búsqueda lineal no escala.",
        "Pasajero → Quadtree → Haversine → Heap → Dijkstra → ETA → Conductor asignado.",
        "Frontend Three.js · API FastAPI · dominio Python (estructuras/, algoritmos/, simulacion/).",
    ], 3, "Recorrer las 7 etapas del flujo y nombrar el archivo Python de cada una.", rec)
    m.estandar("Datos · RF-01", "Red vial real de Comas", [
        f"Zona: {z.get('nombre', 'Comas, Lima')} (bbox N {z.get('norte')}, S {z.get('sur')}, O {z.get('oeste')}, E {z.get('este')}).",
        f"Descargada una vez con OSMnx (network_type='drive'): {z.get('nodos_originales', '—')} nodos y {z.get('aristas_originales', '—')} aristas dirigidas.",
        (f"Se conserva la componente fuertemente conexa mayor (Kosaraju propio): {d['red']['nodos']} nodos, "
         f"{d['red']['aristas']} aristas, {d['red']['area_km2']} km²." if d["red"] else
         "Se conserva la componente fuertemente conexa mayor (Kosaraju propio)."),
        f"{z.get('edificios', '—')} huellas de edificios de OSM; alturas sin dato = ilustrativas.",
        "Grafo dirigido: respeta los sentidos de circulación.",
    ], 4, "RF-01: mostrar que el archivo GraphML está en datos/ y no se descarga en cada ejecución.", rec)
    m.estandar("Datos · RF-02", "Modelo de flota", [
        "300 conductores por defecto (configurable), sobre intersecciones reales.",
        "Atributos: id, lat/lon, x/y, estado, velocidad, arista actual y avance, ruta.",
        "Estados: disponible (verde), ocupado (rojo), candidato (amarillo), asignado (violeta).",
        "Semilla fija: la misma semilla genera exactamente la misma flota.",
    ], 5, "", rec)
    m.estandar("Estructuras · RF-03", "Quadtree: partición espacial", [
        "Clases NodoQuadtree y Quadtree (estructuras/quadtree.py).",
        "insertar, eliminar (con fusión), buscar_en_rectangulo, actualizar_posicion.",
        "Al superar la capacidad, la hoja se divide en NO, NE, SO, SE.",
        "La búsqueda poda los cuadrantes que no intersectan el rectángulo.",
        "Mismo punto: no subdivide si los puntos son idénticos ni pasa de profundidad 16 → hoja desbordada.",
    ], 6, "Demostrar inserción, subdivisión, búsqueda y el caso de muchos conductores en el mismo punto.", rec)
    m.estandar("Algoritmos · RF-04", "Fórmula de Haversine", [
        "a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)",
        "d = 2R · atan2(√a, √(1−a)),   R = 6 371 008,8 m",
        "φ: latitud, λ: longitud (radianes). Distancia sobre la superficie terrestre.",
        "Implementación propia en estructuras/haversine.py.",
        "La línea Haversine (amarilla) NO es la ruta: la ruta por calles (violeta) la calcula Dijkstra.",
    ], 7, "", rec)
    m.estandar("Algoritmos · RF-04", "Heap: los k disponibles más cercanos", [
        "Consulta progresiva: cuadrado de semilado r alrededor del pasajero.",
        "Haversine a cada disponible encontrado; max-heap (heapq) de tamaño k: O(m log k).",
        "Exacto si el k-ésimo está a ≤ r: nadie fuera del cuadrado puede ser mejor.",
        "Si faltan candidatos o el k-ésimo cae en la esquina, se duplica r.",
        "Orden por Haversine ≠ orden final por ETA.",
    ], 8, "", rec)
    m.estandar("Algoritmos · RF-05", "Dijkstra sobre las calles", [
        "Implementación propia con heapq (algoritmos/dijkstra.py); sin funciones de NetworkX/OSMnx.",
        "Desde el conductor HACIA el pasajero, sobre el grafo dirigido.",
        "Colores: azul pendiente, amarillo actual, verde procesado, violeta ruta final.",
        "La animación reproduce la traza real de la ejecución (extraer / relajar / ruta).",
        f"Validado con NetworkX: {'distancias idénticas en ' + str(len(dij['pares'])) + ' rutas' if dij and dij['todas_iguales'] else 'ver benchmark'}.",
    ], 9, "", rec)
    m.estandar("Algoritmos · RF-05", "ETA: tiempo estimado de llegada", [
        "ETA (min) = (distancia vial en m / 1000) / velocidad (km/h) × 60.",
        "Velocidad promedio configurable (30 km/h por defecto).",
        "Se asigna el menor ETA ALCANZABLE.",
        "Caso real de la captura: el más cercano en línea recta recorre mucho más por calles.",
    ], 10, "Usar «Buscar caso real» para mostrar que el más cercano en línea recta no siempre llega primero.", rec)
    m.estandar("Integración", "El Despachador asigna el menor ETA", [
        "Clase Despachador (simulacion/despachador.py) coordina todo el flujo.",
        "Pasajero por clic en el mapa, coordenadas o dirección (Nominatim, con errores explícitos).",
        "Errores claros: sin taxis, coordenada inválida, fuera de zona, sin conexión vial, sin ruta, tiempo agotado.",
        "El conductor elegido pasa a «asignado» y recibe su ruta.",
    ], 11, "", rec)
    m.estandar("Integración · RF-06", "Simulación de flota por turnos", [
        "Cada turno: mover por aristas reales → actualizar_posicion en el Quadtree → estados.",
        "Modo automático y paso a paso, velocidad 0,5× a 4×.",
        "Reinicio reproducible con semilla configurable.",
        "La animación sigue exactamente los puntos calculados por Python.",
    ], 12, "", rec)
    m.estandar("Demostración", "Mapa interactivo de Comas", [
        "Zoom, rotación, vista superior/isométrica, centrar, restablecer, seguir taxi.",
        "Mostrar u ocultar edificios, conductores, rutas, búsqueda y Quadtree de la flota.",
        "«Solicitar taxi» ejecuta todo el flujo y la cámara sigue al taxi asignado.",
        f"Abrir en vivo: {URL_DEMO}/#s-13",
    ], 13, "", rec)

    # 14 · Benchmark ---------------------------------------------------------
    s = m.nueva("RF-09: mediciones reales de benchmark/resultados.json. Leer metodología y limitaciones.")
    m.encabezado(s, "Resultados · RF-09", "Benchmark real: lineal vs Quadtree")
    if b:
        filas = [["Flota", "Lineal (mediana)", "Quadtree (mediana)", "Mejora", "Revisados", "Iguales"]] + [
            [f"{f['conductores']:,}".replace(",", " "), f"{f['lineal']['mediana_ms']:.3f} ms", f"{f['quadtree']['mediana_ms']:.3f} ms",
             f"{f['aceleracion_mediana']:.1f}×", f"{f['elementos_revisados_quadtree']:.0f}", "sí" if f["resultados_identicos"] else "no"] for f in bus]
        tabla = s.shapes.add_table(len(filas), 6, Inches(0.6), Inches(1.75), Inches(6.2), Inches(1.6)).table
        for i, fila in enumerate(filas):
            for j, val in enumerate(fila):
                c = tabla.cell(i, j)
                c.text = val
                c.fill.solid()
                c.fill.fore_color.rgb = RGBColor(0x12, 0x1C, 0x3A) if i else RGBColor(0x0B, 0x3A, 0x55)
                p = c.text_frame.paragraphs[0]
                p.runs[0].font.size, p.runs[0].font.color.rgb, p.runs[0].font.bold = Pt(12), BLANCO, i == 0
        met = b["metodologia"]
        m.vinetas(s, 0.6, 3.6, 6.2, 3.3, [
            f"Semilla {met['semilla']} · {met['repeticiones_por_tamano']} consultas por tamaño · k = 5.",
            f"Dijkstra propio vs NetworkX: {len(dij['pares'])} pares, distancias idénticas: {'sí' if dij['todas_iguales'] else 'no'}.",
            f"Entorno: Python {b['entorno']['python']} · {b['entorno']['sistema']}.",
            "Limitación: tiempos de un solo equipo; la ventaja depende de la distribución espacial.",
        ], 13)
        m.imagen(s, RAIZ / "benchmark" / "grafico_busqueda.png", 7.0, 1.75, 5.8, 3.3)
        m.imagen(s, RAIZ / "benchmark" / "grafico_dijkstra.png", 7.0, 5.15, 5.8, 1.75)
    else:
        m.texto(s, 0.6, 2, 12, 1, "Benchmark pendiente de ejecutar: python -m benchmark.ejecutar_benchmark", 18, GRIS)

    # 15 · Complejidad ---------------------------------------------------------
    s = m.nueva("No son garantías absolutas: dependen de la distribución espacial.")
    m.encabezado(s, "Resultados · análisis Big-O", "Complejidad por operación")
    filas = [["Operación", "Promedio", "Peor caso"],
             ["Quadtree insertar / eliminar / actualizar", "O(log n)", "O(P + c)"],
             ["Quadtree construir", "O(n log n)", "O(n · P)"],
             ["Buscar en rectángulo", "O(log n + m)", "O(n)"],
             ["Haversine (par)", "O(1)", "O(1)"],
             ["Heap de k candidatos", "O(m log k)", "O(m log k)"],
             ["Búsqueda lineal", "O(n log k)", "O(n log k)"],
             ["Dijkstra (cola binaria)", "O((V+E) log V)", "O((V+E) log V)"],
             ["Despacho completo", "O(log n + m log k + k(V+E) log V)", "idem, m = n"]]
    tabla = s.shapes.add_table(len(filas), 3, Inches(0.6), Inches(1.75), Inches(7.6), Inches(4.4)).table
    for i, fila in enumerate(filas):
        for j, val in enumerate(fila):
            c = tabla.cell(i, j)
            c.text = val
            c.fill.solid()
            c.fill.fore_color.rgb = RGBColor(0x12, 0x1C, 0x3A) if i else RGBColor(0x0B, 0x3A, 0x55)
            r = c.text_frame.paragraphs[0].runs[0]
            r.font.size, r.font.bold = Pt(12), i == 0
            r.font.color.rgb = BLANCO if j == 0 or i == 0 else (CIAN if j == 1 else RGBColor(0xFF, 0x8A, 0xA0))
    m.vinetas(s, 8.5, 1.75, 4.3, 5, [
        "n conductores, m dentro de la región, k candidatos, P profundidad, c tamaño de hoja desbordada.",
        "Uniforme: árbol balanceado.",
        "Concentrada: ramas profundas u hojas desbordadas.",
        "Pocos disponibles: se amplía el radio varias veces.",
        "Domina Dijkstra, pero se ejecuta k veces y no n.",
    ], 13)

    m.estandar("Calidad · pytest", "Pruebas automatizadas", [
        f"Último resultado: {d['tests'][0]} de {d['tests'][1]} pruebas pasaron." if d["tests"] else "Ejecutar: python -m pytest",
        "Quadtree vacío, inserción, eliminación, actualización, mismo punto, rectángulo.",
        "Sin disponibles, Haversine conocido, Dijkstra válido, sin ruta, sin conexión vial.",
        "Menor ETA, Quadtree en turnos, semilla reproducible, endpoints FastAPI.",
        "E2E con Playwright: abrir, navegar, cambiar de modo, solicitar taxi, errores, reiniciar.",
    ], 16, "", rec)
    m.estandar("Contexto · industria", "Quadtree frente a H3, S2, Geohash y R-tree", [
        "H3 (Uber): hexágonos jerárquicos; 6 vecinos equidistantes.",
        "S2 (Google): esfera → cubo → curva de Hilbert.",
        "Geohash (Redis): cadena por prefijos; problema en bordes.",
        "R-tree (PostGIS): rectángulos que se solapan; ideal en disco y para polígonos.",
        "Misma idea: dividir el espacio para buscar solo donde importa. No son implementaciones idénticas.",
    ], 17, "", rec)

    # 18 · Conclusiones -------------------------------------------------------
    con = []
    if bus:
        ul, pr = bus[-1], bus[0]
        con.append(f"Con {ul['conductores']:,} conductores: Quadtree {ul['quadtree']['mediana_ms']:.2f} ms vs lineal {ul['lineal']['mediana_ms']:.2f} ms (mediana), mismos candidatos.".replace(",", " "))
        con.append(f"Con {pr['conductores']} conductores la ventaja medida fue {pr['aceleracion_mediana']:.1f}×; depende del tamaño y la distribución.")
    if dij:
        con.append(f"Dijkstra propio = NetworkX en {len(dij['pares'])} rutas reales de Comas.")
    if d["tests"]:
        con.append(f"{d['tests'][0]}/{d['tests'][1]} pruebas pytest aprobadas.")
    con.append(f"{len(d['mapas'])} mapas Folium generados en mapas/ (RF-07).")
    con.append("El más cercano en línea recta no siempre llega primero: se asigna por ETA.")
    con.append("Limitaciones: velocidad constante, sin tráfico; alturas ilustrativas; Nominatim requiere Internet.")
    m.estandar("Cierre", "Resultados, conclusiones y demostración final", con, 18,
               f"Demostración final: abrir {URL_DEMO}/#s-18 y pulsar «Iniciar solicitud completa».", rec)

    SALIDA.parent.mkdir(exist_ok=True)
    m.prs.save(SALIDA)
    return SALIDA


if __name__ == "__main__":
    ruta = construir()
    p = Presentation(ruta)
    print(f"Generado {ruta} · {len(p.slides)} diapositivas")
