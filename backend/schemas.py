"""Contratos de entrada de la API (validación con Pydantic → OpenAPI en /docs)."""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class GenerarFlota(BaseModel):
    cantidad: int = Field(300, ge=1, le=30000, description="Número de conductores")
    semilla: int = Field(42, ge=0, le=2**31 - 1, description="Semilla aleatoria reproducible")
    proporcion_ocupados: float = Field(0.3, ge=0, le=1)
    velocidad_kmh: float = Field(30, gt=0, le=120, description="Velocidad promedio (ETA y movimiento)")
    segundos_por_turno: float = Field(10, gt=0, le=120)
    k: int = Field(5, ge=1, le=50)


class CrearPasajero(BaseModel):
    """Una de tres formas: lat/lon, x/y (clic en el mapa 3D, metros) o dirección."""
    lat: float | None = Field(None, description="Latitud en grados")
    lon: float | None = Field(None, description="Longitud en grados")
    x: float | None = Field(None, description="Este en metros (proyección local)")
    y: float | None = Field(None, description="Norte en metros (proyección local)")
    direccion: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def una_forma(self):
        formas = [self.lat is not None and self.lon is not None,
                  self.x is not None and self.y is not None,
                  bool(self.direccion and self.direccion.strip())]
        if sum(formas) != 1:
            raise ValueError("Indica exactamente una forma: (lat, lon), (x, y) o dirección.")
        return self


class ConsultaPasajero(BaseModel):
    pasajero_id: int = Field(..., ge=1)
    k: int | None = Field(None, ge=1, le=50)
    velocidad_kmh: float | None = Field(None, gt=0, le=120)
    traza: bool = Field(False, description="Incluir la traza paso a paso de Dijkstra")


class BuscarRectangulo(BaseModel):
    xmin: float
    ymin: float
    xmax: float
    ymax: float

    @model_validator(mode="after")
    def orden(self):
        if self.xmin > self.xmax or self.ymin > self.ymax:
            raise ValueError("El mínimo del rectángulo no puede superar al máximo.")
        return self


class Avanzar(BaseModel):
    turnos: int = Field(1, ge=1, le=50)


class Reiniciar(BaseModel):
    semilla: int | None = Field(None, ge=0, le=2**31 - 1)


class Haversine(BaseModel):
    lat1: float = Field(..., ge=-90, le=90)
    lon1: float = Field(..., ge=-180, le=180)
    lat2: float = Field(..., ge=-90, le=90)
    lon2: float = Field(..., ge=-180, le=180)


class PuntoXY(BaseModel):
    x: float
    y: float


class DijkstraTraza(BaseModel):
    origen: PuntoXY
    destino: PuntoXY


class DemoInsertar(BaseModel):
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)


class DemoMover(BaseModel):
    id: int
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)


class DemoEliminar(BaseModel):
    id: int


class DemoReiniciar(BaseModel):
    cantidad: int = Field(0, ge=0, le=300)
    capacidad: int = Field(2, ge=1, le=16)
    semilla: int = Field(7, ge=0)
    agrupados: bool = False


class EjecutarBenchmark(BaseModel):
    repeticiones: int = Field(30, ge=3, le=500)
    consultas_dijkstra: int = Field(25, ge=3, le=200)
    semilla: int = Field(2024, ge=0)
