# Proyecto Integrador N.º 2 — Asignación del conductor más cercano

**Cómo Uber, Cabify o InDrive encuentran tu taxi en segundos.**

Universidad de San Martín de Porres · Facultad de Ingeniería y Arquitectura
Curso: **Algoritmos y Estructura de Datos II** · Ciclo **IV**

Integrantes:
1. Antezana Vargas Jorge Jose
2. Andres Bardales Moreno
3. Vanessa Guerrero Yaniz

Sistema completo en Python que, sobre la **red vial real de Comas (Lima)**, simula una flota de
taxis y asigna a cada pasajero el conductor con **menor tiempo estimado de llegada**:

```
Pasajero → Quadtree → Haversine → Heap → Dijkstra → ETA → Conductor asignado
```

Incluye una **presentación web 3D interactiva de 18 diapositivas** (Three.js), conectada al
backend FastAPI. Todos los cálculos que se muestran vienen de Python.

---

## 1. Inicio rápido (Windows · VS Code)

```powershell
.\iniciar.ps1
```

El script crea/reutiliza `.venv`, instala dependencias, descarga la red vial **solo si falta**,
busca un puerto libre y arranca el servidor:

- Presentación: **http://127.0.0.1:8000**
- API documentada (OpenAPI): http://127.0.0.1:8000/docs

Si PowerShell bloquea scripts: `powershell -ExecutionPolicy Bypass -File .\iniciar.ps1`

Arranque manual equivalente:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn main:app --port 8000
```

`main.py` expone la variable `app` (`from backend.app import crear_app; app = crear_app()`).

Otras formas de arrancar (todas probadas):

| Forma | Comando |
|---|---|
| Doble clic | `iniciar.bat` (no depende de la política de ejecución de PowerShell) |
| Cualquier Python | `python main.py` → si ese Python no tiene las dependencias, se relanza solo con `.venv` |
| VS Code | Ejecutar y depurar → **▶ Presentación (FastAPI :8000)**, o `Ctrl+Shift+B` (tarea «Iniciar presentación») |
| Desarrollo | `.venv\Scripts\python -m uvicorn main:app --reload --port 8000` |

### Si no arranca

| Mensaje | Causa | Solución |
|---|---|---|
| `No module named uvicorn` / `fastapi` | se usó el Python del sistema, no el de `.venv` | `iniciar.ps1`, `iniciar.bat` o `python main.py`; en VS Code elegir el intérprete `.venv` |
| `Could not import module "main"` | la terminal no está en la carpeta del proyecto | `cd C:\Users\jorge\presentacion-conductor-cercano` o *Archivo → Abrir carpeta* en el proyecto |
| `no se puede cargar ... iniciar.ps1` | política de ejecución de PowerShell | usar `iniciar.bat` |
| `[AVISO] El puerto 8000 esta en uso` | quedó otro servidor abierto | cerrar esa terminal (`Ctrl+C`) o usar la URL nueva que muestra el script |

## 2. Link público (abrir desde cualquier navegador)

### Opción A · Link inmediato desde tu laptop (sin cuenta)

Doble clic en **`publicar.bat`** (o `.\publicar.ps1`). El script:

1. instala `cloudflared` de Cloudflare con `winget` (solo la primera vez);
2. enciende la presentación en segundo plano si no estaba encendida;
3. crea un link **`https://xxxx.trycloudflare.com`**, lo copia al portapapeles y lo abre.

Ese link se puede compartir (profesor, celular, proyector). Funciona **mientras la ventana
de `publicar.bat` siga abierta** y la laptop tenga Internet; cada ejecución genera un link nuevo.

### Opción B · Link permanente en Render (requiere cuenta gratuita)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Jossesjsj/conductor-cercano-usmp)

1. Sube el proyecto a GitHub (el documento del curso ya exige un repositorio).
2. En https://render.com → **New + → Blueprint** → elige el repositorio.
3. Render lee `render.yaml`, instala `requirements-web.txt` y publica un link fijo
   `https://conductor-cercano-usmp.onrender.com` (o similar).

En la web la red se carga desde `datos/comas_red.json` (copia ligera del GraphML), así que el
servidor no necesita OSMnx. En el plan gratuito el servicio "se duerme" tras 15 min sin uso:
el primer acceso tarda ~1 minuto en despertar. La simulación es compartida: todos los que
abren el link ven y modifican la misma flota.

## 3. Uso de la presentación

| Acción | Cómo |
|---|---|
| Avanzar / retroceder | `→` / `←`, `Espacio`, botones inferiores |
| Pantalla completa | `F` (salir con `Esc`) |
| Índice de secciones | `M` o ☰ |
| Modo diapositivas ↔ web desplazable | botón superior o `S` (sin recargar) |
| **Modo exposición** | botón o `E`: vista limpia, pantalla completa, navegación discreta |
| **Demostración rápida (≈5 min)** | botón o `D`: Portada → Red vial → Quadtree → Heap → Dijkstra → Despachador → Mapa → Benchmark → Cierre |
| Notas y cronómetro de 15 min | `N` o botón «Notas» (fases: demo, preguntas, modificación) |
| Rendimiento reducido (GPU limitada) | botón ⚡ |

En modo desplazable, la rueda del mouse recorre la página; para hacer zoom en un mapa hay que
hacer clic dentro de él primero (evita que el mapa "robe" el scroll).

### Las 18 diapositivas

| # | Sección | Interacción real |
|---|---|---|
| 01 | Portada | ciudad 3D animada, búsquedas reales cada 6 s, estadísticas vivas |
| 02 | Problema real | búsqueda lineal vs. cuadrantes visitados por el Quadtree (flota actual) |
| 03 | Objetivos y arquitectura | flujo de 7 etapas con el archivo Python de cada una |
| 04 | Red vial de Comas | mapa 3D, intersecciones, estadísticas de la red |
| 05 | Modelo de flota | generar flota (cantidad, semilla, % ocupados), clic en un taxi |
| 06 | Quadtree | insertar, eliminar, mover, buscar en rectángulo, explicación paso a paso, caso "mismo punto" |
| 07 | Haversine | dos puntos del mapa: arco Haversine vs. ruta Dijkstra, valores intermedios |
| 08 | Heap | k = 3/5/10, reproducción de las operaciones reales del heap, ampliaciones de radio |
| 09 | Dijkstra | traza real paso a paso: iniciar, pausar, siguiente, anterior, reiniciar, solución |
| 10 | ETA | velocidad configurable, tabla y gráfico; búsqueda de un caso donde el más cercano no gana |
| 11 | Despachador | clic / coordenadas / dirección, pasos 2-3-4 o flujo completo, errores claros |
| 12 | Simulación | automático / paso a paso, velocidad, semilla, gráfico de estados por turno |
| 13 | Mapa interactivo | todos los controles de cámara, capas y simulación; seguir al taxi |
| 14 | Benchmark | resultados medidos, botón para re-ejecutar (proceso aparte) |
| 15 | Complejidad | tabla Big-O justificada + teoría vs. mediciones |
| 16 | Pruebas | ejecuta pytest y muestra cada caso y la cobertura de requisitos |
| 17 | Comparación | Quadtree vs. H3, S2, Geohash, R-tree; cuadrados vs. hexágonos |
| 18 | Conclusiones | resumen con datos medidos, mapas Folium y demostración final |

## 4. Estructura

```text
presentacion-conductor-cercano/
├── main.py                  # instancia ASGI `app`
├── iniciar.ps1 / .bat       # arranque local en Windows
├── publicar.ps1 / .bat      # link público https (Cloudflare Tunnel)
├── render.yaml              # despliegue permanente en Render
├── requirements-web.txt     # dependencias mínimas del servidor web
├── verificar.py             # verificación integral (informe ✓/✗)
├── requirements.txt
├── backend/                 # FastAPI: app.py, estado.py, schemas.py, routes/
├── estructuras/             # quadtree.py, haversine.py, vecinos.py (k vecinos), proyeccion.py
├── algoritmos/              # dijkstra.py
├── simulacion/              # conductor.py, pasajero.py, flota.py, despachador.py, simulador.py,
│                            # geocodificacion.py, errores.py
├── datos/                   # descargar_red.py, red_vial.py, comas_red.graphml, comas_edificios.json
├── mapas/                   # generar_mapas.py + asignacion_1..3.html (Folium)
├── benchmark/               # ejecutar_benchmark.py, resultados.json/.csv, grafico_*.png
├── tests/                   # pytest (unidad + integración API)
├── tests_e2e/               # pytest + Playwright (navegador)
├── frontend/                # presentación web: index.html, css/, js/ (slides/, city3d.js, …)
├── presentacion/            # capturar.py (capturas) y generar_pptx.py
├── entregables/             # Presentacion_Conductor_Cercano_USMP.pptx + capturas/
└── legacy/prototipo-js/     # prototipo anterior archivado (ver su LEEME.md)
```

## 5. Implementaciones propias

| Requisito | Archivo | Detalle |
|---|---|---|
| Quadtree (RF-03) | `estructuras/quadtree.py` | `NodoQuadtree`, `Quadtree`: `insertar`, `eliminar` (con fusión de hijos), `buscar_en_rectangulo` (con poda y estadísticas), `actualizar_posicion`. No subdivide si todos los puntos de la hoja son idénticos ni más allá de profundidad 16 → evita la recursión infinita. |
| Haversine (RF-04) | `estructuras/haversine.py` | fórmula completa con `math`, R = 6 371 008,8 m. |
| k vecinos (RF-04) | `estructuras/vecinos.py` | búsqueda progresiva: cuadrado de semilado r → Haversine → max-heap (`heapq`) de tamaño k. Es exacta cuando el k-ésimo está a ≤ r (todo conductor no visto está fuera del cuadrado, a más de r). Si no, duplica r. |
| Dijkstra (RF-05) | `algoritmos/dijkstra.py` | `heapq` + eliminación perezosa, corte al extraer el destino, traza opcional para la animación. Grafo **dirigido** (sentidos de circulación). |
| Componente conexa | `datos/red_vial.py` | Kosaraju iterativo propio: se conserva la componente fuertemente conexa mayor. |
| Despachador (RF-05/08) | `simulacion/despachador.py` | pegado a la intersección más cercana (Quadtree de nodos), candidatos, rutas desde cada conductor hacia el pasajero, ETA, asignación por menor ETA alcanzable. |
| Simulación (RF-06) | `simulacion/flota.py`, `simulador.py` | los conductores avanzan por la geometría real de las aristas; el Quadtree se actualiza cada turno; semilla reproducible. |

**ETA** = (distancia vial en m / 1000) / velocidad (km/h) × 60 → minutos.
Un conductor que está a mitad de cuadra termina su cuadra (no hace giros en U): su distancia es
`metros que le faltan + Dijkstra(siguiente intersección → pasajero)`.

**Restricciones del documento:** OSMnx/NetworkX solo se usan para descargar, leer y guardar el
grafo (`datos/`) y para **validar** en el benchmark. No se usan `shortest_path`,
`dijkstra_path`, `nearest_nodes`, KDTree, rtree, STRtree ni h3 (`verificar.py` lo comprueba).

## 6. Datos geográficos (RF-01)

- Zona: **Comas (sector central), Lima, Perú**: N −11,930 · S −11,952 · O −77,068 · E −77,046.
- Descarga única: `python -m datos.descargar_red` (OSMnx `graph_from_bbox`, `network_type="drive"`).
  Si Overpass está saturado, el script reintenta con servidores alternativos.
- Red usada: 1 106 intersecciones y 2 805 aristas dirigidas (componente fuertemente conexa
  mayor de 1 138 / 2 870), 5,83 km², 223 km de calles dirigidas, 1 306 edificios.
- Alturas: si OSM no tiene `height` ni `building:levels`, se usa una altura **ilustrativa** de 2 a 4 pisos.
- Datos © OpenStreetMap contributors, licencia ODbL 1.0.

## 7. API (FastAPI)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/estado` | resumen de red y simulación |
| GET | `/api/grafo` · `/api/edificios` | geometría para el 3D |
| GET | `/api/conductores` · `/api/conductores/{id}` | flota |
| POST | `/api/flota/generar` | nueva flota (cantidad, semilla, % ocupados, velocidad) |
| POST | `/api/pasajeros` | por `lat/lon`, `x/y` (clic) o `direccion` (Nominatim) |
| POST | `/api/quadtree/buscar` · GET `/api/quadtree` | búsqueda en rectángulo y estructura |
| POST | `/api/candidatos` | k vecinos (Quadtree + Haversine + heap) |
| POST | `/api/rutas/calcular` | Dijkstra + ETA por candidato (traza opcional) |
| POST | `/api/despacho/asignar` | flujo completo y asignación |
| POST | `/api/simulacion/avanzar` · `/api/simulacion/reiniciar` | turnos |
| POST | `/api/haversine` · `/api/dijkstra/traza` | demostraciones didácticas |
| * | `/api/quadtree/demo/...` | Quadtree didáctico (misma clase `Quadtree`) |
| GET/POST | `/api/benchmark/resultados` · `/api/benchmark/ejecutar` | benchmark en proceso aparte |
| GET/POST | `/api/pruebas/resultados` · `/api/pruebas/ejecutar` | pytest en proceso aparte |

Errores con código y mensaje claros: `coordenada_invalida`, `fuera_de_zona`,
`sin_conexion_vial` (> 250 m de una calle), `direccion_no_encontrada`, `tiempo_agotado`,
`servicio_no_disponible`, `sin_conductores_disponibles`, `sin_ruta_alcanzable`.

## 8. Entregables y comandos

```powershell
.venv\Scripts\python -m mapas.generar_mapas            # RF-07: mapas/asignacion_1..3.html
.venv\Scripts\python -m benchmark.ejecutar_benchmark   # RF-09: resultados + gráficos Matplotlib
.venv\Scripts\python -m pytest -v                      # pruebas de unidad e integración
.venv\Scripts\python -m pytest tests_e2e -v            # pruebas de navegador (Playwright)
.venv\Scripts\python -m presentacion.capturar          # capturas (servidor encendido)
.venv\Scripts\python -m presentacion.generar_pptx      # entregables/Presentacion_Conductor_Cercano_USMP.pptx
.venv\Scripts\python verificar.py --e2e                # informe de verificación completo
```

Para las pruebas E2E y las capturas: `pip install playwright pytest-playwright` y
`python -m playwright install chromium`.

### Resultados medidos (este equipo, 09/11/2026, semilla 2024, 30 consultas, k = 5)

| Flota | Lineal (mediana) | Quadtree (mediana) | Conductores revisados (Quadtree) | Mismos candidatos |
|---|---|---|---|---|
| 300 | 0,479 ms | 0,107 ms | 41 | sí |
| 3 000 | 5,053 ms | 0,502 ms | 159 | sí |
| 30 000 | 47,442 ms | 4,611 ms | 1 291 | sí |

Dijkstra propio vs NetworkX: **25/25 rutas con distancia idéntica**. Python 3.12.9, Windows 11.
Son tiempos de un solo equipo: dependen de la CPU, la carga y la distribución espacial.

## 9. Pruebas

- `tests/` — **36 casos pytest**: Quadtree vacío, inserción, eliminación y fusión, actualización,
  conductores en el mismo punto, búsqueda en rectángulo comparada con fuerza bruta, límites,
  Haversine con valores conocidos, coordenadas inválidas, k vecinos = búsqueda lineal,
  ampliación de región, sin disponibles, Dijkstra válido, sin ruta, sentidos de circulación,
  traza, validación contra NetworkX, ETA, selección por menor ETA (el más cercano en línea recta
  pierde), sin conductores, zona sin conexión vial, fuera de zona, Quadtree actualizado en turnos,
  reproducibilidad con semilla, llegada y cambio de estado, y 6 pruebas de integración de la API.
- `tests_e2e/` — 7 pruebas Playwright: abrir la presentación (integrantes y 3D), navegar con
  teclado, cambiar de modo sin recargar, solicitar taxi (flujo completo), error claro con
  coordenada fuera de zona, reiniciar simulación y ausencia de errores de JavaScript.

## 10. Limitaciones conocidas

- Velocidad promedio constante: no modela tráfico, semáforos ni hora punta.
- Los conductores a mitad de cuadra no hacen giros en U.
- La geocodificación usa el servicio público Nominatim (requiere Internet; máximo 1 consulta/s).
  Si falla, se informa el error y se pueden usar coordenadas o el clic en el mapa.
- En el mapa 3D se dibujan hasta 6 000 taxis; el benchmark de 30 000 conductores se ejecuta solo en Python.
- Los taxis se dibujan ~2,4× más grandes que su tamaño real para que se vean a escala de barrio.
- La imagen de referencia estética NEXORA no estaba en el equipo: el estilo se basó en la
  descripción del encargo (oscuro, neón, vidrio translúcido).
