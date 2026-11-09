import { accion, encabezado, fmt, h, kpi, legend, toast } from '../ui.js';

// Demostración del Quadtree propio en un espacio 100 × 100. Cada operación se
// ejecuta en el BACKEND (misma clase Quadtree del despachador) y aquí solo se
// dibuja el árbol que devuelve, animando las subdivisiones reales (eventos).
const GUION = [
  { txt: 'Un solo nodo cubre todo el mapa. Capacidad: 2.', op: 'reiniciar' },
  ...[[20, 75], [70, 80], [30, 30], [80, 22], [62, 62], [15, 15], [88, 90], [40, 85], [72, 38], [55, 12], [25, 55], [91, 55]].map(([x, y], i) => ({ txt: `Insertar en (${x}, ${y})${i === 2 ? ': la raíz se llena y se divide en 4.' : '.'}`, op: 'insertar', x, y })),
  { txt: 'Buscar en (50,50)–(95,95): cian = visitado, rojo = descartado.', op: 'buscar', r: [50, 50, 95, 95] },
  { txt: 'Mover el conductor 1: sale de su hoja y se reinserta.', op: 'mover', id: 1, x: 78, y: 70 },
  { txt: 'Eliminar el conductor 6: las hojas casi vacías se fusionan.', op: 'eliminar', id: 6 },
  { txt: '8 conductores en el mismo punto: la hoja no se divide más.', op: 'mismo_punto' },
];

export default {
  titulo: 'Quadtree', capitulo: 'ESTRUCTURAS',
  notas: 'RF-03: insertar, eliminar, buscar en rectángulo y actualizar posición. Pulsa "Reproducir explicación" o "Siguiente paso". Modo libre: clic para insertar, arrastrar para buscar. Mencionar el caso de muchos conductores en el mismo punto.',
  crear({ api, num, raiz }) {
    const cv = h('canvas', { class: 'heap-canvas', style: { cursor: 'crosshair' } });
    const k = { nodos: kpi('Nodos', '—', 'c-cyan'), prof: kpi('Profundidad', '—', 'c-violet'), elem: kpi('Conductores', '—', 'c-green'), vis: kpi('Visitados en búsqueda', '—', 'c-yellow'), desb: kpi('Hojas desbordadas', '—', 'c-red') };
    const paso = h('div', { class: 'card card--violet', style: { minHeight: '5.2rem' } }, h('h4', {}, 'Explicación paso a paso'), h('p', {}, 'Pulsa «Reproducir explicación» o «Siguiente paso».'));
    const modoBtns = {};
    const modo = { actual: 'insertar' };
    const seg = h('div', { class: 'seg' }, ...[['insertar', 'Insertar'], ['eliminar', 'Eliminar'], ['mover', 'Mover'], ['buscar', 'Buscar ▭']].map(([m, t]) => {
      const b = h('button', { type: 'button', onclick: () => cambiarModo(m) }, t); modoBtns[m] = b; return b;
    }));
    const hintModo = h('p', { class: 'hint' });
    const inCap = h('input', { type: 'number', min: 1, max: 8, value: 2, style: { width: '4rem' }, class: 'inp' });
    const btnPlay = h('button', { class: 'btn btn--neon', type: 'button' }, '▶ Reproducir explicación');
    const btnStep = h('button', { class: 'btn btn--violet', type: 'button' }, 'Siguiente paso ›');
    const btnReset = h('button', { class: 'btn btn--ghost', type: 'button' }, '↺ Reiniciar ejemplo');
    const btnRand = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, '+10 aleatorios');
    const btnClus = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, '40 agrupados');

    raiz.append(
      encabezado(num, 'ESTRUCTURAS · RF-03', '<em>Quadtree</em>: partición espacial', 'Si una hoja se llena, se divide en 4 cuadrantes.'),
      h('div', { class: 'slide__body cols-64' },
        h('div', { class: 'card card--flush', style: { display: 'flex', flexDirection: 'column' } },
          h('div', { class: 'row', style: { padding: '.6rem .8rem', borderBottom: '1px solid var(--line)' } }, seg, hintModo),
          h('div', { class: 'chart-box', style: { flex: 1 } }, cv)),
        h('div', { class: 'stack scroll-y' },
          h('div', { class: 'card card--neon' }, h('h4', {}, 'Estadísticas reales del árbol'), h('div', { class: 'kpis' }, k.nodos, k.prof, k.elem, k.vis, k.desb)),
          paso,
          h('div', { class: 'card' }, h('h4', {}, 'Controles'),
            h('div', { class: 'row' }, btnPlay, btnStep),
            h('div', { class: 'row', style: { marginTop: '.5rem' } }, btnReset, h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '.4rem' } }, 'Capacidad', inCap), btnRand, btnClus)),
          legend([['#00D9FF', 'Visitado'], ['#FF4D6D', 'Descartado'], ['#8B5CF6', 'Con conductores'], ['#FACC15', 'Encontrado']]))));

    let foto = { nodos: [], puntos: [], estadisticas: {} };
    let busqueda = null, arrastre = null, seleccion = null;
    const animaciones = []; // {r, t0}
    let raf = 0;

    function cambiarModo(m) {
      modo.actual = m; seleccion = null;
      Object.entries(modoBtns).forEach(([n, b]) => b.classList.toggle('is-on', n === m));
      hintModo.textContent = { insertar: 'Clic para insertar un conductor.', eliminar: 'Clic sobre un conductor para eliminarlo.', mover: 'Clic en un conductor y luego en su nuevo destino.', buscar: 'Arrastra para dibujar el rectángulo de búsqueda.' }[m];
      dibujar();
    }

    function aplicar(f) {
      foto = { ...foto, ...f };
      for (const e of f.eventos || []) if (e.tipo === 'subdividir') animaciones.push({ r: e.nodo, t0: performance.now() });
      if (f.eventos?.some((e) => e.tipo === 'desborde')) toast('Hoja desbordada: los puntos son idénticos o se alcanzó la profundidad máxima; no se subdivide más.', 'info', 'CASO LÍMITE');
      const s = f.estadisticas || foto.estadisticas;
      k.nodos.set(s.nodos); k.prof.set(s.profundidad); k.elem.set(s.elementos); k.desb.set(s.hojas_desbordadas);
      animar();
    }

    const escala = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const lado = Math.min(cv.width, cv.height) - 30 * dpr;
      const ox = (cv.width - lado) / 2, oy = (cv.height - lado) / 2;
      return { dpr, lado, ox, oy, f: (x, y) => [ox + x / 100 * lado, oy + (100 - y) / 100 * lado], inv: (px, py) => [((px * dpr - ox) / lado) * 100, 100 - ((py * dpr - oy) / lado) * 100] };
    };

    function dibujar() {
      const { dpr, lado, ox, oy, f } = escala();
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(0,217,255,.03)'; g.fillRect(ox, oy, lado, lado);
      const clave = (r) => r.join(',');
      const vis = new Set((busqueda?.visitados || []).map(clave)), desc = new Set((busqueda?.descartados || []).map(clave));
      const ahora = performance.now();
      for (const n of foto.nodos) {
        const [x0, y0, x1, y1] = n.r;
        const [a, b] = f(x0, y1), w = (x1 - x0) / 100 * lado, hh = (y1 - y0) / 100 * lado;
        if (n.hoja && n.n > 0) { g.fillStyle = `rgba(139,92,246,${Math.min(0.28, 0.07 + n.n * 0.03)})`; g.fillRect(a, b, w, hh); }
        if (vis.has(clave(n.r)) && n.hoja) { g.fillStyle = 'rgba(0,217,255,.16)'; g.fillRect(a, b, w, hh); }
        if (desc.has(clave(n.r))) { g.fillStyle = 'rgba(255,77,109,.13)'; g.fillRect(a, b, w, hh); }
      }
      for (const n of foto.nodos) {
        const [x0, y0, x1, y1] = n.r;
        const [a, b] = f(x0, y1);
        const k2 = clave(n.r);
        g.lineWidth = (n.p === 0 ? 2.4 : 1.4) * dpr;
        g.strokeStyle = vis.has(k2) ? 'rgba(0,217,255,.95)' : desc.has(k2) ? 'rgba(255,77,109,.6)' : `rgba(110,150,255,${0.75 - n.p * 0.07})`;
        g.strokeRect(a, b, (x1 - x0) / 100 * lado, (y1 - y0) / 100 * lado);
      }
      // Animación de nuevas divisiones: las líneas crecen desde el centro.
      for (const an of animaciones) {
        const t = Math.min(1, (ahora - an.t0) / 650);
        const [x0, y0, x1, y1] = an.r, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const hx = (x1 - x0) / 2 * t, hy = (y1 - y0) / 2 * t;
        g.strokeStyle = `rgba(250,204,21,${1 - t * 0.6})`; g.lineWidth = 3 * dpr; g.shadowColor = '#FACC15'; g.shadowBlur = 14 * (1 - t);
        g.beginPath();
        let [p, q] = f(cx - hx, cy); g.moveTo(p, q); [p, q] = f(cx + hx, cy); g.lineTo(p, q);
        [p, q] = f(cx, cy - hy); g.moveTo(p, q); [p, q] = f(cx, cy + hy); g.lineTo(p, q);
        g.stroke(); g.shadowBlur = 0;
      }
      if (busqueda?.rect) {
        const [x0, y0, x1, y1] = busqueda.rect, [a, b] = f(x0, y1);
        g.setLineDash([8 * dpr, 6 * dpr]); g.strokeStyle = '#FACC15'; g.lineWidth = 2 * dpr;
        g.strokeRect(a, b, (x1 - x0) / 100 * lado, (y1 - y0) / 100 * lado); g.setLineDash([]);
      }
      if (arrastre) {
        const [x0, y0] = f(arrastre.x0, arrastre.y0), [x1, y1] = f(arrastre.x1, arrastre.y1);
        g.fillStyle = 'rgba(250,204,21,.1)'; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
      const encontrados = new Set(busqueda?.encontrados || []);
      for (const [id, x, y] of foto.puntos) {
        const [a, b] = f(x, y);
        const esSel = seleccion === id, esEnc = encontrados.has(id);
        g.fillStyle = esSel ? '#FF7BF6' : esEnc ? '#FACC15' : '#22E39B';
        g.shadowColor = g.fillStyle; g.shadowBlur = 10 * dpr;
        g.beginPath(); g.arc(a, b, (esSel ? 8 : 5.5) * dpr, 0, 7); g.fill(); g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `${10 * dpr}px Inter`; g.fillText(id, a + 7 * dpr, b - 6 * dpr);
      }
      return animaciones.some((an) => ahora - an.t0 < 650);
    }
    function animar() {
      cancelAnimationFrame(raf);
      const bucle = () => { const sigue = dibujar(); if (sigue) raf = requestAnimationFrame(bucle); else animaciones.length = 0; };
      bucle();
    }

    // ------------------------------------------------------- operaciones
    const ops = {
      reiniciar: async (cfg = {}) => { busqueda = null; k.vis.set('—'); aplicar(await api('/api/quadtree/demo/reiniciar', { cantidad: 0, capacidad: Number(inCap.value) || 2, ...cfg })); },
      insertar: async (x, y) => aplicar(await api('/api/quadtree/demo/insertar', { x: +x.toFixed(1), y: +y.toFixed(1) })),
      eliminar: async (id) => { busqueda = null; aplicar(await api('/api/quadtree/demo/eliminar', { id })); },
      mover: async (id, x, y) => { busqueda = null; aplicar(await api('/api/quadtree/demo/mover', { id, x: +x.toFixed(1), y: +y.toFixed(1) })); },
      buscar: async ([x0, y0, x1, y1]) => {
        const r = await api('/api/quadtree/demo/buscar', { xmin: x0, ymin: y0, xmax: x1, ymax: y1 });
        busqueda = { ...r, rect: [x0, y0, x1, y1] };
        k.vis.set(`${r.visitados.length} nodos`);
        toast(`Encontrados ${r.encontrados.length} de ${r.total}. Se revisaron ${r.elementos_revisados} conductores; ${r.descartados.length} cuadrantes descartados.`, 'info', 'BÚSQUEDA EN RECTÁNGULO');
        dibujar();
      },
      mismo_punto: async () => { for (let i = 0; i < 8; i++) await ops.insertar(47.5, 47.5); },
    };

    let pasoIdx = 0, reproduciendo = null;
    async function siguientePaso() {
      if (pasoIdx >= GUION.length) pasoIdx = 0;
      const p = GUION[pasoIdx];
      paso.replaceChildren(h('h4', {}, `Paso ${pasoIdx + 1} de ${GUION.length}`), h('p', {}, p.txt));
      pasoIdx++;
      if (p.op === 'reiniciar') { inCap.value = 2; await ops.reiniciar({ capacidad: 2 }); }
      else if (p.op === 'insertar') await ops.insertar(p.x, p.y);
      else if (p.op === 'buscar') await ops.buscar(p.r);
      else if (p.op === 'mover') await ops.mover(p.id, p.x, p.y);
      else if (p.op === 'eliminar') await ops.eliminar(p.id);
      else if (p.op === 'mismo_punto') await ops.mismo_punto();
    }
    function detener() { clearInterval(reproduciendo); reproduciendo = null; btnPlay.textContent = '▶ Reproducir explicación'; }
    btnPlay.addEventListener('click', () => {
      if (reproduciendo) { detener(); return; }
      pasoIdx = 0;
      btnPlay.textContent = '⏸ Pausar explicación';
      const tick = () => siguientePaso().catch((e) => { toast(e.message, 'error'); detener(); }).then(() => { if (pasoIdx >= GUION.length) detener(); });
      tick();
      reproduciendo = setInterval(tick, 2300);
    });
    btnStep.addEventListener('click', () => accion(btnStep, () => { detener(); return siguientePaso(); }));
    btnReset.addEventListener('click', () => accion(btnReset, () => { detener(); pasoIdx = 0; paso.replaceChildren(h('h4', {}, 'Explicación paso a paso'), h('p', {}, 'Ejemplo reiniciado.')); return ops.reiniciar(); }));
    btnRand.addEventListener('click', () => accion(btnRand, async () => { for (let i = 0; i < 10; i++) await ops.insertar(2 + Math.random() * 96, 2 + Math.random() * 96); }));
    btnClus.addEventListener('click', () => accion(btnClus, () => ops.reiniciar({ cantidad: 40, agrupados: true, semilla: Math.floor(Math.random() * 1000) })));

    // ------------------------------------------------------- puntero
    const pos = (e) => { const r = cv.getBoundingClientRect(); return escala().inv(e.clientX - r.left, e.clientY - r.top); };
    const cercano = (x, y) => { let mejor = null, d = 4; for (const [id, px, py] of foto.puntos) { const dd = Math.hypot(px - x, py - y); if (dd < d) { d = dd; mejor = id; } } return mejor; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      if (modo.actual === 'buscar') { arrastre = { x0: x, y0: y, x1: x, y1: y }; cv.setPointerCapture(e.pointerId); }
    });
    cv.addEventListener('pointermove', (e) => { if (!arrastre) return; const [x, y] = pos(e); arrastre.x1 = Math.max(0, Math.min(100, x)); arrastre.y1 = Math.max(0, Math.min(100, y)); dibujar(); });
    cv.addEventListener('pointerup', async (e) => {
      const [x, y] = pos(e);
      try {
        if (modo.actual === 'buscar' && arrastre) {
          const a = arrastre; arrastre = null;
          if (Math.abs(a.x1 - a.x0) < 1 || Math.abs(a.y1 - a.y0) < 1) { dibujar(); return; }
          await ops.buscar([Math.min(a.x0, a.x1), Math.min(a.y0, a.y1), Math.max(a.x0, a.x1), Math.max(a.y0, a.y1)]);
          return;
        }
        if (x < 0 || x > 100 || y < 0 || y > 100) return;
        if (modo.actual === 'insertar') { busqueda = null; await ops.insertar(x, y); }
        else if (modo.actual === 'eliminar') { const id = cercano(x, y); if (id) await ops.eliminar(id); }
        else if (modo.actual === 'mover') {
          if (seleccion == null) { seleccion = cercano(x, y); dibujar(); if (seleccion) hintModo.textContent = `Conductor ${seleccion} seleccionado: clic en el destino.`; }
          else { const id = seleccion; seleccion = null; await ops.mover(id, x, y); cambiarModo('mover'); }
        }
      } catch (err) { toast(err.message, 'error'); }
    });
    new ResizeObserver(() => dibujar()).observe(cv);

    return {
      async entrar() {
        cambiarModo('insertar');
        if (!foto.nodos.length) { try { await ops.reiniciar({ cantidad: 24, semilla: 7 }); } catch (e) { toast(e.message, 'error'); } } else dibujar();
      },
      salir() { detener(); },
    };
  },
};
