/* ==========================================================================
   Haversine — implementación propia.
   Distancia de círculo máximo entre dos coordenadas geográficas.
   R = 6371,0088 km (radio medio terrestre IUGG).
   ========================================================================== */

export const EARTH_RADIUS_KM = 6371.0088;
export const EARTH_RADIUS_M = EARTH_RADIUS_KM * 1000;

export const toRad = (deg) => (deg * Math.PI) / 180;
export const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Distancia en kilómetros entre dos puntos (lat, lon en grados).
 * Implementa directamente:
 *   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 *   c = 2 · atan2(√a, √(1−a))
 *   d = R · c
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLambda = Math.sin(dLambda / 2);
  const a = sinDPhi * sinDPhi + Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

/**
 * Devuelve el desglose numérico para la escena educativa.
 */
export function haversineSteps(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLambda = Math.sin(dLambda / 2);
  const term1 = sinDPhi * sinDPhi;
  const term2 = Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda;
  const a = term1 + term2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = EARTH_RADIUS_KM * c;
  return {
    lat1, lon1, lat2, lon2,
    dLatDeg: lat2 - lat1,
    dLonDeg: lon2 - lon1,
    dPhiRad: dPhi,
    dLambdaRad: dLambda,
    phi1Rad: phi1,
    phi2Rad: phi2,
    sinDPhi,
    sinDLambda,
    term1,
    term2,
    a,
    sqrtA: Math.sqrt(a),
    sqrt1mA: Math.sqrt(1 - a),
    c,
    km,
    meters: km * 1000,
    radius: EARTH_RADIUS_KM,
  };
}

/**
 * Proyección local equirectangular para índices espaciales.
 * x = este (m), y = sur (m), respecto a un centro.
 * Es una aproximación local: se usa solo para podar regiones;
 * la distancia final de los candidatos se calcula con Haversine.
 */
export function createProjector(centerLat, centerLon) {
  const latRad = toRad(centerLat);
  const mPerDegLat = EARTH_RADIUS_M * (Math.PI / 180);
  const mPerDegLon = mPerDegLat * Math.cos(latRad);
  return {
    centerLat,
    centerLon,
    toLocal(lat, lon) {
      return {
        x: (lon - centerLon) * mPerDegLon,
        y: (centerLat - lat) * mPerDegLat,
      };
    },
    toGeo(x, y) {
      return {
        lat: centerLat - y / mPerDegLat,
        lon: centerLon + x / mPerDegLon,
      };
    },
    metersPerDegLat: mPerDegLat,
    metersPerDegLon: mPerDegLon,
  };
}

/** Caja geográfica a partir de un centro y un radio en metros. */
export function boundingBox(lat, lon, radiusM) {
  const latDelta = radiusM / 111320;
  const lonDelta = radiusM / (111320 * Math.cos(toRad(lat)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

/**
 * Distancia aproximada en metros sobre el plano local.
 * Solo para comparaciones internas del índice espacial.
 */
export function planarDistance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
