import { encabezado, h } from '../ui.js';

const TECNOLOGIAS = [
  { n: 'Quadtree (este proyecto)', tag: 'Árbol · cuadrados', c: 'badge', idea: 'Divide recursivamente el plano en 4 cuadrantes según la densidad.', quien: 'Implementación propia (Python).', pro: 'Se adapta a la densidad.', contra: 'Profundidad desigual.' },
  { n: 'H3 (Uber)', tag: 'Hexágonos jerárquicos', c: 'badge badge--violet', idea: 'Malla global de hexágonos en 16 resoluciones; cada celda tiene un identificador de 64 bits.', quien: 'Uber, para precios dinámicos y despacho.', pro: 'Vecinos equidistantes.', contra: 'Celdas de tamaño fijo.' },
  { n: 'S2 (Google)', tag: 'Esfera → cubo → curva', c: 'badge badge--green', idea: 'Proyecta la esfera sobre un cubo y numera las celdas con una curva de Hilbert.', quien: 'Google Maps, bases de datos geográficas.', pro: 'IDs cercanos = celdas cercanas.', contra: 'Celdas irregulares.' },
  { n: 'Geohash (Redis)', tag: 'Cadena por prefijos', c: 'badge badge--yellow', idea: 'Intercala bits de latitud y longitud en una cadena base32; prefijo común ≈ cercanía.', quien: 'Redis GEO, Elasticsearch.', pro: 'Simple: es una cadena.', contra: 'Falla en los bordes.' },
  { n: 'R-tree (PostGIS)', tag: 'Árbol de rectángulos', c: 'badge badge--red', idea: 'Agrupa objetos en rectángulos mínimos que pueden solaparse (índice GiST).', quien: 'PostGIS / PostgreSQL.', pro: 'Indexa polígonos, en disco.', contra: 'Costoso con muchos movimientos.' },
];

export default {
  titulo: 'Comparación tecnológica', capitulo: 'CONTEXTO',
  notas: 'Todas aplican la misma idea: dividir el espacio para buscar solo donde importa. No son implementaciones idénticas a nuestro Quadtree. Responder las preguntas del documento: ¿por qué hexágonos? y ¿qué pasa con muchos conductores en el mismo punto?',
  crear({ num, raiz }) {
    const cv = h('canvas', { class: 'heap-canvas' });
    raiz.append(
      encabezado(num, 'CONTEXTO · INDUSTRIA', 'Quadtree frente a <em>H3, S2, Geohash y R-tree</em>', 'Misma idea: dividir el espacio para buscar solo donde importa.'),
      h('div', { class: 'slide__body', style: { gridTemplateRows: 'auto 1fr' } },
        h('div', { class: 'tech-grid' }, TECNOLOGIAS.map((t) => h('div', { class: 'card tech hover' }, h('span', { class: `${t.c} tag` }, t.tag), h('h3', {}, t.n),
          h('dl', {}, h('dt', {}, 'Ventaja'), h('dd', {}, t.pro), h('dt', {}, 'Limitación'), h('dd', {}, t.contra))))),
        h('div', { class: 'cols-2', style: { display: 'grid', gap: '1rem', minHeight: 0 } },
          h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', {}, '¿Por qué Uber eligió hexágonos?'), h('div', { class: 'chart-box', style: { flex: 1 } }, cv)),
          h('div', { class: 'card scroll-y' },
            h('h4', {}, 'Preguntas del documento'), h('ul', {}, h('li', {}, h('strong', {}, '¿Hexágonos? '), '6 vecinos a la misma distancia (en un cuadrado: 1 y √2).'), h('li', {}, h('strong', {}, '¿Todos en un punto? '), 'la hoja no se divide más: queda desbordada.'), h('li', {}, h('strong', {}, '¿Línea recta = llegada? '), 'no: decide el ETA por calles.'))))));

    function dibujar() {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const g = cv.getContext('2d');
      const L = Math.min(cv.width / 5.2, cv.height / 3.6);
      const cy = cv.height / 2;
      // Cuadrícula: celda central y sus 8 vecinos.
      const cx1 = cv.width * 0.27;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        g.strokeStyle = 'rgba(0,217,255,.7)'; g.lineWidth = 2 * dpr;
        g.fillStyle = i === 0 && j === 0 ? 'rgba(0,217,255,.25)' : (i && j) ? 'rgba(255,77,109,.12)' : 'rgba(34,227,155,.12)';
        g.fillRect(cx1 + (i - 0.5) * L, cy + (j - 0.5) * L, L, L); g.strokeRect(cx1 + (i - 0.5) * L, cy + (j - 0.5) * L, L, L);
        if (i || j) { g.strokeStyle = (i && j) ? '#FF4D6D' : '#22E39B'; g.beginPath(); g.moveTo(cx1, cy); g.lineTo(cx1 + i * L, cy + j * L); g.stroke(); }
      }
      g.fillStyle = '#fff'; g.font = `700 ${13 * dpr}px Inter`; g.textAlign = 'center';
      g.fillText('Cuadrados: distancias 1 y √2', cx1, cy + 1.95 * L);
      // Hexágonos: celda central y 6 vecinos.
      const cx2 = cv.width * 0.73, R = L * 0.58;
      const hex = (x, y, f) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; g.lineTo(x + R * Math.cos(a), y + R * Math.sin(a)); } g.closePath(); g.fillStyle = f; g.fill(); g.strokeStyle = 'rgba(139,92,246,.9)'; g.stroke(); };
      hex(cx2, cy, 'rgba(139,92,246,.3)');
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 3 * k, d = R * Math.sqrt(3);
        hex(cx2 + d * Math.cos(a), cy + d * Math.sin(a), 'rgba(34,227,155,.12)');
        g.strokeStyle = '#22E39B'; g.beginPath(); g.moveTo(cx2, cy); g.lineTo(cx2 + d * Math.cos(a), cy + d * Math.sin(a)); g.stroke();
      }
      g.fillStyle = '#fff'; g.fillText('Hexágonos: 6 vecinos equidistantes', cx2, cy + 1.95 * L);
    }
    new ResizeObserver(dibujar).observe(cv);
    return { entrar: dibujar };
  },
};
