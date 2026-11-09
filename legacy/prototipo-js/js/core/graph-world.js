/* ==========================================================================
   MUNDO GRAFO — red vial completa en 3D para visualizar Dijkstra.
   ========================================================================== */

import * as THREE from 'three';

const COLORES_CLASE = {
  trunk: 0xb026ff,
  primary: 0x8b00ff,
  secondary: 0x00d9ff,
  tertiary: 0x3f86ff,
  residential: 0x6d4a9e,
  service: 0x3d3054,
  busway: 0xffc857,
};

const BASE = new THREE.Color(0x6a6380);
const ASENTADO = new THREE.Color(0x00d9ff);
const FRONTERA = new THREE.Color(0xffc857);
const INICIO = new THREE.Color(0x3cf5a6);
const FIN = new THREE.Color(0xb026ff);
const RUTA = new THREE.Color(0xffffff);

export function createGraphWorld({ graph, limiteNodos = Infinity }) {
  const group = new THREE.Group();
  const escala = 0.0032;
  const centro = graph.center;
  const disposables = [];

  const pos = [];
  const col = [];
  for (const edge of graph.edges) {
    const color = new THREE.Color(COLORES_CLASE[edge.cls] || 0x5d4a80).multiplyScalar(0.8);
    const coords = [graph.node(edge.a), ...edge.viaLocal.map(([x, y]) => ({ x, y })), graph.node(edge.b)];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      pos.push((a.x - centro.x) * escala, 0.02, (a.y - centro.y) * escala);
      pos.push((b.x - centro.x) * escala, 0.02, (b.y - centro.y) * escala);
      col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  const aristasGeo = new THREE.BufferGeometry();
  aristasGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  aristasGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const aristasMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.LineSegments(aristasGeo, aristasMat));
  disposables.push(aristasGeo, aristasMat);

  /* Nodos. */
  const ids = [];
  const nodosPos = [];
  for (const n of graph.nodes.values()) {
    if (ids.length >= limiteNodos) break;
    ids.push(n.id);
    nodosPos.push((n.x - centro.x) * escala, 0.06, (n.y - centro.y) * escala);
  }
  const nodosGeo = new THREE.BufferGeometry();
  nodosGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodosPos, 3));
  const colores = new Float32Array(ids.length * 3);
  for (let i = 0; i < ids.length; i++) {
    colores[i * 3] = BASE.r;
    colores[i * 3 + 1] = BASE.g;
    colores[i * 3 + 2] = BASE.b;
  }
  nodosGeo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  const nodosMat = new THREE.PointsMaterial({
    size: 2.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const nodos = new THREE.Points(nodosGeo, nodosMat);
  group.add(nodos);
  disposables.push(nodosGeo, nodosMat);
  const indicePorId = new Map(ids.map((id, i) => [id, i]));

  const materialInicio = new THREE.MeshBasicMaterial({ color: 0x3cf5a6, transparent: true, opacity: 0.9 });
  const materialFin = new THREE.MeshBasicMaterial({ color: 0xb026ff, transparent: true, opacity: 0.9 });
  const esferaGeo = new THREE.SphereGeometry(0.28, 16, 16);
  const esferaInicio = new THREE.Mesh(esferaGeo, materialInicio);
  const esferaFin = new THREE.Mesh(esferaGeo, materialFin);
  esferaInicio.visible = false;
  esferaFin.visible = false;
  esferaInicio.position.y = 0.2;
  esferaFin.position.y = 0.2;
  group.add(esferaInicio, esferaFin);
  disposables.push(esferaGeo, materialInicio, materialFin);

  let tuberia = null;
  let claveRuta = '';

  function posNodo(id) {
    const n = graph.node(id);
    if (!n) return null;
    return new THREE.Vector3((n.x - centro.x) * escala, 0.06, (n.y - centro.y) * escala);
  }

  function setColor(i, color) {
    colores[i * 3] = color.r;
    colores[i * 3 + 1] = color.g;
    colores[i * 3 + 2] = color.b;
  }

  function setState({ settled = new Set(), frontier = new Set(), start = null, end = null, path = [], edgeIds = [] } = {}) {
    for (let i = 0; i < ids.length; i++) setColor(i, BASE);
    for (const id of frontier) {
      const i = indicePorId.get(id);
      if (i !== undefined) setColor(i, FRONTERA);
    }
    for (const id of settled) {
      const i = indicePorId.get(id);
      if (i !== undefined) setColor(i, ASENTADO);
    }
    const iStart = start !== null ? indicePorId.get(String(start)) : undefined;
    const iEnd = end !== null ? indicePorId.get(String(end)) : undefined;
    if (iStart !== undefined) setColor(iStart, INICIO);
    if (iEnd !== undefined) setColor(iEnd, FIN);
    for (const id of path) {
      const i = indicePorId.get(String(id));
      if (i !== undefined) setColor(i, RUTA);
    }
    nodosGeo.attributes.color.needsUpdate = true;

    if (iStart !== undefined) {
      esferaInicio.position.copy(posNodo(start)).setY(0.24);
      esferaInicio.visible = true;
    } else esferaInicio.visible = false;
    if (iEnd !== undefined) {
      esferaFin.position.copy(posNodo(end)).setY(0.24);
      esferaFin.visible = true;
    } else esferaFin.visible = false;

    const nuevaClave = `${path.join('>')}`;
    if (path.length > 1 && nuevaClave !== claveRuta) {
      claveRuta = nuevaClave;
      if (tuberia) {
        group.remove(tuberia);
        tuberia.geometry.dispose();
        tuberia.material.dispose();
        tuberia = null;
      }
      const coords = graph.pathCoords(path, edgeIds);
      if (coords.length > 1) {
        const pts = coords.map(([x, y]) => new THREE.Vector3((x - centro.x) * escala, 0.22, (y - centro.y) * escala));
        const curva = new THREE.CatmullRomCurve3(pts);
        const geo = new THREE.TubeGeometry(curva, Math.min(280, Math.max(24, pts.length * 2)), 0.055, 6, false);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x00d9ff,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const tubo = new THREE.Mesh(geo, mat);
        group.add(tubo);
        tuberia = tubo;
        disposables.push(geo, mat);
      }
    }
    if (path.length <= 1 && tuberia) {
      group.remove(tuberia);
      tuberia = null;
      claveRuta = '';
    }
  }

  function pickNode(info) {
    const previo = info.raycaster.params.Points.threshold;
    info.raycaster.params.Points.threshold = 0.09;
    const hits = info.raycaster.intersectObject(nodos, false);
    info.raycaster.params.Points.threshold = previo;
    if (!hits.length) return null;
    return ids[hits[0].index] ?? null;
  }

  const mundo = {
    group,
    camera: { position: [1, 24, 27], target: [0, 0, 0], fov: 45 },
    setState,
    pickNode,
    ids,
    update() {},
    dispose() {
      for (const d of disposables) d.dispose?.();
    },
  };
  return mundo;
}
