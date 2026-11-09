/* Escena 3 — Arquitectura del sistema y pipeline de decisión. */

import { icon, escapeHtml } from '../core/format.js';
import { heading, on, q, qa, setHTML, formula, tags, panel } from './common.js';

const NODOS = [
  {
    id: 'entrada',
    icon: 'send',
    name: 'Entrada GPS',
    short: 'solicitud',
    title: 'Recepción de la solicitud',
    text: 'El pasajero envía latitud y longitud. Se valida el rango geográfico y se descarta una ubicación fuera de la cobertura de Comas.',
    tags: ['lat', 'lon', 'validación'],
    formula: 'p = (\\varphi,\\lambda)',
    complexity: 'O(1)',
  },
  {
    id: 'snap',
    icon: 'pin',
    name: 'Snap a la red',
    short: 'nodo más cercano',
    title: 'Ajuste al nodo vial más cercano',
    text: 'La posición GPS se proyecta al plano local en metros y se busca el nodo vial más cercano. Si el ajuste supera 400 m, la solicitud se rechaza por falta de conexión vial.',
    tags: ['proyección', 'snap', '400 m'],
    formula: '\\min_{v\\in V}\\ \\lVert p-p_v\\rVert_2',
    complexity: 'O(V)',
  },
  {
    id: 'quadtree',
    icon: 'tree',
    name: 'Quadtree',
    short: 'candidatos',
    title: 'Índice espacial Quadtree',
    text: 'El Quadtree divide el área en cuadrantes y poda regiones que no pueden contener a los K más cercanos. Cada consulta examina una fracción de la flota.',
    tags: ['subdivisión', 'poda', 'filtro disponible'],
    formula: 'Q_k(p)=\\operatorname{kNN}_{QT}(p,k)',
    complexity: 'O(\\log n + k)',
  },
  {
    id: 'haversine',
    icon: 'sigma',
    name: 'Haversine',
    short: 'distancia justa',
    title: 'Distancia geográfica Haversine',
    text: 'La distancia plana solo sirve para podar. La comparación final entre candidatos se hace con Haversine, que considera la curvatura terrestre.',
    tags: ['R = 6371,0088 km', 'círculo máximo'],
    formula: 'd=2R\\,\\operatorname{atan2}\\left(\\sqrt a,\\sqrt{1-a}\\right)',
    complexity: 'O(1)',
  },
  {
    id: 'heap',
    icon: 'heap',
    name: 'Heap K',
    short: 'selección',
    title: 'Max-heap de tamaño K',
    text: 'Un max-heap conserva los K candidatos más cercanos. La raíz es el peor del top-K; un candidato nuevo solo entra si mejora a la raíz.',
    tags: ['top-K', 'max-heap', 'O(log K)'],
    formula: 'H=\\operatorname{topK}\\{d_i\\}',
    complexity: 'O(n\\log K)',
  },
  {
    id: 'dijkstra',
    icon: 'graph',
    name: 'Dijkstra',
    short: 'ruta por calles',
    title: 'Ruta mínima por la red vial',
    text: 'Para cada candidato se ejecuta Dijkstra desde su nodo hasta el pasajero. La cola de prioridad es un heap binario implementado por el equipo.',
    tags: ['pesos km', 'cola binaria', 'sin librerías'],
    formula: 'd(v)=\\min_{(u,v)\\in E}\\ d(u)+w(u,v)',
    complexity: 'O((V+E)\\log V)',
  },
  {
    id: 'eta',
    icon: 'clock',
    name: 'ETA',
    short: 'tiempo de llegada',
    title: 'Estimación de tiempo de llegada',
    text: 'La distancia por calles se divide entre la velocidad media de operación. El ganador es el candidato alcanzable con menor ETA; los empates se rompen por distancia y luego por id.',
    tags: ['velocidad', 'orden total', 'desempate'],
    formula: '\\mathrm{ETA}=\\frac{d_{\\text{calle}}}{v}\\cdot 60',
    complexity: 'O(k\\log k)',
  },
  {
    id: 'asignar',
    icon: 'check',
    name: 'Asignación',
    short: 'decisión',
    title: 'Asignación y trazabilidad',
    text: 'Se reserva el conductor, se registran fases, tiempos, nodos visitados y la ruta elegida. La traza permite auditar por qué se seleccionó a ese conductor.',
    tags: ['reserva', 'log', 'auditoría'],
    formula: 'c^*=\\arg\\min_{c\\in C}\\ \\mathrm{ETA}(c)',
    complexity: 'O(1)',
  },
];

export function createArchitectureScene(ctx) {
  let root;
  let actual = 0;
  let timer = 0;
  let playing = false;

  function pintar(indice, { scroll = false } = {}) {
    actual = Math.max(0, Math.min(NODOS.length - 1, indice));
    qa('.arch-node', root).forEach((el, i) => {
      el.classList.toggle('is-active', i === actual);
      el.classList.toggle('is-visited', i < actual);
      if (i === actual && scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
    qa('.arch-link', root).forEach((el, i) => el.classList.toggle('is-pulsing', i === actual && playing));
    const n = NODOS[actual];
    setHTML(root, '#arch-detail', `
      <div class="arch-detail__index"><strong>${String(actual + 1).padStart(2, '0')}</strong><span>de ${NODOS.length} · ${n.complexity}</span></div>
      <h3>${escapeHtml(n.title)}</h3>
      <p>${escapeHtml(n.text)}</p>
      ${tags(n.tags)}
      ${formula(n.formula, `${n.name} · complejidad ${n.complexity}`)}
    `);
    qa('.arch-progress i', root).forEach((el, i) => el.classList.toggle('is-done', i <= actual));
    const etiqueta = q('#arch-step-label', root);
    if (etiqueta) etiqueta.textContent = `${String(actual + 1).padStart(2, '0')} / ${String(NODOS.length).padStart(2, '0')} · ${n.name}`;
  }

  function parar() {
    clearInterval(timer);
    timer = 0;
    playing = false;
    const btn = q('#arch-play', root);
    if (btn) btn.innerHTML = `${icon('play')} Recorrer pipeline`;
    qa('.arch-link', root).forEach((el) => el.classList.remove('is-pulsing'));
  }

  function reproducir() {
    if (playing) {
      parar();
      return;
    }
    playing = true;
    const btn = q('#arch-play', root);
    if (btn) btn.innerHTML = `${icon('pause')} Pausar recorrido`;
    pintar(0);
    timer = setInterval(() => {
      if (actual >= NODOS.length - 1) {
        parar();
        ctx.toast('Pipeline completo: 8 etapas, una sola decisión.', 'info');
        return;
      }
      pintar(actual + 1, { scroll: true });
    }, 1150);
  }

  return {
    id: 'architecture',
    mount(el) {
      root = el;
      const nodosHtml = NODOS.map((n, i) => `
        ${i ? '<div class="arch-link" aria-hidden="true"></div>' : ''}
        <button class="arch-node" type="button" data-arch="${i}" aria-label="${n.title}">
          <span class="arch-node__icon">${icon(n.icon)}</span>
          <strong>${n.name}</strong>
          <small>${n.short}</small>
        </button>`).join('');

      root.innerHTML = `
        <div class="arch-layout">
          <div class="arch-main">
            ${heading({
              eyebrow: 'ACTO I · CONTEXTO',
              title: 'Arquitectura del sistema',
              lead: 'Ocho etapas conectan una solicitud GPS con una asignación auditable. Cada etapa tiene una responsabilidad y un costo algorítmico distinto.',
              right: '<span class="chip chip--cyan">PIPELINE EJECUTABLE</span>',
            })}
            <div class="arch-flow-wrap glass">
              <div class="arch-flow" id="arch-flow" role="list">${nodosHtml}</div>
            </div>
            <div class="arch-flow-controls">
              <button class="btn btn--ghost btn--sm" id="arch-prev" type="button">${icon('chevron')} Anterior</button>
              <button class="btn btn--primary btn--sm" id="arch-play" type="button">${icon('play')} Recorrer pipeline</button>
              <button class="btn btn--ghost btn--sm" id="arch-next" type="button">Siguiente ${icon('chevron')}</button>
            </div>
            <div class="arch-progress" aria-hidden="true">${NODOS.map(() => '<i></i>').join('')}</div>
            <div class="row row--between">
              <span class="mono note" id="arch-step-label">01 / 08 · Entrada GPS</span>
              <span class="mono note">Traza completa en cada asignación</span>
            </div>
          </div>

          <aside class="arch-side">
            <section class="panel glass arch-detail" id="arch-detail"></section>
            <section class="panel glass">
              <div class="panel__head"><div><p class="eyebrow">CONTRATO DEL SISTEMA</p><h3 class="panel__title">Datos reales, decisiones trazables</h3></div></div>
              <div class="panel__body">
                <div class="metrics" style="grid-template-columns:1fr 1fr">
                  <div class="metric"><span class="metric__value">${ctx.graph.stats.nodes.toLocaleString('es-PE')}</span><span class="metric__label">nodos reales</span></div>
                  <div class="metric"><span class="metric__value">${ctx.graph.stats.edges.toLocaleString('es-PE')}</span><span class="metric__label">aristas reales</span></div>
                </div>
                <p class="note" style="margin-top:8px">Quadtree, Dijkstra y Haversine son implementaciones propias. El heap binario es propio. No se usa NetworkX, OSMnx, scipy KDTree ni rtree para resolver el camino crítico.</p>
              </div>
            </section>
          </aside>
        </div>`;

      qa('[data-arch]', root).forEach((el) => on(el, 'click', () => {
        parar();
        pintar(Number(el.dataset.arch));
      }));
      on(root, '#arch-prev', 'click', () => { parar(); pintar(actual - 1, { scroll: true }); });
      on(root, '#arch-next', 'click', () => { parar(); pintar(actual + 1, { scroll: true }); });
      on(root, '#arch-play', 'click', reproducir);
      pintar(0);
    },
    enter() {
      ctx.host.clearWorld();
      parar();
      pintar(actual);
    },
    leave() {
      parar();
    },
    pause(paused) {
      if (paused) parar();
    },
  };
}
