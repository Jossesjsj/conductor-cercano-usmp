"""Captura las 19 diapositivas (1920×1080) para el PowerPoint complementario.

Requiere el servidor en marcha (iniciar.ps1) y Playwright:
    python -m presentacion.capturar [--url http://127.0.0.1:8000]
Las imágenes se guardan en entregables/capturas/sNN.png.
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

SALIDA = Path(__file__).resolve().parent.parent / "entregables" / "capturas"
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/")
    args = ap.parse_args()
    SALIDA.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        nav = p.chromium.launch(args=ARGS)
        pag = nav.new_page(viewport={"width": 1920, "height": 1080})
        pag.goto(args.url)
        pag.wait_for_selector("#boot.is-done", timeout=90_000)
        pag.evaluate("document.body.classList.add('expo')")  # vista limpia de exposición
        for i in range(19):
            pag.evaluate(f"window.__app.ir({i}, {{instant: true}})")
            pag.wait_for_timeout(3000)
            if i == 10:  # despachador: ejecutar una solicitud real
                pag.locator(f"#s-{i + 1:02d} button", has_text="Solicitar taxi").click()
                pag.locator(f"#s-{i + 1:02d} .log .ok", has_text="Asignado").wait_for(timeout=30_000)
                pag.wait_for_timeout(2500)
            pag.screenshot(path=str(SALIDA / f"s{i + 1:02d}.png"))
            print(f"captura {i + 1:02d}")
        nav.close()


if __name__ == "__main__":
    main()
