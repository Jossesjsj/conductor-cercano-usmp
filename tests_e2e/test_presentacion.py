"""Pruebas E2E en navegador (Playwright) de la presentación web.

Levantan su propio servidor en el puerto 8765 con la red real de Comas.
Ejecutar:  .venv\\Scripts\\python -m pytest tests_e2e -v
Requiere:  pip install playwright pytest-playwright && python -m playwright install chromium
"""
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

pw = pytest.importorskip("playwright.sync_api")
RAIZ = Path(__file__).resolve().parent.parent
PUERTO = 8765
URL = f"http://127.0.0.1:{PUERTO}/"
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]


@pytest.fixture(scope="module")
def servidor():
    if not (RAIZ / "datos" / "comas_red.graphml").exists():
        pytest.skip("Falta datos/comas_red.graphml (python -m datos.descargar_red)")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--port", str(PUERTO)],
                            cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    for _ in range(120):
        try:
            socket.create_connection(("127.0.0.1", PUERTO), timeout=0.5).close()
            break
        except OSError:
            time.sleep(0.5)
    yield URL
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope="module")
def pagina(servidor):
    with pw.sync_playwright() as p:
        nav = p.chromium.launch(args=ARGS)
        pag = nav.new_page(viewport={"width": 1366, "height": 768})
        errores = []
        pag.on("pageerror", lambda e: errores.append(str(e)))
        pag.goto(servidor)
        pag.wait_for_selector("#boot.is-done", timeout=90_000)
        pag.errores = errores
        yield pag
        nav.close()


def ir(pag, numero):
    pag.evaluate(f"window.__app.ir({numero - 1})")
    pag.wait_for_timeout(900)


def test_abre_presentacion_con_portada_e_integrantes(pagina):
    assert pagina.locator(".slide").count() == 18
    portada = pagina.locator("#s-01").inner_text()
    for texto in ["UNIVERSIDAD DE SAN MARTÍN DE PORRES", "PROYECTO INTEGRADOR N.º 2",
                  "Antezana Vargas Jorge Jose", "Andres Bardales Moreno", "Vanessa Guerrero Yaniz",
                  "Algoritmos y Estructura de Datos II"]:
        assert texto in portada
    assert pagina.locator("#s-01 canvas").count() == 1, "la escena 3D debe estar montada"


def test_navegar_con_teclado(pagina):
    ir(pagina, 1)
    pagina.keyboard.press("ArrowRight")
    pagina.wait_for_timeout(700)
    assert pagina.locator("#count-cur").inner_text() == "02"
    pagina.keyboard.press("ArrowLeft")
    pagina.wait_for_timeout(700)
    assert pagina.locator("#count-cur").inner_text() == "01"


def test_cambiar_de_modo_sin_recargar(pagina):
    pagina.click("[data-mode=scroll]")
    pagina.wait_for_timeout(600)
    assert "mode-scroll" in pagina.evaluate("document.body.className")
    pagina.click("[data-mode=slides]")
    pagina.wait_for_timeout(600)
    assert "mode-slides" in pagina.evaluate("document.body.className")
    assert pagina.evaluate("performance.getEntriesByType('navigation').length") == 1


def test_solicitar_taxi_flujo_completo(pagina):
    ir(pagina, 13)
    boton = pagina.locator("#s-13 button", has_text="Solicitar taxi")
    boton.click()
    pagina.locator("#s-13 .log .ok", has_text="Asignado conductor").wait_for(timeout=30_000)
    assert pagina.locator("#s-13 .cand.best").count() == 1
    assert pagina.locator("#s-13 .pipe-step.is-done").count() == 7


def test_error_claro_con_coordenada_fuera_de_zona(pagina):
    ir(pagina, 11)
    pagina.locator("#s-11 .tabs button", has_text="Coordenadas").click()
    pagina.locator("#s-11 input[placeholder='-11.94100']").fill("-12.5")
    pagina.locator("#s-11 input[placeholder='-77.05600']").fill("-77.0")
    pagina.locator("#s-11 button", has_text="Crear").click()
    pagina.locator(".toast--error", has_text="fuera").first.wait_for(timeout=10_000)


def test_reiniciar_simulacion(pagina):
    ir(pagina, 12)
    pagina.locator("#s-12 button", has_text="Reiniciar").click()
    pagina.locator(".toast--ok", has_text="reiniciada").first.wait_for(timeout=15_000)
    turno = pagina.evaluate("window.__app.sim.turno")
    assert turno <= 2


def test_sin_errores_de_javascript(pagina):
    assert pagina.errores == []
