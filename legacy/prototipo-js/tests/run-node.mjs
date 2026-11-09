#!/usr/bin/env node
/* Ejecuta la misma suite que la escena 15, sin navegador. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ejecutarSuite } from '../js/tests/suite.js';
import { buildGraph } from '../js/core/graph.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const network = JSON.parse(await readFile(resolve(root, 'assets/data/comas-network.json'), 'utf8'));
const graph = buildGraph(network);

const res = await ejecutarSuite({ graph, network });
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

console.log('');
console.log(c('1', 'CONDUCTOR CERCANO · SUITE DE PRUEBAS (Node)'));
console.log(c('90', 'Red real: ' + graph.nodes.size + ' nodos · ' + graph.edges.length + ' aristas · ' + graph.stats.totalKm.toFixed(2) + ' km'));
console.log(c('90', 'Entorno: ' + res.entorno));
console.log('');

let grupoActual = '';
for (const r of res.resultados) {
  if (r.grupo !== grupoActual) {
    grupoActual = r.grupo;
    console.log(c('35', '\n▌ ' + grupoActual));
  }
  const marca = r.ok ? c('32', '✔') : c('31', '✘');
  const tiempo = c('90', r.ms.toFixed(2).padStart(8) + ' ms');
  console.log(`  ${marca} ${r.nombre.padEnd(62)} ${tiempo}`);
  if (!r.ok) console.log('      ' + c('31', r.error));
}

console.log('');
console.log('─'.repeat(84));
const resumen = `${res.pasadas}/${res.total} pruebas aprobadas · ${res.fallidas} fallidas · ${res.totalMs.toFixed(2)} ms`;
console.log(res.fallidas === 0 ? c('32', '✔ ' + resumen) : c('31', '✘ ' + resumen));
console.log('');
process.exitCode = res.fallidas === 0 ? 0 : 1;
