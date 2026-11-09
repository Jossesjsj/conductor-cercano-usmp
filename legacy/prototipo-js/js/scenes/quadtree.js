/* Escena 5 — Quadtree: índice espacial de la flota sobre la red real. */

import { createQuadtreeWorld } from '../core/quadtree-world.js';
import { construirQuadtreeFlota } from '../core/fleet.js';
import { SeededRandom } from '../core/seeded-random.js';
import { fmtInt, fmt2, fmtM, icon } from '../core/format.js';
import { heading, panel, formula, tags, legend, on, q, qa, setText, setHTML, clampNumber, puntoEnRed } from './common.js';

const MODOS = {
  consulta: 'Consulta K',
  insertar: 'Insertar',
  rectangulo: 'Rectángulo',
};

export function createQuadtreeScene(ctx) {
  let root;
  let world = null;
  let fleet = [];
  let limites = null;
  let quadtree = null;
  let modo = 'consulta';
  let k = 6;
  let ultimo = null;
  let consulta = null;
  let rectangulo = null;
  let inicioArrastre = null;
  let insertados = 0;
  let rng = new SeededRandom(20261105);

  function construir() {
    fleet = ctx.getFlota(300).map((c) => ({ ...c }));
    const res = construirQuadtreeFlota(ctx.graph, fleet, { margen: 260, capacidad: 6, profundidadMaxima: 9 });
    quadtree = res.quadtree;
    limites = res.limites;
    ultimo = null;
    consulta = null;
    rectangulo = null;
    insertados = 0;
  }

  function pintarMundo() {
    if (!world || !quadtree) return;
    world.sync(quadtree);
    if (rectangulo) world.setRect(rectangulo);
    if (consulta) {
      world.setConsulta(consulta);
      const puntos = ultimo?.puntos || [];
      if (puntos.length) world.setCandidatos(puntos);
      if (puntos.length) world.setGanador(puntos[0]);
    }
    actualizarPanel();
  }

  function actualizarPanel() {
    if (!root || !quadtree) return;
    const s = quadtree.estadisticas();
    const disponibles = fleet.filter((c) => c.disponible !== false).length;
    if (q('#quad-stats', root)) {
      setHTML(root, '#quad-stats', `
        <div class="metrics" style="grid-template-columns:1fr 1fr">
          <div class="metric"><span class="metric__value">${fmtInt(s.puntos)}</span><span class="metric__label">puntos indexados</span></div>
          <div class="metric metric--accent"><span class="metric__value">${fmtInt(s.nodos)}</span><span class="metric__label">nodos del árbol</span></div>
          <div class="metric"><span class="metric__value">${s.hojas}</span><span class="metric__label">hojas</span></div>
          <div class="metric"><span class="metric__value">${s.profundidad}</span><span class="metric__label">profundidad real</span></div>
        </div>
        <div class="symbol-list" style="margin-top:9px">
          <div><code>capacidad</code><span>${s.capacidad} puntos por hoja · máximo ${s.profundidadMaxima} niveles</span></div>
          <div><code>disponibles</code><span>${fmtInt(disponibles)} de ${fmtInt(fleet.length)} conductores</span></div>
          <div><code>overflow</code><span>${s.overflow} puntos en hojas saturadas</span></div>
          <div><code>operaciones</code><span>${fmtInt(s.operaciones.insertar)} inserciones · ${fmtInt(s.operaciones.kVecinos)} consultas K</span></div>
        </div>
        ${legend([
          { dot: 'legend__dot--cyan', label: 'disponible' },
          { dot: 'legend__dot--gray', label: 'ocupado' },
          { dot: 'legend__dot--amber', label: 'candidato' },
          { dot: 'legend__dot--green', label: 'ganador' },
        ])}
      `);
    }

    if (q('#quad-readout', root)) {
      setHTML(root, '#quad-readout', `
        <span>MODO <b>${MODOS[modo].toUpperCase()}</b></span>
        <span>PUNTOS <b>${fmtInt(s.puntos)}</b></span>
        <span>PROF. <b>${s.profundidad}</b></span>
        <span>VISITADOS <b>${ultimo ? ultimo.nodosVisitados : '—'}</b></span>
        <span>PODADOS <b>${ultimo ? ultimo.nodosPodados : '—'}</b></span>
      `);
    }

    const etiqueta = q('#quad-mode-label', root);
    if (etiqueta) etiqueta.textContent = MODOS[modo];
    qa('[data-quad-mode]', root).forEach((b) => b.classList.toggle('is-active', b.dataset.quadMode === modo));
    qa('[data-quad-step]', root).forEach((b) => b.classList.toggle('is-active', b.dataset.quadStep === modo));

    if (q('#quad-query', root)) {
      setHTML(root, '#quad-query', ultimo ? resultadoHtml(ultimo) : `
        <div class="empty-state">Haz clic en el plano para consultar los K conductores más cercanos. El pasajero se marca con una cruz cian y los candidatos con ámbar.</div>
      `);
    }
  }

  function resultadoHtml(res) {
    const filas = res.puntos.slice(0, k).map((p, i) => `
      <div class="bar-item">
        <div class="bar-item__head">
          <span><b style="color:${i === 0 ? 'var(--green)' : 'var(--white)'};font-weight:500">${p.id}</b> · ${p.disponible === false ? 'ocupado' : 'disponible'}</span>
          <strong>${fmtM(res.puntos[i].distancia_plana_m)}</strong>
        </div>
        <div class="bar-track"><span class="bar-fill ${i === 0 ? 'bar-fill--green' : 'bar-fill--amber'}" style="width:${Math.max(5, 100 - (p.distancia_plana_m / Math.max(1, res.puntos[res.puntos.length - 1].distancia_plana_m)) * 88)}%"></span></div>
      </div>`).join('');
    return `
      <p class="note" style="margin-bottom:7px">
        <strong style="color:var(--white)">${res.puntos.length}</strong> devueltos ·
        <strong style="color:var(--cyan)">${res.nodosVisitados}</strong> nodos visitados ·
        <strong style="color:var(--cyan)">${res.nodosPodados}</strong> podados ·
        <strong style="color:var(--cyan)">${res.puntosExaminados}</strong> puntos examinados de ${quadtree.tamaño}.
      </p>
      <div class="bar-list">${filas || '<div class="empty-state">No hay conductores disponibles en la consulta.</div>'}</div>
      <p class="note" style="margin-top:8px">La caja resaltada es el resultado del recorrido best-first sobre el árbol. La raíz del max-heap es el peor de los K; por eso se puede podar una región completa cuando su distancia mínima ya supera a ese peor candidato.</p>
    `;
  }

  function consultar(local) {
    if (!quadtree) return;
    consulta = { x: local.x, y: local.y };
    rectangulo = null;
    ultimo = quadtree.k_mas_cercanos(local.x, local.y, k, (p) => p.disponible !== false);
    pintarMundo();
    if (ultimo.puntos.length) {
      ctx.toast(`Consulta K=${k}: ${ultimo.puntos[0].id} es el más cercano en el plano.`, 'info');
    } else {
      ctx.toast('No hay conductores disponibles en esa consulta.', 'warn');
    }
  }

  function consultarRect(rect) {
    if (!quadtree) return;
    const acc = quadtree.buscar_rectangulo(rect);
    rectangulo = rect;
    consulta = null;
    ultimo = acc;
    pintarMundo();
    ctx.toast(`Rectángulo: ${acc.puntos.length} conductores dentro de ${Math.round(rect.w)}×${Math.round(rect.h)} m.`, 'info');
  }

  function insertarEn(local) {
    if (!quadtree) return;
    if (!quadtree.raiz.contiene(local)) {
      ctx.toast('Ese punto está fuera de los límites del índice.', 'warn');
      return;
    }
    const geo = ctx.graph.projector.toGeo(local.x, local.y);
    const punto = {
      id: `Q-${String(++insertados).padStart(3, '0')}`,
      lat: geo.lat,
      lon: geo.lon,
      x: local.x,
      y: local.y,
      disponible: true,
      insertadoEnEscena: true,
      creado: fleet.length,
    };
    const res = quadtree.insertar(punto);
    if (res.ok) {
      fleet.push(punto);
      rectangulo = null;
      consulta = null;
      ultimo = null;
      pintarMundo();
    } else {
      ctx.toast(`No se pudo insertar: ${res.motivo}`, 'warn');
    }
  }

  function agregarConductores(n = 1) {
    for (let i = 0; i < n; i++) {
      const geo = puntoEnRed(ctx.graph, rng);
      const local = ctx.graph.projector.toLocal(geo.lat, geo.lon);
      const punto = {
        id: `Q-${String(++insertados).padStart(3, '0')}`,
        lat: geo.lat,
        lon: geo.lon,
        x: local.x,
        y: local.y,
        disponible: true,
        creado: fleet.length,
      };
      const res = quadtree.insertar(punto);
      if (res.ok) fleet.push(punto);
    }
    consulta = null;
    rectangulo = null;
    ultimo = null;
    pintarMundo();
  }

  function localDeEvento(info) {
    if (!world) return null;
    const p = ctx.host.puntoEnPlano(info);
    if (!p) return null;
    return world.toLocal(p.x, p.z);
  }

  function alPresionar(info) {
    const local = localDeEvento(info);
    if (!local) return;
    if (modo === 'rectangulo') {
      inicioArrastre = local;
      rectangulo = { x: local.x, y: local.y, w: 0, h: 0 };
      ctx.host.controls.enablePan = false;
      world.setRect(rectangulo);
    } else if (modo === 'insertar') {
      insertarEn(local);
    } else {
      consultar(local);
    }
  }

  function alArrastrar(info) {
    if (modo !== 'rectangulo' || !inicioArrastre) return;
    const local = localDeEvento(info);
    if (!local) return;
    rectangulo = {
      x: Math.min(inicioArrastre.x, local.x),
      y: Math.min(inicioArrastre.y, local.y),
      w: Math.abs(local.x - inicioArrastre.x),
      h: Math.abs(local.y - inicioArrastre.y),
    };
    world.setRect(rectangulo);
  }

  function alSoltar(info) {
    if (modo === 'rectangulo' && inicioArrastre) {
      ctx.host.controls.enablePan = true;
      if (rectangulo && rectangulo.w > 12 && rectangulo.h > 12) {
        consultarRect(rectangulo);
      } else {
        rectangulo = null;
        world.setRect(null);
      }
      inicioArrastre = null;
    }
  }

  function cambiarModo(nuevo) {
    modo = nuevo;
    rectangulo = null;
    consulta = null;
    ultimo = null;
    inicioArrastre = null;
    ctx.host.controls.enablePan = true;
    if (world) {
      world.setRect(null);
      world.setConsulta(null);
      world.setGanador(null);
    }
    pintarMundo();
  }

  return {
    id: 'quadtree',
    mount(el) {
      root = el;
      construir();
      root.innerHTML = `
        <div class="quad-layout">
          <div class="quad-left">
            ${heading({
              eyebrow: 'ACTO II · ALGORITMOS',
              title: 'Quadtree',
              lead: 'El índice divide el área de Comas en cuadrantes y descarta regiones completas. En lugar de revisar 300 conductores, examina una fracción pequeña de la flota.',
              right: '<span class="chip chip--cyan">ÍNDICE PROPIO</span>',
            })}

            ${panel({
              title: 'Cómo se recorre el índice',
              eyebrow: 'PASO A PASO',
              iconName: 'tree',
              body: `
                <div class="quad-steps" role="list">
                  <button class="quad-step" type="button" data-quad-step="insertar"><span class="n">1</span><span><strong style="color:var(--white)">Insertar</strong> · los conductores se ubican por su posición local.</span></button>
                  <button class="quad-step" type="button" data-quad-step="consulta"><span class="n">2</span><span><strong style="color:var(--white)">Subdividir y podar</strong> · una hoja se divide al superar su capacidad.</span></button>
                  <button class="quad-step" type="button" data-quad-step="consulta"><span class="n">3</span><span><strong style="color:var(--white)">Consultar K</strong> · best-first con heap de regiones y max-heap de candidatos.</span></button>
                  <button class="quad-step" type="button" data-quad-step="rectangulo"><span class="n">4</span><span><strong style="color:var(--white)">Rango</strong> · un rectángulo devuelve todos los puntos contenidos.</span></button>
                </div>
                ${formula('Q_k(p)=\\operatorname{kNN}_{QT}(p,k)', 'La consulta K poda un cuadrante cuando su distancia mínima ya no puede mejorar al peor candidato del top-K.')}
                ${tags(['capacidad 6', 'profundidad máxima 9', 'proyección local en metros', 'filtro de disponibilidad'])}
              `,
            })}

            ${panel({
              title: 'Contrato del índice',
              eyebrow: 'IMPLEMENTACIÓN',
              iconName: 'cpu',
              body: `
                <div class="symbol-list">
                  <div><code>insertar(p)</code><span>O(profundidad) · el punto se guarda en una hoja</span></div>
                  <div><code>k_mas_cercanos(x,y,k)</code><span>O(log n + k) en el caso típico, con poda</span></div>
                  <div><code>buscar_rectangulo(r)</code><span>O(visitados + devueltos), sin revisar regiones disjuntas</span></div>
                  <div><code>actualizar_posicion()</code><span>elimina y reinserta: apto para flota en movimiento</span></div>
                </div>
                <p class="note" style="margin-top:8px">Cada nodo del árbol dibujado proviene del índice real de esta escena. No es una ilustración: si insertas un punto, el árbol se subdivide de verdad cuando corresponde.</p>
              `,
            })}
          </div>

          <aside class="quad-right">
            <section class="panel glass">
              <header class="panel__head"><div><p class="eyebrow">ESTADO DEL ÍNDICE</p><h3 class="panel__title">${icon('chart')} Estructura viva</h3></div></header>
              <div class="panel__body" id="quad-stats"></div>
            </section>

            <section class="panel glass">
              <header class="panel__head"><div><p class="eyebrow">RESULTADO DE LA CONSULTA</p><h3 class="panel__title">${icon('search')} Vecinos</h3></div></header>
              <div class="panel__body" id="quad-query"></div>
            </section>

            <section class="panel glass">
              <header class="panel__head"><div><p class="eyebrow">PARÁMETRO</p><h3 class="panel__title">K vecinos</h3></div></header>
              <div class="panel__body">
                <div class="k-controls">
                  <button class="btn btn--ghost btn--sm" id="quad-k-menos" type="button" aria-label="Reducir K">−</button>
                  <span class="k-value" id="quad-k-value">${k}</span>
                  <button class="btn btn--ghost btn--sm" id="quad-k-mas" type="button" aria-label="Aumentar K">+</button>
                  <span class="note">conductores</span>
                </div>
                <p class="note" style="margin-top:6px">Cambiar K reconstruye la consulta con el mismo punto. El árbol no cambia: solo cambia cuántos candidatos conserva el max-heap.</p>
              </div>
            </section>
          </aside>

          <div class="quad-toolbar" role="group" aria-label="Herramientas del Quadtree">
            <button class="btn btn--ghost btn--sm is-active" type="button" data-quad-mode="consulta">${icon('search')} Consultar K</button>
            <button class="btn btn--ghost btn--sm" type="button" data-quad-mode="insertar">${icon('plus')} Insertar</button>
            <button class="btn btn--ghost btn--sm" type="button" data-quad-mode="rectangulo">${icon('target')} Rectángulo</button>
            <span class="sep"></span>
            <button class="btn btn--ghost btn--sm" id="quad-add" type="button">+1 conductor</button>
            <button class="btn btn--ghost btn--sm" id="quad-reset" type="button">${icon('reset')} Reiniciar</button>
          </div>

          <div class="quad-canvas-hint"><i></i><span>CLIC: CONSULTAR · MODO INSERTAR: AÑADIR · MODO RECTÁNGULO: ARRASTRAR</span></div>
          <div class="quad-readout" id="quad-readout"></div>
        </div>`;

      qa('[data-quad-mode]', root).forEach((b) => on(b, 'click', () => cambiarModo(b.dataset.quadMode)));
      qa('[data-quad-step]', root).forEach((b) => on(b, 'click', () => {
        if (b.dataset.quadStep === modo) {
          if (modo === 'consulta' && consulta) consultar(consulta);
          else if (modo === 'rectangulo' && rectangulo) consultarRect(rectangulo);
          else ctx.toast('Haz clic sobre el plano para usar este modo.', 'info');
        } else cambiarModo(b.dataset.quadStep);
      }));
      on(root, '#quad-k-menos', 'click', () => cambiarK(k - 1));
      on(root, '#quad-k-mas', 'click', () => cambiarK(k + 1));
      on(root, '#quad-add', 'click', () => agregarConductores(1));
      on(root, '#quad-reset', 'click', () => {
        construir();
        if (world) world.setRect(null);
        pintarMundo();
        ctx.toast('Índice reconstruido con la flota original de 300 conductores.', 'info');
      });
    },

    enter() {
      world = ctx.host.setWorld('quadtree', () => {
        const w = createQuadtreeWorld({ limites, graph: ctx.graph });
        w.onPointerDown = alPresionar;
        w.onPointerDrag = alArrastrar;
        w.onPointerUp = alSoltar;
        return w;
      });
      ctx.host.controls.enablePan = true;
      if (quadtree) pintarMundo();
    },

    leave() {
      ctx.host.controls.enablePan = true;
      inicioArrastre = null;
    },

    pause(paused) {
      ctx.host.setPaused(paused);
    },

    resize() {
      ctx.host.resize();
    },
  };

  function cambiarK(siguiente) {
    const nuevo = clampNumber(siguiente, 1, 12, k);
    if (nuevo === k) return;
    k = nuevo;
    setText(root, '#quad-k-value', String(k));
    if (consulta) {
      ultimo = quadtree.k_mas_cercanos(consulta.x, consulta.y, k, (p) => p.disponible !== false);
      pintarMundo();
    } else {
      actualizarPanel();
    }
  }
}
