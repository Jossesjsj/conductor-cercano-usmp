"""Errores del despacho con códigos claros para la API y la interfaz."""


class ErrorDespacho(Exception):
    codigo = "error_despacho"
    estado_http = 400

    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


class CoordenadaInvalida(ErrorDespacho):
    codigo = "coordenada_invalida"
    estado_http = 422


class FueraDeZona(ErrorDespacho):
    codigo = "fuera_de_zona"
    estado_http = 422


class SinConexionVial(ErrorDespacho):
    codigo = "sin_conexion_vial"
    estado_http = 422


class DireccionNoEncontrada(ErrorDespacho):
    codigo = "direccion_no_encontrada"
    estado_http = 404


class TiempoAgotado(ErrorDespacho):
    codigo = "tiempo_agotado"
    estado_http = 504


class ServicioNoDisponible(ErrorDespacho):
    codigo = "servicio_no_disponible"
    estado_http = 503


class SinConductores(ErrorDespacho):
    codigo = "sin_conductores_disponibles"
    estado_http = 409


class SinRutaAlcanzable(ErrorDespacho):
    codigo = "sin_ruta_alcanzable"
    estado_http = 409


class PasajeroNoEncontrado(ErrorDespacho):
    codigo = "pasajero_no_encontrado"
    estado_http = 404
