"""Estado compartido del servidor: red vial, simulación y procesos en segundo plano."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

from fastapi import HTTPException

from datos.red_vial import RedVial, cargar_red
from simulacion.simulador import Simulacion

RAIZ = Path(__file__).resolve().parent.parent


class ProcesoFondo:
    """Ejecuta un comando de Python en otro proceso (no bloquea la API)."""

    def __init__(self, nombre: str, args: list[str], salida: Path):
        self.nombre, self.args, self.salida = nombre, args, salida
        self.proceso: subprocess.Popen | None = None
        self.inicio: float | None = None
        self.fin: float | None = None
        self.log = ""
        self.codigo: int | None = None
        self._bloqueo = threading.Lock()

    def ejecutar(self, extra: list[str] | None = None) -> dict:
        with self._bloqueo:
            if self.proceso and self.proceso.poll() is None:
                return self.estado()
            self.inicio, self.fin, self.codigo, self.log = time.time(), None, None, ""
            self.proceso = subprocess.Popen(
                [sys.executable, *self.args, *(extra or [])], cwd=RAIZ,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                encoding="utf-8", errors="replace",
                env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8",
                     "PYTHONUNBUFFERED": "1"})
            threading.Thread(target=self._leer, daemon=True).start()
            return self.estado()

    def _leer(self):
        p = self.proceso
        for linea in p.stdout:
            self.log = (self.log + linea)[-6000:]
        self.codigo = p.wait()
        self.fin = time.time()

    def estado(self) -> dict:
        corriendo = bool(self.proceso and self.proceso.poll() is None and self.fin is None)
        return {"nombre": self.nombre, "ejecutando": corriendo, "codigo_salida": self.codigo,
                "inicio": self.inicio, "fin": self.fin,
                "segundos": round((self.fin or time.time()) - self.inicio, 1) if self.inicio else None,
                "log": self.log[-2500:]}


class EstadoApp:
    def __init__(self, red: RedVial | None = None):
        self.red = red
        self.error_red: str | None = None
        self.sim: Simulacion | None = None
        self._grafo_json: dict | None = None
        self._edificios_json: list | None = None
        self.benchmark = ProcesoFondo("benchmark", ["-m", "benchmark.ejecutar_benchmark"],
                                      RAIZ / "benchmark" / "resultados.json")
        self.pruebas = ProcesoFondo(
            "pytest", ["-m", "pytest", "-q", "-p", "no:cacheprovider",
                       "--junitxml=tests/resultados_junit.xml"],
            RAIZ / "tests" / "resultados_junit.xml")

    def iniciar(self):
        if self.red is None:
            try:
                self.red = cargar_red()
            except Exception as exc:  # archivo faltante o corrupto
                self.error_red = str(exc)
                return
        self.sim = Simulacion(self.red, cantidad=300, semilla=42)

    def requerir_sim(self) -> Simulacion:
        if self.sim is None:
            raise HTTPException(503, detail={
                "codigo": "red_no_disponible",
                "mensaje": f"La red vial no está cargada: {self.error_red}. "
                           "Ejecuta: python -m datos.descargar_red"})
        return self.sim

    # ------------------------------------------------------------- datos 3D
    def grafo_json(self) -> dict:
        if self._grafo_json is None:
            red = self.requerir_sim().red
            calles, vistos = [], set()
            for (u, v), a in red.aristas.items():
                if (v, u) in vistos:
                    continue
                vistos.add((u, v))
                plano = [round(c, 1) for p in a["xy"] for c in p]
                calles.append({"u": u, "v": v, "tipo": a["tipo"], "nombre": a["nombre"],
                               "doble": (v, u) in red.aristas,
                               "longitud": round(a["longitud"], 1), "xy": plano})
            self._grafo_json = {
                "resumen": red.resumen(),
                "zona": red.zona,
                "limites": [round(v, 1) for v in red.limites.a_lista()],
                "nodos": [[n.id, round(n.x, 1), round(n.y, 1)] for n in red.nodos.values()],
                "calles": calles,
            }
        return self._grafo_json

    def edificios_json(self) -> list:
        if self._edificios_json is None:
            red = self.requerir_sim().red
            salida = []
            for e in red.edificios:
                xy = [red.proyeccion.a_xy(lat, lon) for lat, lon in e["contorno"]]
                if len(xy) < 4 or not all(red.limites.contiene(x, y) for x, y in xy):
                    continue
                if e.get("altura_m"):
                    h, real = e["altura_m"], True
                elif e.get("niveles"):
                    h, real = e["niveles"] * 3.0, True
                else:
                    # Altura ILUSTRATIVA (OSM no tiene el dato): 2–4 pisos, determinista.
                    semilla = int(hashlib.md5(json.dumps(e["contorno"][0]).encode()).hexdigest(), 16)
                    h, real = 6.0 + (semilla % 7) * 1.5, False
                salida.append({"xy": [round(c, 1) for p in xy for c in p], "h": round(h, 1),
                               "real": real})
            self._edificios_json = salida
        return self._edificios_json


ESTADO = EstadoApp()
