"""Punto de entrada ASGI de la presentación.

Formas de arrancar (todas equivalentes):
    .\\iniciar.ps1          (recomendado: prepara todo y abre el navegador)
    iniciar.bat             (doble clic, sin problemas de política de PowerShell)
    python main.py          (con CUALQUIER Python: usa automáticamente .venv)
    .venv\\Scripts\\python -m uvicorn main:app --reload --port 8000

→ http://127.0.0.1:8000  (presentación)   ·   http://127.0.0.1:8000/docs (API)
"""
import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
VENV_PY = RAIZ / ".venv" / "Scripts" / "python.exe"
if str(RAIZ) not in sys.path:  # permite importar backend/, datos/, etc. desde cualquier carpeta
    sys.path.insert(0, str(RAIZ))

try:
    import fastapi  # noqa: F401
    import uvicorn  # noqa: F401
except ModuleNotFoundError as exc:
    usando_venv = VENV_PY.exists() and Path(sys.executable).resolve() == VENV_PY.resolve()
    if __name__ == "__main__" and VENV_PY.exists() and not usando_venv:
        # Se ejecutó con el Python del sistema: relanzar con el entorno virtual del proyecto.
        print(f"Este Python ({sys.executable}) no tiene las dependencias; usando .venv …")
        sys.exit(subprocess.call([str(VENV_PY), str(RAIZ / "main.py"), *sys.argv[1:]]))
    raise SystemExit(
        f"Falta la dependencia '{exc.name}' en {sys.executable}.\n"
        "Solución: ejecuta .\\iniciar.ps1 (o iniciar.bat), o bien\n"
        f"  {VENV_PY} -m pip install -r requirements.txt") from exc

from backend.app import crear_app  # noqa: E402

app = crear_app()

if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Servidor de la presentación Conductor Cercano")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--reload", action="store_true")
    args = ap.parse_args()
    os.chdir(RAIZ)
    print(f"\n  Presentación: http://127.0.0.1:{args.port}\n  API:          http://127.0.0.1:{args.port}/docs\n")
    uvicorn.run("main:app", host="127.0.0.1", port=args.port, reload=args.reload, app_dir=str(RAIZ))
