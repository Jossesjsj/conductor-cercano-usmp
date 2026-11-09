// Ayudas para Chart.js con el tema oscuro de la presentación.
import { h } from './ui.js';

export const EJES = (titX, titY, log = false) => ({
  x: { type: log ? 'logarithmic' : 'category', ticks: { color: '#A8B3CC' }, grid: { color: 'rgba(120,160,255,.08)' }, title: { display: !!titX, text: titX, color: '#6F7B98' } },
  y: { type: log ? 'logarithmic' : 'linear', ticks: { color: '#A8B3CC' }, grid: { color: 'rgba(120,160,255,.1)' }, title: { display: !!titY, text: titY, color: '#6F7B98' } },
});

/** Crea (o reemplaza) un gráfico dentro de `caja` (.chart-box). */
export function grafico(caja, config) {
  caja.querySelector('canvas')?.__chart?.destroy();
  caja.replaceChildren();
  const cv = h('canvas');
  caja.append(cv);
  config.options = { responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
    plugins: { legend: { labels: { color: '#A8B3CC', boxWidth: 12 } }, ...(config.options?.plugins || {}) }, ...config.options };
  cv.__chart = new window.Chart(cv, config);
  return cv.__chart;
}
