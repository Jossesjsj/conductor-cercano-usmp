// Controlador de la presentación: carga, navegación (diapositivas / scroll),
// modo exposición, demostración rápida, notas y atajos de teclado.
import { api } from './api.js';
import { City } from './city3d.js';
import { sim } from './sim.js';
import { $, $$, h, toast } from './ui.js';
import { SLIDES } from './slides/index.js';

const city = new City();
city.conectarSim(sim);
const RECORRIDO = [0, 3, 5, 7, 8, 10, 12, 18]; // demostración rápida (≈5 min)
const estado = { actual: -1, modo: 'slides', recorrido: false, instancias: [] };
const deck = $('#deck');

function ctx() { return { city, sim, api, ir, toast, siguiente, anterior }; }

// ------------------------------------------------------------------- arranque
async function arrancar() {
  const status = $('#boot-status');
  try {
    const e = await api('/api/estado');
    if (!e.listo) throw new Error(`El backend respondió, pero la red vial no está cargada:\n${e.error}\n\nEjecuta:  python -m datos.descargar_red`);
    status.textContent = 'Cargando red vial de OpenStreetMap…';
    const [grafo, edif] = await Promise.all([api('/api/grafo'), api('/api/edificios')]);
    status.textContent = `Construyendo ciudad 3D (${grafo.nodos.length} intersecciones, ${edif.edificios.length} edificios)…`;
    await new Promise((r) => requestAnimationFrame(r));
    city.cargar(grafo, edif.edificios);
    window.__grafo = grafo;
    status.textContent = 'Sincronizando flota con el backend…';
    await sim.cargar();
  } catch (err) {
    $('#boot').classList.add('is-error');
    status.textContent = err.message || String(err);
    return;
  }
  construir();
  const hash = location.hash.match(/s-(\d+)/);
  ir(hash ? Math.min(SLIDES.length - 1, Number(hash[1]) - 1) : 0, { instant: true });
  setTimeout(() => $('#boot').classList.add('is-done'), 150);
  if (localStorage.getItem?.('cc-perf') === 'baja') alternarRendimiento(true);
}

function construir() {
  SLIDES.forEach((def, i) => {
    const seccion = h('section', { class: `slide ${def.clase || ''}`, id: `s-${String(i + 1).padStart(2, '0')}`, 'aria-label': def.titulo, dataset: { i } });
    const inner = h('div', { class: 'slide__inner' });
    seccion.append(inner);
    deck.append(seccion);
    let inst;
    try {
      inst = def.crear({ ...ctx(), num: i + 1, raiz: inner }) || {};
    } catch (e) {
      console.error(e);
      inner.append(h('div', { class: 'pending' }, h('strong', {}, 'Error al construir la sección'), String(e.message)));
      inst = {};
    }
    estado.instancias.push({ def, inst, seccion });
    $('#menu-list').append(h('li', {}, h('button', { type: 'button', dataset: { i }, onclick: () => { cerrarMenu(); ir(i); } },
      h('span', { class: 'n' }, String(i + 1).padStart(2, '0')), h('span', { class: 't' }, def.titulo), h('span', { class: 'c' }, def.capitulo || ''))));
  });
  $('#count-tot').textContent = `/ ${SLIDES.length}`;
  observarScroll();
}

// ---------------------------------------------------------------- navegación
function activar(i) {
  const prev = estado.instancias[estado.actual];
  if (prev && estado.actual !== i) { try { prev.inst.salir?.(); } catch (e) { console.error(e); } }
  const cur = estado.instancias[i];
  estado.actual = i;
  if (cur.inst.viewport) city.montar(cur.inst.viewport);
  // La flota solo se mueve sola donde aporta (portada, flota, simulación, mapa);
  // en las diapositivas de algoritmos se detiene para que los dibujos no se desplacen.
  sim.setAuto(!!cur.def.animarFlota);
  city.autoRotar = false;
  try { cur.inst.entrar?.(); } catch (e) { console.error(e); toast(e.message, 'error'); }
  const num = String(i + 1).padStart(2, '0');
  $('#count-cur').textContent = num;
  $('#progress').style.width = `${((i + 1) / SLIDES.length) * 100}%`;
  $('#topbar-title').textContent = `${num} · ${cur.def.titulo}`;
  $('#pres-notes').textContent = cur.def.notas || '';
  $$('#menu-list button').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.i) === i));
  history.replaceState(null, '', `#s-${num}`);
  actualizarRecorrido();
}

function ir(i, { instant = false } = {}) {
  i = Math.max(0, Math.min(SLIDES.length - 1, i));
  if (estado.modo === 'scroll') {
    estado.instancias[i].seccion.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    if (instant || estado.actual === -1) activar(i);
    return;
  }
  if (i === estado.actual) return;
  // Red de seguridad: tras la transición solo la diapositiva actual queda visible.
  clearTimeout(estado.limpieza);
  estado.limpieza = setTimeout(() => {
    estado.instancias.forEach(({ seccion }, j) => {
      if (j !== estado.actual && seccion.classList.contains('is-active')) {
        window.gsap?.killTweensOf(seccion);
        seccion.classList.remove('is-active');
        seccion.style.opacity = ''; seccion.style.transform = '';
      }
    });
  }, 900);
  const anterior = estado.instancias[estado.actual];
  const nueva = estado.instancias[i];
  const dir = i > estado.actual ? 1 : -1;
  nueva.seccion.classList.add('is-active');
  activar(i);
  if (anterior) {
    if (instant || !window.gsap) {
      anterior.seccion.classList.remove('is-active');
    } else {
      window.gsap.killTweensOf([anterior.seccion, nueva.seccion]);
      window.gsap.fromTo(nueva.seccion, { opacity: 0, x: 60 * dir }, { opacity: 1, x: 0, duration: 0.55, ease: 'power3.out', clearProps: 'transform' });
      window.gsap.to(anterior.seccion, { opacity: 0, x: -60 * dir, duration: 0.4, ease: 'power2.in', onComplete: () => { anterior.seccion.classList.remove('is-active'); window.gsap.set(anterior.seccion, { clearProps: 'opacity,transform' }); } });
      const hijos = nueva.seccion.querySelectorAll('.slide__head, .card, .pipeline');
      window.gsap.fromTo(hijos, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, delay: 0.12, ease: 'power2.out', clearProps: 'opacity,transform' });
    }
  }
}

function siguiente() {
  if (estado.recorrido) {
    const pos = RECORRIDO.findIndex((x) => x > estado.actual);
    if (pos === -1) { terminarRecorrido(); return; }
    ir(RECORRIDO[pos]);
    return;
  }
  ir(estado.actual + 1);
}
function anterior() {
  if (estado.recorrido) {
    const previos = RECORRIDO.filter((x) => x < estado.actual);
    if (previos.length) ir(previos[previos.length - 1]);
    return;
  }
  ir(estado.actual - 1);
}

// ------------------------------------------------------------------- modos
function cambiarModo(modo) {
  if (modo === estado.modo) return;
  const actual = estado.actual;
  estado.modo = modo;
  document.body.classList.toggle('mode-slides', modo === 'slides');
  document.body.classList.toggle('mode-scroll', modo === 'scroll');
  $$('.seg [data-mode]').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === modo));
  estado.instancias.forEach(({ seccion }, i) => {
    window.gsap?.set(seccion, { clearProps: 'all' });
    seccion.classList.toggle('is-active', modo === 'slides' && i === actual);
  });
  city.controls.enableZoom = modo === 'slides';
  if (modo === 'scroll') {
    requestAnimationFrame(() => estado.instancias[actual].seccion.scrollIntoView({ behavior: 'auto' }));
    toast('Modo web desplazable: usa la rueda para recorrer. Haz clic en un mapa para activar su zoom.', 'info');
  } else {
    window.scrollTo(0, 0);
  }
}

function observarScroll() {
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      e.target.classList.toggle('in-view', e.intersectionRatio > 0.15);
      if (estado.modo === 'scroll' && e.intersectionRatio > 0.55) {
        const i = Number(e.target.dataset.i);
        if (i !== estado.actual) activar(i);
      }
    }
  }, { threshold: [0, 0.15, 0.55, 0.8] });
  estado.instancias.forEach(({ seccion }) => io.observe(seccion));
  // En modo scroll el zoom del mapa se activa solo tras hacer clic dentro (no roba la rueda).
  city.canvas.addEventListener('pointerdown', () => { if (estado.modo === 'scroll') city.controls.enableZoom = true; });
  city.canvas.addEventListener('pointerleave', () => { if (estado.modo === 'scroll') city.controls.enableZoom = false; });
  // Parallax sutil del fondo.
  window.addEventListener('scroll', () => {
    if (estado.modo === 'scroll') $('#bg').style.transform = `translateY(${-window.scrollY * 0.04}px)`;
  }, { passive: true });
}

// ------------------------------------------------------- recorrido y exposición
function iniciarRecorrido() {
  estado.recorrido = true;
  cambiarModo('slides');
  ir(RECORRIDO[0]);
  actualizarRecorrido();
  toast('Demostración rápida: 9 escenas clave en ~5 minutos. Usa → para avanzar.', 'info', 'DEMO RÁPIDA');
}
function terminarRecorrido() { estado.recorrido = false; actualizarRecorrido(); }
function actualizarRecorrido() {
  const el = $('#tour-indicator');
  el.hidden = !estado.recorrido;
  $('#btn-tour').classList.toggle('is-on', estado.recorrido);
  if (!estado.recorrido) return;
  const pos = RECORRIDO.indexOf(estado.actual);
  el.replaceChildren(h('span', {}, `Demo rápida ${pos >= 0 ? pos + 1 : '–'} / ${RECORRIDO.length}`),
    h('button', { type: 'button', title: 'Salir de la demostración rápida', onclick: terminarRecorrido }, '✕'));
}

async function alternarExposicion() {
  const activo = document.body.classList.toggle('expo');
  $('#btn-expo').classList.toggle('is-on', activo);
  $('#btn-expo').textContent = activo ? 'Salir de exposición' : 'Modo exposición';
  if (activo) {
    cambiarModo('slides');
    try { await document.documentElement.requestFullscreen?.(); } catch { /* el navegador puede rechazarlo */ }
  } else if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }
}

function pantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => toast('El navegador no permitió la pantalla completa.', 'error'));
}

function alternarRendimiento(forzarBajo) {
  const bajo = forzarBajo === true ? true : !document.body.classList.contains('perf-low');
  document.body.classList.toggle('perf-low', bajo);
  city.setCalidad(bajo ? 'baja' : 'alta');
  $('#btn-perf').classList.toggle('is-on', bajo);
  $('#btn-perf').title = bajo ? 'Rendimiento: BAJO (GPU limitada). Clic para alto.' : 'Rendimiento: ALTO. Clic para modo bajo.';
  try { localStorage.setItem('cc-perf', bajo ? 'baja' : 'alta'); } catch { /* sin almacenamiento */ }
  if (forzarBajo !== true) toast(bajo ? 'Modo de rendimiento reducido activado.' : 'Calidad gráfica alta activada.', 'info');
}

// ------------------------------------------------------------ cronómetro
const crono = { total: 15 * 60, restante: 15 * 60, intervalo: null };
function pintarCrono() {
  const m = Math.floor(crono.restante / 60), s = crono.restante % 60;
  $('#pres-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const transcurrido = crono.total - crono.restante;
  $('#pres-phase').textContent = transcurrido < 300 ? 'Fase 1 · Demostración en vivo' : transcurrido < 600 ? 'Fase 2 · Preguntas individuales' : 'Fase 3 · Modificación en vivo';
}
function alternarCrono() {
  if (crono.intervalo) { clearInterval(crono.intervalo); crono.intervalo = null; $('#pres-toggle').textContent = 'Continuar'; return; }
  crono.intervalo = setInterval(() => { crono.restante = Math.max(0, crono.restante - 1); pintarCrono(); }, 1000);
  $('#pres-toggle').textContent = 'Pausar';
}

// --------------------------------------------------------------- menú
function abrirMenu() { $('#menu').hidden = false; $('#menu-backdrop').hidden = false; }
function cerrarMenu() { $('#menu').hidden = true; $('#menu-backdrop').hidden = true; }

// --------------------------------------------------------------- eventos
$('#btn-next').addEventListener('click', siguiente);
$('#btn-prev').addEventListener('click', anterior);
$('#btn-fs').addEventListener('click', pantallaCompleta);
$('#btn-menu').addEventListener('click', abrirMenu);
$('#menu-close').addEventListener('click', cerrarMenu);
$('#menu-backdrop').addEventListener('click', cerrarMenu);
$('#brand').addEventListener('click', () => ir(0));
$('#btn-tour').addEventListener('click', () => (estado.recorrido ? terminarRecorrido() : iniciarRecorrido()));
$('#btn-expo').addEventListener('click', alternarExposicion);
$('#btn-perf').addEventListener('click', () => alternarRendimiento());
$('#btn-notes').addEventListener('click', () => { $('#presenter').hidden = !$('#presenter').hidden; });
$('#pres-toggle').addEventListener('click', alternarCrono);
$('#pres-reset').addEventListener('click', () => { clearInterval(crono.intervalo); crono.intervalo = null; crono.restante = crono.total; $('#pres-toggle').textContent = 'Iniciar'; pintarCrono(); });
$('#to-top').addEventListener('click', () => ir(0));
$$('.seg [data-mode]').forEach((b) => b.addEventListener('click', () => cambiarModo(b.dataset.mode)));
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('expo')) {
    document.body.classList.remove('expo');
    $('#btn-expo').classList.remove('is-on');
    $('#btn-expo').textContent = 'Modo exposición';
  }
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const tecla = e.key;
  if (tecla === 'ArrowRight' || tecla === 'PageDown' || (tecla === ' ' && estado.modo === 'slides')) {
    if (tecla === ' ' && t.closest?.('button')) return; // Espacio activa el botón enfocado
    e.preventDefault(); siguiente();
  } else if (tecla === 'ArrowLeft' || tecla === 'PageUp') { e.preventDefault(); anterior(); }
  else if (tecla === 'Home') { e.preventDefault(); ir(0); }
  else if (tecla === 'End') { e.preventDefault(); ir(SLIDES.length - 1); }
  else if (tecla === 'f' || tecla === 'F') pantallaCompleta();
  else if (tecla === 'm' || tecla === 'M') ($('#menu').hidden ? abrirMenu() : cerrarMenu());
  else if (tecla === 'n' || tecla === 'N') $('#presenter').hidden = !$('#presenter').hidden;
  else if (tecla === 's' || tecla === 'S') cambiarModo(estado.modo === 'slides' ? 'scroll' : 'slides');
  else if (tecla === 'e' || tecla === 'E') alternarExposicion();
  else if (tecla === 'd' || tecla === 'D') (estado.recorrido ? terminarRecorrido() : iniciarRecorrido());
  else if (tecla === 'Escape') { cerrarMenu(); if (estado.recorrido) terminarRecorrido(); }
});

sim.on('error', (e) => toast(e.message || String(e), 'error'));
pintarCrono();
window.__app = { estado, city, sim, ir, cambiarModo };
arrancar();
