/* ==========================================================================
   MUNDO QUADTREE — proyección ortográfica del índice espacial.
   Dibuja subdivisiones, puntos y el rectángulo de consulta.
   ========================================================================== */

import * as THREE from 'three';

function texturaPunto() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createQuadtreeWorld({ limites, graph }) {
  const group = new THREE.Group();
  const dyn = new THREE.Group();
  group.add(dyn);
  const escala = 0.012;
  const cx = limites.x + limites.w / 2;
  const cy = limites.y + limites.h / 2;
  const view = { width: limites.w * escala + 2.4, height: limites.h * escala + 2.4 };
  const glow = texturaPunto();
  const disposables = [glow];

  const toWorld = (x, y) => ({ x: (x - cx) * escala, z: (y - cy) * escala });
  const toLocal = (wx, wz) => ({ x: wx / escala + cx, y: wz / escala + cy });

  /* Suelo técnico. */
  const sueloGeo = new THREE.PlaneGeometry(view.width * 1.4, view.height * 1.4);
  const sueloMat = new THREE.MeshBasicMaterial({ color: 0x0b0716, transparent: true, opacity: 0.6, depthWrite: false });
  const suelo = new THREE.Mesh(sueloGeo, sueloMat);
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = -0.05;
  group.add(suelo);
  disposables.push(sueloGeo, sueloMat);

  const grid = new THREE.GridHelper(Math.max(view.width, view.height) * 1.3, 24, 0x5a2c8c, 0x2a1745);
  grid.position.y = -0.03;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  group.add(grid);
  disposables.push(grid.geometry, grid.material);

  const tmp = new THREE.Object3D();
  let cuadro = null;
  let relleno = null;
  let anilloGanador = null;
  let marcaConsulta = null;

  function limpiarDyn() {
    while (dyn.children.length) {
      const obj = dyn.children.pop();
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    }
    cuadro = null;
    relleno = null;
    anilloGanador = null;
    marcaConsulta = null;
  }

  function construirLineas(quadtree) {
    const pos = [];
    const col = [];
    const nodos = quadtree.nodos();
    for (const n of nodos) {
      const { x, y, w, h } = n.limites;
      const a = toWorld(x, y);
      const b = toWorld(x + w, y + h);
      const t = Math.min(1, n.profundidad / Math.max(1, quadtree.profundidadMaxima));
      const color = new THREE.Color(0x8b00ff).lerp(new THREE.Color(0x00d9ff), t);
      const y0 = 0.02 + n.profundidad * 0.003;
      const lados = [
        [a.x, y0, a.z, b.x, y0, a.z],
        [b.x, y0, a.z, b.x, y0, b.z],
        [b.x, y0, b.z, a.x, y0, b.z],
        [a.x, y0, b.z, a.x, y0, a.z],
      ];
      for (const l of lados) {
        pos.push(...l);
        col.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    dyn.add(new THREE.LineSegments(geo, mat));
  }

  function instanciarPuntos(puntos, color, radio) {
    if (!puntos.length) return;
    const geo = new THREE.CircleGeometry(radio, 10);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, puntos.length);
    mesh.frustumCulled = false;
    puntos.forEach((p, i) => {
      const w = toWorld(p.x, p.y);
      tmp.position.set(w.x, 0.13, w.z);
      tmp.rotation.set(-Math.PI / 2, 0, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    dyn.add(mesh);
  }

  function sync(quadtree) {
    limpiarDyn();
    construirLineas(quadtree);
    const puntos = quadtree.todos();
    const disponibles = puntos.filter((p) => p.disponible !== false);
    const ocupados = puntos.filter((p) => p.disponible === false);
    instanciarPuntos(disponibles, 0x00d9ff, 0.085);
    instanciarPuntos(ocupados, 0x6f6980, 0.07);
    // Ganador y candidatos se añaden desde la escena.
    return { total: puntos.length, disponibles: disponibles.length };
  }

  function setCandidatos(puntos = []) {
    if (!puntos.length) return;
    instanciarPuntos(puntos, 0xffc857, 0.18);
    instanciarPuntos(puntos, 0xffffff, 0.07);
  }

  function setGanador(punto) {
    if (anilloGanador) {
      dyn.remove(anilloGanador);
      anilloGanador.geometry.dispose();
      anilloGanador.material.dispose();
      anilloGanador = null;
    }
    if (!punto) return;
    const w = toWorld(punto.x, punto.y);
    const geo = new THREE.RingGeometry(0.3, 0.42, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3cf5a6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    anilloGanador = new THREE.Mesh(geo, mat);
    anilloGanador.rotation.x = -Math.PI / 2;
    anilloGanador.position.set(w.x, 0.16, w.z);
    dyn.add(anilloGanador);
  }

  function setRect(rect) {
    if (cuadro) {
      dyn.remove(cuadro);
      cuadro.geometry.dispose();
      cuadro.material.dispose();
      cuadro = null;
    }
    if (relleno) {
      dyn.remove(relleno);
      relleno.geometry.dispose();
      relleno.material.dispose();
      relleno = null;
    }
    if (!rect || rect.w <= 0 || rect.h <= 0) return;
    const a = toWorld(rect.x, rect.y);
    const b = toWorld(rect.x + rect.w, rect.y + rect.h);
    const pos = [
      a.x, 0.2, a.z, b.x, 0.2, a.z,
      b.x, 0.2, a.z, b.x, 0.2, b.z,
      b.x, 0.2, b.z, a.x, 0.2, b.z,
      a.x, 0.2, b.z, a.x, 0.2, a.z,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.95 });
    cuadro = new THREE.LineSegments(geo, mat);
    dyn.add(cuadro);

    const planeGeo = new THREE.PlaneGeometry(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x00d9ff,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    relleno = new THREE.Mesh(planeGeo, planeMat);
    relleno.rotation.x = -Math.PI / 2;
    relleno.position.set((a.x + b.x) / 2, 0.18, (a.z + b.z) / 2);
    dyn.add(relleno);
  }

  /** Marca el punto de consulta (pasajero) con una cruz y un anillo. */
  function setConsulta(punto) {
    if (marcaConsulta) {
      dyn.remove(marcaConsulta);
      marcaConsulta.traverse?.((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      marcaConsulta = null;
    }
    if (!punto) return;
    const w = toWorld(punto.x, punto.y);
    const g = new THREE.Group();
    const anilloGeo = new THREE.RingGeometry(0.18, 0.27, 32);
    const anilloMat = new THREE.MeshBasicMaterial({
      color: 0x00d9ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const anillo = new THREE.Mesh(anilloGeo, anilloMat);
    anillo.rotation.x = -Math.PI / 2;
    anillo.position.y = 0.19;
    g.add(anillo);
    const cruzMat = new THREE.LineBasicMaterial({ color: 0x8cecff, transparent: true, opacity: 0.95 });
    const cruzGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0.2, 0), new THREE.Vector3(0.5, 0.2, 0),
      new THREE.Vector3(0, 0.2, -0.5), new THREE.Vector3(0, 0.2, 0.5),
    ]);
    g.add(new THREE.LineSegments(cruzGeo, cruzMat));
    g.position.set(w.x, 0, w.z);
    dyn.add(g);
    marcaConsulta = g;
  }

  const mundo = {
    group,
    orthographic: true,
    view,
    camera: { rotate: false },
    toLocal,
    toWorld,
    limites,
    sync,
    setCandidatos,
    setGanador,
    setRect,
    setConsulta,
    localDesdeEvento(info) {
      const p = info?._puntoPlano;
      if (!p) return null;
      return toLocal(p.x, p.z);
    },
    update(dt, elapsed) {
      if (anilloGanador) {
        const s = 1 + Math.sin(elapsed * 3.2) * 0.13;
        anilloGanador.scale.setScalar(s);
      }
    },
    dispose() {
      limpiarDyn();
      for (const d of disposables) d.dispose?.();
    },
  };
  return mundo;
}
