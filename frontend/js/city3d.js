// Motor 3D único de la ciudad (Three.js). Un solo renderer que se "muda" al
// contenedor de la diapositiva activa: una sola copia de geometrías en GPU.
// Sistema de coordenadas: backend (x este, y norte, metros) → Three (X = x, Z = -y).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

export const COLOR = {
  disponible: 0x22e39b, ocupado: 0xff4d6d, candidato: 0xfacc15, asignado: 0x8b5cf6,
  cian: 0x00d9ff, violeta: 0x8b5cf6, magenta: 0xc026d3, amarillo: 0xfacc15, azul: 0x2563eb,
  pendiente: 0x2f7bff, actual: 0xfacc15, procesado: 0x22e39b, ruta: 0xb18cff,
};
const ANCHO_VIA = { motorway: 22, trunk: 18, primary: 15, secondary: 12, tertiary: 10, unclassified: 7, residential: 6.5, living_street: 5 };
const BRILLO_VIA = { motorway: 1, trunk: 1, primary: .95, secondary: .8, tertiary: .65 };
const ESCALA_TAXI = 2.4; // los taxis se dibujan ~2,4× más grandes para ser visibles a escala de barrio

const v3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

function fusionar(geometrias) {
  // Fusión simple de geometrías no indexadas (posición, normal).
  const partes = geometrias.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = partes.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of partes) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return r;
}

function texturaPunto() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Material de "flujo" para rutas: trazos que avanzan a lo largo del recorrido.
function materialFlujo(color, { opacidad = 0.9, guion = 0, velocidad = 60 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOp: { value: opacidad }, uDash: { value: guion }, uVel: { value: velocidad } },
    vertexShader: 'attribute float dist; varying float vD; varying float vS; attribute float side; void main(){ vD = dist; vS = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uOp; uniform float uDash; uniform float uVel; varying float vD; varying float vS;
      void main(){ float edge = 1.0 - smoothstep(0.55, 1.0, abs(vS));
        float pulse = 0.55 + 0.45 * smoothstep(0.6, 1.0, fract((vD - uTime * uVel) / 90.0));
        float a = uOp * (0.35 + 0.65 * edge) * pulse;
        if (uDash > 0.0 && fract(vD / uDash) > 0.55) discard;
        gl_FragColor = vec4(uColor * (0.8 + 0.6 * edge), a); }`,
  });
}

function cintaGeometria(puntos, ancho, altura = 1.2) {
  // Cinta plana (dos triángulos por segmento) con atributo de distancia acumulada.
  const pos = [], dist = [], lado = [];
  let acum = 0;
  for (let i = 0; i < puntos.length - 1; i++) {
    const [x0, y0] = puntos[i], [x1, y1] = puntos[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 0.01) continue;
    const nx = -(y1 - y0) / L * ancho / 2, ny = (x1 - x0) / L * ancho / 2;
    const a = [x0 + nx, y0 + ny], b = [x0 - nx, y0 - ny], c = [x1 + nx, y1 + ny], d = [x1 - nx, y1 - ny];
    for (const [p, s, dd] of [[a, 1, acum], [b, -1, acum], [c, 1, acum + L], [b, -1, acum], [d, -1, acum + L], [c, 1, acum + L]]) {
      pos.push(p[0], altura, -p[1]); lado.push(s); dist.push(dd);
    }
    acum += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('dist', new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute('side', new THREE.Float32BufferAttribute(lado, 1));
  return g;
}

export class City {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.calidad = 'alta';
    this._ajustarPixelRatio();
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', 'Mapa 3D interactivo de Comas');
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050816, 0.00018);
    this.camera = new THREE.PerspectiveCamera(42, 1, 2, 30000);
    this.camera.position.set(1600, 1500, 1900);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 9000;
    this.controls.autoRotateSpeed = 0.35;
    this.reloj = new THREE.Clock();
    this.tiempo = 0;
    this.pausado = false;
    this.contenedor = null;
    this.capaEtiquetas = document.createElement('div');
    this.capaEtiquetas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden';
    this.etiquetas = [];
    this.arcosTaxi = [];
    this.sim = null;
    this.seguir = null;
    this.onPick = null;
    this.materialesAnimados = new Set();
    this._resizeObs = new ResizeObserver(() => this._redimensionar());

    const luzH = new THREE.HemisphereLight(0x6f8cff, 0x05060f, 1.3);
    const luzD = new THREE.DirectionalLight(0xbfd4ff, 1.4);
    luzD.position.set(-800, 1400, 600);
    this.scene.add(luzH, luzD);

    this.grupos = {};
    for (const n of ['suelo', 'calles', 'edificios', 'nodos', 'flota', 'overlay', 'quadtree', 'rutas', 'efectos', 'pasajero']) {
      this.grupos[n] = new THREE.Group();
      this.scene.add(this.grupos[n]);
    }
    this._eventosPuntero();
    this.renderer.setAnimationLoop(() => this._cuadro());
  }

  _ajustarPixelRatio() {
    const max = this.calidad === 'baja' ? 1 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, max));
  }

  setCalidad(c) {
    this.calidad = c;
    this._ajustarPixelRatio();
    this._redimensionar();
    if (this.bordes) this.bordes.visible = c !== 'baja';
    if (this.particulas) this.particulas.visible = c !== 'baja';
  }

  // ------------------------------------------------------------ datos
  cargar(grafo, edificios) {
    this.grafo = grafo;
    const [xmin, ymin, xmax, ymax] = grafo.limites;
    this.centro = { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 };
    this.tamano = Math.max(xmax - xmin, ymax - ymin);
    this.nodoIndice = new Map(grafo.nodos.map((n, i) => [n[0], i]));
    this.nodoXY = new Map(grafo.nodos.map((n) => [n[0], [n[1], n[2]]]));
    this._suelo(xmin, ymin, xmax, ymax);
    this._calles(grafo.calles);
    this._edificios(edificios);
    this._nodos(grafo.nodos);
    this._taxis();
    this._particulas();
    this._marcadorPasajero();
    this.vista('portada', { instant: true });
  }

  _suelo(xmin, ymin, xmax, ymax) {
    const w = xmax - xmin, hgt = ymax - ymin;
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(w * 3, hgt * 3),
      new THREE.MeshBasicMaterial({ color: 0x060b1d }));
    plano.rotation.x = -Math.PI / 2;
    plano.position.copy(v3(this.centro.x, this.centro.y, -0.5));
    this.plano = plano;
    const rejilla = new THREE.GridHelper(Math.max(w, hgt) * 3, 90, 0x163060, 0x0c1a3a);
    rejilla.position.copy(v3(this.centro.x, this.centro.y, -0.2));
    rejilla.material.transparent = true;
    rejilla.material.opacity = 0.35;
    // Contorno de la zona descargada.
    const borde = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      v3(xmin, ymin, 1), v3(xmax, ymin, 1), v3(xmax, ymax, 1), v3(xmin, ymax, 1)]),
    new THREE.LineBasicMaterial({ color: COLOR.violeta, transparent: true, opacity: 0.5 }));
    this.grupos.suelo.add(plano, rejilla, borde);
  }

  _calles(calles) {
    const pos = [], col = [], posGlow = [];
    const c = new THREE.Color();
    for (const calle of calles) {
      const ancho = ANCHO_VIA[calle.tipo] || 6;
      const brillo = BRILLO_VIA[calle.tipo] || 0.42;
      c.setRGB(0.05 + 0.1 * brillo, 0.35 + 0.5 * brillo, 0.7 + 0.3 * brillo);
      const xy = calle.xy;
      for (let i = 0; i + 3 < xy.length; i += 2) {
        const x0 = xy[i], y0 = xy[i + 1], x1 = xy[i + 2], y1 = xy[i + 3];
        const L = Math.hypot(x1 - x0, y1 - y0);
        if (L < 0.05) continue;
        const nx = -(y1 - y0) / L * ancho / 2, ny = (x1 - x0) / L * ancho / 2;
        const quad = [[x0 + nx, y0 + ny], [x0 - nx, y0 - ny], [x1 + nx, y1 + ny], [x0 - nx, y0 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny]];
        for (const [px, py] of quad) { pos.push(px, 0.3, -py); col.push(c.r, c.g, c.b); }
        if (brillo >= 0.65) {
          const k = 2.6;
          for (const [px, py] of [[x0 + nx * k, y0 + ny * k], [x0 - nx * k, y0 - ny * k], [x1 + nx * k, y1 + ny * k], [x0 - nx * k, y0 - ny * k], [x1 - nx * k, y1 - ny * k], [x1 + nx * k, y1 + ny * k]]) posGlow.push(px, 0.1, -py);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const malla = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78 }));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(posGlow, 3));
    const brillo = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: 0x0aa7ff, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.grupos.calles.add(brillo, malla);
  }

  _edificios(edificios) {
    if (!edificios || !edificios.length) return;
    const pos = [], nor = [], col = [], lineas = [];
    const base = new THREE.Color(0x0b1430), techo = new THREE.Color(0x1a2a5c);
    for (const e of edificios) {
      const xy = e.xy;
      const pts = [];
      for (let i = 0; i < xy.length; i += 2) pts.push(new THREE.Vector2(xy[i], xy[i + 1]));
      if (pts.length > 2 && pts[0].equals(pts[pts.length - 1])) pts.pop();
      if (pts.length < 3) continue;
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      const hgt = e.h;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const n = [dy / L, 0, dx / L];
        const muro = [[a.x, 0, a.y], [b.x, 0, b.y], [b.x, hgt, b.y], [a.x, 0, a.y], [b.x, hgt, b.y], [a.x, hgt, a.y]];
        for (const [x, yy, y] of muro) {
          pos.push(x, yy, -y); nor.push(n[0], 0, n[2]);
          const cc = yy > 0 ? techo : base; col.push(cc.r, cc.g, cc.b);
        }
        lineas.push(a.x, hgt, -a.y, b.x, hgt, -b.y);
      }
      const tri = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const t of tri) {
        for (const k of t) { pos.push(pts[k].x, hgt, -pts[k].y); nor.push(0, 1, 0); col.push(techo.r, techo.g, techo.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const malla = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x050a1c, side: THREE.DoubleSide }));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3));
    this.bordes = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5b6cff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.grupos.edificios.add(malla, this.bordes);
  }

  _nodos(nodos) {
    const pos = new Float32Array(nodos.length * 3);
    const col = new Float32Array(nodos.length * 3);
    nodos.forEach(([, x, y], i) => { pos[i * 3] = x; pos[i * 3 + 1] = 3; pos[i * 3 + 2] = -y; col.set([0.25, 0.55, 1], i * 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.nodosPuntos = new THREE.Points(g, new THREE.PointsMaterial({ size: 11, vertexColors: true, map: texturaPunto(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.grupos.nodos.add(this.nodosPuntos);
    this.grupos.nodos.visible = false;
  }

  /** Colorea nodos: mapa id → color hex; el resto recibe `porDefecto` (o se oculta si null). */
  pintarNodos(colores, porDefecto = 0x1d3f8a, tamano = 11) {
    const attr = this.nodosPuntos.geometry.attributes.color;
    const c = new THREE.Color();
    const d = porDefecto == null ? null : new THREE.Color(porDefecto);
    for (const [id, i] of this.nodoIndice) {
      const hex = colores.get(id);
      if (hex != null) { c.setHex(hex); attr.setXYZ(i, c.r, c.g, c.b); } else if (d) attr.setXYZ(i, d.r, d.g, d.b); else attr.setXYZ(i, 0, 0, 0);
    }
    attr.needsUpdate = true;
    this.nodosPuntos.material.size = tamano;
  }

  _taxis() {
    const cuerpo = new THREE.BoxGeometry(4.6, 1.3, 2.0); cuerpo.translate(0, 1.0, 0);
    const cabina = new THREE.BoxGeometry(2.4, 0.9, 1.7); cabina.translate(-0.2, 2.1, 0);
    const letrero = new THREE.BoxGeometry(0.8, 0.45, 1.1); letrero.translate(-0.2, 2.8, 0);
    const geo = fusionar([cuerpo, cabina, letrero]);
    geo.scale(ESCALA_TAXI, ESCALA_TAXI, ESCALA_TAXI);
    const max = 6000;
    this.taxis = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.taxis.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.taxis.count = 0;
    const halo = new THREE.CircleGeometry(11, 20); halo.rotateX(-Math.PI / 2); halo.translate(0, 0.8, 0);
    this.halos = new THREE.InstancedMesh(halo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), max);
    this.halos.count = 0;
    this.taxis.setColorAt(0, new THREE.Color()); this.halos.setColorAt(0, new THREE.Color());
    this.grupos.flota.add(this.halos, this.taxis);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    this._idsTaxi = [];
  }

  _particulas() {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = this.centro.x + (Math.random() - 0.5) * this.tamano * 1.3;
      pos[i * 3 + 1] = 40 + Math.random() * 500;
      pos[i * 3 + 2] = -(this.centro.y + (Math.random() - 0.5) * this.tamano * 1.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particulas = new THREE.Points(g, new THREE.PointsMaterial({ size: 7, color: 0x64d8ff, map: texturaPunto(), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.grupos.efectos.add(this.particulas);
  }

  _marcadorPasajero() {
    const g = new THREE.Group();
    const haz = new THREE.Mesh(new THREE.CylinderGeometry(3, 7, 260, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: COLOR.magenta, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    haz.position.y = 130;
    const esfera = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 16), new THREE.MeshBasicMaterial({ color: 0xff7bf6 }));
    esfera.position.y = 22;
    const anillo = new THREE.Mesh(new THREE.RingGeometry(14, 19, 40), new THREE.MeshBasicMaterial({ color: 0xff7bf6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    anillo.rotation.x = -Math.PI / 2; anillo.position.y = 1.5;
    const onda = anillo.clone(); onda.material = anillo.material.clone();
    g.add(haz, esfera, anillo, onda);
    g.userData = { esfera, onda };
    g.visible = false;
    this.pasajeroMarca = g;
    this.grupos.pasajero.add(g);
  }

  ponerPasajero(x, y) {
    if (x == null) { this.pasajeroMarca.visible = false; return; }
    this.pasajeroMarca.position.copy(v3(x, y));
    this.pasajeroMarca.visible = true;
  }

  // ----------------------------------------------------------- flota
  conectarSim(sim) { this.sim = sim; }

  _colorTaxi(c) {
    const s = this.sim;
    if (s.asignado === c.id) return COLOR.asignado;
    if (s.candidatos.has(c.id)) return COLOR.candidato;
    return COLOR[c.estado] ?? COLOR.disponible;
  }

  _actualizarTaxis() {
    if (!this.sim || !this.grupos.flota.visible) return;
    this.sim.actualizarPosiciones(performance.now());
    let i = 0;
    this._idsTaxi.length = 0;
    for (const c of this.sim.conductores.values()) {
      if (i >= this.taxis.instanceMatrix.count) break;
      const resaltado = this.sim.asignado === c.id || this.sim.candidatos.has(c.id);
      const esc = resaltado ? 1.6 : 1;
      this._p.set(c.x, 0, -c.y);
      this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.rumbo || 0);
      this._s.set(esc, esc, esc);
      this._m.compose(this._p, this._q, this._s);
      this.taxis.setMatrixAt(i, this._m);
      this._s.set(esc * 1.3, 1, esc * 1.3);
      this._m.compose(this._p, this._q, this._s);
      this.halos.setMatrixAt(i, this._m);
      this._c.setHex(this._colorTaxi(c));
      this.taxis.setColorAt(i, this._c);
      this.halos.setColorAt(i, this._c);
      this._idsTaxi.push(c.id);
      i++;
    }
    this.taxis.count = this.halos.count = i;
    this.taxis.instanceMatrix.needsUpdate = this.halos.instanceMatrix.needsUpdate = true;
    if (this.taxis.instanceColor) this.taxis.instanceColor.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ overlays
  limpiar(grupo = 'overlay') {
    const g = this.grupos[grupo];
    for (const o of [...g.children]) {
      g.remove(o);
      o.traverse((n) => { n.geometry?.dispose(); if (n.material) { this.materialesAnimados.delete(n.material); n.material.dispose(); } });
    }
    if (grupo === 'overlay') { this.limpiarEtiquetas(); this.arcosTaxi = []; }
  }

  limpiarTodo() {
    this.limpiar('overlay'); this.limpiar('rutas'); this.limpiar('quadtree');
    this.ponerPasajero(null);
    this.grupos.nodos.visible = false;
    this.seguir = null;
  }

  ruta(puntos, color = COLOR.violeta, { ancho = 9, grupo = 'rutas', opacidad = 0.95, guion = 0, altura = 2 } = {}) {
    if (!puntos || puntos.length < 2) return null;
    const mat = materialFlujo(color, { opacidad, guion });
    const m = new THREE.Mesh(cintaGeometria(puntos, ancho, altura), mat);
    m.renderOrder = 5;
    this.materialesAnimados.add(mat);
    this.grupos[grupo].add(m);
    return m;
  }

  static geometriaArco(p1, p2, radio, alturaRel = 0.28, segmentos = 48) {
    const a = v3(p1[0], p1[1], 4), b = v3(p2[0], p2[1], 4);
    const d = a.distanceTo(b);
    const medio = a.clone().add(b).multiplyScalar(0.5); medio.y = 4 + d * alturaRel;
    const curva = new THREE.QuadraticBezierCurve3(a, medio, b);
    const tubo = new THREE.TubeGeometry(curva, segmentos, radio, 6, false);
    const L = curva.getLength();
    const uv = tubo.attributes.uv;
    const dist = new Float32Array(uv.count), lado = new Float32Array(uv.count);
    for (let i = 0; i < uv.count; i++) { dist[i] = uv.getX(i) * L; lado[i] = Math.sin(uv.getY(i) * Math.PI * 2) * 0.4; }
    tubo.setAttribute('dist', new THREE.BufferAttribute(dist, 1));
    tubo.setAttribute('side', new THREE.BufferAttribute(lado, 1));
    return tubo;
  }

  arco(p1, p2, color = COLOR.amarillo, { radio = 2.2, grupo = 'overlay', alturaRel = 0.28, guion = 14 } = {}) {
    const mat = materialFlujo(color, { opacidad: 1, guion, velocidad: 90 });
    this.materialesAnimados.add(mat);
    const m = new THREE.Mesh(City.geometriaArco(p1, p2, radio, alturaRel, 64), mat);
    this.grupos[grupo].add(m);
    return m;
  }

  /** Arco desde un punto fijo hasta un TAXI: se recalcula si el taxi se mueve. */
  arcoTaxi(p1, id, color = COLOR.amarillo, { radio = 1.8 } = {}) {
    const c = this.sim?.conductores.get(id);
    if (!c) return null;
    const m = this.arco(p1, [c.x, c.y], color, { radio });
    this.arcosTaxi.push({ desde: p1, id, mesh: m, radio, ultimo: [c.x, c.y] });
    return m;
  }

  /** Etiqueta que acompaña a un taxi. */
  etiquetaTaxi(id, texto, altura = 34) {
    const c = this.sim?.conductores.get(id);
    if (!c) return null;
    const el = this.etiqueta(c.x, c.y, texto, '', altura);
    this.etiquetas[this.etiquetas.length - 1].id = id;
    return el;
  }

  _seguirArcos() {
    for (const a of this.arcosTaxi) {
      const c = this.sim.conductores.get(a.id);
      if (!c || !a.mesh.parent) continue;
      if (Math.abs(c.x - a.ultimo[0]) < 0.8 && Math.abs(c.y - a.ultimo[1]) < 0.8) continue;
      a.ultimo = [c.x, c.y];
      a.mesh.geometry.dispose();
      a.mesh.geometry = City.geometriaArco(a.desde, a.ultimo, a.radio);
    }
  }

  rectangulos(lista, color = COLOR.cian, { opacidad = 0.6, altura = 3, grupo = 'overlay' } = {}) {
    const pos = [];
    for (const [x0, y0, x1, y1] of lista) {
      pos.push(x0, altura, -y0, x1, altura, -y0, x1, altura, -y0, x1, altura, -y1, x1, altura, -y1, x0, altura, -y1, x0, altura, -y1, x0, altura, -y0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacidad, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.grupos[grupo].add(l);
    return l;
  }

  area([x0, y0, x1, y1], color = COLOR.cian, opacidad = 0.12, grupo = 'overlay') {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1, x1 - x0), Math.max(1, y1 - y0)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacidad, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    p.rotation.x = -Math.PI / 2;
    p.position.copy(v3((x0 + x1) / 2, (y0 + y1) / 2, 2.5));
    this.grupos[grupo].add(p);
    this.rectangulos([[x0, y0, x1, y1]], color, { opacidad: 0.95, altura: 3.5, grupo });
    return p;
  }

  marca(x, y, color = COLOR.cian, radio = 10, grupo = 'overlay') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radio, 16, 12), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(v3(x, y, radio + 2));
    const anillo = new THREE.Mesh(new THREE.RingGeometry(radio * 1.4, radio * 1.9, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    anillo.rotation.x = -Math.PI / 2; anillo.position.copy(v3(x, y, 1.5));
    this.grupos[grupo].add(m, anillo);
    return m;
  }

  etiqueta(x, y, texto, clase = '', altura = 40) {
    const el = document.createElement('div');
    el.className = `lbl3d ${clase}`;
    el.textContent = texto;
    el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);padding:.18rem .5rem;border-radius:.45rem;font:700 .72rem Inter,sans-serif;white-space:nowrap;background:rgba(5,8,22,.85);border:1px solid rgba(0,217,255,.5);color:#fff;will-change:transform';
    this.capaEtiquetas.append(el);
    const e = { el, pos: v3(x, y, altura) };
    this.etiquetas.push(e);
    return el;
  }

  limpiarEtiquetas() { this.etiquetas.forEach((e) => e.el.remove()); this.etiquetas = []; }

  // ------------------------------------------------------------- cámara
  vista(nombre, { instant = false, x, y, distancia } = {}) {
    if (!this.centro) return;
    const c = this.centro, T = this.tamano;
    let objetivo = v3(c.x, c.y), pos;
    switch (nombre) {
      case 'superior': pos = v3(c.x, c.y - 1, T * 1.15); break;
      case 'isometrica': pos = v3(c.x + T * 0.42, c.y - T * 0.44, T * 0.46); break;
      case 'portada': objetivo = v3(c.x + T * 0.12, c.y); pos = v3(c.x + T * 0.48, c.y - T * 0.42, T * 0.36); break;
      case 'cerca': objetivo = v3(x, y); pos = v3(x + (distancia || 500) * 0.55, y - (distancia || 500) * 0.65, (distancia || 500) * 0.7); break;
      case 'arriba-cerca': objetivo = v3(x, y); pos = v3(x, y - 1, distancia || 900); break;
      default: pos = v3(c.x + T * 0.5, c.y - T * 0.62, T * 0.55);
    }
    this.seguir = null;
    if (instant || !window.gsap) {
      this.camera.position.copy(pos); this.controls.target.copy(objetivo); this.controls.update(); return;
    }
    window.gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 1.3, ease: 'power2.inOut' });
    window.gsap.to(this.controls.target, { x: objetivo.x, y: objetivo.y, z: objetivo.z, duration: 1.3, ease: 'power2.inOut' });
  }

  zoom(factor) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    const nueva = this.controls.target.clone().add(dir.multiplyScalar(factor));
    window.gsap.to(this.camera.position, { x: nueva.x, y: nueva.y, z: nueva.z, duration: 0.5 });
  }

  rotar(angulo) {
    const t = this.controls.target, p = this.camera.position.clone().sub(t);
    p.applyAxisAngle(THREE.Object3D.DEFAULT_UP, angulo);
    const n = t.clone().add(p);
    window.gsap.to(this.camera.position, { x: n.x, y: n.y, z: n.z, duration: 0.6 });
  }

  seguirTaxi(id) { this.seguir = id; }

  visible(capa, v) { if (this.grupos[capa]) this.grupos[capa].visible = v; }

  // ------------------------------------------------------- montaje DOM
  montar(contenedor) {
    if (this.contenedor === contenedor) return;
    if (this.contenedor) this._instantanea(this.contenedor);
    this.contenedor = contenedor;
    contenedor.querySelector(':scope > img.snapshot')?.remove();
    contenedor.prepend(this.canvas);
    contenedor.append(this.capaEtiquetas);
    this._resizeObs.disconnect();
    this._resizeObs.observe(contenedor);
    this._redimensionar();
  }

  _instantanea(cont) {
    // Deja una imagen de la última vista en el contenedor anterior (modo scroll).
    try {
      this.renderer.render(this.scene, this.camera);
      const img = new Image();
      img.className = 'snapshot';
      img.alt = '';
      img.src = this.canvas.toDataURL('image/jpeg', 0.75);
      cont.querySelector(':scope > img.snapshot')?.remove();
      cont.prepend(img);
    } catch { /* sin instantánea */ }
  }

  _redimensionar() {
    if (!this.contenedor) return;
    const w = this.contenedor.clientWidth, hgt = this.contenedor.clientHeight;
    if (!w || !hgt) return;
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  _eventosPuntero() {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let inicio = null;
    this.canvas.addEventListener('pointerdown', (e) => { inicio = [e.clientX, e.clientY]; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!inicio || Math.hypot(e.clientX - inicio[0], e.clientY - inicio[1]) > 6 || !this.onPick) return;
      const r = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      if (this.grupos.flota.visible && this.taxis.count) {
        const hit = ray.intersectObject(this.taxis, false)[0] || ray.intersectObject(this.halos, false)[0];
        if (hit && hit.instanceId != null) { this.onPick({ tipo: 'taxi', id: this._idsTaxi[hit.instanceId] }); return; }
      }
      const suelo = ray.intersectObject(this.plano, false)[0];
      if (suelo) this.onPick({ tipo: 'suelo', x: suelo.point.x, y: -suelo.point.z });
    });
  }

  // -------------------------------------------------------------- bucle
  _cuadro() {
    const dt = Math.min(0.05, this.reloj.getDelta());
    // No dibujar si el contenedor no está visible (ahorra GPU).
    if (!this.contenedor || !this.contenedor.getClientRects().length || document.hidden) return;
    if (!this.pausado) {
      this.tiempo += dt;
      for (const m of this.materialesAnimados) m.uniforms.uTime.value = this.tiempo;
      if (this.particulas?.visible) this.particulas.rotation.y += dt * 0.004;
      const pm = this.pasajeroMarca;
      if (pm.visible) {
        const f = (this.tiempo % 1.6) / 1.6;
        pm.userData.onda.scale.setScalar(1 + f * 3.5);
        pm.userData.onda.material.opacity = 0.8 * (1 - f);
        pm.userData.esfera.position.y = 22 + Math.sin(this.tiempo * 3) * 4;
      }
    }
    this._actualizarTaxis();
    if (this.arcosTaxi.length && this.sim) this._seguirArcos();
    if (this.seguir != null && this.sim) {
      const c = this.sim.conductores.get(this.seguir);
      if (c) {
        const objetivo = v3(c.x, c.y);
        const delta = objetivo.clone().sub(this.controls.target).multiplyScalar(0.08);
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
    }
    this.controls.autoRotate = this.autoRotar && !this.pausado;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (this.etiquetas.length) {
      const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight, p = new THREE.Vector3();
      for (const e of this.etiquetas) {
        if (e.id != null) { const c = this.sim?.conductores.get(e.id); if (c) e.pos.set(c.x, e.pos.y, -c.y); }
        p.copy(e.pos).project(this.camera);
        const visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
        e.el.style.display = visible ? '' : 'none';
        if (visible) e.el.style.transform = `translate(${(p.x + 1) / 2 * w}px, ${(1 - p.y) / 2 * hgt}px) translate(-50%,-100%)`;
      }
    }
  }
}
