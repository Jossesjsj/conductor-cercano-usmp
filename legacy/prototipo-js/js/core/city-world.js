/* ==========================================================================
   MUNDO URBANO — visualización de la red real de Comas en 3D.
   Se reutiliza en portada, problema y conclusiones con variantes visuales.
   ========================================================================== */

import * as THREE from 'three';
import { SeededRandom } from './seeded-random.js';

const COLORES_CLASE = {
  trunk: 0xb026ff,
  trunk_link: 0x9b3cff,
  primary: 0x8b00ff,
  primary_link: 0x8b00ff,
  secondary: 0x00d9ff,
  secondary_link: 0x00b8dd,
  tertiary: 0x3f86ff,
  tertiary_link: 0x3f86ff,
  residential: 0x6d4a9e,
  living_street: 0x5d4a80,
  service: 0x3d3054,
  busway: 0xffc857,
  unclassified: 0x5f5470,
};

function texturaGlow() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.28, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function construirAristas(graph, escala, centro) {
  const posiciones = [];
  const colores = [];
  for (const edge of graph.edges) {
    const color = new THREE.Color(COLORES_CLASE[edge.cls] || 0x5d4a80);
    const coords = [graph.node(edge.a), ...edge.viaLocal.map(([x, y]) => ({ x, y })), graph.node(edge.b)];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      posiciones.push((a.x - centro.x) * escala, 0.02, (a.y - centro.y) * escala);
      posiciones.push((b.x - centro.x) * escala, 0.02, (b.y - centro.y) * escala);
      colores.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.LineSegments(geo, mat);
}

export function createCityWorld(graph, { variant = 'cover' } = {}) {
  const group = new THREE.Group();
  const escala = 0.0032;
  const centro = graph.center;
  const rng = new SeededRandom(variant === 'problem' ? 77 : variant === 'conclusions' ? 99 : 42);
  const glow = texturaGlow();
  const disposables = [glow];

  const aristas = construirAristas(graph, escala, centro);
  group.add(aristas);
  disposables.push(aristas.geometry, aristas.material);

  // Nodos como puntos tenues: dan sensación de intersecciones iluminadas.
  const nodosPos = [];
  for (const n of graph.nodes.values()) {
    nodosPos.push((n.x - centro.x) * escala, 0.035, (n.y - centro.y) * escala);
  }
  const nodosGeo = new THREE.BufferGeometry();
  nodosGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodosPos, 3));
  const nodosMat = new THREE.PointsMaterial({
    color: 0x9fdcff,
    size: 2.4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.5,
    map: glow,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.Points(nodosGeo, nodosMat));
  disposables.push(nodosGeo, nodosMat);

  // Suelo y retícula.
  const sueloGeo = new THREE.PlaneGeometry(80, 80);
  const sueloMat = new THREE.MeshBasicMaterial({ color: 0x0a0714, transparent: true, opacity: 0.55, depthWrite: false });
  const suelo = new THREE.Mesh(sueloGeo, sueloMat);
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = -0.18;
  group.add(suelo);
  disposables.push(sueloGeo, sueloMat);

  const grid = new THREE.GridHelper(90, 45, 0x8b00ff, 0x2b1748);
  grid.position.y = -0.14;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  group.add(grid);
  disposables.push(grid.geometry, grid.material);

  // Borde del área de estudio.
  const b = graph.bounds;
  const puntosBorde = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
    [b.minX, b.minY],
  ].map(([x, y]) => new THREE.Vector3((x - centro.x) * escala, 0.01, (y - centro.y) * escala));
  const bordeGeo = new THREE.BufferGeometry().setFromPoints(puntosBorde);
  const bordeMat = new THREE.LineBasicMaterial({ color: 0xb026ff, transparent: true, opacity: 0.35 });
  group.add(new THREE.Line(bordeGeo, bordeMat));
  disposables.push(bordeGeo, bordeMat);

  /* Vehículos: recorren aristas reales, no trayectorias inventadas. */
  const candidatas = graph.edges.filter((e) => e.w > 0.12);
  const materialAutoA = new THREE.SpriteMaterial({ map: glow, color: 0x00d9ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const materialAutoB = new THREE.SpriteMaterial({ map: glow, color: 0xb026ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  disposables.push(materialAutoA, materialAutoB);

  const autos = [];
  const cantidad = variant === 'conclusions' ? 16 : variant === 'problem' ? 22 : 30;
  for (let i = 0; i < cantidad; i++) {
    const edge = rng.pick(candidatas);
    const coords = [graph.node(edge.a), ...edge.viaLocal.map(([x, y]) => ({ x, y })), graph.node(edge.b)];
    const sprite = new THREE.Sprite(i % 4 === 0 ? materialAutoB : materialAutoA);
    sprite.scale.setScalar(0.55);
    group.add(sprite);
    autos.push({
      edge,
      coords,
      t: rng.float(0, 1),
      velocidad: rng.float(0.025, 0.075),
      sprite,
      carril: rng.float(-0.12, 0.12),
    });
  }

  function posEnArista(auto, t) {
    const tramos = [];
    let total = 0;
    for (let i = 0; i < auto.coords.length - 1; i++) {
      const a = auto.coords[i];
      const b = auto.coords[i + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      tramos.push({ a, b, d });
      total += d;
    }
    let objetivo = t * total;
    for (const tr of tramos) {
      if (objetivo <= tr.d || tr === tramos[tramos.length - 1]) {
        const f = tr.d > 0 ? Math.min(1, objetivo / tr.d) : 0;
        const x = (tr.a.x + (tr.b.x - tr.a.x) * f - centro.x) * escala;
        const z = (tr.a.y + (tr.b.y - tr.a.y) * f - centro.y) * escala;
        const nx = -(tr.b.y - tr.a.y) / (tr.d || 1);
        const nz = (tr.b.x - tr.a.x) / (tr.d || 1);
        return { x: x + nx * auto.carril, z: z + nz * auto.carril };
      }
      objetivo -= tr.d;
    }
    return { x: 0, z: 0 };
  }

  /* Anillo de escaneo para la escena del problema. */
  let anillo = null;
  if (variant === 'problem') {
    const geo = new THREE.RingGeometry(0.96, 1, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00d9ff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    anillo = new THREE.Mesh(geo, mat);
    anillo.rotation.x = -Math.PI / 2;
    anillo.position.y = 0.08;
    group.add(anillo);
    disposables.push(geo, mat);
  }

  /* Polvo volumétrico / estrellas. */
  const chispas = [];
  for (let i = 0; i < (variant === 'conclusions' ? 420 : 160); i++) {
    chispas.push(rng.float(-30, 30), rng.float(1, 22), rng.float(-30, 30));
  }
  const chispasGeo = new THREE.BufferGeometry();
  chispasGeo.setAttribute('position', new THREE.Float32BufferAttribute(chispas, 3));
  const chispasMat = new THREE.PointsMaterial({
    color: 0xc9b6ff,
    size: 1.8,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.55,
    map: glow,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.Points(chispasGeo, chispasMat));
  disposables.push(chispasGeo, chispasMat);

  const camara = variant === 'conclusions'
    ? { position: [0, 16, 30], target: [0, 0, 0], fov: 45, autoRotate: true, autoRotateSpeed: 0.22 }
    : variant === 'problem'
      ? { position: [4, 18, 24], target: [0, 0, 0], fov: 44, autoRotate: true, autoRotateSpeed: 0.18 }
      : { position: [0, 15, 25], target: [0, 0, 0], fov: 42, autoRotate: true, autoRotateSpeed: 0.3 };

  const mundo = {
    group,
    camera: camara,
    fogDensity: variant === 'conclusions' ? 0.016 : 0.011,
    variant,
    update(dt, elapsed) {
      for (const auto of autos) {
        auto.t += auto.velocidad * dt;
        if (auto.t > 1) {
          auto.t = 0;
          const edge = rng.pick(candidatas);
          auto.edge = edge;
          auto.coords = [graph.node(edge.a), ...edge.viaLocal.map(([x, y]) => ({ x, y })), graph.node(edge.b)];
        }
        const p = posEnArista(auto, auto.t);
        auto.sprite.position.set(p.x, 0.22, p.z);
      }
      if (anillo) {
        const ciclo = (elapsed % 6) / 6;
        const r = 1.5 + ciclo * 15;
        anillo.scale.setScalar(r);
        anillo.material.opacity = 0.55 * (1 - ciclo) ** 1.5;
      }
      if (variant === 'conclusions') {
        group.rotation.y = Math.sin(elapsed * 0.05) * 0.08;
      }
    },
    dispose() {
      group.traverse((obj) => {
        if (obj.isSprite) obj.parent?.remove(obj);
      });
      for (const d of disposables) d.dispose?.();
    },
  };
  return mundo;
}
