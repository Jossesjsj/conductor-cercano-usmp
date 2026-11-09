import fs from 'node:fs';
import { haversineKm, haversineSteps } from './js/algorithms/haversine.js';
import { Quadtree } from './js/algorithms/quadtree.js';
import { buildGraph } from './js/core/graph.js';
import { dijkstra, bellmanFord, createGridGraph } from './js/algorithms/dijkstra.js';
import { Despachador, buscarLineal } from './js/algorithms/dispatcher.js';
import { SeededRandom } from './js/core/seeded-random.js';

const net = JSON.parse(fs.readFileSync('./assets/data/comas-network.json','utf8'));
console.log('network', net.meta.nodes, net.meta.edges, net.meta.area_km2);
console.log('haversine Comas-Plaza', haversineKm(-11.94007,-77.045895,-12.0464,-77.0428));
console.log('steps', haversineSteps(-11.94007,-77.045895,-11.95,-77.05).meters.toFixed(2));

const g = buildGraph(net);
console.log('graph stats', g.stats);
let s = '2574' // pick first node
const ids = [...g.nodes.keys()];
const start = ids[0], end = ids[Math.floor(ids.length/2)];
const t0=performance.now(); const d = dijkstra(g,start,end); console.log('dijkstra', d.found, d.distancia_km, d.path.length, d.operaciones, (performance.now()-t0).toFixed(2)+'ms');
const b = bellmanFord(g,start,end); console.log('bellman', b.distancia_km, 'diff', Math.abs(d.distancia_km-b.distancia_km));

const rng = new SeededRandom(123);
const p = g.projector.toLocal(-11.94,-77.045);
const bounds = {x:g.bounds.minX, y:g.bounds.minY, w:g.bounds.width, h:g.bounds.height};
const qt = new Quadtree(bounds, {capacidad:4, profundidadMaxima:8});
qt.setProyeccion((x,y)=>{const q=g.projector.toGeo(x,y); return [q.lat,q.lon];});
const drivers=[];
for(let i=0;i<300;i++){
  const node = g.node(rng.pick(ids));
  const pt = {id:'C-'+i, x:node.x, y:node.y, lat:node.lat, lon:node.lon, disponible: rng.chance(.7), nodeId:node.id};
  drivers.push(pt); qt.insertar(pt);
}
console.log('quad stats', qt.estadisticas());
const knn = qt.k_mas_cercanos(p.x,p.y,5, q=>q.disponible);
console.log('knn', knn.puntos.map(x=>[x.id, x.distancia_plana_m.toFixed(1), x.disponible]), knn.nodosVisitados, knn.puntosExaminados);
const disp = new Despachador(g,{k:5,velocidadKmh:28});
const res = disp.asignar({pasajero:{lat:-11.94,lon:-77.045}, quadtree:qt, conductores:drivers,k:5,velocidadKmh:28});
console.log('dispatch ok', res.ok, 'winner', res.ganador?.id, res.ganador?.etaMin, res.fases.map(f=>[f.label,f.ms.toFixed(2)]));
console.log('candidates', res.candidatos.map(c=>[c.id,c.roadKm.toFixed(2),c.etaMin.toFixed(2),c.reachable]));
console.log('linear', buscarLineal(drivers,{lat:-11.94,lon:-77.045},5));

// grid validation
for (const seed of [1,2,3]) {
  const gg=createGridGraph(8,8,seed);
  const nids=[...gg.nodes.keys()];
  const a=nids[0], z=nids[nids.length-1];
  const dd=dijkstra(gg,a,z); const bb=bellmanFord(gg,a,z);
  console.log('grid',seed,dd.distancia_km.toFixed(6),bb.distancia_km.toFixed(6), Math.abs(dd.distancia_km-bb.distancia_km)<1e-9);
}
