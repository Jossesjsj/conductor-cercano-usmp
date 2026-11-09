// Cliente HTTP del backend FastAPI con tiempo máximo y errores legibles.
export class ApiError extends Error {
  constructor(mensaje, codigo = 'error', estado = 0) {
    super(mensaje);
    this.codigo = codigo;
    this.estado = estado;
  }
}

export async function api(ruta, cuerpo, { metodo, tiempoMax = 25000 } = {}) {
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), tiempoMax);
  const opciones = { method: metodo || (cuerpo !== undefined ? 'POST' : 'GET'), signal: ctrl.signal, headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  let resp;
  try {
    resp = await fetch(ruta, opciones);
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError(`La consulta tardó más de ${Math.round(tiempoMax / 1000)} s.`, 'tiempo_agotado');
    throw new ApiError('No se pudo conectar con el backend Python. ¿Está corriendo iniciar.ps1?', 'sin_conexion');
  } finally {
    clearTimeout(temporizador);
  }
  let datos = null;
  try { datos = await resp.json(); } catch { /* respuesta sin JSON */ }
  if (!resp.ok) {
    const d = datos && datos.detail;
    const msg = (d && (d.mensaje || (typeof d === 'string' ? d : null))) || `Error HTTP ${resp.status}`;
    throw new ApiError(msg, (d && d.codigo) || 'http', resp.status);
  }
  return datos;
}
