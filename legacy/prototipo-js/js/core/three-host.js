/* ==========================================================================
   HOST WEBGL ÚNICO — Three.js
   Un solo renderer y una sola escena; cada escena monta y desmonta su mundo.
   Esto evita múltiples contextos WebGL y mantiene el consumo estable.
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

export class ThreeHost {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.touchAction = 'none';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x090711, 0.012);

    this.perspectiva = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);
    this.ortografica = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 4000);
    this.camera = this.perspectiva;
    this.scene.add(this.ambient = new THREE.AmbientLight(0xbfa6ff, 1.15));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(14, 26, 12);
    this.scene.add(dir);
    const p1 = new THREE.PointLight(0x8b00ff, 120, 90, 2);
    p1.position.set(-18, 8, -10);
    this.scene.add(p1);
    const p2 = new THREE.PointLight(0x00d9ff, 80, 80, 2);
    p2.position.set(16, 6, 14);
    this.scene.add(p2);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.panSpeed = 0.8;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.enabled = false;

    this.world = null;
    this.worldName = null;
    this.paused = false;
    this.quality = 'auto';
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.pointer = { down: false, downX: 0, downY: 0, x: 0, y: 0, startX: 0, startY: 0 };
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._bindPointer();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  _bindPointer() {
    const local = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = local(e);
      this.pointer = { ...this.pointer, down: true, downX: p.x, downY: p.y, x: p.x, y: p.y, startX: p.x, startY: p.y };
      if (e.button === 0 && this.world?.onPointerDown) this.world.onPointerDown(this._eventInfo(e, p));
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = local(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      const info = this._eventInfo(e, p);
      if (this.world?.onPointerMove) this.world.onPointerMove(info);
      if (this.pointer.down && this.world?.onPointerDrag) this.world.onPointerDrag(info);
    });
    const up = (e) => {
      const p = local(e);
      const moved = Math.hypot(p.x - this.pointer.downX, p.y - this.pointer.downY);
      const info = this._eventInfo(e, p, moved);
      if (this.world?.onPointerUp) this.world.onPointerUp(info);
      this.pointer.down = false;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', () => {
      this.pointer.down = false;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.down = false;
    });
  }

  _eventInfo(e, p, moved = 0) {
    const ndc = new THREE.Vector2((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1);
    this._raycaster.setFromCamera(ndc, this.camera);
    return {
      event: e,
      clientX: e.clientX,
      clientY: e.clientY,
      x: p.x,
      y: p.y,
      ndc,
      moved,
      raycaster: this._raycaster,
    };
  }

  /** Punto del plano horizontal y=0 bajo el puntero. */
  puntoEnPlano(info, y = 0) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    const hit = info.raycaster.ray.intersectPlane(plane, out);
    return hit ? out : null;
  }

  setWorld(name, factory) {
    if (this.worldName === name) {
      return this.world;
    }
    if (this.world) {
      this.root.remove(this.world.group);
      this.world.dispose?.();
      this.world = null;
    }
    this.worldName = name;
    if (!factory) return null;
    const world = factory();
    this.world = world;
    this.root.add(world.group);
    this.controls.enabled = true;
    const cam = world.camera || {};
    const ortho = Boolean(world.orthographic);
    this.camera = ortho ? this.ortografica : this.perspectiva;
    this.controls.object = this.camera;
    this.controls.enableRotate = !ortho && cam.rotate !== false;
    this.controls.enablePan = true;
    this.controls.minZoom = 0.4;
    this.controls.maxZoom = 12;
    this.controls.autoRotate = Boolean(cam.autoRotate);
    this.controls.autoRotateSpeed = cam.autoRotateSpeed ?? 0.35;
    if (ortho) {
      this._view = world.view || { width: 20, height: 20 };
      this._fitOrtho(true);
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 50, 0.01);
      this.camera.up.set(0, 0, -1);
      this.camera.zoom = 1;
      this.controls.update();
    } else {
      if (cam.position) this.camera.position.set(...cam.position);
      if (cam.target) this.controls.target.set(...cam.target);
      else this.controls.target.set(0, 0, 0);
      this.camera.up.set(0, 1, 0);
      this.camera.fov = cam.fov || 45;
      this.camera.near = cam.near || 0.1;
      this.camera.far = cam.far || 4000;
      this.camera.updateProjectionMatrix();
      this.controls.update();
    }
    this.scene.fog = world.fog === false ? null : new THREE.FogExp2(0x090711, world.fogDensity ?? 0.012);
    world.enter?.();
    return world;
  }

  clearWorld() {
    if (this.world) {
      this.root.remove(this.world.group);
      this.world.dispose?.();
    }
    this.world = null;
    this.worldName = null;
    this.controls.enabled = false;
  }

  _fitOrtho(resetZoom = false) {
    const w = this._view?.width || 20;
    const h = this._view?.height || 20;
    const aspect = Math.max(0.1, this.renderer.domElement.clientWidth / Math.max(1, this.renderer.domElement.clientHeight));
    const alto = Math.max(h, w / aspect);
    const ancho = alto * aspect;
    const cam = this.ortografica;
    cam.left = -ancho / 2;
    cam.right = ancho / 2;
    cam.top = alto / 2;
    cam.bottom = -alto / 2;
    if (resetZoom) cam.zoom = 1;
    cam.updateProjectionMatrix();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.perspectiva.aspect = w / h;
    this.perspectiva.updateProjectionMatrix();
    this._fitOrtho();
    this.world?.resize?.(w, h);
  }

  setPaused(paused) {
    this.paused = paused;
    this.clock.getDelta();
  }

  setQuality(quality) {
    this.quality = quality;
    const ratio = quality === 'low' ? 1 : quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.8);
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.paused) {
      this.elapsed += dt;
      this.world?.update?.(dt, this.elapsed);
      if (this.controls.enabled) this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.clearWorld();
    this.renderer.dispose();
  }
}
